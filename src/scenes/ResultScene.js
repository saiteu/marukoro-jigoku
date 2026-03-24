/**
 * リザルト画面（スケルトン）
 * ステップ8で本実装
 */
import Phaser from 'phaser';
import { CSS_COLORS, COLORS, getTitle } from '../config.js';
import { soundManager } from '../systems/SoundManager.js';
import { saveManager } from '../systems/SaveManager.js';

export class ResultScene extends Phaser.Scene {
  constructor() {
    super({ key: 'ResultScene' });
  }

  init(data) {
    this._meters = data.meters || 0;
  }

  create() {
    const { width, height } = this.scale;
    soundManager.playBgm('bgm_result');

    const isNew = saveManager.submitScore(this._meters);
    const title = getTitle(this._meters);
    const best  = saveManager.getHighScore();

    this.add.rectangle(width / 2, height / 2, width, height, COLORS.BG_SKY);

    this.add.text(width / 2, height * 0.18, '結果', {
      fontFamily: "'Press Start 2P'", fontSize: '20px', color: CSS_COLORS.ORANGE,
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.34, `↑ ${this._meters}m`, {
      fontFamily: "'Press Start 2P'", fontSize: '32px', color: CSS_COLORS.YELLOW,
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.50, `「${title}」`, {
      fontFamily: "'Press Start 2P'", fontSize: '11px', color: CSS_COLORS.WHITE,
    }).setOrigin(0.5);

    if (isNew) {
      soundManager.playSe('se_record');
      this.add.text(width / 2, height * 0.60, 'NEW RECORD!', {
        fontFamily: "'Press Start 2P'", fontSize: '14px', color: '#ffd700',
        stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5);
    } else {
      this.add.text(width / 2, height * 0.60, `🏆 最高：${best}m`, {
        fontFamily: "'Press Start 2P'", fontSize: '10px', color: CSS_COLORS.WHITE,
      }).setOrigin(0.5);
    }

    this._createButton(width / 2, height * 0.74, 'もう一度', () => {
      soundManager.playSe('se_select');
      soundManager.stopBgm();
      this.scene.start('GameScene');
    });

    this._createButton(width / 2, height * 0.86, 'シェアする', () => {
      this._share(title);
    });
  }

  _createButton(x, y, label, onClick) {
    const bg = this.add.rectangle(x, y, 220, 36, 0xffd93d)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(3, 0xe6a800);
    const text = this.add.text(x, y, label, {
      fontFamily: "'Press Start 2P'", fontSize: '11px', color: '#2d3436',
    }).setOrigin(0.5);
    bg.on('pointerover', () => bg.setFillStyle(0xffb347));
    bg.on('pointerout',  () => bg.setFillStyle(0xffd93d));
    bg.on('pointerdown', onClick);
  }

  _share(title) {
    const text = `まるころ地獄旅行で${this._meters}mまで到達！\n称号：「${title}」\nあなたはどこまで飛べる？\n#まるころ地獄旅行`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
  }
}
