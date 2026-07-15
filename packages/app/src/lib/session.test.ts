import { describe, it, expect, beforeAll } from 'vitest';
import { createSessionToken, verifySessionToken } from './session.js';

beforeAll(() => {
  process.env['SESSION_SECRET'] = 'test-secret-that-is-long-enough-32chars';
});

describe('createSessionToken / verifySessionToken', () => {
  it('round-trips a valid session', async () => {
    const token = await createSessionToken({ displayName: 'Alice' });
    const result = await verifySessionToken(token);
    expect(result).toEqual({ displayName: 'Alice' });
  });

  it('returns null for a tampered token', async () => {
    const token = await createSessionToken({ displayName: 'Bob' });
    const tampered = token.slice(0, -4) + 'XXXX';
    expect(await verifySessionToken(tampered)).toBeNull();
  });

  it('returns null for a garbage string', async () => {
    expect(await verifySessionToken('not.a.jwt')).toBeNull();
  });

  it('returns null for an empty string', async () => {
    expect(await verifySessionToken('')).toBeNull();
  });
});
