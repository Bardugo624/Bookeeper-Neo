import type { SettingsSection } from '../../types';
import { LibrarySection } from './LibrarySection';

export const section: SettingsSection = {
  id: 'library',
  labelKey: 'settings.sections.library',
  icon: 'library',
  order: 30,
  element: <LibrarySection />,
};
