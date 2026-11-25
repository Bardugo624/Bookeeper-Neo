import { roleCan } from '../../../../kit';
import type { SettingsSection } from '../../types';
import { BackupSection } from './BackupSection';

export const section: SettingsSection = {
  id: 'backup',
  labelKey: 'backup.section',
  icon: 'server',
  order: 50,
  element: <BackupSection />,
  // The core allows backups to admin and owner; restoring is owner-only (see `RestoreBlock`).
  visible: ({ role }) => roleCan(role, 'admin'),
};
