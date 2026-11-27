// Captures the homepage screenshots (light and dark) from a seeded server and the desktop dev frontend.
// Usage: node capture.mjs <demo-credentials.json> <out-dir> [desktop-url] [only-shot-name]
//   desktop-url defaults to http://localhost:5173/ (vite.desktop.config.mjs); the PWA is served by the server.
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

// Playwright is installed globally in the capture environment, not in the repo.
const require = createRequire(import.meta.url);
let pw;
try {
  pw = require('playwright');
} catch {
  pw = createRequire(execSync('npm root -g').toString().trim() + '/').call(null, 'playwright');
}
const { chromium, devices } = pw;

const [, , credsPath, outDir, DESKTOP = 'http://localhost:5173/', ONLY] = process.argv;
const creds = JSON.parse(readFileSync(credsPath, 'utf8'));
mkdirSync(outDir, { recursive: true });
const PHONE = `${creds.base}/`;
const book = (t) => creds.books[t];

async function login(kind) {
  const r = await fetch(`${creds.base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: creds.email,
      password: creds.password,
      device_kind: kind,
      device_name: kind === 'mobile' ? 'Telefono di Giulia' : 'Computer di casa',
      library_id: creds.library_id,
    }),
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()).session;
}

const SHOTS = [
  { name: 'desktop-library', kind: 'desktop', route: '/books', ready: 'text=Libri' },
  {
    name: 'desktop-shelf',
    kind: 'desktop',
    route: `/shelves?unit=${creds.units.grande}&book=${book('Il fu Mattia Pascal')}`,
    ready: 'text=ripiano 3',
  },
  { name: 'desktop-book', kind: 'desktop', route: `/books/${book('Il fu Mattia Pascal')}`, ready: 'text=Chi lo legge' },
  { name: 'desktop-loans', kind: 'desktop', route: '/loans', ready: 'text=Segna come restituito' },
  {
    name: 'desktop-stats',
    kind: 'desktop',
    route: '/stats',
    ready: 'text=Per genere',
  },
  {
    name: 'desktop-reading',
    kind: 'desktop',
    route: '/stats',
    ready: 'text=Per genere',
    async act(page) {
      await page.getByRole('tab', { name: 'Lettura' }).or(page.getByRole('button', { name: 'Lettura' })).first().click();
      await page.waitForTimeout(1500);
    },
  },
  { name: 'phone-where', kind: 'phone', route: `/books/${book('Delitto e castigo')}/where`, ready: 'text=posto' },
  {
    name: 'phone-search',
    kind: 'phone',
    route: '/search',
    ready: 'text=Ultimi libri aggiunti',
    async act(page) {
      await page.getByRole('searchbox').or(page.getByPlaceholder(/Cerca titolo/)).first().fill('Pirandello');
      await page.waitForTimeout(1200);
    },
  },
];

const browser = await chromium.launch();
for (const shot of SHOTS) {
  if (ONLY && shot.name !== ONLY) continue;
  for (const theme of ['light', 'dark']) {
    const desk = shot.kind === 'desktop';
    const common = { colorScheme: theme, reducedMotion: 'reduce', locale: 'it-IT', timezoneId: 'Europe/Rome' };
    const ctx = await browser.newContext(
      desk ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, ...common } : { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, ...common },
    );
    // A fresh session per capture: refresh tokens rotate, so contexts must not share one.
    const s = await login(desk ? 'desktop' : 'mobile');
    await ctx.addInitScript(
      ({ s, desk, theme }) => {
        if (sessionStorage.getItem('bk-seeded')) return;
        sessionStorage.setItem('bk-seeded', '1');
        localStorage.setItem('bookeeper.theme', theme); // the app toggles `html.dark` from this
        localStorage.setItem('bookeeper.locale', 'it');
        if (desk) {
          const id = 'demo-connection';
          localStorage.setItem(
            'bookeeper.connections',
            JSON.stringify({
              active: id,
              items: [
                {
                  id,
                  kind: 'remote',
                  url: 'https://libri.esempio.it',
                  fingerprint: null,
                  library_name: 'Famiglia Rossi',
                  user_name: 'Giulia',
                  device_id: s.device_id,
                  access_token: s.access_token,
                  refresh_token: s.refresh_token,
                },
              ],
            }),
          );
          // No tour is pending for this connection; also mark the first-book moment as seen.
          localStorage.setItem('bookeeper.onboarding.firstBook.' + id, '1');
        } else {
          localStorage.setItem(
            'bookeeper.mobile.session',
            JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token, device_id: s.device_id }),
          );
        }
      },
      { s, desk, theme },
    );
    const page = await ctx.newPage();
    await page.goto((desk ? DESKTOP : PHONE) + '#' + shot.route);
    await page.locator(shot.ready).first().waitFor({ timeout: 15000 });
    if (shot.act) await shot.act(page);
    await page.addStyleTag({ content: '*{caret-color:transparent!important}' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);
    const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    if (dark !== (theme === 'dark')) throw new Error(`${shot.name}: theme ${theme} not applied`);
    const file = `${outDir}/${shot.name}-${theme}.png`;
    await page.screenshot({ path: file });
    console.log('saved', file);
    await ctx.close();
  }
}
await browser.close();
