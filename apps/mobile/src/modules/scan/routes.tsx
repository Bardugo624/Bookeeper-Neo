import type { MobileModule } from '../../app/types';
import { ScanPage } from './ScanPage';

export const module: MobileModule = {
  id: 'scan',
  routes: [{ path: '/scan', element: <ScanPage /> }],
  tab: { labelKey: 'mscan.tab', icon: 'grid', to: '/scan', order: 20 },
};
