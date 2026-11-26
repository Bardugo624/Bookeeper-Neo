import { useEffect, useRef } from 'react';
import { Icon } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { useOverlays } from '../../app/overlays';
import type { AppModule } from '../../app/types';
import { PaletteList } from './PaletteList';
import { usePalette } from './usePalette';
import styles from './Palette.module.css';

/** The open palette: remembers where the focus was and gives it back on close. */
function PaletteView({ modules }: { modules: AppModule[] }) {
  const t = useT();
  const close = useOverlays((s) => s.closePalette);
  const input = useRef<HTMLInputElement>(null);
  const p = usePalette(modules);

  useEffect(() => {
    const before = document.activeElement;
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (before instanceof HTMLElement && before.isConnected) before.focus();
    };
  }, [close]);

  const empty = p.items.length === 0;
  const notice = !empty ? null : p.hint ?? (p.pending ? 'searching' : 'none');
  return (
    <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-modal="true" aria-label={t('palette.title')} className={styles.panel}>
        <div className={styles.search}>
          <Icon name="search" size={18} />
          <input
            ref={input}
            className={styles.input}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={p.listId}
            aria-autocomplete="list"
            aria-activedescendant={p.active >= 0 ? p.optionId(p.active) : undefined}
            aria-label={t('palette.input')}
            placeholder={t('palette.placeholder')}
            autoComplete="off"
            spellCheck={false}
            value={p.text}
            onChange={(e) => p.setText(e.target.value)}
            onKeyDown={p.onKeyDown}
          />
        </div>
        <PaletteList
          id={p.id}
          listId={p.listId}
          items={p.items}
          active={p.active}
          optionId={p.optionId}
          onHover={p.setCursor}
          onPick={p.run}
          notice={notice}
        />
      </div>
    </div>
  );
}

export function CommandPalette({ modules }: { modules: AppModule[] }) {
  const open = useOverlays((s) => s.palette);
  return open ? <PaletteView modules={modules} /> : null;
}
