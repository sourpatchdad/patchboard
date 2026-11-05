// Whether the Docker CLI is installed. The slim image leaves it out, so
// updates from the UI turn off there with a reason instead of failing
// mid-update. Checked once at start: the image doesn't change while running.

import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';

function onPath(name: string): boolean {
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  const names = process.platform === 'win32' ? [`${name}.exe`, `${name}.cmd`] : [name];
  return dirs.some((d) =>
    names.some((n) => {
      try {
        accessSync(join(d, n), constants.X_OK);
        return true;
      } catch {
        return false;
      }
    }),
  );
}

export const dockerCli = onPath('docker');
