const Phaser = window.Phaser;
import { COLORS } from '../ships.js';
import { NetworkClient, getSignalingUrl } from '../network.js';

export default class LobbyScene extends Phaser.Scene {
  constructor() {
    super('Lobby');
  }

  init(data) {
    this.autoJoinCode = data.autoJoin || null;
    this.myPlayerNum = null;
  }

  create() {
    const { width, height } = this.scale;
    const cx = width / 2;

    this.netClient = new NetworkClient();

    // Notebook background
    this.drawBg(width, height);

    this.add.text(cx, 40, 'Сетевая игра', {
      fontFamily: '"Courier New", monospace',
      fontSize: '32px', color: '#2a4b7c', fontStyle: 'bold',
    }).setOrigin(0.5);

    // Create lobby button
    this.createBtn = this.add.text(cx, 130, 'Создать лобби', {
      fontFamily: '"Courier New", monospace',
      fontSize: '22px', color: '#f5f0e8', backgroundColor: '#2a4b7c',
      padding: { x: 24, y: 12 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.createBtn.on('pointerdown', () => this.createLobby());

    // Join by code
    this.add.text(cx, 210, 'Есть код комнаты?', {
      fontFamily: '"Courier New", monospace',
      fontSize: '16px', color: '#546e7a',
    }).setOrigin(0.5);

    this.joinBtn = this.add.text(cx, 250, 'Присоединиться по коду', {
      fontFamily: '"Courier New", monospace',
      fontSize: '18px', color: '#f5f0e8', backgroundColor: '#388e3c',
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.joinBtn.on('pointerdown', () => this.promptJoin());

    // Back button
    this.add.text(cx, height - 40, '← Назад', {
      fontFamily: '"Courier New", monospace',
      fontSize: '18px', color: '#2a4b7c',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.netClient.disconnect();
        this.scene.start('Menu');
      });

    // Status / info texts
    this.statusText = this.add.text(cx, 310, 'Подключение к серверу...', {
      fontFamily: '"Courier New", monospace',
      fontSize: '16px', color: '#546e7a',
    }).setOrigin(0.5);

    this.lobbyIdText = this.add.text(cx, 370, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '14px', color: '#2a4b7c',
      wordWrap: { width: 500 },
    }).setOrigin(0.5);

    // Connect to signaling server
    const wsUrl = getSignalingUrl();
    this.netClient.connect(wsUrl).then(() => {
      this.statusText.setText('✅ Подключено к серверу');

      if (this.autoJoinCode) {
        this.statusText.setText(`🔗 Подключение к комнате ${this.autoJoinCode}...`);
        this.netClient.joinLobby(this.autoJoinCode);
      }
    }).catch(() => {
      this.statusText.setText('❌ Ошибка подключения к серверу.\nЗапустите: node server/server.js');
    });

    this.netClient.onMessage = (msg) => this.handleMessage(msg);
  }

  drawBg(w, h) {
    const g = this.add.graphics();
    g.fillStyle(COLORS.bg, 1);
    g.fillRect(0, 0, w, h);
    g.lineStyle(2, COLORS.marginLine, 0.6);
    g.lineBetween(48, 0, 48, h);
    g.lineStyle(1, COLORS.gridLineLight, 0.3);
    for (let y = 0; y < h; y += 20) g.lineBetween(50, y, w, y);
  }

  createLobby() {
    if (!this.netClient.ws || this.netClient.ws.readyState !== WebSocket.OPEN) {
      this.statusText.setText('Нет подключения к серверу');
      return;
    }
    this.statusText.setText('Создание лобби...');
    this.netClient.createLobby();
  }

  promptJoin() {
    const input = prompt('Введите код комнаты или вставьте ссылку:');
    if (!input) return;

    let roomId = input.trim();
    const match = roomId.match(/[?&]join=([a-f0-9]+)/i);
    if (match) roomId = match[1];

    if (roomId.length < 6) {
      this.statusText.setText('❌ Некорректный код комнаты');
      return;
    }

    this.statusText.setText(`🔗 Подключение к комнате ${roomId}...`);
    this.netClient.joinLobby(roomId);
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'lobby_created':
        this.myPlayerNum = 1;
        const link = `${window.location.origin}${window.location.pathname}?join=${msg.room_id}`;
        this.statusText.setText('✅ Лобби создано! Отправьте ссылку другу:');
        this.lobbyIdText.setText(link);

        const copyBtn = this.add.text(this.scale.width / 2, 420, '📋 Скопировать ссылку', {
          fontFamily: '"Courier New", monospace',
          fontSize: '16px', color: '#f5f0e8', backgroundColor: '#1565c0',
          padding: { x: 16, y: 8 },
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        copyBtn.on('pointerdown', () => {
          navigator.clipboard.writeText(link).then(() => {
            this.statusText.setText('✅ Ссылка скопирована! Ждём друга...');
            copyBtn.destroy();
          });
        });
        break;

      case 'game_start':
        const playerNum = this.myPlayerNum || 2;
        this.scene.start('Place', {
          mode: 'network',
          networkClient: this.netClient,
          playerNum,
          roomId: msg.room_id,
        });
        break;

      case 'error':
        this.statusText.setText(`❌ ${msg.message}`);
        break;
    }
  }
}