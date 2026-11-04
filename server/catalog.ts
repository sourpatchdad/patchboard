// The service catalog: what to show in the patch row, the Apps view and the
// command palette. It holds names, links and container names only. No secrets
// belong in this file; those live in the environment.

import { readFileSync, watch } from 'node:fs';
import { parse } from 'yaml';
import type { Catalog } from '../shared/types.ts';
import { config } from './config.ts';
import { demoCatalog } from './demo.ts';

let catalog: Catalog = { groups: [], dock: [] };

function load(): void {
  if (config.demo) {
    catalog = demoCatalog;
    return;
  }
  try {
    const raw = parse(readFileSync(config.catalogPath, 'utf8')) as Partial<Catalog> | null;
    catalog = { groups: raw?.groups ?? [], dock: raw?.dock ?? [] };
    console.log(`catalog: ${catalog.groups.reduce((n, g) => n + g.services.length, 0)} services`);
  } catch (err) {
    console.error(`catalog: could not read ${config.catalogPath}: ${(err as Error).message}`);
  }
}

export function getCatalog(): Catalog {
  return catalog;
}

export function initCatalog(onChange: () => void): void {
  load();
  if (config.demo) return;
  // Reload on edit so tweaking services.yaml doesn't need a restart.
  try {
    let timer: NodeJS.Timeout | undefined;
    watch(config.catalogPath, () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        load();
        onChange();
      }, 300);
    });
  } catch {
    /* file missing; load() already logged it */
  }
}
