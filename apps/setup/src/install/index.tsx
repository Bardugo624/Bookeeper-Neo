import type { SetupInfo } from '../bridge';
import { ProgressBlock, SetupLayout, useProgress } from '../shell';
import { Customize } from './Customize';
import { Done } from './Done';
import { Maintenance } from './Maintenance';
import { AppRunning, Failed } from './Problems';
import { useInstallFlow } from './useInstallFlow';
import { Welcome } from './Welcome';

/** Install, customize, update or repair: one frontispiece, one working panel that changes with the state. */
export function InstallFlow({ info, onUninstall }: { info: SetupInfo; onUninstall(): void }) {
  const flow = useInstallFlow(info);
  const progress = useProgress();
  const version = info.payload?.version ?? '';
  const installedBytes = info.payload?.installedBytes ?? 0;
  const { choices } = flow;

  const panel = (() => {
    switch (flow.screen) {
      case 'welcome':
        return (
          <Welcome
            version={version}
            installedBytes={installedBytes}
            dir={choices.dir}
            desktopIcon={choices.desktopIcon}
            autostart={choices.autostart}
            onCustomize={flow.customize}
            onInstall={flow.install}
          />
        );
      case 'customize':
        return (
          <Customize
            version={version}
            installedBytes={installedBytes}
            dir={choices.dir}
            check={flow.check}
            desktopIcon={choices.desktopIcon}
            autostart={choices.autostart}
            onPickFolder={() => void flow.changeFolder()}
            onDesktopIcon={flow.setDesktopIcon}
            onAutostart={flow.setAutostart}
            onLess={flow.less}
            onInstall={flow.install}
          />
        );
      case 'progress':
        return <ProgressBlock titleKey={`setup.progress.${flow.mode}`} event={progress} />;
      case 'done':
        return <Done mode={flow.mode} desktopIcon={choices.desktopIcon} onClose={flow.close} onOpen={flow.openApp} />;
      case 'running':
        return <AppRunning onRetry={flow.retry} />;
      case 'error':
        return <Failed copied={flow.copied} onCopy={() => void flow.copyDetails()} onRetry={flow.retry} />;
      case 'maintenance':
        return (
          <Maintenance
            info={info}
            onUpdate={flow.update}
            onRepair={flow.repair}
            onOpen={flow.openApp}
            onClose={flow.close}
            onUninstall={onUninstall}
          />
        );
    }
  })();

  const customizing = flow.screen === 'customize';
  return (
    <SetupLayout quote={flow.quote} compact={customizing} panelHeight={customizing ? 'tall' : 'short'}>
      <div data-flow="install" data-screen={flow.screen}>
        {panel}
      </div>
    </SetupLayout>
  );
}
