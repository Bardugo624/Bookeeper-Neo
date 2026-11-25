import { describe, expect, it } from 'vitest';
import { ApiError } from '@bookeeper/api';
import { t } from '@bookeeper/i18n';
import { apiErrorMessage } from './apiErrorMessage';

const tr = (key: string, vars?: Record<string, string | number>) => t('it', key, vars);
const generic = tr('common.errors.generic');

describe('apiErrorMessage', () => {
  it.each(['validation', 'not_found', 'conflict', 'forbidden', 'payload_too_large', 'network'])('has its own text for %s', (code) => {
    const msg = apiErrorMessage(tr, new ApiError(400, code, 'x'));
    expect(msg).toBe(tr(`common.errors.${code}`));
    expect(msg).not.toBe(generic);
  });

  it.each(['slot_taken', 'book_already_lent', 'progressive_taken', 'setup_closed'])('shows the conflict text for the domain code %s', (code) => {
    expect(apiErrorMessage(tr, new ApiError(409, code, 'x'))).toBe(tr('common.errors.conflict'));
  });

  it('puts the seconds in rate_limited', () => {
    expect(apiErrorMessage(tr, new ApiError(429, 'rate_limited', 'x', 12))).toContain('12');
  });

  it('falls back to a generic text', () => {
    expect(apiErrorMessage(tr, new ApiError(500, 'internal', 'x'))).toBe(generic);
    expect(apiErrorMessage(tr, new Error('x'))).toBe(generic);
  });

  it('lets overrides win', () => {
    expect(apiErrorMessage(tr, new ApiError(409, 'conflict', 'x'), { conflict: 'Già in prestito' })).toBe('Già in prestito');
  });
});
