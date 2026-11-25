/** "iPhone · Safari" from a user-agent string; falls back to a generic name. */
export function deviceNameFromUserAgent(ua: string, fallback = 'Phone'): string {
  const device = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? (/Pixel \w+/.exec(ua)?.[0] ?? 'Android')
        : fallback;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /(CriOS|Chrome)\//.test(ua)
      ? 'Chrome'
      : /(FxiOS|Firefox)\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : null;
  return browser ? `${device} · ${browser}` : device;
}
