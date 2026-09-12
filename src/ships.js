// Ship types: [size, count]
export const SHIP_CONFIG = [
  { size: 4, count: 1 },
  { size: 3, count: 2 },
  { size: 2, count: 3 },
  { size: 1, count: 4 },
];
export const GRID_SIZE = 10;
export const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;

// Colors (notebook style)
export const COLORS = {
  bg: 0xf5f0e8,
  gridLine: 0x8bb8f0,
  gridLineLight: 0xc8dbf5,
  marginLine: 0xe04040,
  shipFill: 0xf5f0e8,
  shipStroke: 0x2a4b7c,
  hitCross: 0xd32f2f,
  hitFill: 0xff4444,
  missDot: 0x546e7a,
  missOutline: 0x90a4ae,
  sunkShip: 0x9e9e9e,
  sunkOverlay: 0x000000,
  textColor: 0x2a4b7c,
  buttonBg: 0x2a4b7c,
  buttonText: 0xf5f0e8,
  readyBg: 0x388e3c,
  waitingBg: 0xf57f17,
  enemyHitBg: 0xffcdd2,
  playerHitBg: 0xffebee,
};

export function createEmptyBoard() {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
}

// Check if a ship can be placed at (row, col) with given orientation
export function canPlaceShip(board, row, col, size, horizontal) {
  const cells = horizontal
    ? Array.from({ length: size }, (_, i) => [row, col + i])
    : Array.from({ length: size }, (_, i) => [row + i, col]);

  for (const [r, c] of cells) {
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false;
  }
  for (const [r, c] of cells) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
          if (board[nr][nc] !== 0) return false;
        }
      }
    }
  }
  return true;
}

// Auto-place all ships
export function autoPlaceShips() {
  const board = createEmptyBoard();
  const ships = [];

  for (const { size, count } of SHIP_CONFIG) {
    for (let n = 0; n < count; n++) {
      let placed = false;
      for (let attempt = 0; attempt < 200; attempt++) {
        const row = Math.floor(Math.random() * GRID_SIZE);
        const col = Math.floor(Math.random() * GRID_SIZE);
        const horizontal = Math.random() > 0.5;
        if (canPlaceShip(board, row, col, size, horizontal)) {
          const cells = horizontal
            ? Array.from({ length: size }, (_, i) => [row, col + i])
            : Array.from({ length: size }, (_, i) => [row + i, col]);
          const shipId = ships.length;
          for (const [r, c] of cells) {
            board[r][c] = shipId + 1;
          }
          ships.push({ cells, size, hits: new Set() });
          placed = true;
          break;
        }
      }
      if (!placed) {
        for (let r = 0; r < GRID_SIZE && !placed; r++) {
          for (let c = 0; c < GRID_SIZE && !placed; c++) {
            if (canPlaceShip(board, r, c, size, true)) {
              const cells = Array.from({ length: size }, (_, i) => [r, c + i]);
              const shipId = ships.length;
              for (const [cr, cc] of cells) board[cr][cc] = shipId + 1;
              ships.push({ cells, size, hits: new Set() });
              placed = true;
            } else if (canPlaceShip(board, r, c, size, false)) {
              const cells = Array.from({ length: size }, (_, i) => [r + i, c]);
              const shipId = ships.length;
              for (const [cr, cc] of cells) board[cr][cc] = shipId + 1;
              ships.push({ cells, size, hits: new Set() });
              placed = true;
            }
          }
        }
      }
    }
  }
  return { board, ships };
}

// Process attack on board
export function processAttack(board, ships, row, col) {
  const val = board[row][col];
  if (val > 0) {
    const shipIdx = val - 1;
    const ship = ships[shipIdx];
    ship.hits.add(`${row},${col}`);
    const sunk = ship.hits.size === ship.size;
    return { hit: true, sunk, shipIdx };
  }
  return { hit: false };
}

// Check if all ships are sunk
export function allSunk(ships) {
  return ships.every(s => s.hits.size === s.size);
}
