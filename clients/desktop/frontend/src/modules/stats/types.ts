/**
 * modules/stats/types.ts
 *
 * DTO mirror del payload restituito da `GET /api/v1/stats`. Tutti i campi
 * sono snake_case perché replicano il JSON del server senza ulteriori
 * trasformazioni.
 */

export interface StatsKV {
  key: string;
  count: number;
}

export interface StatsMonth {
  ym: string; // "YYYY-MM"
  count: number;
}

export interface StatsLoanMonth {
  ym: string;
  lent: number;
  returned: number;
}

export interface StatsShelfFill {
  id: string;
  name: string;
  color: string;
  capacity: number;
  used: number;
  pct: number; // 0..1+
}

export interface StatsOverview {
  total_books: number;
  total_authors: number;
  total_shelves: number;
  total_pages: number;
  wishlist_count: number;
  active_loans: number;
  overdue_loans: number;
  returned_loans: number;
}

export interface StatsResponse {
  overview: StatsOverview;
  by_format: StatsKV[];
  by_language: StatsKV[];
  by_genre: StatsKV[];
  by_decade: StatsKV[];
  additions_by_month: StatsMonth[];
  loans_by_month: StatsLoanMonth[];
  top_authors: StatsKV[];
  shelf_fill: StatsShelfFill[];
}

/* ---------- Helpers di formattazione ---------- */

const NUM_IT = new Intl.NumberFormat('it-IT');
export const fmtNum = (n: number | null | undefined): string =>
  n == null ? '—' : NUM_IT.format(n);

const MONTH_SHORT = new Intl.DateTimeFormat('it-IT', { month: 'short', year: '2-digit' });
/** "2025-04" → "apr 25" — etichette ad alta densità per asse X. */
export function fmtMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return MONTH_SHORT.format(new Date(Date.UTC(y, m - 1, 1)));
}

/** Etichette leggibili in italiano per i formati libro più comuni. */
const FORMAT_LABELS: Record<string, string> = {
  hardcover: 'Rilegato',
  paperback: 'Brossura',
  ebook: 'Ebook',
  audiobook: 'Audiolibro',
  sconosciuto: 'Sconosciuto',
};
export const fmtFormat = (key: string): string =>
  FORMAT_LABELS[key.toLowerCase()] ?? key;

/** Codici ISO 639-1 più comuni → nome lingua in italiano. */
const LANG_LABELS: Record<string, string> = {
  it: 'Italiano',
  en: 'Inglese',
  fr: 'Francese',
  de: 'Tedesco',
  es: 'Spagnolo',
  pt: 'Portoghese',
  ja: 'Giapponese',
  zh: 'Cinese',
  la: 'Latino',
  sconosciuto: 'Sconosciuta',
};
export const fmtLanguage = (key: string): string => {
  const k = key.toLowerCase();
  return LANG_LABELS[k] ?? key;
};

/** Percentuale "compressa": 0.873 → "87%". */
export const fmtPct = (v: number): string => `${Math.round(v * 100)}%`;
