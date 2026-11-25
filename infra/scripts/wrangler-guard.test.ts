// The deploy preflight must refuse any login other than khangtd.09@gmail.com (ported from th.legal, 2026-11-24).
import { describe, expect, test } from 'bun:test';
import { decideAccount, findEmails, isExpectedAccount, isTokenMode, wranglerChildEnv } from './wrangler-guard.ts';

const GMAIL_WHOAMI = `wrangler: using khangtd.09@gmail.com
 ⛅️ wrangler 4.157.0
Getting User settings...
👋 You are logged in with an OAuth Token, associated with the email khangtd.09@gmail.com.`;

const OTHER_WHOAMI = `wrangler: using someone@other-account.example
👋 You are logged in with an OAuth Token, associated with the email someone@other-account.example.`;

describe('findEmails / isExpectedAccount', () => {
  test('extracts the email from a whoami transcript', () => {
    expect(findEmails(GMAIL_WHOAMI)).toEqual(['khangtd.09@gmail.com']);
  });

  test('accepts the expected account', () => {
    expect(isExpectedAccount(GMAIL_WHOAMI)).toBe(true);
  });

  test('refuses another account login', () => {
    expect(isExpectedAccount(OTHER_WHOAMI)).toBe(false);
    expect(findEmails(OTHER_WHOAMI)).toEqual(['someone@other-account.example']);
  });

  test('refuses look-alike addresses (prefix and suffix tricks)', () => {
    expect(isExpectedAccount('associated with the email xkhangtd.09@gmail.com.')).toBe(false);
    expect(isExpectedAccount('associated with the email khangtd.09@gmail.com.evil.io')).toBe(false);
  });

  test('matches case-insensitively', () => {
    expect(isExpectedAccount('email KHANGTD.09@GMAIL.COM')).toBe(true);
  });
});

describe('decideAccount', () => {
  test('ok on the expected login and prints the found email', () => {
    const d = decideAccount(GMAIL_WHOAMI, {});
    expect(d.ok).toBe(true);
    expect(d.found).toEqual(['khangtd.09@gmail.com']);
  });

  test('refuses another login and names the email it found', () => {
    const d = decideAccount(OTHER_WHOAMI, {});
    expect(d.ok).toBe(false);
    expect(d.found).toEqual(['someone@other-account.example']);
    expect(d.reason).toContain('someone@other-account.example');
  });

  test('refuses when no email is printed (API-token or logged-out state)', () => {
    const d = decideAccount('You are not authenticated.', {});
    expect(d.ok).toBe(false);
    expect(d.found).toEqual([]);
  });

  test('refuses when an API token is set, even on the expected login', () => {
    const d = decideAccount(GMAIL_WHOAMI, { CLOUDFLARE_API_TOKEN: 'x' });
    expect(d.ok).toBe(false);
    expect(d.reason).toContain('CLOUDFLARE_API_TOKEN');
  });
});

describe('wranglerChildEnv', () => {
  test('strips credentials and project-local node_modules/.bin from PATH', () => {
    const env = wranglerChildEnv({
      CLOUDFLARE_API_TOKEN: 't',
      CLOUDFLARE_API_KEY: 'k',
      CLOUDFLARE_EMAIL: 'e',
      HOME: '/h',
      PATH: '/repo/node_modules/.bin:/Users/u/.local/bin:/usr/bin::/repo/packages/x/node_modules/.bin',
    });
    expect(env.CLOUDFLARE_API_TOKEN).toBeUndefined();
    expect(env.CLOUDFLARE_API_KEY).toBeUndefined();
    expect(env.CLOUDFLARE_EMAIL).toBeUndefined();
    expect(env.HOME).toBe('/h');
    expect(env.PATH).toBe('/Users/u/.local/bin:/usr/bin');
  });
});

// Token mode (2026-11-24): a User API Token is accepted only for the expected owner and account.
const ACCOUNT = '0123456789abcdef0123456789abcdef';
const TOKEN_WHOAMI = `👋 You are logged in with an User API Token, associated with the email khangtd.09@gmail.com.
ℹ️  The API Token is read from the CLOUDFLARE_API_TOKEN environment variable.
│ Khangtd.09@gmail.com's Account │ ${ACCOUNT} │`;
const TOKEN_ENV = { CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: ACCOUNT };

describe('token mode', () => {
  test('accepts a User API Token of the expected owner that reaches the account', () => {
    const d = decideAccount(TOKEN_WHOAMI, TOKEN_ENV);
    expect(d.ok).toBe(true);
  });

  test('refuses a token without CLOUDFLARE_ACCOUNT_ID', () => {
    const d = decideAccount(TOKEN_WHOAMI, { CLOUDFLARE_API_TOKEN: 't' });
    expect(d.ok).toBe(false);
    expect(d.reason).toContain('CLOUDFLARE_ACCOUNT_ID');
  });

  test('refuses a token whose account list lacks CLOUDFLARE_ACCOUNT_ID', () => {
    const d = decideAccount(TOKEN_WHOAMI, { ...TOKEN_ENV, CLOUDFLARE_ACCOUNT_ID: 'f'.repeat(32) });
    expect(d.ok).toBe(false);
  });

  test('refuses a User API Token of another owner', () => {
    const d = decideAccount(TOKEN_WHOAMI.replace('associated with the email khangtd.09@gmail.com', 'associated with the email someone@other-account.example'), TOKEN_ENV);
    expect(d.ok).toBe(false);
    expect(d.reason).toContain('someone@other-account.example');
  });

  test('refuses an Account API Token (no owner email)', () => {
    const d = decideAccount(`You are logged in with an Account API Token.\n│ x │ ${ACCOUNT} │`, TOKEN_ENV);
    expect(d.ok).toBe(false);
  });

  test('refuses an OAuth transcript while a token is set', () => {
    expect(decideAccount(GMAIL_WHOAMI, TOKEN_ENV).ok).toBe(false);
  });

  test('the Global API Key is never token mode and stays refused', () => {
    const env = { ...TOKEN_ENV, CLOUDFLARE_API_KEY: 'k' };
    expect(isTokenMode(env)).toBe(false);
    expect(decideAccount(TOKEN_WHOAMI, env).ok).toBe(false);
  });

  test('wranglerChildEnv keeps the token and account and adds the project wrangler to PATH', () => {
    const env = wranglerChildEnv({ ...TOKEN_ENV, CLOUDFLARE_EMAIL: '', PATH: '/usr/bin' });
    expect(env.CLOUDFLARE_API_TOKEN).toBe('t');
    expect(env.CLOUDFLARE_ACCOUNT_ID).toBe(ACCOUNT);
    expect(env.PATH).toBe(`/usr/bin:${process.cwd()}/node_modules/.bin`);
  });
});
