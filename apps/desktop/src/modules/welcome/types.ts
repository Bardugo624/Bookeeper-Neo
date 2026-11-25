export type PathId = 'local' | 'join' | 'server';

/** A message with a button that sends the user to another card. */
export interface Redirect {
  text: string;
  to: PathId;
  action: string;
}
