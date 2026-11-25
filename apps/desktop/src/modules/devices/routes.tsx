import type { AppModule } from '../../app';
import { DevicesPage } from './DevicesPage';

export const module: AppModule = {
  id: 'devices',
  nav: { labelKey: 'devices.title', icon: 'phone', to: '/devices', group: 'bottom', order: 10 },
  routes: [{ path: '/devices', element: <DevicesPage /> }],
};
