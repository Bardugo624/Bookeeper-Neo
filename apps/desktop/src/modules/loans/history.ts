import type { LoanOut } from '@bookeeper/api';

export const DAY_SECONDS = 86_400;

export interface MonthGroup {
  /** `YYYY-MM` of the return, local time. */
  key: string;
  /** A unix time inside the month, to format its name. */
  at: number;
  loans: LoanOut[];
}

export interface HistorySummary {
  closed: number;
  /** Average length in whole days; null with no closed loan. */
  averageDays: number | null;
  /** Person with most loans (ties: the first alphabetically). */
  topBorrower: { name: string; count: number } | null;
}

/** Days the book stayed out. */
export function durationDays(loan: Pick<LoanOut, 'lent_at' | 'returned_at'>): number {
  if (loan.returned_at == null) return 0;
  return Math.max(0, Math.round((loan.returned_at - loan.lent_at) / DAY_SECONDS));
}

/** Days past the due date at the return; 0 when on time or without a due date. */
export function lateDays(loan: Pick<LoanOut, 'due_at' | 'returned_at'>): number {
  if (loan.returned_at == null || loan.due_at == null || loan.returned_at <= loan.due_at) return 0;
  return Math.max(1, Math.round((loan.returned_at - loan.due_at) / DAY_SECONDS));
}

function monthKey(unix: number): string {
  const d = new Date(unix * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Returned loans grouped by month of return, most recent month (and loan) first. */
export function groupByMonth(loans: LoanOut[]): MonthGroup[] {
  const sorted = loans
    .filter((l) => l.returned_at != null)
    .sort((a, b) => (b.returned_at ?? 0) - (a.returned_at ?? 0));
  const groups: MonthGroup[] = [];
  for (const loan of sorted) {
    const at = loan.returned_at ?? 0;
    const key = monthKey(at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.loans.push(loan);
    else groups.push({ key, at, loans: [loan] });
  }
  return groups;
}

export function summarize(loans: LoanOut[]): HistorySummary {
  const closed = loans.filter((l) => l.returned_at != null);
  if (closed.length === 0) return { closed: 0, averageDays: null, topBorrower: null };
  const total = closed.reduce((n, l) => n + durationDays(l), 0);
  const counts = new Map<string, { name: string; count: number }>();
  for (const l of closed) {
    const k = sameName(l.borrower_name);
    const e = counts.get(k);
    if (e) e.count += 1;
    else counts.set(k, { name: l.borrower_name, count: 1 });
  }
  const top = [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))[0] ?? null;
  return { closed: closed.length, averageDays: Math.round(total / closed.length), topBorrower: top };
}

/** Key to compare names without regard to case or surrounding spaces. */
export function sameName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

/** Search by person or title over the loaded loans. */
export function matchesText(loan: Pick<LoanOut, 'borrower_name' | 'book_title'>, text: string): boolean {
  const q = text.trim().toLocaleLowerCase();
  if (!q) return true;
  return loan.borrower_name.toLocaleLowerCase().includes(q) || loan.book_title.toLocaleLowerCase().includes(q);
}
