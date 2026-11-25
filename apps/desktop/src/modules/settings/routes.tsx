import type { AppModule } from '../../app/types';
import { SettingsPage } from './SettingsPage';

export const module: AppModule = {
  id: 'settings',
  nav: { labelKey: 'settings.title', icon: 'settings', to: '/settings', group: 'bottom', order: 20 },
  routes: [
    { path: '/settings', element: <SettingsPage /> },
    { path: '/settings/:sectionId', element: <SettingsPage /> },
  ],
};
