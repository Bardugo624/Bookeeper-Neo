import { describe, expect, it } from 'vitest';
import { serverMode } from './serverMode';

describe('serverMode', () => {
  it('treats a plain server reached over HTTPS as encrypted by a proxy', () => {
    expect(serverMode('off', 'https://libri.example.org', null)).toBe('proxy');
    expect(serverMode('off', null, 'https://libri.example.org')).toBe('proxy');
  });
  it('keeps a plain server on plain HTTP unencrypted', () => {
    expect(serverMode('off', null, 'http://192.168.1.5:7842')).toBe('off');
    expect(serverMode('off', null, null)).toBe('off');
  });
  it('passes the other modes through', () => {
    expect(serverMode('acme', 'https://libri.example.org', null)).toBe('acme');
    expect(serverMode('self', null, 'https://192.168.1.5:7842')).toBe('self');
    expect(serverMode('local', null, null)).toBe('local');
  });
});
