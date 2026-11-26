import { useSession } from '../../../../session';
import type { SettingsSection } from '../../types';
import { NotificationsSection } from './NotificationsSection';

export const section: SettingsSection = {
  id: 'notifications',
  labelKey: 'notifications.section',
  icon: 'alert',
  order: 35,
  element: <NotificationsSection />,
  // Only where the platform can show system notifications.
  visible: () => !!useSession.getState().platform?.notifications,
};
