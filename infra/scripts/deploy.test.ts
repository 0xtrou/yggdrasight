// Source-tree rule of a real deploy (deploy.ts sourceProblems).
import { describe, expect, test } from 'bun:test';
import { sourceProblems } from './deploy.ts';

const clean = { branch: 'main', dirty: false, head: 'abc', upstream: 'abc', fromBranch: false, routedWorkers: [] as string[] };

describe('sourceProblems', () => {
  test('clean pushed main deploys', () => {
    expect(sourceProblems(clean)).toEqual([]);
  });

  test('a feature branch is refused without --from-branch', () => {
    expect(sourceProblems({ ...clean, branch: 'feat/x' })).toEqual(['on branch "feat/x", not main']);
  });

  test('--from-branch allows a clean, pushed branch for route-less workers', () => {
    expect(sourceProblems({ ...clean, branch: 'feat/x', fromBranch: true })).toEqual([]);
  });

  test('--from-branch never covers a worker that owns routes', () => {
    const p = sourceProblems({ ...clean, branch: 'feat/x', fromBranch: true, routedWorkers: ['yggdrasight-landing'] });
    expect(p[0]).toContain('only for workers without routes');
    expect(p).toContain('on branch "feat/x", not main');
  });

  test('dirty or unpushed trees are refused either way', () => {
    expect(sourceProblems({ ...clean, dirty: true })).toEqual(['working tree has uncommitted changes']);
    expect(sourceProblems({ ...clean, branch: 'feat/x', fromBranch: true, upstream: '' })).toEqual(['HEAD is not origin/feat/x']);
    expect(sourceProblems({ ...clean, upstream: 'def' })).toEqual(['HEAD is not origin/main']);
  });
});
