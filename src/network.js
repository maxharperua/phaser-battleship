// Сетевая игра (многопользовательский Морской бой)
// Подключается к WebSocket серверу сигнализации

const WS_URL_KEY = 'battleship:ws_url';

export function getSignalingUrl() {
  const loc = window.location;
  const wsProto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  const saved = localStorage.getItem(WS_URL_KEY);
  if (saved) return saved;
  // Use nginx proxy: same origin, path /ws
  return `${wsProto}//${loc.host}/ws`;
}

export function setSignalingUrl(url) {
  localStorage.setItem(WS_URL_KEY, url);
}

export class NetworkClient {
  constructor() {
    this.ws = null;
    this.roomId = null;
    this.onMessage = null;
    this.onOpen = null;
    this.onClose = null;
    this.onError = null;
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => {
        if (this.onOpen) this.onOpen();
        resolve();
      };
      this.ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (this.onMessage) this.onMessage(msg);
        } catch (e) {
          console.error('WS parse error:', e);
        }
      };
      this.ws.onclose = (ev) => {
        if (this.onClose) this.onClose(ev);
      };
      this.ws.onerror = (err) => {
        if (this.onError) this.onError(err);
        reject(err);
      };
    });
  }

  send(type, payload = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, ...payload }));
    }
  }

  createLobby() {
    this.send('create_lobby');
  }

  joinLobby(roomId) {
    this.roomId = roomId;
    this.send('join_lobby', { room_id: roomId });
  }

  ready(board, ships) {
    this.send('player_ready', {
      room_id: this.roomId,
      board,
      ships: ships.map(s => ({
        cells: s.cells,
        size: s.size,
        hits: s.hits || [],
      })),
    });
  }

  attack(row, col) {
    this.send('attack', { room_id: this.roomId, row, col });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}