import type { MobileModule } from '../../app/types';
import { ScanPage } from './ScanPage';
import { ShelfScanPage } from './ShelfScanPage';

export const module: MobileModule = {
  id: 'scan',
  routes: [
    { path: '/scan', element: <ScanPage /> },
    { path: '/scan/shelf', element: <ShelfScanPage /> },
  ],
  tab: { labelKey: 'mscan.tab', icon: 'grid', to: '/scan', order: 20 },
};
