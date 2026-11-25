// Account guard for every wrangler run from this repo (deploy, secrets, tail).
// Ported verbatim from gumpbox-landing (infra/scripts/wrangler-guard.ts, from th.legal), 2026-11-25: same
// Cloudflare account. Production changes go only through the khangtd.09@gmail.com login. The machine's folder-aware shim
// (~/.local/bin/wrangler) picks that login; a project-local copy (bunx / npx / node_modules/.bin) skips the shim
// and would use another login. So: wrangler is resolved from PATH without node_modules/.bin, and
// `wrangler whoami` must print khangtd.09@gmail.com before anything runs.
//
// Token mode (founder decision, 2026-11-24): cloud sessions have no browser login, so a User API Token in
// CLOUDFLARE_API_TOKEN is accepted when, and only when, `wrangler whoami` (run with that token) says it is a
// User API Token associated with khangtd.09@gmail.com, prints no other email, and lists the account in
// CLOUDFLARE_ACCOUNT_ID. Cloudflare answers whoami from the token itself, so the token proves its owner.
// Account API Tokens (no owner email), the Global API Key (CLOUDFLARE_API_KEY / CLOUDFLARE_EMAIL) and a
// token without CLOUDFLARE_ACCOUNT_ID stay refused. In token mode the identity is pinned by the token, so the
// project copy of wrangler may run (the login shim matters only for browser logins).
import { spawnSync } from 'node:child_process';

export const EXPECTED_WRANGLER_EMAIL = 'khangtd.09@gmail.com';

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const CREDENTIAL_ENV = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_API_KEY', 'CLOUDFLARE_EMAIL'] as const;
const GLOBAL_KEY_ENV = ['CLOUDFLARE_API_KEY', 'CLOUDFLARE_EMAIL'] as const;
const USER_TOKEN_LINE = /logged in with an? User API Token, associated with the email/i;

/** True when the run is in token mode: a User API Token is set and no Global API Key is. */
export function isTokenMode(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.CLOUDFLARE_API_TOKEN) && !GLOBAL_KEY_ENV.some((k) => Boolean(env[k]));
}

/** Every email address printed in a wrangler transcript, de-duplicated, lower-cased, in order. */
export function findEmails(output: string): string[] {
  return [...new Set((output.match(EMAIL) ?? []).map((e) => e.toLowerCase()))];
}

/** True only when the expected account is an exact address in the transcript (not a superstring). */
export function isExpectedAccount(output: string): boolean {
  return findEmails(output).includes(EXPECTED_WRANGLER_EMAIL);
}

/** Env for a wrangler child: credentials removed, and project-local node_modules/.bin removed from PATH so a
 * project copy cannot shadow the machine shim. Build children keep PATH (their own tools live in node_modules/.bin). */
export function wranglerChildEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (isTokenMode(env)) {
    // Keep the token and account; make sure a wrangler is reachable (the project copy is fine here).
    const out: NodeJS.ProcessEnv = { ...env };
    for (const k of GLOBAL_KEY_ENV) delete out[k];
    const bin = `${process.cwd()}/node_modules/.bin`;
    const parts = (env.PATH ?? '').split(':').filter((p) => p !== '');
    out.PATH = (parts.includes(bin) ? parts : [...parts, bin]).join(':');
    return out;
  }
  const out: NodeJS.ProcessEnv = { ...env };
  for (const k of CREDENTIAL_ENV) delete out[k];
  out.PATH = (env.PATH ?? '')
    .split(':')
    .filter((p) => p !== '' && !p.includes('node_modules/.bin'))
    .join(':');
  return out;
}

export interface AccountDecision {
  ok: boolean;
  found: string[];
  reason: string;
}

/** Pure decision on a `wrangler whoami` transcript and the env the run was started with. */
export function decideAccount(output: string, env: NodeJS.ProcessEnv): AccountDecision {
  const found = findEmails(output);
  if (isTokenMode(env)) return decideToken(output, env, found);
  const set = CREDENTIAL_ENV.filter((k) => Boolean(env[k]));
  if (set.length > 0) {
    return { ok: false, found, reason: `${set.join(', ')} is set. Unset it: production runs only as the ${EXPECTED_WRANGLER_EMAIL} login.` };
  }
  if (isExpectedAccount(output)) {
    return { ok: true, found, reason: `wrangler login is ${EXPECTED_WRANGLER_EMAIL}` };
  }
  if (found.length === 0) {
    return { ok: false, found, reason: `wrangler whoami printed no email (not logged in, or an API-token login). Expected ${EXPECTED_WRANGLER_EMAIL}.` };
  }
  return { ok: false, found, reason: `wrangler whoami found ${found.join(', ')}; expected ${EXPECTED_WRANGLER_EMAIL}. Run from the repo with ~/.local/bin/wrangler (never a project copy).` };
}

/** Token mode: the token must belong to the expected owner and reach the account in CLOUDFLARE_ACCOUNT_ID. */
function decideToken(output: string, env: NodeJS.ProcessEnv, found: string[]): AccountDecision {
  const accountId = (env.CLOUDFLARE_ACCOUNT_ID ?? '').trim();
  if (!/^[0-9a-f]{32}$/i.test(accountId)) {
    return { ok: false, found, reason: `CLOUDFLARE_API_TOKEN is set but CLOUDFLARE_ACCOUNT_ID is missing or not an account ID. Set both.` };
  }
  if (!USER_TOKEN_LINE.test(output)) {
    return { ok: false, found, reason: `wrangler whoami did not report a User API Token with an owner email (Account API Tokens are refused). Expected ${EXPECTED_WRANGLER_EMAIL}.` };
  }
  if (found.length !== 1 || found[0] !== EXPECTED_WRANGLER_EMAIL) {
    return { ok: false, found, reason: `the API token belongs to ${found.join(', ') || 'no email'}; expected ${EXPECTED_WRANGLER_EMAIL}.` };
  }
  if (!output.toLowerCase().includes(accountId.toLowerCase())) {
    return { ok: false, found, reason: `the API token cannot reach the account in CLOUDFLARE_ACCOUNT_ID.` };
  }
  return { ok: true, found, reason: `User API Token of ${EXPECTED_WRANGLER_EMAIL}, account matches CLOUDFLARE_ACCOUNT_ID` };
}

/** Runs `wrangler whoami` (credentials stripped, machine shim on PATH) and decides. Never deploys anything. */
export function preflightAccount(env: NodeJS.ProcessEnv = process.env): AccountDecision {
  const set = CREDENTIAL_ENV.filter((k) => Boolean(env[k]));
  if (set.length > 0 && !isTokenMode(env)) return decideAccount('', env); // refuse before any wrangler call
  const r = spawnSync('wrangler', ['whoami'], { encoding: 'utf8', env: wranglerChildEnv(env), shell: false, timeout: 120_000 });
  if (r.error) return { ok: false, found: [], reason: `could not run wrangler whoami: ${r.error.message}` };
  const output = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  if (r.status !== 0) return { ok: false, found: findEmails(output), reason: `wrangler whoami exited ${r.status}` };
  return decideAccount(output, env);
}
