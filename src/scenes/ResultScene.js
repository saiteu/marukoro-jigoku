import Phaser from 'phaser';
import { CSS_COLORS, COLORS } from '../config.js';
import { soundManager } from '../systems/SoundManager.js';
import { saveManager } from '../systems/SaveManager.js';
import { i18n } from '../i18n/index.js';

export class ResultScene extends Phaser.Scene {
  constructor() {
    super({ key: 'ResultScene' });
  }

  init(data) {
    this._meters     = data.meters     || 0;
    this._retryCount = data.retryCount || 0;
    this._livesLeft  = data.livesLeft  ?? 0;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    soundManager.playBgm('bgm_result', false);

    const isNew     = saveManager.submitScore(this._meters);
    const titleData = i18n.getTitle(this._meters);
    const best      = saveManager.getHighScore();

    // ---- 背景 ----
    this.add.rectangle(W / 2, H / 2, W, H, 0x1a0000);

    // ---- NEW RECORD演出 ----
    if (isNew) {
      soundManager.playSe('se_record');
      const rec = this.add.text(W / 2, 80, i18n.t('newRecord'), {
        fontSize:        '22px',
        color:           '#FFD700',
        stroke:          '#000000',
        strokeThickness: 4,
      }).setOrigin(0.5);

      this.tweens.add({
        targets:  rec,
        x:        W / 2 + 8,
        duration: 80,
        yoyo:     true,
        repeat:   6,
      });
    }

    // ---- 到達高度 ----
    this.add.text(W / 2, 160, `${this._meters}${i18n.t('meters')}`, {
      fontFamily:      "'Press Start 2P'",
      fontSize:        '72px',
      color:           '#ffffff',
      stroke:          '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5);

    // ---- 称号 ----
    this.add.text(W / 2, 260, `${titleData.emoji} ${titleData.title}`, {
      fontSize:        '20px',
      color:           '#FFD700',
      stroke:          '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    // ---- コメント ----
    this.add.text(W / 2, 305, titleData.comment, {
      fontSize: '14px',
      color:    '#aaaaaa',
    }).setOrigin(0.5);

    // ---- リトライ回数 ----
    const retryLabel = this._retryCount === 0
      ? i18n.t('noRetry')
      : i18n.t('retryLabel', { n: this._retryCount });
    this.add.text(W / 2, 345, retryLabel, {
      fontFamily: "'Press Start 2P'",
      fontSize:   '9px',
      color:      this._retryCount === 0 ? '#00ff88' : '#aaaaaa',
    }).setOrigin(0.5);

    // ---- 残ライフ ----
    const livesStr = '♥'.repeat(this._livesLeft) + '♡'.repeat(5 - this._livesLeft);
    this.add.text(W / 2, 370, `${i18n.t('livesLeft')}：${livesStr}`, {
      fontSize: '16px',
      color:    '#ff4444',
    }).setOrigin(0.5);

    // ---- 最高記録 ----
    this.add.text(W / 2, 410, `${i18n.t('bestHeight')}：${best}${i18n.t('meters')}`, {
      fontFamily: "'Press Start 2P'",
      fontSize:   '10px',
      color:      '#888888',
    }).setOrigin(0.5);

    // ---- もう一度ボタン ----
    this._createButton(W / 2, 470, i18n.t('retry'), 0x444444, 0x666666, () => {
      soundManager.playSe('se_select');
      soundManager.stopBgm();
      this.scene.start('GameScene');
    });

    // ---- シェアボタン ----
    this._createButton(W / 2, 530, i18n.t('share'), 0x1a8cd8, 0x1DA1F2, () => {
      soundManager.playSe('se_select');
      this._share(titleData);
    });
  }

  _createButton(x, y, label, colorNormal, colorHover, onClick) {
    const bg = this.add.rectangle(x, y, 260, 44, colorNormal)
      .setInteractive({ useHandCursor: true });
    const text = this.add.text(x, y, label, {
      fontSize:        '14px',
      color:           '#ffffff',
      stroke:          '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    bg.on('pointerover',  () => bg.setFillStyle(colorHover));
    bg.on('pointerout',   () => bg.setFillStyle(colorNormal));
    bg.on('pointerdown',  onClick);

    return { bg, text };
  }

  _share(titleData) {
    const text = i18n.lang === 'ja'
      ? `まるころ地獄旅行で${this._meters}mまで到達！\n` +
        `${titleData.emoji}「${titleData.title}」\n` +
        `${titleData.comment}\n` +
        `#まるころ地獄旅行 #MaRuKoRoHellTrip`
      : `I reached ${this._meters}m in MARUKORO HELL TRIP!\n` +
        `${titleData.emoji} "${titleData.title}"\n` +
        `${titleData.comment}\n` +
        `#MaRuKoRoHellTrip #indiegame`;

    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
      '_blank',
    );
  }
}
