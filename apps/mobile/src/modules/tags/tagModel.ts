import { SHELF_COLORS } from '@bookeeper/ui/shelf';

/** Colors a tag can have: the names of the core, in the order of the shelf palette. */
export const TAG_COLORS = ['sage', 'terracotta', 'night', 'plum', 'amber', 'graphite'] as const;

/** Limits of the core. */
export const NAME_MAX = 40;

/** Same comparison as the core: outer spaces and letter case do not count. */
export const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The swatch color of a tag; an unknown name falls back to the first. */
export function colorOf(name: string): string {
  const i = (TAG_COLORS as readonly string[]).indexOf(name);
  return SHELF_COLORS[i === -1 ? 0 : i]!;
}

/** The first color of the palette that the fewest tags use. */
export function leastUsedColor(tags: readonly { color: string }[]): string {
  const uses = (name: string) => tags.filter((tag) => tag.color === name).length;
  return TAG_COLORS.reduce((best, name) => (uses(name) < uses(best) ? name : best), TAG_COLORS[0]);
}

export const tagFilterPath = (id: string) => `/search?tag=${encodeURIComponent(id)}`;

/** Writing books needs the `member` role (guests only read). */
export const canEditTags = (role: string | undefined) => role === 'owner' || role === 'admin' || role === 'member';
