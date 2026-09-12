const Phaser = window.Phaser;

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // Load explosion spritesheet (512x512, 4x4 grid, 16 frames of 128x128)
    this.load.spritesheet('exp_hit', 'assets/Explosion21.png', {
      frameWidth: 128,
      frameHeight: 128
    });
  }

  create() {
    // Create explosion animation (hit)
    this.anims.create({
      key: 'explode_hit',
      frames: this.anims.generateFrameNumbers('exp_hit', { start: 0, end: 15 }),
      frameRate: 20,
      repeat: 0
    });

    this.scene.start('Menu');
  }
}