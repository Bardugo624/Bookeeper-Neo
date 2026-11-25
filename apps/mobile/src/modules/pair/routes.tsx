import type { MobileModule } from '../../app/types';
import { CodePage } from './CodePage';
import { PairRoute } from './PairRoute';

export const module: MobileModule = {
  id: 'pair',
  routes: [],
  public: [
    { path: '/pair', element: <PairRoute /> },
    { path: '/pair/code', element: <CodePage /> },
  ],
};
