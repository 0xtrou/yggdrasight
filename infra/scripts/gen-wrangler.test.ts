// Ported from gumpbox-landing (infra/scripts/gen-wrangler.test.ts), 2026-11-25.
import { describe, expect, test } from 'bun:test';
import { workers, type WorkerEntry } from '../workers.manifest.ts';
import { wranglerConfig } from './gen-wrangler.ts';

const base = workers.landing as WorkerEntry;

describe('wranglerConfig', () => {
  test('points main and assets at the OpenNext output of apps/web, relative to infra/wrangler/', () => {
    const cfg = wranglerConfig(base);
    expect(cfg.main).toBe('../../apps/web/.open-next/worker.js');
    expect(cfg.assets).toEqual({ binding: 'ASSETS', directory: '../../apps/web/.open-next/assets' });
    expect(cfg.compatibility_flags).toContain('nodejs_compat');
    expect(cfg.$schema).toBe('../../node_modules/wrangler/config-schema.json');
  });

  test('keeps workers.dev on while there are no routes (bootstrap)', () => {
    const cfg = wranglerConfig({ ...base, routes: [] });
    expect(cfg.workers_dev).toBe(true);
    expect(cfg.routes).toEqual([]);
  });

  test('turns debug origins off once a production worker owns routes', () => {
    const cfg = wranglerConfig({ ...base, routes: [{ pattern: 'yggdrasight.example.com', customDomain: true }] });
    expect(cfg.workers_dev).toBe(false);
    expect(cfg.preview_urls).toBe(false);
    expect(cfg.routes).toEqual([{ pattern: 'yggdrasight.example.com', custom_domain: true }]);
  });

  test('never emits pendingRoutes or buildEnv (build-only / cutover-only fields)', () => {
    const json = JSON.stringify(wranglerConfig({ ...base, pendingRoutes: [{ pattern: 'x.example.com', customDomain: true }] }));
    expect(json).not.toContain('pendingRoutes');
    expect(json).not.toContain('x.example.com');
    expect(json).not.toContain('LANDING_ONLY');
  });

  test('refuses a worker name without the yggdrasight- prefix', () => {
    expect(() => wranglerConfig({ ...base, name: 'landing' as WorkerEntry['name'] })).toThrow('yggdrasight-');
  });

  test('every manifest worker is yggdrasight- prefixed', () => {
    for (const w of Object.values(workers)) expect(w.name.startsWith('yggdrasight-')).toBe(true);
  });

  test('the landing worker has no routes and no data bindings (workers.dev only, stateless)', () => {
    expect(base.routes).toEqual([]);
    expect(base.kv ?? []).toEqual([]);
    expect(base.d1 ?? []).toEqual([]);
    expect(base.r2 ?? []).toEqual([]);
    expect(base.buildEnv).toEqual({ MODE: 'landing', LANDING_ONLY: '1' });
  });
});
