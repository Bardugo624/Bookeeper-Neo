import type { AuditOut } from '@bookeeper/api';
import { stringParam, type ParamSchema, type ParamSpec } from '../../../../kit';

export const PAGE_SIZE = 50;
/** Most entries the CSV carries; the core pages at 200. */
export const CSV_MAX = 5000;
export const CSV_PAGE = 200;

/** Every `action` the core writes, each with a sentence under `audit.what.<action>`. */
export const KNOWN_ACTIONS = [
  'book.create', 'book.update', 'book.delete', 'book.cover', 'book.cover_delete', 'book.tags',
  'library.backup', 'library.import', 'library.restore',
  'loan.create', 'loan.update', 'loan.delete', 'loan.return', 'loan.reopen',
  'reading.set', 'reading.delete',
  'room.create', 'room.update', 'room.delete',
  'shelf.create', 'shelf.update', 'shelf.delete', 'shelf.place', 'shelf.unplace',
  'tag.create', 'tag.update', 'tag.delete',
  'wishlist.create', 'wishlist.update', 'wishlist.delete', 'wishlist.convert',
  'device.revoke',
  'user.update', 'user.remove', 'user.join', 'library.owner', 'invite.create', 'invite.revoke',
] as const;

export function isKnownAction(action: string): boolean {
  return (KNOWN_ACTIONS as readonly string[]).includes(action);
}

const dayParam = (): ParamSpec<string> => ({
  default: '',
  parse: (raw) => (/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : undefined),
  serialize: (v) => v,
});

export interface AuditFilters {
  user: string;
  device: string;
  action: string;
  from: string;
  to: string;
}

export const AUDIT_PARAMS: ParamSchema<AuditFilters> = {
  user: stringParam(),
  device: stringParam(),
  action: stringParam(),
  from: dayParam(),
  to: dayParam(),
};


/** Start and end of the chosen local days, as unix seconds (both inclusive). */
export function dayBounds(from: string, to: string): { from?: number; to?: number } {
  const out: { from?: number; to?: number } = {};
  const f = /^(\d{4})-(\d{2})-(\d{2})$/.exec(from);
  const e = /^(\d{4})-(\d{2})-(\d{2})$/.exec(to);
  if (f) out.from = Math.floor(new Date(+f[1]!, +f[2]! - 1, +f[3]!, 0, 0, 0).getTime() / 1000);
  if (e) out.to = Math.floor(new Date(+e[1]!, +e[2]! - 1, +e[3]!, 23, 59, 59).getTime() / 1000);
  return out;
}

export function queryParams(f: AuditFilters) {
  return {
    user_id: f.user || undefined,
    device_id: f.device || undefined,
    action: f.action || undefined,
    ...dayBounds(f.from, f.to),
  };
}

type Detail = Record<string, unknown>;
const detailOf = (e: AuditOut): Detail => (e.detail && typeof e.detail === 'object' ? (e.detail as Detail) : {});
const text = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : typeof v === 'number' ? String(v) : undefined);

/** The book an entry is about, if any: the entity itself, or the book a wish became. */
export function bookIdOf(e: AuditOut): string | undefined {
  if ((e.entity_type === 'book' || e.entity_type === 'reading') && e.entity_id) return e.action === 'book.delete' ? undefined : e.entity_id;
  if (e.action === 'wishlist.convert') return text(detailOf(e).book_id);
  return undefined;
}

export interface Phrase {
  /** i18n key of the sentence; `null` for an action the client does not know. */
  key: string | null;
  vars: Record<string, string | number>;
  /** Title stored in the entry, when it has one. */
  title?: string;
}

/** Picks the sentence for an entry and the values it needs (translated later). */
export function phraseOf(e: AuditOut): Phrase {
  const d = detailOf(e);
  if (!isKnownAction(e.action)) return { key: null, vars: {} };
  const title = text(d.title);
  const vars: Record<string, string | number> = {};
  if (e.action === 'tag.create') vars.name = text(d.name) ?? '';
  if (e.action === 'library.import') {
    vars.new = Number(d.new ?? 0);
    vars.duplicates = Number(d.duplicates ?? 0);
  }
  if (e.action === 'reading.set') vars.status = text(d.status) ?? '';
  if (e.action === 'invite.create') vars.role = text(d.role) ?? '';
  if (e.action === 'user.join') {
    vars.name = text(d.display_name) ?? '';
    vars.role = text(d.role) ?? '';
    if (!vars.name) return { key: 'audit.what.user.joinUnnamed', vars, title };
  }
  if (e.action === 'user.remove') {
    vars.name = text(d.display_name) ?? '';
    if (!vars.name) return { key: 'audit.what.user.removeUnnamed', vars, title };
  }
  if (e.action === 'user.update') {
    // One change has its own sentence; several at once (or none known) get the general one.
    const name = text(d.display_name);
    const role = text(d.role);
    if (name && !role) return { key: 'audit.what.user.updateName', vars: { name }, title };
    if (role && !name) return { key: 'audit.what.user.updateRole', vars: { role }, title };
  }
  return { key: `audit.what.${e.action}`, vars, title };
}
