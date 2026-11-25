import { roleCan } from '../../../../kit';
import type { SettingsSection } from '../../types';
import { TransferSection } from './TransferSection';

export const section: SettingsSection = {
  id: 'transfer',
  labelKey: 'transfer.section',
  icon: 'library',
  order: 40,
  element: <TransferSection />,
  // Export needs `member`; guests can use neither half.
  visible: ({ role }) => roleCan(role, 'write'),
};
