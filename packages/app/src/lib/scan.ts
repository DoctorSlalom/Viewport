import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface ScannedTab {
  slug: string;
}

export interface ScannedPrototype {
  tabSlug: string;
  variant: string;
  /** Repo-relative path, e.g. "prototypes/homepage/variant-a" */
  path: string;
  title: string;
}

export interface ScanResult {
  tabs: ScannedTab[];
  prototypes: ScannedPrototype[];
}

function extractTitle(html: string, fallback: string): string {
  const match = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  return match?.[1]?.trim() || fallback;
}

export async function scanPrototypes(root: string): Promise<ScanResult> {
  const tabs: ScannedTab[] = [];
  const prototypes: ScannedPrototype[] = [];

  let topLevel: string[];
  try {
    topLevel = await readdir(root, { withFileTypes: false });
  } catch {
    // prototypes/ doesn't exist yet — return empty, sync will archive everything
    return { tabs: [], prototypes: [] };
  }

  const tabFolders = topLevel.filter((name) => !name.startsWith('_') && !name.startsWith('.'));

  for (const tabSlug of tabFolders) {
    const tabPath = join(root, tabSlug);

    let variants: string[];
    try {
      variants = await readdir(tabPath, { withFileTypes: false });
    } catch {
      continue;
    }

    const variantFolders = variants.filter((v) => !v.startsWith('_') && !v.startsWith('.'));
    let hasAnyVariant = false;

    for (const variant of variantFolders) {
      const variantPath = join(tabPath, variant);
      const indexPath = join(variantPath, 'index.html');

      let html: string;
      try {
        html = await readFile(indexPath, 'utf8');
      } catch {
        continue; // no index.html — not a valid prototype
      }

      hasAnyVariant = true;
      prototypes.push({
        tabSlug,
        variant,
        path: `prototypes/${tabSlug}/${variant}`,
        title: extractTitle(html, variant),
      });
    }

    if (hasAnyVariant) {
      tabs.push({ slug: tabSlug });
    }
  }

  return { tabs, prototypes };
}
