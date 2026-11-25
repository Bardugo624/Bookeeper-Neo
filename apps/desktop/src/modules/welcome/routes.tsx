import type { AppModule } from '../../app/types';
import { WelcomeView } from './WelcomeView';

export const module: AppModule = {
  id: 'welcome',
  routes: [],
  public: [{ path: '/welcome', element: <WelcomeView /> }],
};
