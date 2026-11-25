// Usage: bun run infra/scripts/deploy.ts <landing|all> [--skip-build] [--dry-run] [--from-branch]
//
// Root deploy surface: every worker deploys FROM THE REPO ROOT with the
// generated infra/wrangler/<key>.jsonc. Ported from gumpbox-landing
// (infra/scripts/deploy.ts, itself from th.legal), 2026-11-25.
//
// Steps per worker: clean build output -> iac:gen -> OpenNext build in the
// worker's appDir (runs `next build` with the manifest's buildEnv) ->
// populateCache local -> `wrangler deploy --config infra/wrangler/<key>.jsonc`.
//
// Wrangler runs as plain `wrangler` from PATH (the machine shim
// ~/.local/bin/wrangler picks the khangtd.09@gmail.com login), never bunx / npx /
// node_modules/.bin. Before anything runs, `wrangler whoami` must print
// khangtd.09@gmail.com. A User API Token is accepted only when Cloudflare says it belongs to
// khangtd.09@gmail.com and it reaches CLOUDFLARE_ACCOUNT_ID (token mode, wrangler-guard.ts).
// --dry-run passes through to wrangler (bundle + config validation, no upload);
// the preflight still runs, so a dry run also proves the account.
// A real deploy additionally requires a clean tree on `main` in sync with origin.
//
// --from-branch (yggdrasight addition): a real deploy from a clean, pushed
// feature branch, allowed ONLY for workers with no routes (workers.dev only,
// no custom domain, nothing public-DNS-facing). It exists because agents may
// not push to main; production-domain deploys still require main.
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { workers, type WorkerEntry } from '../workers.manifest.ts';
import { preflightAccount, wranglerChildEnv, EXPECTED_WRANGLER_EMAIL } from './wrangler-guard.ts';

type WorkerKey = keyof typeof workers;
const CREDENTIAL_ENV = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_API_KEY', 'CLOUDFLARE_EMAIL'];

function git(...args: string[]): string {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}

/** Pure decision for the source-tree rule of a real deploy. Exported for tests. */
export function sourceProblems(s: {
  branch: string;
  dirty: boolean;
  head: string;
  upstream: string;
  fromBranch: boolean;
  routedWorkers: string[];
}): string[] {
  const allowBranch = s.fromBranch && s.routedWorkers.length === 0;
  return [
    s.fromBranch && s.routedWorkers.length > 0 && `--from-branch is only for workers without routes; ${s.routedWorkers.join(', ')} own routes, deploy them from main`,
    !allowBranch && s.branch !== 'main' && `on branch "${s.branch}", not main`,
    s.dirty && 'working tree has uncommitted changes',
    (!s.upstream || s.head !== s.upstream) && `HEAD is not origin/${allowBranch ? s.branch : 'main'}`,
  ].filter((p): p is string => Boolean(p));
}

if (import.meta.main) {
  const target = process.argv[2];
  const skipBuild = process.argv.includes('--skip-build');
  const dryRun = process.argv.includes('--dry-run');
  const fromBranch = process.argv.includes('--from-branch');
  const keys = (target === 'all' ? Object.keys(workers) : [target]) as WorkerKey[];
  if (!target || !keys.every((k) => k in workers)) {
    console.error(`Usage: bun run infra/scripts/deploy.ts <${Object.keys(workers).join('|')}|all> [--skip-build] [--dry-run] [--from-branch]`);
    process.exit(2);
  }

  // Real deploys only from committed `main`, in sync with origin (th.legal rule M10),
  // or with --from-branch from a pushed branch for route-less workers.
  if (!dryRun) {
    const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
    const ref = fromBranch ? branch : 'main';
    spawnSync('git', ['fetch', '--quiet', 'origin', ref]);
    const problems = sourceProblems({
      branch,
      dirty: Boolean(git('status', '--porcelain')),
      head: git('rev-parse', 'HEAD'),
      upstream: git('rev-parse', `origin/${ref}`),
      fromBranch,
      routedWorkers: keys.filter((k) => (workers[k] as WorkerEntry).routes.length > 0).map((k) => workers[k].name),
    });
    if (problems.length) {
      console.error(`DEPLOY REFUSED: ${problems.join('; ')}. Use --dry-run, or deploy from a clean, pushed main.`);
      process.exit(3);
    }
    if (fromBranch) console.log(`NOTE: deploying from branch "${branch}" (route-less workers only, workers.dev).`);
  }

  // Account preflight. Runs before any build or upload.
  const account = preflightAccount();
  console.log(`account preflight: ${account.ok ? 'OK' : 'REFUSED'} — ${account.reason}`);
  if (!account.ok) {
    console.error(`\nDEPLOY REFUSED: wrangler must run as ${EXPECTED_WRANGLER_EMAIL} (its login, or its User API Token). Nothing was built or uploaded.`);
    process.exit(3);
  }

  const run = (cmd: string[], opts: { wrangler?: boolean; cwd?: string; extraEnv?: Record<string, string> } = {}): number => {
    // Builds: credentials stripped. Wrangler: credentials stripped and
    // project-local node_modules/.bin removed from PATH (wrangler-guard.ts).
    const env = opts.wrangler ? wranglerChildEnv(process.env) : { ...process.env, ...opts.extraEnv };
    if (!opts.wrangler) for (const k of CREDENTIAL_ENV) delete env[k];
    const prefix = opts.extraEnv ? `${Object.entries(opts.extraEnv).map(([k, v]) => `${k}=${v}`).join(' ')} ` : '';
    console.log(`+ ${opts.cwd ? `(cd ${opts.cwd}) ` : ''}${prefix}${cmd.join(' ')}`);
    const r = spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit', env, shell: false, cwd: opts.cwd });
    return r.status ?? 1;
  };

  let failed = false;
  for (const key of keys) {
    const w: WorkerEntry = workers[key];
    const config = `infra/wrangler/${key}.jsonc`;
    // The OpenNext CLI runs inside the app dir; the config path is relative to it.
    const configFromApp = `${w.appDir.split('/').map(() => '..').join('/')}/${config}`;
    console.log(`\n=== ${w.name} (${w.appDir}) ===`);

    if (!skipBuild) {
      // Fresh-build mandate (th.legal lesson): never deploy a half-failed or cached build.
      for (const t of ['.next', '.open-next']) rmSync(`${w.appDir}/${t}`, { recursive: true, force: true });
      if (run(['bun', 'run', 'iac:gen']) !== 0) { failed = true; break; }
      // The OpenNext CLI is a build tool (no upload); it runs from the app's node_modules with credentials stripped.
      const opennext = './node_modules/.bin/opennextjs-cloudflare';
      if (run([opennext, 'build', '--config', configFromApp], { cwd: w.appDir, extraEnv: { ...w.buildEnv } }) !== 0) { failed = true; break; }
      // Static-assets incremental cache (apps/web/open-next.config.ts): copies the prerendered
      // pages/routes into .open-next/assets/cdn-cgi/_next_cache. A local file copy, no upload.
      // Without it every "static" page renders per request, and the OG images (which read
      // public/ through node:fs at build time) fail with 500.
      if (run([opennext, 'populateCache', 'local', '--config', configFromApp], { cwd: w.appDir }) !== 0) { failed = true; break; }
    }

    const cmd = ['wrangler', 'deploy', '--config', config];
    if (dryRun) cmd.push('--dry-run');
    if (run(cmd, { wrangler: true }) !== 0) { failed = true; break; }
  }

  console.log(failed ? '\nDEPLOY FAILED (see output above)' : dryRun ? '\nDry-run OK — configs valid.' : '\nDeploy complete. Save this output as evidence.');
  process.exit(failed ? 1 : 0);
}
