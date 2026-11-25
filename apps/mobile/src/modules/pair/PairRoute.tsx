import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useSession } from '../../session';
import { AlreadyPaired } from './AlreadyPaired';
import { IntroPage } from './IntroPage';
import { LinkPage } from './LinkPage';
import { normalizeCode } from './normalize';

/** `/pair`: the link page when the address carries a code, otherwise the instructions. */
export function PairRoute() {
  const [params] = useSearchParams();
  const code = params.get('code') ?? '';
  // Decided once on arrival: the session turning `ready` after pairing must not bring the question back.
  const [asking, setAsking] = useState(() => useSession.getState().status === 'ready');
  if (!normalizeCode(code)) return <IntroPage />;
  if (asking) return <AlreadyPaired onAgain={() => setAsking(false)} />;
  return <LinkPage code={code} />;
}
