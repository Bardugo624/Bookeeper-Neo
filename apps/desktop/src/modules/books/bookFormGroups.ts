import type { BookFormValues } from './bookFormModel';

/** The groups of the sheet that fold away; the essentials are always in view. */
export type GroupId = 'edition' | 'collection' | 'notes';

export const GROUP_IDS: readonly GroupId[] = ['edition', 'collection', 'notes'];

/** Fields of each foldable group, in the order of the form. */
export const GROUP_FIELDS: Record<GroupId, ReadonlyArray<keyof BookFormValues>> = {
  edition: ['language', 'pages', 'format', 'isbn13', 'isbn10'],
  collection: ['genre', 'progressive', 'condition', 'acquired', 'price', 'owner'],
  notes: ['description', 'notes'],
};

export type OpenGroups = Record<GroupId, boolean>;

const filled = (v: BookFormValues[keyof BookFormValues]) => (Array.isArray(v) ? v.length > 0 : v.trim() !== '');

/** How many fields of the group hold a value. */
export function filledCount(values: BookFormValues, group: GroupId): number {
  return GROUP_FIELDS[group].filter((key) => filled(values[key])).length;
}

/**
 * Open the groups that have values (from the lookup or from the stored book), fold the empty ones.
 * `ignore` names fields the app fills in by itself (the proposed progressive number of a new book).
 */
export function groupsWithValues(values: BookFormValues, ignore: ReadonlyArray<keyof BookFormValues> = []): OpenGroups {
  const has = (group: GroupId) => GROUP_FIELDS[group].some((key) => !ignore.includes(key) && filled(values[key]));
  return { edition: has('edition'), collection: has('collection'), notes: has('notes') };
}

/** The group a field lives in; undefined for the essentials. */
export function groupOf(key: keyof BookFormValues): GroupId | undefined {
  return GROUP_IDS.find((g) => GROUP_FIELDS[g].includes(key));
}
