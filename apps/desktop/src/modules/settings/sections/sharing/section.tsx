import { roleCan } from '../../../../kit';
import { useSession } from '../../../../session';
import type { SettingsSection } from '../../types';
import { SharingSection } from './SharingSection';

export const section: SettingsSection = {
  id: 'sharing',
  labelKey: 'sharing.section',
  icon: 'server',
  order: 60,
  element: <SharingSection />,
  // Only the owner of a library kept on this computer can open it to the network, and only where the shell can serve it.
  visible: ({ role, platform }) => {
    if (platform !== 'tauri' || !roleCan(role, 'owner')) return false;
    const { platform: p, connection } = useSession.getState();
    return !!p?.sharing && connection?.kind === 'local';
  },
};
