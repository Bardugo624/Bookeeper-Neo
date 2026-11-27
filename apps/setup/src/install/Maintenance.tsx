import { Button } from '@bookeeper/ui/base';
import type { SetupInfo } from '../bridge';
import { useT } from '../shell';
import { Notice } from './Notice';
import { relation } from './version';

export interface MaintenanceProps {
  info: SetupInfo;
  onUpdate(): void;
  onRepair(): void;
  onOpen(): void;
  onClose(): void;
  onUninstall(): void;
}

/**
 * An installation exists. Only an older one can be updated, and only the same one repaired.
 * A newer or 0.x/1.x one is never touched, and the light Setup (no installer inside) can only remove or close.
 */
export function Maintenance({ info, onUpdate, onRepair, onOpen, onClose, onUninstall }: MaintenanceProps) {
  const t = useT();
  const installed = info.installed;
  if (!installed) return null;
  const version = info.payload?.version ?? installed.version;
  const kind = info.payload ? relation(installed, info.payload.version) : installed.legacy ? 'legacy' : 'newer';
  const vars = { installed: installed.version, version };

  const uninstall = (
    <Button variant="ghost" onClick={onUninstall}>
      {t('setup.maintenance.uninstall')}
    </Button>
  );
  const close = (
    <Button variant="primary" onClick={onClose}>
      {t('setup.done.close')}
    </Button>
  );

  switch (kind) {
    case 'older':
      return (
        <Notice title={t('setup.maintenance.older.title')} text={t('setup.maintenance.older.text', vars)}>
          {uninstall}
          <Button variant="primary" onClick={onUpdate}>
            {t('setup.maintenance.older.go')}
          </Button>
        </Notice>
      );
    case 'same':
      return (
        <Notice title={t('setup.maintenance.same.title', vars)} text={t('setup.maintenance.same.text')}>
          {uninstall}
          <Button variant="secondary" onClick={onRepair}>
            {t('setup.maintenance.same.repair')}
          </Button>
          <Button variant="primary" onClick={onOpen}>
            {t('setup.done.open')}
          </Button>
        </Notice>
      );
    case 'newer':
      return (
        <Notice title={t('setup.maintenance.newer.title')} text={t('setup.maintenance.newer.text', vars)}>
          {uninstall}
          {close}
        </Notice>
      );
    case 'legacy':
      return (
        <Notice title={t('setup.maintenance.legacy.title')} text={t('setup.maintenance.legacy.text', vars)}>
          {close}
        </Notice>
      );
  }
}
