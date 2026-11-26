import { SHELF_COLORS } from '@bookeeper/ui/shelf';

/** Colors a tag can have: the names of the core, in the order of the shelf palette. */
export const TAG_COLORS = ['sage', 'terracotta', 'night', 'plum', 'amber', 'graphite'] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export const DEFAULT_COLOR: TagColor = 'sage';

/** Limits of the core: 1..40 characters per name, at most 20 tags per book. */
export const NAME_MAX = 40;
export const MAX_TAGS_PER_BOOK = 20;

/** The swatch color of a tag; an unknown name falls back to the default. */
export function colorOf(name: string): string {
  const i = (TAG_COLORS as readonly string[]).indexOf(name);
  return SHELF_COLORS[i === -1 ? 0 : i]!;
}

export function isTagColor(name: string): name is TagColor {
  return (TAG_COLORS as readonly string[]).includes(name);
}

/** Same comparison as the core: outer spaces and letter case do not count. */
export const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The same set of ids, whatever the order. */
export function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}
