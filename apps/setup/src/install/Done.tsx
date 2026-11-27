import { Button } from '@bookeeper/ui/base';
import type { Mode } from '../bridge';
import { useT } from '../shell';
import { Notice } from './Notice';

export interface DoneProps {
  mode: Mode;
  /** The desktop icon exists: only a fresh install makes it, so only then does the text name it. */
  desktopIcon: boolean;
  onClose(): void;
  onOpen(): void;
}

export function Done({ mode, desktopIcon, onClose, onOpen }: DoneProps) {
  const t = useT();
  return (
    <Notice
      badge={{ icon: 'check', tone: 'ok' }}
      title={t(`setup.done.${mode}`)}
      text={t(desktopIcon && mode === 'install' ? 'setup.done.whereBoth' : 'setup.done.whereStart')}
    >
      <Button variant="ghost" onClick={onClose}>
        {t('setup.done.close')}
      </Button>
      <Button variant="primary" onClick={onOpen}>
        {t('setup.done.open')}
      </Button>
    </Notice>
  );
}
