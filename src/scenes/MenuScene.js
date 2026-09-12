const Phaser = window.Phaser;
import { COLORS } from '../ships.js';

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    // Check URL for ?join=XXX → auto-join room
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get('join');
    if (joinCode && joinCode.length >= 6) {
      this.scene.start('Lobby', { autoJoin: joinCode });
      return;
    }

    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w / 2;
    const isPortrait = w < h;

    this.drawNotebookBg(w, h);

    // Title
    const titleSize = isPortrait ? Math.min(42, w / 7) : 48;
    this.add.text(cx, h * 0.12, 'МОРСКОЙ БОЙ', {
      fontFamily: '"Courier New", monospace',
      fontSize: `${titleSize}px`,
      color: '#2a4b7c',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(cx, h * 0.12 + titleSize + 8, 'Классическая игра', {
      fontFamily: '"Courier New", monospace',
      fontSize: `${Math.min(16, w / 22)}px`,
      color: '#546e7a',
    }).setOrigin(0.5);

    // Buttons
    const btnSize = isPortrait ? Math.min(18, w / 20) : 22;
    this.createButton(cx, h * 0.38, 'Новая игра (против ИИ)', btnSize, () => {
      this.scene.start('Place', { mode: 'ai' });
    });

    this.createButton(cx, h * 0.38 + (isPortrait ? 56 : 80), 'Сетевая игра', btnSize, () => {
      this.scene.start('Lobby');
    });

    // Decorative ships
    this.drawDecoShips(cx, h * 0.62);
  }

  createButton(x, y, text, size, callback) {
    const btn = this.add.text(x, y, text, {
      fontFamily: '"Courier New", monospace',
      fontSize: `${size}px`,
      color: '#f5f0e8',
      backgroundColor: '#2a4b7c',
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setStyle({ backgroundColor: '#3a6b9c' }));
    btn.on('pointerout', () => btn.setStyle({ backgroundColor: '#2a4b7c' }));
    btn.on('pointerdown', callback);
    return btn;
  }

  drawNotebookBg(w, h) {
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

  drawDecoShips(cx, y) {
    const g = this.add.graphics();
    const ships = [
      { w: 80, h: 20 },
      { w: 60, h: 20 },
      { w: 40, h: 20 },
      { w: 20, h: 20 },
    ];
    ships.forEach((s, i) => {
      const sx = cx + i * 30 - 70;
      const sy = y + i * 28;
      this.drawPenRect(g, sx, sy, s.w, s.h, COLORS.shipStroke);
    });
  }

  drawPenRect(g, x, y, w, h, color) {
    g.lineStyle(2, color, 0.8);
    const wobble = 1;
    g.beginPath();
    g.moveTo(x - wobble, y - wobble);
    g.lineTo(x + w + wobble, y);
    g.lineTo(x + w, y + h + wobble);
    g.lineTo(x, y + h);
    g.closePath();
    g.strokePath();
    g.lineStyle(1, color, 0.2);
    for (let i = 0; i < w; i += 6) {
      g.lineBetween(x + i, y, x + i + 3, y + h);
    }
  }
}
