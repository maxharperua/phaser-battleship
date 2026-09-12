const Phaser = window.Phaser;
import {
  GRID_SIZE, COLORS, SHIP_CONFIG,
  createEmptyBoard, canPlaceShip, autoPlaceShips
} from '../ships.js';

export default class PlaceScene extends Phaser.Scene {
  constructor() {
    super('Place');
  }

  init(data) {
    this.mode = data.mode || 'ai';
    this.networkClient = data.networkClient || null;
    this.playerNum = data.playerNum || 1;
    this.roomId = data.roomId || null;
    this.remoteAddress = data.remoteAddress || null;
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;
    this.isPortrait = w < h;
    const isP = this.isPortrait;

    this.placedShips = [];
    this.board = createEmptyBoard();
    this.horizontal = true;
    this.ready = false;
    this.dragging = false;

    // Build ship queue: flatten SHIP_CONFIG into ordered list
    this.shipQueue = [];
    for (const { size, count } of SHIP_CONFIG) {
      for (let i = 0; i < count; i++) {
        this.shipQueue.push({ size, placed: false });
      }
    }
    this.queueIdx = 0;

    // Dynamic text labels (to avoid leaks)
    this.poolLabel = null;
    this.poolHint = null;
    this.poolCounter = null;

    // Calculate layout
    const margin = 16;
    const headerH = isP ? 40 : 30;
    const titleH = isP ? 30 : 26;
    const buttonAreaH = isP ? 130 : 110;
    const previewH = isP ? 65 : 55;

    if (isP) {
      const labelMargin = 24; // room for row numbers
      const availW = w - margin * 2 - labelMargin;
      const availH = h - headerH - titleH - buttonAreaH - previewH - 20;
      this.CELL = Math.min(
        Math.floor((availW - 9 * 2) / 10),
        Math.floor((availH - 9 * 2) / 10)
      );
      this.CELL = Math.max(28, Math.min(this.CELL, 48));
      this.GAP = 2;
      this.BOARD_PX = GRID_SIZE * (this.CELL + this.GAP);
      this.OFFSET_X = Math.floor((w - labelMargin - this.BOARD_PX) / 2 + labelMargin);
      this.OFFSET_Y = Math.floor(headerH + titleH + 10);
    } else {
      const availW = w - margin * 3 - 160;
      const availH = h - headerH - 20;
      this.CELL = Math.min(
        Math.floor((availW - 9 * 2) / 10),
        Math.floor((availH - 9 * 2) / 10)
      );
      this.CELL = Math.max(28, Math.min(this.CELL, 48));
      this.GAP = 2;
      this.BOARD_PX = GRID_SIZE * (this.CELL + this.GAP);
      this.OFFSET_X = Math.floor(margin + 48);
      this.OFFSET_Y = Math.floor(headerH + 10);
    }

    // Notebook bg
    this.drawBg(w, h);

    // Title
    const title = this.mode === 'ai'
      ? 'Расставьте корабли'
      : `Расставьте корабли — Игрок ${this.playerNum}`;
    this.add.text(w / 2, headerH, title, {
      fontFamily: '"Courier New", monospace',
      fontSize: `${isP ? 20 : 26}px`,
      color: '#2a4b7c',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Graphics layers (order matters: later = on top)
    this.gridGraphics = this.add.graphics();
    this.shipGraphics = this.add.graphics();
    this.poolBgGraphics = this.add.graphics();    // bg behind preview
    this.hoverHighlight = this.add.graphics();
    this.previewGraphics = this.add.graphics();    // ship block on top of pool bg
    this.drawGrid();

    // Controls area
    const cx = this.OFFSET_X + this.BOARD_PX / 2;
    const boardEnd = this.OFFSET_Y + this.BOARD_PX;
    const previewY = boardEnd + (isP ? 6 : 4);
    this.controlsY = previewY + previewH + 4;

    // Preview zone (Block Blast style block)
    this.previewZone = { x: cx, y: previewY + previewH / 2, w: this.BOARD_PX, h: previewH };

    // Controls
    // Rotate button
    this.rotateBtn = this.add.text(cx, this.controlsY, 'Повернуть', {
      fontFamily: '"Courier New", monospace',
      fontSize: `${isP ? 15 : 17}px`,
      color: '#f5f0e8',
      backgroundColor: '#546e7a',
      padding: { x: 10, y: 7 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.rotateBtn.on('pointerdown', () => this.toggleRotate());

    // Auto-place button
    this.autoBtn = this.add.text(cx, this.controlsY + (isP ? 34 : 38), 'Авторасстановка', {
      fontFamily: '"Courier New", monospace',
      fontSize: `${isP ? 15 : 17}px`,
      color: '#f5f0e8',
      backgroundColor: '#2a4b7c',
      padding: { x: 10, y: 7 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.autoBtn.on('pointerdown', () => this.autoPlace());

    // Ready button
    this.readyBtn = this.add.text(cx, this.controlsY + (isP ? 72 : 80), 'Готов!', {
      fontFamily: '"Courier New", monospace',
      fontSize: `${isP ? 17 : 19}px`,
      color: '#f5f0e8',
      backgroundColor: '#9e9e9e',
      padding: { x: 18, y: 9 },
    }).setOrigin(0.5);
    this.readyBtn.setAlpha(0.5);
    this.readyBtn.setInteractive({ useHandCursor: true });
    this.readyBtn.on('pointerdown', () => this.confirmReady());

    // ─── Interaction Logic ──────────────────────────────────

    this.input.on('pointerdown', (pointer) => {
      // If dragging: try placing on grid
      if (this.dragging) {
        const cell = this.pointerToCell(pointer.x, pointer.y);
        if (cell) {
          this.placeShip(cell.row, cell.col);
        }
        return;
      }

      // If tapping preview zone and ships remain: start drag
      if (this.queueIdx < this.shipQueue.length) {
        const pz = this.previewZone;
        if (pointer.x >= pz.x - pz.w / 2 && pointer.x <= pz.x + pz.w / 2 &&
            pointer.y >= pz.y - pz.h / 2 && pointer.y <= pz.y + pz.h / 2) {
          this.beginDrag();
          return;
        }
      }
    });

    this.input.on('pointermove', (pointer) => {
      this.previewGraphics.clear();
      this.hoverHighlight.clear();

      if (!this.dragging) return;

      // Show ghost preview on grid
      const cell = this.pointerToCell(pointer.x, pointer.y);
      if (!cell) return;

      const size = this.shipQueue[this.queueIdx].size;
      const cells = this.getPlacementCells(cell.row, cell.col, size);
      const canPlace = canPlaceShip(this.board, cell.row, cell.col, size, this.horizontal);

      // Ghost grid cells
      const color = canPlace ? 0x388e3c : 0xd32f2f;
      this.hoverHighlight.fillStyle(color, canPlace ? 0.35 : 0.2);
      for (const [r, c] of cells) {
        const x = this.OFFSET_X + c * (this.CELL + this.GAP);
        const y = this.OFFSET_Y + r * (this.CELL + this.GAP);
        this.hoverHighlight.fillRect(x, y, this.CELL, this.CELL);
      }

      // Ship block following finger (semi-transparent)
      this.drawDragPreview(pointer.x, pointer.y, size);
    });

    this.input.keyboard.on('keydown-R', () => this.toggleRotate());

    // Network
    if (this.mode === 'network' && this.networkClient) {
      this.networkClient.onMessage = (msg) => this.handleNetMessage(msg);
    }

    // Initial UI
    this.renderShips();
    this.drawPool();
    this.updateReadyButton();
  }

  // ─── Ship Preview ────────────────────────────────────────

  beginDrag() {
    if (this.queueIdx >= this.shipQueue.length) return;
    this.dragging = true;
    this.rotateBtn.setAlpha(1).setInteractive();
    this.drawPool();
  }

  drawDragPreview(px, py, size) {
    const g = this.previewGraphics;
    g.clear();
    const cell = this.CELL;
    const s = cell * 0.9;

    if (this.horizontal) {
      for (let i = 0; i < size; i++) {
        const x = px - (size * (s + 2)) / 2 + i * (s + 2);
        const y = py - s / 2;
        g.fillStyle(0x2a4b7c, 0.5);
        g.fillRoundedRect(x, y, s, s, 3);
        g.lineStyle(2, 0x1a3a6c, 0.7);
        g.strokeRoundedRect(x, y, s, s, 3);
      }
    } else {
      for (let i = 0; i < size; i++) {
        const x = px - s / 2;
        const y = py - (size * (s + 2)) / 2 + i * (s + 2);
        g.fillStyle(0x2a4b7c, 0.5);
        g.fillRoundedRect(x, y, s, s, 3);
        g.lineStyle(2, 0x1a3a6c, 0.7);
        g.strokeRoundedRect(x, y, s, s, 3);
      }
    }
  }

  clearPoolText() {
    if (this.poolLabel) { this.poolLabel.destroy(); this.poolLabel = null; }
    if (this.poolHint) { this.poolHint.destroy(); this.poolHint = null; }
    if (this.poolCounter) { this.poolCounter.destroy(); this.poolCounter = null; }
  }

  drawPool() {
    this.poolBgGraphics.clear();
    this.previewGraphics.clear();
    this.clearPoolText();

    const pz = this.previewZone;
    const cx = pz.x;
    const y = pz.y;
    const s = Math.min(this.CELL * 0.85, 38);

    // Background for preview zone
    this.poolBgGraphics.fillStyle(COLORS.bg, 1);
    this.poolBgGraphics.fillRect(pz.x - pz.w / 2, pz.y - pz.h / 2, pz.w, pz.h);
    this.poolBgGraphics.lineStyle(1, 0xcccccc, 0.5);
    this.poolBgGraphics.strokeRoundedRect(pz.x - pz.w / 2, pz.y - pz.h / 2, pz.w, pz.h, 8);

    if (this.queueIdx >= this.shipQueue.length) {
      // All ships placed – green checkmark text
      this.poolLabel = this.add.text(cx, y, '✓ Все корабли расставлены!', {
        fontFamily: '"Courier New", monospace',
        fontSize: '15px',
        color: '#388e3c',
        fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(5);
      return;
    }

    if (this.dragging) {
      // Hint while dragging
      this.poolLabel = this.add.text(cx, y, '⬇ Коснитесь поля для установки', {
        fontFamily: '"Courier New", monospace',
        fontSize: '13px',
        color: '#546e7a',
      }).setOrigin(0.5).setDepth(5);
      return;
    }

    // ── Show current ship as a Block Blast style block ──
    const size = this.shipQueue[this.queueIdx].size;
    const totalShips = this.shipQueue.length;

    // Draw the ship block
    const g = this.previewGraphics;
    this.drawShipBlock(g, cx, y, size, s, this.horizontal, 0x2a4b7c);

    // Remaining counter
    this.poolCounter = this.add.text(pz.x + pz.w / 2 - 10, y,
      `${totalShips - this.placedShips.length}`, {
        fontFamily: '"Courier New", monospace',
        fontSize: '20px',
        color: '#2a4b7c',
        fontStyle: 'bold',
    }).setOrigin(1, 0.5).setDepth(5);

    // Hint text
    this.poolHint = this.add.text(cx, y + pz.h / 2 - 7, 'Нажмите на блок, затем коснитесь поля', {
      fontFamily: '"Courier New", monospace',
      fontSize: '9px',
      color: '#9e9e9e',
    }).setOrigin(0.5).setDepth(5);
  }

  drawShipBlock(g, cx, cy, size, s, horizontal, color) {
    g.clear();
    if (horizontal) {
      const blockW = size * (s + 3) - 3;
      const startX = cx - blockW / 2;
      for (let i = 0; i < size; i++) {
        g.fillStyle(color, 0.8);
        g.fillRoundedRect(startX + i * (s + 3), cy - s / 2, s, s, 4);
        g.lineStyle(2, 0x1a3a6c, 1);
        g.strokeRoundedRect(startX + i * (s + 3), cy - s / 2, s, s, 4);
      }
    } else {
      const blockH = size * (s + 3) - 3;
      const startY = cy - blockH / 2;
      for (let i = 0; i < size; i++) {
        g.fillStyle(color, 0.8);
        g.fillRoundedRect(cx - s / 2, startY + i * (s + 3), s, s, 4);
        g.lineStyle(2, 0x1a3a6c, 1);
        g.strokeRoundedRect(cx - s / 2, startY + i * (s + 3), s, s, 4);
      }
    }
  }

  // ─── Ship Placement ──────────────────────────────────────

  toggleRotate() {
    this.horizontal = !this.horizontal;
    this.rotateBtn.setText(this.horizontal ? 'Повернуть' : 'Повернуть ↕');
    this.drawPool();
  }

  getPlacementCells(row, col, size) {
    return Array.from({ length: size }, (_, i) =>
      this.horizontal ? [row, col + i] : [row + i, col]
    );
  }

  placeShip(row, col) {
    const size = this.shipQueue[this.queueIdx].size;
    if (!canPlaceShip(this.board, row, col, size, this.horizontal)) return;

    const cells = this.getPlacementCells(row, col, size);
    const shipId = this.placedShips.length + 1;
    for (const [r, c] of cells) {
      this.board[r][c] = shipId;
    }
    this.placedShips.push({ cells, size, hits: [] });

    // Mark as placed and advance queue
    this.shipQueue[this.queueIdx].placed = true;
    this.queueIdx++;

    this.dragging = false;
    this.hoverHighlight.clear();
    this.previewGraphics.clear();
    this.renderShips();
    this.updateReadyButton();

    // Show next ship or completion
    this.drawPool();
  }

  autoPlace() {
    const result = autoPlaceShips();
    this.board = result.board;
    this.placedShips = result.ships.map(s => ({ ...s, hits: [] }));
    this.queueIdx = this.shipQueue.length;
    this.shipQueue.forEach(s => s.placed = true);
    this.dragging = false;
    this.hoverHighlight.clear();
    this.previewGraphics.clear();
    this.renderShips();
    this.drawPool();
    this.updateReadyButton();
  }

  // ─── Drawing ─────────────────────────────────────────────

  drawBg(w, h) {
    const g = this.add.graphics();
    g.fillStyle(COLORS.bg, 1);
    g.fillRect(0, 0, w, h);
    g.lineStyle(2, COLORS.marginLine, 0.6);
    g.lineBetween(48, 0, 48, h);
    g.lineStyle(1, COLORS.gridLineLight, 0.3);
    for (let y = 0; y < h; y += 20) {
      g.lineBetween(50, y, w, y);
    }
  }

  drawGrid() {
    const g = this.gridGraphics;
    g.clear();

    const ox = this.OFFSET_X;
    const oy = this.OFFSET_Y;
    const cell = this.CELL;
    const gap = this.GAP;

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const x = ox + c * (cell + gap);
        const y = oy + r * (cell + gap);
        g.fillStyle(0xffffff, 0.4);
        g.fillRect(x, y, cell, cell);
        g.lineStyle(1, COLORS.gridLine, 0.5);
        g.strokeRect(x, y, cell, cell);
      }
    }

    // Labels
    const labelSize = Math.max(11, Math.min(16, cell * 0.45));
    for (let r = 0; r < GRID_SIZE; r++) {
      this.add.text(ox - labelSize - 4, oy + r * (cell + gap) + cell / 2,
        `${r + 1}`, {
          fontFamily: '"Courier New", monospace',
          fontSize: `${labelSize}px`,
          color: '#2a4b7c',
        }).setOrigin(0.5);
    }
    const letters = 'АБВГДЕЖЗИК';
    for (let c = 0; c < GRID_SIZE; c++) {
      this.add.text(ox + c * (cell + gap) + cell / 2,
        oy - labelSize - 4, letters[c], {
          fontFamily: '"Courier New", monospace',
          fontSize: `${labelSize}px`,
          color: '#2a4b7c',
        }).setOrigin(0.5);
    }
  }

  renderShips() {
    this.shipGraphics.clear();
    const ox = this.OFFSET_X;
    const oy = this.OFFSET_Y;
    const cell = this.CELL;
    const gap = this.GAP;

    for (const ship of this.placedShips) {
      for (const [r, c] of ship.cells) {
        const x = ox + c * (cell + gap);
        const y = oy + r * (cell + gap);
        this.drawPenRect(this.shipGraphics, x, y, cell, cell, COLORS.shipStroke);
      }
    }
  }

  drawPenRect(g, x, y, w, h, color, alpha = 1) {
    g.lineStyle(2.5, color, alpha);
    const wb = 0.8;
    g.beginPath();
    g.moveTo(x + wb, y - wb);
    g.lineTo(x + w + wb * 0.5, y + wb);
    g.lineTo(x + w, y + h + wb * 0.5);
    g.lineTo(x - wb, y + h);
    g.closePath();
    g.strokePath();
    g.fillStyle(COLORS.bg, 0.3);
    g.fillRect(x + 1, y + 1, w - 2, h - 2);
  }

  updateReadyButton() {
    const expected = SHIP_CONFIG.reduce((a, s) => a + s.count, 0);
    if (this.placedShips.length === expected) {
      this.readyBtn.setStyle({ backgroundColor: '#388e3c' });
      this.readyBtn.setAlpha(1);
    } else {
      this.readyBtn.setStyle({ backgroundColor: '#9e9e9e' });
      this.readyBtn.setAlpha(0.5);
    }
  }

  confirmReady() {
    const expected = SHIP_CONFIG.reduce((a, s) => a + s.count, 0);
    if (this.placedShips.length !== expected) {
      this.readyBtn.setStyle({ backgroundColor: '#d32f2f' });
      this.time.delayedCall(300, () => this.updateReadyButton());
      return;
    }

    if (this.mode === 'ai') {
      this.scene.start('Battle', {
        mode: 'ai',
        playerBoard: this.board,
        playerShips: this.placedShips,
      });
    } else if (this.mode === 'network' && this.networkClient) {
      this.ready = true;
      this.readyBtn.setText('Ожидание соперника...');
      this.readyBtn.disableInteractive();
      this.networkClient.ready(this.board, this.placedShips);
    }
  }

  pointerToCell(px, py) {
    const col = Math.floor((px - this.OFFSET_X) / (this.CELL + this.GAP));
    const row = Math.floor((py - this.OFFSET_Y) / (this.CELL + this.GAP));
    if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return null;
    return { row, col };
  }

  handleNetMessage(msg) {
    switch (msg.type) {
      case 'opponent_ready':
        this.add.text(this.OFFSET_X + this.BOARD_PX / 2,
          this.OFFSET_Y + this.BOARD_PX + 180,
          'Соперник готов!', {
            fontFamily: '"Courier New", monospace',
            fontSize: '14px',
            color: '#388e3c',
          }).setOrigin(0.5);
        break;
      case 'battle_start':
        this.scene.start('Battle', {
          mode: 'network',
          playerBoard: this.board,
          playerShips: this.placedShips,
          networkClient: this.networkClient,
          playerNum: this.playerNum,
          roomId: this.roomId,
        });
        break;
    }
  }
}