const Phaser = window.Phaser;
import BootScene from './scenes/BootScene.js';
import MenuScene from './scenes/MenuScene.js';
import PlaceScene from './scenes/PlaceScene.js';
import BattleScene from './scenes/BattleScene.js';
import LobbyScene from './scenes/LobbyScene.js';

const urlParams = new URLSearchParams(window.location.search);
const joinCode = urlParams.get('join');

const config = {
  type: Phaser.CANVAS,
  parent: 'game-container',
  backgroundColor: '#f5f0e8',
  input: {
    touch: true,
    mouse: { preventDefaultDown: true },
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    autoRound: true,
    min: { width: 320, height: 480 },
    max: { width: 1920, height: 2048 },
  },
  render: { pixelArt: true },
  scene: [BootScene, MenuScene, PlaceScene, BattleScene, LobbyScene],
};

const game = new Phaser.Game(config);

if (joinCode) {
  game.events.on('ready', () => {
    game.scene.start('Lobby', { autoJoin: joinCode });
  });
}
