import { describe, expect, it } from 'vitest';
import { decideResume, openingTarget, type ResumeSource } from './index';

const dev = (o: Partial<Extract<ResumeSource, { kind: 'device' }>> = {}): ResumeSource => ({
  kind: 'device', deviceId: 'phone', deviceKind: 'mobile', sameFile: true, value: 'cfi-p', percent: 45, at: 2000, ...o,
});
const local = { value: 'cfi-l', percent: 10, at: 1000 };

describe('resume', () => {
  it('no_offer_when_this_device_is_ahead', () => {
    expect(decideResume({ ...local, percent: 50 }, [dev()], 'me')).toBeNull();
    expect(decideResume(local, [dev({ deviceId: 'me' })], 'me')).toBeNull();
  });
  it('offer_when_another_device_is_ahead_and_newer', () => {
    const o = decideResume(local, [dev()], 'me');
    expect(o).toMatchObject({ percent: 45, page: null, target: { cfi: 'cfi-p' } });
    expect(decideResume(null, [dev()], 'me')).not.toBeNull();
  });
  it('ignores_sources_less_than_one_point_ahead', () => {
    expect(decideResume(local, [dev({ percent: 10.9 })], 'me')).toBeNull();
    expect(decideResume(local, [dev({ percent: 11 })], 'me')).not.toBeNull();
  });
  it('ignores_older_sources', () => {
    expect(decideResume(local, [dev({ at: 1000 }), dev({ at: 500 })], 'me')).toBeNull();
  });
  it('picks_the_furthest_then_the_newest', () => {
    const a = dev({ deviceId: 'a', percent: 30, at: 3000 });
    const b = dev({ deviceId: 'b', percent: 60, at: 2000 });
    const c = dev({ deviceId: 'c', percent: 60, at: 2500 });
    expect(decideResume(local, [a, b, c], 'me')?.source).toBe(c);
  });
  it('own_server_copy_is_where_the_book_opens', () => {
    const own = dev({ deviceId: 'me', value: 'cfi-own' });
    expect(openingTarget(null, [dev(), own], 'me')).toEqual({ cfi: 'cfi-own' });
    expect(openingTarget(null, [dev({ deviceId: 'me', value: null, percent: 50 })], 'me')).toEqual({ fraction: 0.5 });
    expect(openingTarget(local, [own], 'me')).toBeNull();
    expect(openingTarget(null, [dev()], 'me')).toBeNull();
  });
  it('own_copy_of_another_file_gives_only_a_fraction', () => {
    expect(openingTarget(null, [dev({ deviceId: 'me', sameFile: false, percent: 30 })], 'me')).toEqual({ fraction: 0.3 });
    const other = dev({ deviceId: 'me', sameFile: false, value: 'x' });
    expect(openingTarget(null, [other, dev({ deviceId: 'me', value: 'cfi-own' })], 'me')).toEqual({ cfi: 'cfi-own' });
  });
  it('offer_is_measured_against_the_own_server_copy', () => {
    const own = dev({ deviceId: 'me', percent: 50, at: 1000 });
    expect(decideResume(null, [own, dev({ percent: 45, at: 2000 })], 'me')).toBeNull();
    expect(decideResume({ ...local, percent: 10.1 }, [dev({ percent: 11.1 })], 'me')).not.toBeNull();
  });
  it('a_hand_typed_page_is_offered_with_its_page', () => {
    const o = decideResume(local, [{ kind: 'page', page: 212, percent: 45, at: 2000 }], 'me');
    expect(o).toMatchObject({ page: 212, percent: 45, target: { fraction: 0.45 } });
    const other = decideResume(local, [dev({ sameFile: false })], 'me');
    expect(other?.target).toEqual({ fraction: 0.45 });
  });
});
