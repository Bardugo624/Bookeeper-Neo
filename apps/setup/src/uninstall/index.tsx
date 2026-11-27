import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@bookeeper/ui/base";
import {
  useLogTail,
  useProgress,
  useQuit,
  useUninstall,
  type SetupInfo,
} from "../bridge";
import { ProgressBlock, SetupLayout, useQuotes, useT } from "../shell";
import { ChoicePanel, type Choice } from "./ChoicePanel";
import { ConfirmDialog } from "./ConfirmDialog";
import { NoticePanel } from "./NoticePanel";

type Phase = "choose" | "running" | "appRunning" | "error" | "removed";

/** Choose what to keep, confirm if everything goes, run, then say what is left. */
export function UninstallFlow({ info }: { info: SetupInfo }) {
  const t = useT();
  const quit = useQuit();
  const progress = useProgress();
  const logTail = useLogTail();
  const uninstall = useUninstall();
  const { pick } = useQuotes();
  const [quote] = useState(() => pick("farewell"));
  const [choice, setChoice] = useState<Choice>("keep");
  const [confirming, setConfirming] = useState(false);
  const [phase, setPhase] = useState<Phase>("choose");
  const [deleted, setDeleted] = useState(false);
  const [copied, setCopied] = useState(false);

  const flow = useRef<HTMLDivElement>(null);

  // The dialog unmounts with the choice panel; its close handling then hands focus to a
  // surviving control (the title bar). Re-focus the title once that has run.
  useEffect(() => {
    if (phase !== "running") return;
    const id = setTimeout(
      () =>
        flow.current
          ?.querySelector<HTMLElement>("h1")
          ?.focus({ preventScroll: true }),
      0,
    );
    return () => clearTimeout(id);
  }, [phase]);

  const run = useCallback(
    async (deleteData: boolean) => {
      setConfirming(false);
      setDeleted(deleteData);
      setCopied(false);
      setPhase("running");
      const result = await uninstall.run(deleteData);
      if (result.ok) setPhase("removed");
      else setPhase(result.error === "app_running" ? "appRunning" : "error");
    },
    [uninstall],
  );

  const copyDetails = async () => {
    try {
      await navigator.clipboard.writeText(await logTail());
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const go = () =>
    choice === "delete" ? setConfirming(true) : void run(false);
  const panel = phase === "choose" ? "tall" : "short";

  return (
    <SetupLayout
      quote={quote}
      compact={phase === "choose"}
      panelHeight={panel}
    >
      {/* The marker is read by the app tests to tell the flows apart. */}
      <div ref={flow} data-flow="uninstall" style={{ display: "contents" }}>
        {phase === "choose" ? (
          <>
            <ChoicePanel
              info={info}
              choice={choice}
              onChoice={setChoice}
              onCancel={() => void quit(1)}
              onGo={go}
            />
            <ConfirmDialog
              open={confirming}
              data={info.data}
              onCancel={() => setConfirming(false)}
              onConfirm={() => void run(true)}
            />
          </>
        ) : null}
        {phase === "running" ? (
          <ProgressBlock
            titleKey="setup.progress.uninstall"
            initialStep="removeApp"
            event={progress}
          />
        ) : null}
        {phase === "appRunning" ? (
          <NoticePanel
            alert
            title={t("setup.running.title")}
            text={t("setup.running.text")}
          >
            <Button variant="primary" onClick={() => void run(deleted)}>
              {t("setup.running.retry")}
            </Button>
          </NoticePanel>
        ) : null}
        {phase === "error" ? (
          <NoticePanel
            alert
            title={t("setup.error.uninstall")}
            text={t("setup.error.text")}
          >
            <Button variant="ghost" onClick={() => void copyDetails()}>
              {t(copied ? "setup.error.copied" : "setup.error.copy")}
            </Button>
            <Button variant="primary" onClick={() => void run(deleted)}>
              {t("setup.error.retry")}
            </Button>
          </NoticePanel>
        ) : null}
        {phase === "removed" ? (
          <NoticePanel
            title={t("setup.removed.title")}
            text={t(deleted ? "setup.removed.deleted" : "setup.removed.kept")}
          >
            <Button variant="primary" onClick={() => void quit(0)}>
              {t("setup.removed.close")}
            </Button>
          </NoticePanel>
        ) : null}
      </div>
    </SetupLayout>
  );
}
