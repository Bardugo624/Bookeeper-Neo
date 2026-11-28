import { useEffect, useState, type KeyboardEvent } from 'react';
import { Button, Textarea } from '@bookeeper/ui/base';
import { Dialog } from '@bookeeper/ui/overlays';
import { useReaderT } from '../../i18n';
import { Sheet } from '../view/Sheet';
import styles from './Look.module.css';

export interface NoteEditorProps {
  open: boolean;
  layout: 'desktop' | 'phone';
  /** The note as it is now; empty for a new one. */
  value: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}

/** The note of a highlight. Ctrl or Cmd+Enter saves, Esc cancels. A window on the computer, a sheet on the phone. */
export function NoteEditor({ open, layout, value, onSave, onCancel }: NoteEditorProps) {
  const t = useReaderT();
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSave(draft);
    }
  };
  const onOpenChange = (next: boolean) => {
    if (!next) onCancel();
  };
  const footer = (
    <div className={styles.noteActions}>
      <Button variant="ghost" onClick={onCancel}>
        {t('rlook.note.cancel')}
      </Button>
      <Button variant="primary" onClick={() => onSave(draft)}>
        {t('rlook.note.save')}
      </Button>
    </div>
  );
  const field = (
    <Textarea
      className={styles.noteField}
      aria-label={t('rlook.note.label')}
      placeholder={t('rlook.note.placeholder')}
      value={draft}
      rows={layout === 'phone' ? 8 : 5}
      autoFocus
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={onKeyDown}
    />
  );
  if (layout === 'phone') {
    return (
      <Sheet open={open} onOpenChange={onOpenChange} title={t('rlook.note.title')} footer={footer}>
        {field}
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('rlook.note.title')} footer={footer} closeLabel={t('rlook.close')}>
      {field}
    </Dialog>
  );
}
