// Battleship WebSocket signaling server
import { WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';

const PORT = process.env.GAME_PORT || 3001;
const HOST = process.env.GAME_HOST || '0.0.0.0';

const rooms = new Map(); // roomId -> { players, state, board1, board2, ships1, ships2, ready1, ready2 }

function createRoom() {
  const id = randomUUID().slice(0, 8);
  rooms.set(id, {
    id,
    players: [],
    state: 'waiting', // waiting, placing, playing, over
    ready: new Set(),
  });
  return id;
}

const wss = new WebSocketServer({ host: HOST, port: PORT });
console.log(`WS signaling server on ${HOST}:${PORT}`);

wss.on('connection', (ws) => {
  ws._player = null;
  ws._room = null;

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      handleMessage(ws, msg);
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
    }
  });

  ws.on('close', () => handleDisconnect(ws));
});

function handleMessage(ws, msg) {
  switch (msg.type) {
    case 'create_lobby':
      return handleCreateLobby(ws);
    case 'join_lobby':
      return handleJoinLobby(ws, msg.room_id);
    case 'player_ready':
      return handlePlayerReady(ws, msg);
    case 'attack':
      return handleAttack(ws, msg);
    default:
      ws.send(JSON.stringify({ type: 'error', message: `Unknown type: ${msg.type}` }));
  }
}

function handleCreateLobby(ws) {
  ws._player = 1;
  const roomId = createRoom();
  ws._room = roomId;
  const room = rooms.get(roomId);
  room.players[0] = ws;
  ws.send(JSON.stringify({ type: 'lobby_created', room_id: roomId }));
  console.log(`Room ${roomId} created by player 1`);
}

function handleJoinLobby(ws, roomId) {
  const room = rooms.get(roomId);
  if (!room) {
    ws.send(JSON.stringify({ type: 'error', message: 'Комната не найдена' }));
    return;
  }
  if (room.players.length >= 2) {
    ws.send(JSON.stringify({ type: 'error', message: 'Комната уже заполнена' }));
    return;
  }
  ws._player = 2;
  ws._room = roomId;
  room.players[1] = ws;
  room.state = 'placing';

  // Notify both players
  const msg = { type: 'game_start', room_id: roomId };
  room.players[0]?.send(JSON.stringify(msg));
  room.players[1]?.send(JSON.stringify(msg));
  console.log(`Room ${roomId}: player 2 joined, game start`);
}

function handlePlayerReady(ws, msg) {
  const room = rooms.get(msg.room_id || ws._room);
  if (!room) return;

  room.ready.add(ws._player);
  room[`board${ws._player}`] = msg.board;
  room[`ships${ws._player}`] = msg.ships;

  // Notify the other player that opponent is ready
  const other = ws._player === 1 ? 2 : 1;
  const otherWs = room.players.find(p => p?._player === other);
  if (otherWs) {
    otherWs.send(JSON.stringify({ type: 'opponent_ready', player: ws._player }));
  }

  if (room.ready.size === 2) {
    room.state = 'playing';
    room.players.forEach(p => {
      p.send(JSON.stringify({ type: 'battle_start' }));
    });
    console.log(`Room ${room.id}: both ready, battle start`);
  }
}

function handleAttack(ws, msg) {
  const room = rooms.get(msg.room_id || ws._room);
  if (!room || room.state !== 'playing') {
    ws.send(JSON.stringify({ type: 'error', message: 'Игра ещё не началась' }));
    return;
  }

  const attacker = ws._player;
  const defender = attacker === 1 ? 2 : 1;
  const boardKey = `board${defender}`;
  const shipsKey = `ships${defender}`;
  const board = room[boardKey];
  const ships = room[shipsKey];

  if (!board || !ships) {
    ws.send(JSON.stringify({ type: 'error', message: 'Ошибка данных игры' }));
    return;
  }

  const row = msg.row, col = msg.col;
  const val = board[row][col];
  let hit = false, sunk = false, shipIdx = -1;

  if (val > 0) {
    shipIdx = val - 1;
    const ship = ships[shipIdx];
    if (!ship.hits.includes(`${row},${col}`)) {
      ship.hits.push(`${row},${col}`);
    }
    hit = true;
    sunk = ship.hits.length === ship.size;
  }

  // Update dead ships tracking
  const deadShips = hit && sunk ? ships.filter(s => s.hits.length === s.size).length : null;

  const result = { type: 'attack_result', row, col, hit, sunk, attacker };

  // Check win
  const allSunk = ships.every(s => s.hits.length === s.size);
  if (allSunk) {
    result.winner = attacker;
    room.state = 'over';
  }

  // Send result to both
  const attackMsg = { ...result, defender };
  room.players.forEach(p => p.send(JSON.stringify(attackMsg)));

  if (allSunk) {
    console.log(`Room ${room.id}: player ${attacker} wins!`);
    // Cleanup room after a delay
    setTimeout(() => rooms.delete(room.id), 60000);
  }
}

function handleDisconnect(ws) {
  const room = rooms.get(ws._room);
  if (room) {
    const other = room.players.find(p => p !== ws && p);
    if (other) {
      other.send(JSON.stringify({ type: 'opponent_disconnected' }));
    }
    rooms.delete(ws._room);
    console.log(`Room ${ws._room}: player ${ws._player} disconnected`);
  }
}