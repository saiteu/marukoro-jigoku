/**
 * ゲームシーン（Arcade Physics 版）
 *
 * TestScene で検証済みの物理・スコア・着地判定を移植
 * - Arcade Physics（gravity.y=1500）
 * - 発射・スコア・力尽きた判定は TestScene と同仕様
 * - Matter.js の記述は全て削除済み
 */
import Phaser from 'phaser';
import {
  COLORS, CSS_COLORS,
  GAME_WIDTH, GAME_HEIGHT,
  LAUNCH, COURSE,
  getBgColor,
} from '../config.js';
import { LaunchController } from '../objects/LaunchController.js';
import { TrailEffect } from '../objects/TrailEffect.js';
import { soundManager } from '../systems/SoundManager.js';

const LAUNCH_X = LAUNCH.launchPadX;   // 240px
const LAUNCH_Y = LAUNCH.launchPadY;   // 580px（スコア基準 Y）
const RADIUS   = 18;
const WALL_H   = 8000;
const WALL_W   = 30;

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  // ------------------------------------------------------------------
  // create
  // ------------------------------------------------------------------
  create() {
    soundManager.unlock();
    soundManager.playBgm('bgm_game');

    this._createTextures();

    // ---- 背景 ----
    const wallCY = GAME_HEIGHT / 2 - WALL_H / 2;
    this._bgRect = this.add.rectangle(
      GAME_WIDTH / 2, wallCY,
      GAME_WIDTH, WALL_H + GAME_HEIGHT,
      COLORS.BG_SKY,
    ).setDepth(0);

    // ---- 壁（静的ボディ） ----
    this._walls = this.physics.add.staticGroup();
    this._walls.create(WALL_W / 2, wallCY, 'wallPx')
      .setDisplaySize(WALL_W, WALL_H + GAME_HEIGHT)
      .setTint(COLORS.WALL).refreshBody();
    this._walls.create(GAME_WIDTH - WALL_W / 2, wallCY, 'wallPx')
      .setDisplaySize(WALL_W, WALL_H + GAME_HEIGHT)
      .setTint(COLORS.WALL).refreshBody();
    this._walls.create(GAME_WIDTH / 2, GAME_HEIGHT + 16, 'wallPx')
      .setDisplaySize(GAME_WIDTH, 32)
      .setTint(COLORS.WALL).refreshBody();

    this._drawLaunchPad();

    // ---- まるころ（Arcade Physics Image） ----
    this._ball = this.physics.add.image(LAUNCH_X, LAUNCH_Y, 'ballTex');
    this._ball.setBounce(0.6);
    this._ball.setCollideWorldBounds(false);
    this._ball.setMaxVelocity(2000, 3000);
    this._ball.setDragX(50);
    this._ball.setDepth(10);
    this._ball.body.allowGravity = false;   // エイミング中は重力を止める

    // 壁との衝突判定
    this.physics.add.collider(this._ball, this._walls);

    // ---- エフェクト ----
    this._trail = new TrailEffect(this);

    // ---- 発射コントローラー ----
    this._launcher = new LaunchController(this);
    this._launcher.start();

    // ---- UI ----
    this._meterText = this.add.text(12, 12, '', {
      fontFamily: "'Press Start 2P'",
      fontSize: '14px',
      color: CSS_COLORS.YELLOW,
      stroke: '#000', strokeThickness: 3,
    }).setDepth(30).setScrollFactor(0).setVisible(false);

    const soundBtn = this.add.text(GAME_WIDTH - 14, 14, '🔊', {
      fontSize: '18px',
    }).setOrigin(1, 0).setDepth(30).setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    soundBtn.on('pointerdown', () => {
      const en = !soundManager.isEnabled();
      soundManager.setEnabled(en);
      soundBtn.setText(en ? '🔊' : '🔇');
    });

    // ---- 入力 ----
    this.input.keyboard.on('keydown-SPACE', () => this._onConfirm());
    this.input.keyboard.on('keydown-ESC',   () => this._returnToTitle());
    this.input.on('pointerdown',            () => this._onConfirm());

    // ---- 状態 ----
    this._state       = 'aiming';
    this._maxMeters   = 0;
    this._maxHeight   = 0;         // 最高到達高度（px）
    this._pastApex    = false;     // 頂点通過フラグ（カメラ制御用）
    this._resultTimer = 0;
  }

  // ------------------------------------------------------------------
  // テクスチャ動的生成（存在チェックで重複生成を防ぐ）
  // ------------------------------------------------------------------
  _createTextures() {
    if (!this.textures.exists('ballTex')) {
      const g = this.make.graphics({ add: false });
      g.fillStyle(COLORS.PLAYER, 1);
      g.fillCircle(RADIUS, RADIUS, RADIUS);
      g.lineStyle(2, COLORS.PLAYER_OUTLINE, 1);
      g.strokeCircle(RADIUS, RADIUS, RADIUS);
      g.generateTexture('ballTex', RADIUS * 2, RADIUS * 2);
      g.destroy();
    }
    if (!this.textures.exists('wallPx')) {
      const g = this.make.graphics({ add: false });
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, 1, 1);
      g.generateTexture('wallPx', 1, 1);
      g.destroy();
    }
  }

  // ------------------------------------------------------------------
  // 入力
  // ------------------------------------------------------------------
  _onConfirm() {
    if (this._state !== 'aiming') return;
    const vel = this._launcher.confirm();
    if (vel) {
      // 発射：setVelocity は発射時の1回のみ
      this._ball.body.allowGravity = true;
      this._ball.setVelocity(vel.vx, vel.vy);
      this._trail.start();
      this._state = 'flying';
      soundManager.playSe('se_launch');
    }
  }

  _returnToTitle() {
    soundManager.stopBgm();
    this.scene.start('TitleScene');
  }

  // ------------------------------------------------------------------
  // update
  // ------------------------------------------------------------------
  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.05);

    this._launcher.update(dt);

    switch (this._state) {
      case 'aiming':
        // エイミング中はボールを発射台に固定
        this._ball.body.reset(LAUNCH_X, LAUNCH_Y);
        break;

      case 'flying':
        this._tickFlying(dt);
        this._trail.update(this._ball.x, this._ball.y, dt);
        break;

      case 'result':
        this._resultTimer += dt;
        if (this._resultTimer >= 2.0) {
          soundManager.stopBgm();
          this.scene.start('ResultScene', { meters: this._maxMeters });
        }
        break;
    }
  }

  // ------------------------------------------------------------------
  // フライト tick
  // ------------------------------------------------------------------
  _tickFlying(dt) {
    const by = this._ball.y;
    const vy = this._ball.body.velocity.y;

    // ---- 頂点検出（vy > 0 = 下降開始） ----
    if (!this._pastApex && vy > 0) this._pastApex = true;

    // ---- カメラ追従 ----
    const lerpT  = this._pastApex ? 0.06 : 0.13;
    const desired = by - GAME_HEIGHT * 0.55;
    const cur     = this.cameras.main.scrollY;
    this.cameras.main.setScroll(0, cur + (desired - cur) * lerpT);

    // ---- スコア：上昇中のみ最高記録を更新 ----
    const currentHeight = LAUNCH_Y - by;
    if (currentHeight > this._maxHeight) {
      this._maxHeight = currentHeight;
      this._maxMeters = Math.floor(this._maxHeight / COURSE.pxPerMeter);
      this._bgRect.setFillStyle(getBgColor(this._maxMeters));
    }
    if (!this._meterText.visible) this._meterText.setVisible(true);
    this._meterText.setText(`↑ ${this._maxMeters}m`);

    // ---- 力尽きた判定 ----
    // 条件1: 発射台 Y より下に戻った（by > LAUNCH_Y）
    // 条件2: 縦速度が十分に小さい（|vy| < 50）
    if (by > LAUNCH_Y && Math.abs(vy) < 50) {
      this._state = 'result';
      this._trail.stop();
    }
  }

  // ------------------------------------------------------------------
  // 描画ヘルパー
  // ------------------------------------------------------------------
  _drawLaunchPad() {
    const g  = this.add.graphics().setDepth(3);
    const px = LAUNCH_X;
    const py = LAUNCH_Y;

    g.fillStyle(COLORS.LAUNCH_PAD, 1);
    g.fillRect(px - 52, py, 104, 14);
    g.lineStyle(3, 0xbb0000, 1);
    g.strokeRect(px - 52, py, 104, 14);
    g.fillStyle(0x888888, 1);
    g.fillRect(px - 46, py + 14, 10, 20);
    g.fillRect(px + 36, py + 14, 10, 20);

    this.add.text(px, py - 4, '↑ LAUNCH', {
      fontFamily: "'Press Start 2P'",
      fontSize: '7px',
      color: CSS_COLORS.WHITE,
    }).setOrigin(0.5, 1).setDepth(4);
  }
}
