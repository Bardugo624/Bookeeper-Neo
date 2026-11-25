import { roleCan } from '../../../../kit';
import type { SettingsSection } from '../../types';
import { AuditSection } from './AuditSection';

export const section: SettingsSection = {
  id: 'audit',
  labelKey: 'audit.section',
  icon: 'list',
  order: 70,
  element: <AuditSection />,
  // The log is for the owner and the admins only.
  visible: ({ role }) => roleCan(role, 'admin'),
};
