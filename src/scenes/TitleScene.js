/**
 * タイトル画面
 */
import Phaser from 'phaser';
import { COLORS, CSS_COLORS } from '../config.js';
import { soundManager } from '../systems/SoundManager.js';
import { saveManager } from '../systems/SaveManager.js';
import { drawPlayer, FACE } from '../utils/DrawUtils.js';
import { i18n } from '../i18n/index.js';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TitleScene' });
  }

  create() {
    const { width, height } = this.scale;

    soundManager.playBgm('bgm_title');

    // 背景
    this.add.rectangle(width / 2, height / 2, width, height, COLORS.BG_SKY);

    // 炎パーティクル（装飾）
    this._flames = [];
    this._createFlameParticles();

    // タイトルロゴ（2行）
    this.add.text(width / 2, height * 0.18, i18n.t('titleLine1'), {
      fontFamily: "'Press Start 2P'",
      fontSize: '28px',
      color: CSS_COLORS.ORANGE,
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.27, i18n.t('titleLine2'), {
      fontFamily: "'Press Start 2P'",
      fontSize: '28px',
      color: CSS_COLORS.FLAME,
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.36, i18n.t('subtitle'), {
      fontFamily: "'Press Start 2P'",
      fontSize: '7px',
      color: CSS_COLORS.UI_TEXT,
    }).setOrigin(0.5);

    // ハイスコア表示
    const best = saveManager.getHighScore();
    if (best > 0) {
      this.add.text(width / 2, height * 0.43, `${i18n.t('bestScore')}：${best}${i18n.t('meters')}`, {
        fontFamily: "'Press Start 2P'",
        fontSize: '9px',
        color: CSS_COLORS.YELLOW,
      }).setOrigin(0.5);
    }

    // まるころアイドルアニメーション
    this._playerGfx = this.add.graphics();
    this._playerX = width / 2;
    this._playerY = height * 0.57;
    this._playerBob = 0;

    // ボタン
    this._createButton(width / 2, height * 0.72, i18n.t('btnStart'), () => {
      soundManager.playSe('se_start');
      soundManager.stopBgm();
      this.scene.start('GameScene');
    });

    // 言語切り替えボタン
    this._createLangToggle();

    // 音量トグル
    this._createSoundToggle();

    // バージョン
    this.add.text(width - 10, height - 10, 'v0.2.0', {
      fontFamily: "'Press Start 2P'",
      fontSize: '6px',
      color: '#aaaaaa',
    }).setOrigin(1, 1);
  }

  _createButton(x, y, label, onClick) {
    const bg = this.add.rectangle(x, y, 200, 40, 0xffd93d)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(3, 0xe6a800);

    const text = this.add.text(x, y, label, {
      fontFamily: "'Press Start 2P'",
      fontSize: '14px',
      color: '#2d3436',
    }).setOrigin(0.5);

    bg.on('pointerover', () => {
      bg.setFillStyle(0xffb347);
      this.tweens.add({ targets: [bg, text], scaleX: 1.05, scaleY: 1.05, duration: 80 });
    });
    bg.on('pointerout', () => {
      bg.setFillStyle(0xffd93d);
      this.tweens.add({ targets: [bg, text], scaleX: 1, scaleY: 1, duration: 80 });
    });
    bg.on('pointerdown', () => {
      soundManager.unlock().then(() => onClick());
    });

    return { bg, text };
  }

  _createLangToggle() {
    const { width } = this.scale;
    const label = i18n.lang === 'ja' ? 'EN' : 'JP';
    const btn = this.add.text(width - 16, 50, label, {
      fontFamily: "'Press Start 2P'",
      fontSize: '11px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      backgroundColor: '#334455',
      padding: { x: 6, y: 4 },
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setAlpha(0.75));
    btn.on('pointerout',  () => btn.setAlpha(1));
    btn.on('pointerdown', () => {
      i18n.setLang(i18n.lang === 'ja' ? 'en' : 'ja');
      this.scene.restart();
    });
    return btn;
  }

  _createSoundToggle() {
    const { width } = this.scale;
    const btn = this.add.text(width - 16, 16, '🔊', {
      fontSize: '20px',
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });

    btn.on('pointerdown', () => {
      const enabled = !soundManager.isEnabled();
      soundManager.setEnabled(enabled);
      btn.setText(enabled ? '🔊' : '🔇');
    });
    return btn;
  }

  _createFlameParticles() {
    const { width, height } = this.scale;
    for (let i = 0; i < 20; i++) {
      this._flames.push({
        x: Math.random() * width,
        y: height * 0.85 + Math.random() * 60,
        vy: -(20 + Math.random() * 40),
        vx: (Math.random() - 0.5) * 15,
        life: Math.random(),
        maxLife: 0.5 + Math.random() * 0.8,
        size: 4 + Math.random() * 10,
      });
    }
    this._flameGfx = this.add.graphics();
  }

  update(time, delta) {
    const dt = delta / 1000;
    this._playerBob += dt * 2.5;

    // まるころアイドル描画
    this._playerGfx.clear();
    const bobY = Math.sin(this._playerBob) * 5;
    const scaleY = 1 + Math.sin(this._playerBob * 2) * 0.06;
    drawPlayer(this._playerGfx, this._playerX, this._playerY + bobY, 18, FACE.NORMAL, 1, scaleY);

    // 炎更新
    this._flameGfx.clear();
    const { width, height } = this.scale;
    for (const f of this._flames) {
      f.y += f.vy * dt;
      f.x += f.vx * dt;
      f.life += dt;
      if (f.life > f.maxLife) {
        f.x = Math.random() * width;
        f.y = height * 0.9 + Math.random() * 30;
        f.life = 0;
      }
      const alpha = 1 - f.life / f.maxLife;
      this._flameGfx.fillStyle(0xff6348, alpha * 0.7);
      this._flameGfx.fillCircle(f.x, f.y, f.size * (1 - f.life / f.maxLife));
    }
  }
}
