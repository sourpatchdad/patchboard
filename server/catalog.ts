// The service catalog: what to show in the patch row, the Apps view and the
// command palette. It holds names, links and container names only. No secrets
// belong in this file; those live in the environment.

import { readFileSync, watch } from 'node:fs';
import { parse } from 'yaml';
import type { Catalog } from '../shared/types.ts';
import { config } from './config.ts';
import { demoCatalog } from './demo.ts';
import { mergeCatalog } from './labels.ts';
import type { Container } from '../shared/types.ts';

let catalog: Catalog = { groups: [], dock: [] };
let containers: Container[] = [];
let merged: Catalog | null = null;

/** The hub hands over the container list on every poll, for label discovery. */
export function setCatalogContainers(list: Container[]): void {
  containers = list;
  merged = null;
}

function load(): void {
  if (config.demo) {
    catalog = demoCatalog;
    merged = null;
    return;
  }
  try {
    const raw = parse(readFileSync(config.catalogPath, 'utf8')) as Partial<Catalog> | null;
    catalog = { groups: raw?.groups ?? [], dock: raw?.dock ?? [] };
    merged = null;
    console.log(`catalog: ${catalog.groups.reduce((n, g) => n + g.services.length, 0)} services`);
  } catch (err) {
    console.error(`catalog: could not read ${config.catalogPath}: ${(err as Error).message}`);
  }
}

/** The YAML catalog merged with services registered through Docker labels. */
export function getCatalog(): Catalog {
  merged ??= mergeCatalog(catalog, containers);
  return merged;
}

/** Only what services.yaml says, for the audit. */
export function getYamlCatalog(): Catalog {
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
