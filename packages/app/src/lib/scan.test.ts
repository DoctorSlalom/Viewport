import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanPrototypes } from './scan.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'viewport-test-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function makePrototype(tabSlug: string, variant: string, title?: string) {
  const dir = join(root, tabSlug, variant);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'index.html'),
    title ? `<html><head><title>${title}</title></head><body></body></html>` : '<html><body></body></html>',
  );
}

describe('scanPrototypes', () => {
  it('returns empty result when prototypes dir does not exist', async () => {
    const result = await scanPrototypes('/nonexistent/path/that/does/not/exist');
    expect(result).toEqual({ tabs: [], prototypes: [] });
  });

  it('returns empty result for an empty directory', async () => {
    const result = await scanPrototypes(root);
    expect(result).toEqual({ tabs: [], prototypes: [] });
  });

  it('discovers a tab and prototype', async () => {
    await makePrototype('homepage', 'variant-a', 'Homepage Minimal');
    const result = await scanPrototypes(root);
    expect(result.tabs).toEqual([{ slug: 'homepage' }]);
    expect(result.prototypes).toEqual([
      {
        tabSlug: 'homepage',
        variant: 'variant-a',
        path: 'prototypes/homepage/variant-a',
        title: 'Homepage Minimal',
      },
    ]);
  });

  it('falls back to variant name when <title> is missing', async () => {
    await makePrototype('homepage', 'variant-a');
    const { prototypes } = await scanPrototypes(root);
    expect(prototypes[0]?.title).toBe('variant-a');
  });

  it('skips _-prefixed tab folders', async () => {
    await makePrototype('_template', 'default', 'Template');
    await makePrototype('homepage', 'variant-a', 'Home');
    const result = await scanPrototypes(root);
    expect(result.tabs.map((t) => t.slug)).toEqual(['homepage']);
  });

  it('skips dotfile tab folders', async () => {
    await makePrototype('.hidden', 'variant', 'Hidden');
    await makePrototype('homepage', 'variant-a', 'Home');
    const result = await scanPrototypes(root);
    expect(result.tabs.map((t) => t.slug)).toEqual(['homepage']);
  });

  it('skips variant folders without index.html', async () => {
    await mkdir(join(root, 'homepage', 'empty-variant'), { recursive: true });
    await makePrototype('homepage', 'variant-a', 'Home');
    const { prototypes } = await scanPrototypes(root);
    expect(prototypes).toHaveLength(1);
    expect(prototypes[0]?.variant).toBe('variant-a');
  });

  it('skips tabs that have no valid variants', async () => {
    await mkdir(join(root, 'empty-tab', 'no-html'), { recursive: true });
    const result = await scanPrototypes(root);
    expect(result.tabs).toHaveLength(0);
  });

  it('discovers multiple tabs and variants', async () => {
    await makePrototype('homepage', 'variant-a', 'Home A');
    await makePrototype('homepage', 'variant-b', 'Home B');
    await makePrototype('onboarding', 'variant-a', 'Onboarding');
    const result = await scanPrototypes(root);
    expect(result.tabs).toHaveLength(2);
    expect(result.prototypes).toHaveLength(3);
  });
});
