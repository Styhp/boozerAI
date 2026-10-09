import { describe, expect, it } from 'vitest';
import { permitsRequest } from '../src/server/app.js';

describe('static host boundary', () => {
  it('allows the exact loopback host and same origin', () => {
    expect(permitsRequest('127.0.0.1:4173', undefined)).toBe(true);
    expect(permitsRequest('127.0.0.1:4173', 'http://127.0.0.1:4173')).toBe(true);
  });
  it('rejects rebinding hosts, cross-origin requests and null origins', () => {
    for (const host of [undefined, 'localhost:4173', 'evil.example:4173', '127.0.0.1:5173']) {
      expect(permitsRequest(host, undefined)).toBe(false);
    }
    for (const origin of ['null', 'https://evil.example', 'http://127.0.0.1:5173']) {
      expect(permitsRequest('127.0.0.1:4173', origin)).toBe(false);
    }
  });
  it('blocks network calls in the default suite', () => {
    expect(() => fetch('http://127.0.0.1:11434')).toThrow('Network access is forbidden');
  });
  it('allows the exact dev-proxy Origin only for explicit development startup', () => {
    expect(permitsRequest('127.0.0.1:4173', 'http://127.0.0.1:5173')).toBe(false);
    expect(permitsRequest('127.0.0.1:4173', 'http://127.0.0.1:5173', false)).toBe(false);
    expect(permitsRequest('127.0.0.1:4173', 'http://127.0.0.1:5173', true)).toBe(true);
    expect(permitsRequest('127.0.0.1:4173', 'http://127.0.0.1:4173', true)).toBe(true);
    expect(permitsRequest('127.0.0.1:4173', undefined, true)).toBe(true);
  });
  it('keeps Host checks and rejects null, foreign and lookalike Origins in dev mode', () => {
    for (const host of [undefined, 'localhost:4173', 'evil.example:4173', '127.0.0.1:5173']) {
      expect(permitsRequest(host, 'http://127.0.0.1:5173', true)).toBe(false);
    }
    for (const origin of ['null', 'https://evil.example', 'http://localhost:5173', 'https://127.0.0.1:5173', 'http://127.0.0.1:5173/', 'http://127.0.0.1:51730']) {
      expect(permitsRequest('127.0.0.1:4173', origin, true)).toBe(false);
    }
  });
});
