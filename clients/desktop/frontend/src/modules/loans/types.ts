/**
 * modules/loans/types.ts
 *
 * Tipi e helper per i prestiti familiari. Lo stato di un prestito è
 * derivato lato client da (lent_at, due_at, returned_at) per restare
 * sempre coerente col tempo reale (un prestito diventa "overdue" da solo
 * non appena la data passa, senza richiedere refresh).
 */

export type LoanStatus = 'active' | 'overdue' | 'returned';

export interface LoanStatusMeta {
  value: LoanStatus;
  label: string;
  severity: 'info' | 'warn' | 'danger' | 'success' | 'secondary';
  icon: string;
}

export const LOAN_STATUSES: LoanStatusMeta[] = [
  { value: 'active', label: 'In corso', severity: 'info', icon: 'pi pi-clock' },
  { value: 'overdue', label: 'In ritardo', severity: 'danger', icon: 'pi pi-exclamation-triangle' },
  { value: 'returned', label: 'Restituito', severity: 'success', icon: 'pi pi-check-circle' },
];

export function statusMeta(s: LoanStatus): LoanStatusMeta {
  return LOAN_STATUSES.find((x) => x.value === s) ?? LOAN_STATUSES[0];
}

/** Loan come arriva dall'API (snake_case, mirror del DTO Go). */
export interface Loan {
  id: string;
  book_id: string;
  /** Snapshot dal JOIN backend, vuoto se il libro è stato cancellato. */
  book_title: string;
  /** JSON array stringificato (es. `["Tolkien","Lewis"]`); parsiamo on demand. */
  book_authors: string;
  borrower_name: string;
  borrower_user_id?: string | null;
  lent_at: number;
  due_at?: number | null;
  returned_at?: number | null;
  notes?: string | null;
}

/** Payload per create/update. Usiamo 0 per "nessuna data" su due_at. */
export interface LoanInput {
  book_id: string;
  borrower_name: string;
  lent_at: number;
  due_at: number;
  notes: string;
}

export const EMPTY_LOAN_INPUT: LoanInput = {
  book_id: '',
  borrower_name: '',
  lent_at: 0,
  due_at: 0,
  notes: '',
};

export function loanToInput(l: Loan): LoanInput {
  return {
    book_id: l.book_id,
    borrower_name: l.borrower_name,
    lent_at: l.lent_at,
    due_at: l.due_at ?? 0,
    notes: l.notes ?? '',
  };
}

/** Deriva lo stato corrente di un prestito (epoch secondi UTC). */
export function deriveStatus(l: Loan, nowSec: number = Math.floor(Date.now() / 1000)): LoanStatus {
  if (l.returned_at && l.returned_at > 0) return 'returned';
  if (l.due_at && l.due_at > 0 && l.due_at < nowSec) return 'overdue';
  return 'active';
}

/** Giorni residui (positivi = ancora utili, negativi = ritardo, null = no scadenza). */
export function daysRemaining(l: Loan, nowSec: number = Math.floor(Date.now() / 1000)): number | null {
  if (!l.due_at || l.due_at <= 0) return null;
  if (l.returned_at && l.returned_at > 0) return null;
  const diff = l.due_at - nowSec;
  return Math.ceil(diff / 86400);
}

/** Tenta il parse del JSON authors; fallback a stringa singola o []. */
export function parseAuthors(raw: string): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Conversione Date <-> epoch secondi (helper per i Calendar PrimeVue). */
export function dateToUnix(d: Date | null | undefined): number {
  if (!d) return 0;
  return Math.floor(d.getTime() / 1000);
}

export function unixToDate(v: number | null | undefined): Date | null {
  if (!v || v <= 0) return null;
  return new Date(v * 1000);
}
