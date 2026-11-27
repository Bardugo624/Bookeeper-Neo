import { expect, it } from 'vitest';
import { dispositionName } from './dispositionName';

it('prefers the UTF-8 form, then the plain one', () => {
  expect(dispositionName("attachment; filename=\"a.pdf\"; filename*=UTF-8''%C3%A8.pdf")).toBe('è.pdf');
  expect(dispositionName('attachment; filename="a b.pdf"')).toBe('a b.pdf');
  expect(dispositionName('attachment; filename=a.pdf')).toBe('a.pdf');
});

it('is null without a usable name', () => {
  expect(dispositionName(null)).toBeNull();
  expect(dispositionName('attachment')).toBeNull();
  expect(dispositionName("attachment; filename*=UTF-8''%E0%A4")).toBeNull();
});
