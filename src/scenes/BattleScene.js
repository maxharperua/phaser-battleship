const Phaser = window.Phaser;
import {
  GRID_SIZE, COLORS, SHIP_CONFIG,
  processAttack, allSunk, createEmptyBoard, autoPlaceShips
} from '../ships.js';
import { BattleshipAI } from '../ai.js';

export default class BattleScene extends Phaser.Scene {
  constructor() {
    super('Battle');
  }

  init(data) {
    this.mode = data.mode || 'ai';
    this.playerBoard = data.playerBoard;
    this.playerShips = data.playerShips.map(s => ({ ...s, hits: new Set(s.hits || []) }));
    this.networkClient = data.networkClient || null;
    this.playerNum = data.playerNum || 1;
    this.roomId = data.roomId || null;

    this.enemyShips = null;
    this.enemyBoard = null;

    this.myTurn = this.mode === 'ai';
    this.gameOver = false;
    this.log = [];
    this.showEnemyView = true;

    if (this.mode === 'ai') {
      const result = autoPlaceShips();
      this.enemyBoard = result.board;
      this.enemyShips = result.ships.map(s => ({ ...s, hits: new Set() }));
      this.ai = new BattleshipAI();
    }

    this.shots = { my: new Set(), enemy: new Set() };

    // Sound init
    this._audioCtx = null;
    this.soundEnabled = localStorage.getItem('bs_sound') !== 'off';
  }

  // ─── Audio System ────────────────────────────────────────

  _ensureAudio() {
    if (!this._audioCtx) {
      try {
        this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        return null;
      }
    }
    if (this._audioCtx.state === 'suspended') {
      this._audioCtx.resume();
    }
    return this._audioCtx;
  }

  playHitSound() {
    if (!this.soundEnabled) return;
    try {
      const ctx = this._ensureAudio();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.35);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (e) { /* ignore */ }
  }

  playMissSound() {
    if (!this.soundEnabled) return;
    try {
      const ctx = this._ensureAudio();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(900, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch (e) { /* ignore */ }
  }

  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    localStorage.setItem('bs_sound', this.soundEnabled ? 'on' : 'off');
    if (this.soundBtn) {
      this.soundBtn.setText(this.soundEnabled ? '\u{1F50A}' : '\u{1F507}');
    }
  }

  // ─── Visual Effects ──────────────────────────────────────

  _getCellPos(row, col, isEnemy) {
    const cell = this.CELL;
    const gap = this.GAP;
    let ox;
    if (this.isPortrait) {
      ox = this.BOARD_X;
    } else {
      ox = isEnemy ? this.RIGHT_BOARD_X : this.LEFT_BOARD_X;
    }
    return {
      x: ox + col * (cell + gap),
      y: this.BOARD_Y + row * (cell + gap)
    };
  }

  showHitEffect(row, col, isEnemy) {
    if (!this.CELL) return;
    const s = this.CELL;
    const pos = this._getCellPos(row, col, isEnemy);
    const cx = pos.x + s / 2;
    const cy = pos.y + s / 2;

    // Scale to fill ~2 cell widths for clear visibility
    const scale = Math.max(0.9, (s / 64) * 2.0);
    const explosion = this.add.sprite(cx, cy, 'exp_hit').setDepth(10);
    explosion.setScale(scale);
    explosion.setAlpha(0.9);
    explosion.play('explode_hit');
    explosion.once('animationcomplete', () => explosion.destroy());

    this.playHitSound();
  }

  showMissEffect(row, col, isEnemy) {
    if (!this.CELL) return;
    const s = this.CELL;
    const pos = this._getCellPos(row, col, isEnemy);
    const cx = pos.x + s / 2;
    const cy = pos.y + s / 2;

    // Draw a blue expanding ripple ring (water splash) using Graphics
    const g = this.add.graphics().setDepth(10);
    const maxR = s * 1.4;
    let progress = 0;

    const timer = this.time.addEvent({
      delay: 18,
      repeat: 14,
      callback: () => {
        progress += 1 / 15;
        g.clear();
        const r = maxR * Math.min(progress, 1);

        // Outer ring
        const a1 = Math.max(0, 0.85 * (1 - progress));
        g.lineStyle(Math.max(1, s * 0.08), 0x4488ff, a1);
        g.strokeCircle(cx, cy, r);

        // Inner ring
        const a2 = Math.max(0, 0.6 * (1 - progress * 0.7));
        g.lineStyle(Math.max(1, s * 0.04), 0x66bbff, a2);
        g.strokeCircle(cx, cy, r * 0.6);

        // Center dot (fades quickly)
        if (progress < 0.3) {
          g.fillStyle(0x4488ff, 0.5 * (1 - progress * 3));
          g.fillCircle(cx, cy, Math.max(2, s * 0.08));
        }

        if (progress >= 1) {
          g.destroy();
          timer.destroy();
        }
      }
    });

    this.playMissSound();
  }

  // ─── Game Methods ────────────────────────────────────────

  create() {
    this._resizeTimer = null;
    this.resizeHandler = () => {
      if (this._resizeTimer) return;
      this._resizeTimer = this.time.delayedCall(150, () => {
        this._resizeTimer = null;
        this.handleResize();
      });
    };
    this.scale.on('resize', this.resizeHandler);
    this.handleResize();

    if (this.mode === 'network' && this.networkClient) {
      this.networkClient.onMessage = (msg) => this.handleNetMessage(msg);
    }
  }

  handleResize() {
    const w = this.scale.width;
    const h = this.scale.height;
    this.isPortrait = w < h;

    const headerH = 50;
    const footerH = 60;
    const margin = Math.max(8, Math.floor(w * 0.04));
    this.margin = margin;

    const availW = w - margin * 2;
    const availH = h - headerH - footerH;

    let cell, gap;
    if (this.isPortrait) {
      cell = Math.min(
        Math.floor((availW - 9 * 1.5) / 10),
        Math.floor((availH - 9 * 1.5) / 10)
      );
    } else {
      cell = Math.min(
        Math.floor((availW * 0.42 - 9 * 1.5) / 10),
        Math.floor((availH - 9 * 1.5) / 10)
      );
    }
    cell = Math.max(26, Math.min(cell, 55));
    gap = 1.5;
    this.CELL = cell;
    this.GAP = gap;
    this.BOARD_PX = GRID_SIZE * (cell + gap);

    if (this.isPortrait) {
      this.BOARD_X = Math.floor((w - this.BOARD_PX) / 2);
      this.BOARD_Y = Math.floor(headerH + 5);
    } else {
      const twoBoardsW = this.BOARD_PX * 2 + 40;
      const startX = Math.max(10, Math.floor((w - twoBoardsW) / 2));
      this.LEFT_BOARD_X = startX;
      this.RIGHT_BOARD_X = startX + this.BOARD_PX + 40;
      this.BOARD_Y = Math.floor(headerH + 5);
    }

    this.cleanAndBuild(w, h);
  }

  cleanAndBuild(w, h) {
    if (this._built) {
      this.children.removeAll(true);
    }

    this.gridG = this.add.graphics();
    this.overlayG = this.add.graphics();
    this.uiLayer = this.add.container(0, 0);
    this._built = true;

    this.drawBg(w, h);

    if (this.isPortrait) {
      this.buildPortrait(w, h);
    } else {
      this.buildLandscape(w, h);
    }
  }

  buildPortrait(w, h) {
    const cx = w / 2;
    const cell = this.CELL;
    const gap = this.GAP;
    const ox = this.BOARD_X;
    const oy = this.BOARD_Y;

    // Mute button
    this.soundBtn = this.add.text(12, 12, this.soundEnabled ? '\u{1F50A}' : '\u{1F507}', {
      fontFamily: 'Arial',
      fontSize: '18px',
    }).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    this.soundBtn.on('pointerdown', () => this.toggleSound());
    this.soundBtn.setDepth(20);

    // Toggle button
    const toggleText = this.showEnemyView ? '\u2694\uFE0F Атака' : '\u{1F6E1}\uFE0F Мои корабли';
    this.toggleBtn = this.add.text(cx, 12, toggleText, {
      fontFamily: '"Courier New", monospace',
      fontSize: '18px',
      color: '#f5f0e8',
      backgroundColor: '#1e3a5f',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.toggleBtn.on('pointerdown', () => {
      this.showEnemyView = !this.showEnemyView;
      this.refreshBoard();
    });

    // Board label
    const labelText = this.showEnemyView ? 'Поле противника' : 'Ваше поле';
    this.boardLabel = this.add.text(cx, 34, labelText, {
      fontFamily: '"Courier New", monospace',
      fontSize: '15px',
      color: '#2a4b7c',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Draw grid
    this.gridG.clear();
    this.drawGrid(this.gridG, ox, oy, true);

    // Draw ships (only on player board)
    if (!this.showEnemyView) {
      this.drawPlayerShips(ox, oy, cell, gap);
    }

    // Draw markers
    this.drawMarkers(ox, oy, cell, gap);

    // Turn indicator
    this.turnText = this.add.text(cx, h - 24, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '18px',
      color: '#2a4b7c',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.updateTurnText();

    // Log
    this.logText = this.add.text(this.margin, h - 85, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '14px',
      color: '#1a2a4a',
      fontStyle: 'bold',
      wordWrap: { width: w - this.margin * 2 },
    });

    // Back button (menu)
    this.menuBtn = this.add.text(this.margin, 12, '☰ Меню', {
      fontFamily: '"Courier New", monospace',
      fontSize: '16px',
      color: '#2a4b7c',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    this.menuBtn.on('pointerdown', () => {
      this.scale.off('resize', this.resizeHandler);
      this.scene.start('Menu');
    });

    // Click handler for portrait
    this.input.off('pointerdown');
    this.input.on('pointerdown', (pointer) => {
      if (this.showEnemyView) {
        this.handleEnemyClick(pointer, ox, oy);
      }
    });
  }

  buildLandscape(w, h) {
    const cell = this.CELL;
    const gap = this.GAP;
    const cx = w / 2;

    // Mute button
    this.soundBtn = this.add.text(12, 12, this.soundEnabled ? '\u{1F50A}' : '\u{1F507}', {
      fontFamily: 'Arial',
      fontSize: '18px',
    }).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    this.soundBtn.on('pointerdown', () => this.toggleSound());
    this.soundBtn.setDepth(20);

    // Labels
    this.boardLabelL = this.add.text(this.LEFT_BOARD_X + this.BOARD_PX / 2, 14, 'Ваше поле', {
      fontFamily: '"Courier New", monospace',
      fontSize: '16px',
      color: '#1a2a4a',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.boardLabelR = this.add.text(this.RIGHT_BOARD_X + this.BOARD_PX / 2, 14, 'Поле противника', {
      fontFamily: '"Courier New", monospace',
      fontSize: '16px',
      color: '#1a2a4a',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Grids
    this.gridG.clear();
    this.drawGrid(this.gridG, this.LEFT_BOARD_X, this.BOARD_Y, true);
    this.drawGrid(this.gridG, this.RIGHT_BOARD_X, this.BOARD_Y, false);

    this.drawPlayerShips(this.LEFT_BOARD_X, this.BOARD_Y, cell, gap);
    this.drawMarkers(this.LEFT_BOARD_X, this.BOARD_Y, cell, gap);
    this.drawMarkers(this.RIGHT_BOARD_X, this.BOARD_Y, cell, gap);

    // Turn text
    this.turnText = this.add.text(cx, h - 24, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '18px',
      color: '#2a4b7c',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.updateTurnText();

    this.logText = this.add.text(cx, h - 44, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '13px',
      color: '#1a2a4a',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.menuBtn = this.add.text(10, 12, '☰ Меню', {
      fontFamily: '"Courier New", monospace',
      fontSize: '16px',
      color: '#2a4b7c',
      fontStyle: 'bold',
    }).setInteractive({ useHandCursor: true });
    this.menuBtn.on('pointerdown', () => {
      this.scale.off('resize', this.resizeHandler);
      this.scene.start('Menu');
    });

    // Click handler
    this.input.off('pointerdown');
    this.input.on('pointerdown', (pointer) => {
      this.handleEnemyClick(pointer, this.RIGHT_BOARD_X, this.BOARD_Y);
    });
  }

  refreshBoard() {
    const w = this.scale.width;
    const h = this.scale.height;
    this.cleanAndBuild(w, h);
    this.updateTurnText();
    if (this.logText && this.log.length) {
      this.logText.setText(this.log.slice(-3).join('\n'));
    }
  }

  drawBg(w, h) {
    const g = this.gridG;
    g.fillStyle(COLORS.bg, 1);
    g.fillRect(0, 0, w, h);
    g.lineStyle(2, COLORS.marginLine, 0.6);
    g.lineBetween(48, 0, 48, h);
    g.lineStyle(1, COLORS.gridLineLight, 0.3);
    for (let y = 0; y < h; y += 20) {
      g.lineBetween(50, y, w, y);
    }
  }

  drawGrid(g, ox, oy, showLabels) {
    const cell = this.CELL;
    const gap = this.GAP;
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const x = ox + c * (cell + gap);
        const y = oy + r * (cell + gap);
        g.fillStyle(0xffffff, 0.3);
        g.fillRect(x, y, cell, cell);
        g.lineStyle(0.5, COLORS.gridLine, 0.4);
        g.strokeRect(x, y, cell, cell);
      }
    }
    if (showLabels) {
      const labelSize = Math.max(11, Math.min(16, cell * 0.45));
      const letters = 'АБВГДЕЖЗИК';
      for (let c = 0; c < GRID_SIZE; c++) {
        this.add.text(ox + c * (cell + gap) + cell / 2, oy - labelSize - 2,
          letters[c], {
            fontFamily: '"Courier New", monospace',
            fontSize: `${labelSize}px`,
            color: '#2a4b7c',
          }).setOrigin(0.5);
      }
      for (let r = 0; r < GRID_SIZE; r++) {
        this.add.text(ox - labelSize - 2, oy + r * (cell + gap) + cell / 2,
          `${r + 1}`, {
            fontFamily: '"Courier New", monospace',
            fontSize: `${labelSize}px`,
            color: '#2a4b7c',
          }).setOrigin(0.5);
      }
    }
  }

  drawPlayerShips(ox, oy, cell, gap) {
    const g = this.overlayG;
    for (const ship of this.playerShips) {
      const isSunk = ship.hits && ship.hits.size === ship.size;
      for (const [r, c] of ship.cells) {
        const x = ox + c * (cell + gap);
        const y = oy + r * (cell + gap);
        if (isSunk) {
          g.fillStyle(COLORS.sunkShip, 0.6);
          g.fillRect(x, y, cell, cell);
          this.drawCross(g, x, y, cell, COLORS.marginLine);
        } else {
          g.fillStyle(COLORS.shipStroke, 0.15);
          g.fillRect(x, y, cell, cell);
          g.lineStyle(2, COLORS.shipStroke, 0.8);
          g.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
        }
      }
    }
  }

  drawMarkers(ox, oy, cell, gap) {
    const g = this.overlayG;
    const isEnemyBoard = (this.isPortrait && this.showEnemyView) ||
      (!this.isPortrait && ox === this.RIGHT_BOARD_X);

    const shotsSet = isEnemyBoard ? this.shots.enemy : this.shots.my;
    const ships = isEnemyBoard ? this.enemyShips : this.playerShips;

    for (const key of shotsSet) {
      const [r, c] = key.split(',').map(Number);
      const x = ox + c * (cell + gap);
      const y = oy + r * (cell + gap);
      const cx2 = x + cell / 2;
      const cy = y + cell / 2;

      const isHit = ships && ships.some(s => s.hits.has(key));

      if (isHit) {
        g.fillStyle(COLORS.hitFill, 0.7);
        g.fillCircle(cx2, cy, cell * 0.3);
        this.drawCross(g, x, y, cell, COLORS.hitCross);
        g.fillStyle(isEnemyBoard ? COLORS.enemyHitBg : COLORS.playerHitBg, 0.4);
        g.fillRect(x, y, cell, cell);
      } else {
        g.lineStyle(1.5, COLORS.missOutline, 0.6);
        g.strokeCircle(cx2, cy, cell * 0.2);
        g.fillStyle(COLORS.missDot, 0.5);
        g.fillCircle(cx2, cy, 2.5);
      }
    }

    if (isEnemyBoard && ships) {
      for (const ship of ships) {
        if (ship.hits && ship.hits.size === ship.size) {
          for (const [r, c] of ship.cells) {
            const x = ox + c * (cell + gap);
            const y = oy + r * (cell + gap);
            g.fillStyle(COLORS.sunkShip, 0.4);
            g.fillRect(x, y, cell, cell);
            g.lineStyle(1, COLORS.missDot, 0.5);
            for (let i = 0; i < cell; i += 6) {
              g.lineBetween(x + i, y, x + i + 4, y + cell);
            }
          }
        }
      }
    }
  }

  drawCross(g, x, y, size, color) {
    const s = size * 0.3;
    const cx = x + size / 2;
    const cy = y + size / 2;
    g.lineStyle(2.5, color, 0.9);
    g.lineBetween(cx - s, cy - s, cx + s, cy + s);
    g.lineBetween(cx + s, cy - s, cx - s, cy + s);
  }

  handleEnemyClick(pointer, ox, oy) {
    if (!this.myTurn || this.gameOver) return;

    const cell = this.pointerToCell(pointer.x, pointer.y, ox, oy);
    if (!cell) return;

    const key = `${cell.row},${cell.col}`;
    if (this.shots.enemy.has(key)) return;

    if (this.mode === 'network') {
      this.networkClient.attack(cell.row, cell.col);
      return;
    }

    const result = processAttack(this.enemyBoard, this.enemyShips, cell.row, cell.col);
    this.shots.enemy.add(key);

    // Refresh board FIRST (adds persistent markers), then play animation on top
    this.refreshBoard();

    if (result.hit) {
      this.addLog(`Попадание! ${result.sunk ? 'Корабль уничтожен!' : ''}`);
      this.showHitEffect(cell.row, cell.col, true);
      this.playHitSound();
      if (result.sunk) {
        const ship = this.enemyShips[result.shipIdx];
        this.markSunkArea(ship);
        // Refresh board after sunk markers, with delay so hit animation plays first
        this.time.delayedCall(900, () => this.refreshBoard());
      }
      if (allSunk(this.enemyShips)) {
        this.gameOver = true;
        this.showWinner(true);
        return;
      }
    } else {
      this.addLog('Мимо!');
      this.showMissEffect(cell.row, cell.col, true);
      this.playMissSound();
      this.myTurn = false;
    }

    if (!this.myTurn && !this.gameOver) {
      this.time.delayedCall(600, () => this.aiTurn());
    }
  }

  aiTurn() {
    if (this.gameOver) return;

    // Show player's board during enemy turn
    this.showEnemyView = false;

    const [row, col] = this.ai.getAttack();
    const key = `${row},${col}`;
    this.shots.my.add(key);

    const result = processAttack(this.playerBoard, this.playerShips, row, col);
    this.ai.processResult(row, col, result);

    // Refresh board FIRST (adds persistent markers), then play animation on top
    this.refreshBoard();

    if (result.hit) {
      this.addLog(`Противник попал! ${result.sunk ? 'Ваш корабль уничтожен!' : ''}`);
      this.showHitEffect(row, col, false);
      this.playHitSound();
      if (result.sunk) {
        const ship = this.playerShips[result.shipIdx];
        this.markPlayerSunkArea(ship);
        this.ai.markSunk(ship);
        // Refresh board after sunk markers, with delay so hit animation plays first
        this.time.delayedCall(900, () => this.refreshBoard());
      }
      if (allSunk(this.playerShips)) {
        this.gameOver = true;
        this.showWinner(false);
        return;
      }
      this.time.delayedCall(600, () => this.aiTurn());
    } else {
      this.addLog('Противник промахнулся!');
      this.showMissEffect(row, col, false);
      this.playMissSound();
      this.myTurn = true;
      // Switch back to enemy board for your turn
      this.showEnemyView = true;
      // Delayed refresh to switch view after miss animation plays
      this.time.delayedCall(900, () => this.refreshBoard());
    }
  }

  markSunkArea(ship) {
    const cell = this.CELL || 30;
    const gap = this.GAP || 1.5;
    for (const [r, c] of ship.cells) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
            const key = `${nr},${nc}`;
            if (!this.shots.enemy.has(key)) {
              this.shots.enemy.add(key);
            }
          }
        }
      }
    }
  }

  markPlayerSunkArea(ship) {
    for (const [r, c] of ship.cells) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
            const key = `${nr},${nc}`;
            if (!this.shots.my.has(key)) {
              this.shots.my.add(key);
            }
          }
        }
      }
    }
  }

  pointerToCell(px, py, ox, oy) {
    const cell = this.CELL;
    const gap = this.GAP;
    const col = Math.floor((px - ox) / (cell + gap));
    const row = Math.floor((py - oy) / (cell + gap));
    if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return null;
    return { row, col };
  }

  addLog(msg) {
    this.log.push(msg);
    if (this.log.length > 5) this.log.shift();
    if (this.logText) {
      this.logText.setText(this.log.join('\n'));
    }
  }

  updateTurnText() {
    if (!this.turnText) return;
    if (this.gameOver) return;
    this.turnText.setText(this.myTurn
      ? '\u{1F3AF} Ваш ход'
      : '\u23F3 Ход противника...');
  }

  showWinner(playerWon) {
    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w / 2;

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.5);
    overlay.fillRect(0, 0, w, h);
    overlay.setDepth(100);

    const msg = playerWon ? '\u{1F3C6} ПОБЕДА!' : '\u{1F480} Поражение...';
    this.add.text(cx, h * 0.4, msg, {
      fontFamily: '"Courier New", monospace',
      fontSize: '36px',
      color: playerWon ? '#388e3c' : '#d32f2f',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(101);

    this.add.text(cx, h * 0.5, playerWon
      ? 'Все корабли противника уничтожены!'
      : 'Все ваши корабли уничтожены', {
      fontFamily: '"Courier New", monospace',
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(101);

    const btn = this.add.text(cx, h * 0.6, 'В главное меню', {
      fontFamily: '"Courier New", monospace',
      fontSize: '20px',
      color: '#f5f0e8',
      backgroundColor: '#2a4b7c',
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(101);
    btn.on('pointerdown', () => {
      this.scale.off('resize', this.resizeHandler);
      this.scene.start('Menu');
    });
  }

  handleNetMessage(msg) {
    switch (msg.type) {
      case 'attack_result':
        const isMe = (msg.attacker === this.playerNum);
        if (isMe) {
          this.shots.enemy.add(`${msg.row},${msg.col}`);
          if (msg.hit) {
            this.addLog('Попадание! ' + (msg.sunk ? 'Корабль уничтожен!' : ''));
            if (msg.winner === this.playerNum) {
              this.gameOver = true;
              this.refreshBoard();
              this.showWinner(true);
              return;
            }
          } else {
            this.addLog('Мимо!');
            this.myTurn = false;
          }
        } else {
          this.shots.my.add(`${msg.row},${msg.col}`);
          if (msg.hit) {
            this.addLog('Противник попал!');
            if (msg.sunk) {
              this.addLog('Корабль уничтожен!');
            }
            if (msg.winner === msg.attacker) {
              this.gameOver = true;
              this.refreshBoard();
              this.showWinner(false);
              return;
            }
          } else {
            this.addLog('Противник промахнулся!');
            this.myTurn = true;
          }
        }
        this.refreshBoard();
        break;
    }
  }

  shutdown() {
    if (this.resizeHandler) {
      this.scale.off('resize', this.resizeHandler);
    }
  }
}