// The demo's Tesla, drawn: the demo car is a Model 3, so it shows the
// built-in Model 3 drawings (shared/car-art.ts), and the first time demo mode
// starts it gets a Car board that shows it as a live engineering drawing.
// Seeded once: delete the board and it stays deleted.

import { STARTERS } from '../shared/board.ts';
import { exportExtras, saveExtras } from './boards.ts';
import { kvGet, kvSet } from './db.ts';

export function seedDemoCar(): void {
  if (kvGet('demo-car-seeded')) return;
  const extras = exportExtras();
  const wall = STARTERS.find((s) => s.id === 'wall-car');
  if (wall && !extras.some((b) => b.id === 'car')) saveExtras([...extras, { id: 'car', board: { ...wall.board, name: 'Car' } }]);
  kvSet('demo-car-seeded', true);
}
