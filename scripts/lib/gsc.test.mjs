import { generateKeyPairSync, createVerify } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  READONLY_SCOPE,
  analyticsTotals,
  coverageCounts,
  opportunities,
  serviceAccountJwt,
} from './gsc.mjs';

describe('serviceAccountJwt', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const key = {
    client_email: 'reader@p.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    private_key_id: 'abc',
    token_uri: 'https://oauth2.googleapis.com/token',
  };

  it('asks only for the read-only scope, for one hour, signed with the key', () => {
    const jwt = serviceAccountJwt(key, 1000);
    const [header, claims, signature] = jwt.split('.');
    const decode = (s) => JSON.parse(Buffer.from(String(s), 'base64url').toString());
    expect(decode(header)).toEqual({ alg: 'RS256', typ: 'JWT', kid: 'abc' });
    expect(decode(claims)).toEqual({
      iss: key.client_email,
      scope: READONLY_SCOPE,
      aud: key.token_uri,
      iat: 1000,
      exp: 4600,
    });
    const ok = createVerify('RSA-SHA256')
      .update(`${header}.${claims}`)
      .verify(publicKey, Buffer.from(String(signature), 'base64url'));
    expect(ok).toBe(true);
  });

  it('refuses a file that is not a service account key', () => {
    expect(() => serviceAccountJwt({ client_email: 'x' }, 1)).toThrow(/private_key/);
  });
});

describe('coverageCounts', () => {
  it('counts states, most common first', () => {
    expect(
      coverageCounts([
        { coverageState: 'Submitted and indexed' },
        { coverageState: 'Discovered - currently not indexed' },
        { coverageState: 'Discovered - currently not indexed' },
        {},
      ]),
    ).toEqual([
      ['Discovered - currently not indexed', 2],
      ['No answer', 1],
      ['Submitted and indexed', 1],
    ]);
  });
});

describe('analyticsTotals', () => {
  it('weights position by impressions and is empty-safe', () => {
    expect(
      analyticsTotals([
        { clicks: 1, impressions: 10, position: 5 },
        { clicks: 0, impressions: 30, position: 15 },
      ]),
    ).toEqual({ clicks: 1, impressions: 40, ctr: 0.025, position: 12.5 });
    expect(analyticsTotals([])).toEqual({ clicks: 0, impressions: 0, ctr: 0, position: null });
  });
});

describe('opportunities', () => {
  const row = (q, impressions, position, ctr) => ({
    keys: [q],
    clicks: 0,
    impressions,
    ctr,
    position,
  });

  it('flags near-page-one and low-CTR queries with enough impressions', () => {
    expect(
      opportunities([
        row('near', 50, 12, 0.01),
        row('top-low-ctr', 80, 3, 0.01),
        row('top-good', 80, 3, 0.2),
        row('too-few', 5, 12, 0),
        row('far', 50, 40, 0),
      ]).map((o) => [o.query, o.reasons]),
    ).toEqual([
      ['top-low-ctr', ['shown but rarely clicked']],
      ['near', ['near page one']],
    ]);
  });
});
