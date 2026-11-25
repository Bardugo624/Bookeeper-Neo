import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import styles from './Description.module.css';

/** The description, clipped to six lines with a toggle when it is longer than that. */
export function Description({ text }: { text: string }) {
  const t = useT();
  const id = useId();
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Measured while clipped; once opened the toggle must stay, so only a closed paragraph is measured.
    const measure = () => {
      if (!open) setClipped(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [text, open]);

  return (
    <div>
      <p ref={ref} id={id} className={open ? styles.text : `${styles.text} ${styles.clamped}`}>
        {text}
      </p>
      {clipped || open ? (
        <button type="button" className={styles.toggle} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
          {open ? t('msearch.detail.description.less') : t('msearch.detail.description.more')}
          <span className={open ? `${styles.chevron} ${styles.up}` : styles.chevron}>
            <Icon name="chevron-down" size={16} />
          </span>
        </button>
      ) : null}
    </div>
  );
}
