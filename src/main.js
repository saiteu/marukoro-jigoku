/**
 * まるころ地獄旅行（リブート版）
 * エントリーポイント・Phaser初期化
 */
import Phaser from 'phaser';
import { ResultScene } from './scenes/ResultScene.js';
import { TestScene } from './scenes/TestScene.js';
import { GAME_WIDTH, GAME_HEIGHT } from './config.js';

const config = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-container',
  backgroundColor: '#e8f4f8',
  pixelArt: true,
  antialias: false,
  // TestScene で動作確認中。確認後は TitleScene に戻す
  // ※ GameScene は Matter.js 依存のため Arcade Physics 移行後に別途対応
  scene: [TestScene, ResultScene],
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 1500 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

const game = new Phaser.Game(config);

// デバッグ用グローバル（開発中のみ）
if (import.meta.env.DEV) {
  window.__game = game;
}
