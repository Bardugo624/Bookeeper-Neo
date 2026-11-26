export type ServerMode = 'local' | 'off' | 'proxy' | 'self' | 'acme';

const isHttps = (url: string | null | undefined) => Boolean(url?.toLowerCase().startsWith('https://'));

/**
 * The mode to show. A server in `off` mode reached through an HTTPS address sits behind a proxy
 * that encrypts the traffic: telling the person "not encrypted" would be wrong.
 */
export function serverMode(tls: string, publicUrl: string | null | undefined, connectionUrl: string | null | undefined): ServerMode {
  if (tls === 'off' && (isHttps(publicUrl) || isHttps(connectionUrl))) return 'proxy';
  return tls as ServerMode;
}
