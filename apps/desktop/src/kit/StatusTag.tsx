import { Tag, type TagProps } from '@bookeeper/ui/base';

type Tone = NonNullable<TagProps['tone']>;

export interface StatusTagProps<S extends string> {
  status: S;
  /** Tone per status; a missing status is neutral. */
  tones: Partial<Record<S, Tone>>;
  /** Visible text per status, already translated. */
  labels: Record<S, string>;
}

export function StatusTag<S extends string>({ status, tones, labels }: StatusTagProps<S>) {
  return <Tag tone={tones[status] ?? 'neutral'}>{labels[status]}</Tag>;
}
