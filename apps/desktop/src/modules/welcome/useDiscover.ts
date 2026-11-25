import { useEffect, useState } from 'react';
import { usePlatform, type Found } from '../../platform';

export interface FoundServer {
  key: string;
  name: string;
  address: string;
}

function toServer(f: Found): FoundServer {
  const address = f.url ?? `${f.tls === 'none' ? 'http' : 'https'}://${f.host}:${f.port}`;
  return { key: `${f.instance}|${address}`, name: f.instance, address };
}

/** Servers announced on the local network, looked up once when the screen opens. */
export function useDiscover(): FoundServer[] {
  const platform = usePlatform();
  const [found, setFound] = useState<FoundServer[]>([]);
  useEffect(() => {
    let live = true;
    platform
      .discover()
      .then((list) => live && setFound(list.map(toServer)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [platform]);
  return found;
}
