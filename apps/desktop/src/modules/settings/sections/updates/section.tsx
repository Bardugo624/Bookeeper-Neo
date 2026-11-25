import { useSession } from '../../../../session';
import { controllerFor } from '../../../updates/controller';
import type { SettingsSection } from '../../types';
import { UpdatesSection } from './UpdatesSection';

export const section: SettingsSection = {
  id: 'updates',
  labelKey: 'updates.section',
  icon: 'monitor',
  order: 80,
  element: <UpdatesSection />,
  // Only where the shell can update itself, and not when this build has updates turned off.
  visible: () => {
    const updates = useSession.getState().platform?.updates;
    return !!updates && controllerFor(updates).getSnapshot().result?.state !== 'disabled';
  },
};
