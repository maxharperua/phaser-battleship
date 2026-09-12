import { GRID_SIZE, processAttack } from './ships.js';

// Hunt/Target AI
export class BattleshipAI {
  constructor() {
    this.targetStack = [];
    this.lastHit = null;
    this.shipDirs = null; // ['horizontal', 'vertical'] or one of them
    this.shots = new Set(); // "row,col" of shots taken
    this.huntMode = true;
  }

  reset() {
    this.targetStack = [];
    this.lastHit = null;
    this.shipDirs = null;
    this.shots = new Set();
    this.huntMode = true;
  }

  markSunk(ship) {
    // Mark all cells within 1-cell radius as "already shot" (forbidden)
    for (const [r, c] of ship.cells) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
            this.shots.add(`${nr},${nc}`);
          }
        }
      }
    }
    // Remove any target-stack entries that are now in the forbidden zone
    this.targetStack = this.targetStack.filter(([r, c]) => !this.shots.has(`${r},${c}`));
  }

  // Get next attack coordinates
  getAttack() {
    if (this.targetStack.length > 0) {
      const p = this.targetStack.pop();
      const key = `${p[0]},${p[1]}`;
      if (!this.shots.has(key)) return p;
      return this.getAttack(); // skip already targeted
    }
    // Hunt mode: random untargeted cell
    return this.randomHunt();
  }

  randomHunt() {
    let attempts = 0;
    while (attempts < 200) {
      const row = Math.floor(Math.random() * GRID_SIZE);
      const col = Math.floor(Math.random() * GRID_SIZE);
      const key = `${row},${col}`;
      if (!this.shots.has(key)) return [row, col];
      attempts++;
    }
    // Grid scan fallback
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (!this.shots.has(`${r},${c}`)) return [r, c];
      }
    }
    return [0, 0]; // shouldn't happen
  }

  processResult(row, col, result) {
    this.shots.add(`${row},${col}`);

    if (result.hit) {
      if (!result.sunk) {
        // Ship hit but not sunk — add adjacent cells to target stack
        if (this.lastHit === null) {
          // First hit on a new ship
          this.lastHit = [row, col];
          this.shipDirs = null;
          this.addAdjacent(row, col, false);
        } else {
          // Extended a ship — determine direction
          const dr = row - this.lastHit[0];
          const dc = col - this.lastHit[1];
          if (dr !== 0) this.shipDirs = ['vertical'];
          if (dc !== 0) this.shipDirs = ['horizontal'];
          // Add next in same direction
          this.addAdjacent(row, col, true);
        }
      } else {
        // Ship sunk — clear targeting for this ship
        this.lastHit = null;
        this.shipDirs = null;
        this.targetStack = this.targetStack.filter(([r, c]) => {
          const key = `${r},${c}`;
          return !this.shots.has(key);
        });
      }
    } else {
      // Miss: if we were targeting a ship, remove this direction
      if (this.shipDirs && this.lastHit) {
        // Try other directions from lastHit
        if (this.shipDirs.includes('horizontal')) {
          this.addAdjacent(this.lastHit[0], this.lastHit[1], true, 'vertical');
        }
        if (this.shipDirs.includes('vertical')) {
          this.addAdjacent(this.lastHit[0], this.lastHit[1], true, 'horizontal');
        }
        this.shipDirs = null;
      }
    }
  }

  addAdjacent(row, col, extendOnly = false, forceDir = null) {
    const dirs = forceDir
      ? [forceDir]
      : (this.shipDirs || ['horizontal', 'vertical']);

    for (const dir of dirs) {
      if (dir === 'horizontal') {
        for (const dc of [-1, 1]) {
          const nc = col + dc;
          if (nc >= 0 && nc < GRID_SIZE) {
            const key = `${row},${nc}`;
            if (!this.shots.has(key)) {
              this.targetStack.push([row, nc]);
            }
          }
        }
      } else {
        for (const dr of [-1, 1]) {
          const nr = row + dr;
          if (nr >= 0 && nr < GRID_SIZE) {
            const key = `${nr},${col}`;
            if (!this.shots.has(key)) {
              this.targetStack.push([nr, col]);
            }
          }
        }
      }
    }
  }
}
