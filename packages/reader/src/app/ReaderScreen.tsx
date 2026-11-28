import { useCallback, useEffect, useRef, useState } from 'react';
import type { MenuEntry } from '@bookeeper/ui/overlays';
import { useReaderT } from '../i18n';
import { chapterTicks } from '../model';
import { AppearancePanel, NoteEditor, SelectionToolbar } from '../ui/look';
import { CompanionPanel, type PanelTab } from '../ui/panel';
import { BottomBar, Reader, TopBar, useChrome, useReaderKeys, type ReaderError } from '../ui/view';
import type { ReaderAppProps } from './ReaderApp';
import { PagePane } from './PagePane';
import { chapterAtFraction, labelOfHref } from './helpers';
import { useAnnotations } from './useAnnotations';
import { useBookSession } from './useBookSession';
import { useJumps } from './useJumps';
import { useNoteActions } from './useNoteActions';
import { usePositionKeeper, usePositionSaving } from './usePositions';
import { useQuestion } from './useQuestion';
import { useReaderSettings } from './useReaderSettings';
import { useSearch } from './useSearch';
import { useSelection, type Editing } from './useSelection';
import { useSpeed } from './useSpeed';

/** Flushing must not hold the screen back when the network stalls. */
const CLOSE_WAIT_MS = 1500;

const TURN_FLAG_MS = 1500;

export function ReaderScreen({ backend, book, file, platform, appDark, topEnd, menuItems, onClose }: ReaderAppProps) {
  const t = useReaderT();
  const desktop = platform === 'desktop';
  const { settings, change, theme, layout } = useReaderSettings(appDark);
  const keeper = usePositionKeeper(backend, file.id);
  const session = useBookSession({ backend, file, keeper, layout });
  const { engine, opened, relocation } = session;
  usePositionSaving(keeper, engine);

  const [tab, setTab] = useState<PanelTab>('toc');
  const [sheet, setSheet] = useState(false);
  const [appearance, setAppearance] = useState(false);
  const [pageSpan, setPageSpan] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const turning = useRef<'next' | 'prev' | null>(null);
  const turnTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(turnTimer.current), []);

  const jumps = useJumps(engine, relocation);
  const times = useSpeed(engine, opened, relocation, turning, setPageSpan);
  const notes = useAnnotations(backend, { bookId: book.id, sha256: file.sha256 }, engine, opened, relocation, pageSpan);
  const q = useQuestion({ backend, opened, relocation, localAtOpen: session.localAtOpen, sources: session.sources, reading: session.reading, goTo: jumps.goTo });
  const search = useSearch(engine);

  const [editing, setEditing] = useState<Editing | null>(null);
  const actions = useNoteActions({ backend, book, store: notes.store, items: notes.items, goTo: jumps.goTo, setEditing });
  const sel = useSelection(engine, backend, notes.store, notes.addNow, notes.items, notes.here, editing, setEditing, actions.copyText, actions.removed);

  const panelOpen = desktop ? settings.panelOpen : sheet;
  const openPanel = useCallback(
    (next: PanelTab) => {
      setTab(next);
      if (desktop) change({ ...settings, panelOpen: true });
      else setSheet(true);
    },
    [desktop, change, settings],
  );
  const closePanel = useCallback(() => (desktop ? change({ ...settings, panelOpen: false }) : setSheet(false)), [desktop, change, settings]);

  const chrome = useChrome({ layout: platform, hold: !!q.question || appearance || !!editing || (!desktop && sheet) });
  const turn = useCallback(
    (direction: 'next' | 'prev') => {
      if (!engine) return;
      turning.current = direction;
      // A turn that moves nothing (the last page) sends no `relocate`: the flag must not outlive it.
      clearTimeout(turnTimer.current);
      turnTimer.current = setTimeout(() => (turning.current = null), TURN_FLAG_MS);
      q.stay();
      jumps.turned(direction);
      chrome.hide();
      if (direction === 'next') engine.next();
      else engine.prev();
    },
    [engine, q, jumps, chrome],
  );
  const appearanceRef = useRef(appearance);
  appearanceRef.current = appearance;
  const onFrameKey = useReaderKeys({
    onNext: () => turn('next'),
    onPrev: () => turn('prev'),
    onSearch: () => openPanel('search'),
    onToggleChrome: chrome.toggle,
    layers: [
      { open: !!sel.selection, close: sel.dismiss },
      { open: q.resumeOpen, close: q.stay },
      { open: desktop && panelOpen, close: closePanel },
    ],
    enabled: !appearance && !editing && !(!desktop && sheet),
  });
  useEffect(() => {
    if (!engine) return;
    const offs = [
      engine.on('key', (k) => {
        // The page is an iframe: the popover never sees its keys, so close it here.
        if (appearanceRef.current && k.key === 'Escape') setAppearance(false);
        onFrameKey(k);
      }),
      engine.on('tap', (m) => {
        if (appearanceRef.current) {
          // A click on the page is an outside click for the anchored panel; it only closes it.
          setAppearance(false);
          return;
        }
        if (m.zone === 'center') chrome.onTap('center');
        else turn(m.zone === 'start' ? 'prev' : 'next');
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [engine, onFrameKey, chrome.onTap, turn]);

  const close = useCallback(async () => {
    await Promise.race([keeper.flush().catch(() => undefined), new Promise((r) => setTimeout(r, CLOSE_WAIT_MS))]);
    onClose();
  }, [keeper, onClose]);

  const onError = (error: ReaderError) => {
    if (error === 'open_failed' && session.file && typeof URL.createObjectURL === 'function') {
      const a = document.createElement('a');
      const url = URL.createObjectURL(session.file);
      a.href = url;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } else void close();
  };

  const toc = opened?.toc ?? [];
  const fraction = relocation?.fraction ?? 0;
  const afterJump = (fn: () => void) => () => {
    fn();
    if (!desktop) setSheet(false);
  };
  const moreItems: MenuEntry[] = [{ id: 'book', label: t('reader.more.open_book'), onSelect: () => void close() }, ...(menuItems ?? [])];
  const bounds = { width: stage.current?.clientWidth ?? 0, height: stage.current?.clientHeight ?? 0 };

  const panel = (
    <CompanionPanel
      variant={desktop ? 'aside' : 'sheet'}
      open={panelOpen}
      onClose={closePanel}
      tab={tab}
      onTab={setTab}
      toc={{ items: toc, current: relocation?.tocHref ?? null, onGo: (href) => afterJump(() => jumps.goTo({ href }))() }}
      notes={{ ...actions.notes, items: notes.entries, theme, onGo: (e) => afterJump(() => actions.notes.onGo(e))() }}
      search={{
        query: search.query,
        onQueryChange: search.setQuery,
        results: search.results,
        progress: search.progress,
        done: search.done,
        onPick: (hit) => afterJump(() => jumps.goTo({ cfi: hit.cfi }))(),
        autoFocus: tab === 'search',
      }}
    />
  );

  const appearanceProps = {
    open: appearance,
    onOpenChange: setAppearance,
    layout: platform,
    format: opened?.format ?? file.format,
    settings,
    onChange: change,
  };

  return (
    <Reader
      layout={platform}
      theme={theme}
      chromeVisible={chrome.visible}
      progress={fraction}
      onReveal={chrome.show}
      panelOpen={desktop && panelOpen}
      panel={desktop ? panel : undefined}
      top={
        <TopBar
          layout={platform}
          title={book.title}
          chapter={opened ? labelOfHref(toc, relocation?.tocHref ?? null) : null}
          onBack={() => void close()}
          onSearch={() => openPanel('search')}
          onBookmark={notes.toggleBookmark}
          bookmarked={notes.bookmarked}
          onAppearance={() => setAppearance(true)}
          anchorAppearance={desktop ? (trigger) => <AppearancePanel {...appearanceProps} trigger={trigger} /> : undefined}
          onPanel={() => (panelOpen ? closePanel() : openPanel(tab))}
          panelOpen={panelOpen}
          moreItems={moreItems}
          topEnd={topEnd}
        />
      }
      bottom={
        <BottomBar
          layout={platform}
          fraction={fraction}
          ticks={opened ? chapterTicks(toc, opened.sectionFractions) : []}
          chapterAt={(f) => chapterAtFraction(toc, f)}
          onSeek={(f) => jumps.goTo({ fraction: f })}
          times={times}
          question={q.question}
          jumpBack={jumps.jump ? { percent: Math.round(jumps.jump.percent), onBack: jumps.back } : null}
          phone={{
            onToc: () => openPanel('toc'),
            onNotes: () => openPanel('notes'),
            onSearch: () => openPanel('search'),
            onBookmark: notes.toggleBookmark,
            bookmarked: notes.bookmarked,
          }}
        />
      }
      overlays={
        <>
          {desktop ? null : panel}
          {desktop ? null : <AppearancePanel {...appearanceProps} />}
          <NoteEditor open={!!editing} layout={platform} value={editing?.value ?? ''} onSave={sel.saveNote} onCancel={() => setEditing(null)} />
        </>
      }
    >
      <PagePane iframeRef={session.iframeRef} stageRef={stage} status={session.status} progress={session.progress} onError={onError}>
        {sel.selection ? (
          <SelectionToolbar
            layout={platform}
            theme={theme}
            rect={sel.selection.rect}
            bounds={bounds}
            current={sel.selection.color}
            onColor={sel.color}
            onNote={sel.note}
            onCopy={sel.copy}
            onSearch={sel.search}
            onRemove={sel.remove}
          />
        ) : null}
      </PagePane>
    </Reader>
  );
}
