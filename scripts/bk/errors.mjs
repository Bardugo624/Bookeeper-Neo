// A failure the user can act on: printed as a short message plus an optional hint.
export class BkError extends Error {
  constructor(message, hint) {
    super(message);
    this.name = 'BkError';
    this.hint = hint;
  }
}
