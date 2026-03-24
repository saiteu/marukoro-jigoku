/**
 * ゲームシーン
 */
import Phaser from 'phaser';
import {
  COLORS, CSS_COLORS,
  GAME_WIDTH, GAME_HEIGHT,
  PHYSICS, LAUNCH, COURSE,
  getBgColor,
} from '../config.js';
import { getZone } from '../systems/CourseGenerator.js';
import { soundManager } from '../systems/SoundManager.js';
import { Marukoro } from '../objects/Marukoro.js';
import { LaunchController } from '../objects/LaunchController.js';
import { TrailEffect } from '../objects/TrailEffect.js';
import { CourseGenerator } from '../systems/CourseGenerator.js';
import { generateSeed } from '../utils/RNG.js';

const WORLD_H        = 600 * COURSE.pxPerMeter + GAME_HEIGHT;
const RESULT_DELAY   = 2.0;
const SPRING_BOOST   = 620;  // spring 最低上昇速度（px/s）
const SPEED_THRESHOLD = 260; // スピードライン表示開始（px/s）

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    soundManager.unlock();
    soundManager.playBgm('bgm_game');

    const seed = generateSeed();

    this.matter.world.setBounds(0, -WORLD_H, GAME_WIDTH, WORLD_H + GAME_HEIGHT, 64);

    // ---- 背景 ----
    this._bgRect = this.add.rectangle(
      GAME_WIDTH / 2, -WORLD_H / 2,
      GAME_WIDTH, WORLD_H + GAME_HEIGHT,
      COLORS.BG_SKY,
    ).setDepth(0);

    this._drawEdgeWalls();
    this._drawLaunchPad();

    // ---- オブジェクト ----
    this._course    = new CourseGenerator(this, seed);
    this._marukoro  = new Marukoro(this, LAUNCH.launchPadX, LAUNCH.launchPadY - PHYSICS.radius);
    this._trail     = new TrailEffect(this);
    this._launcher  = new LaunchController(this);
    this._launcher.start();

    // ---- スピードライン ----
    this._speedGfx = this.add.graphics().setDepth(28).setScrollFactor(0);

    // ---- UI ----
    this._meterText = this.add.text(12, 12, '0 m', {
      fontFamily: "'Press Start 2P'",
      fontSize: '14px',
      color: CSS_COLORS.YELLOW,
      stroke: '#000', strokeThickness: 3,
    }).setDepth(30).setScrollFactor(0);

    const soundBtn = this.add.text(GAME_WIDTH - 14, 14, '🔊', {
      fontSize: '18px',
    }).setOrigin(1, 0).setDepth(30).setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    soundBtn.on('pointerdown', () => {
      const en = !soundManager.isEnabled();
      soundManager.setEnabled(en);
      soundBtn.setText(en ? '🔊' : '🔇');
    });

    // ---- ゾーンラベル（アナウンス用） ----
    this._zoneLabel = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.3, '', {
      fontFamily: "'Press Start 2P'",
      fontSize: '11px',
      color: '#ffffff',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(26).setScrollFactor(0).setAlpha(0);

    // ---- 衝突イベント ----
    this._setupCollisions();

    // ---- 入力 ----
    this.input.keyboard.on('keydown-SPACE', () => this._onConfirm());
    this.input.keyboard.on('keydown-ESC',   () => this._returnToTitle());
    this.input.on('pointerdown',            () => this._onConfirm());

    // ---- 状態 ----
    this._state        = 'aiming';
    this._maxMeters    = 0;
    this._camTargetY   = 0;
    this._resultTimer  = 0;
    this._warpCooldown = 0;
    this._currentZone  = null;
    this._currentBgmKey = 'bgm_game';

    this._course.update(0, 0);
  }

  // -------------------------------------------------------
  //  衝突処理
  // -------------------------------------------------------
  _setupCollisions() {
    this.matter.world.on('collisionstart', (event) => {
      if (this._state !== 'flying') return;
      for (const pair of event.pairs) {
        const { bodyA, bodyB } = pair;
        const maru = bodyA.label === 'marukoro' ? bodyA
          : bodyB.label === 'marukoro' ? bodyB : null;
        if (!maru) continue;
        const other = maru === bodyA ? bodyB : bodyA;

        // 衝突速度でカメラシェイク
        const spd = Math.sqrt(maru.velocity.x ** 2 + maru.velocity.y ** 2) * 60;
        if (spd > 200) {
          const intensity = Math.min(0.008, spd / 120000);
          this.cameras.main.shake(100, intensity);
        }

        switch (other.label) {
          case 'spring':  this._doSpring(maru); break;
          case 'bounce':  soundManager.playSe('se_bounce'); break;
          case 'vanish':  this._doVanish(other); break;
          case 'warp':    if (this._warpCooldown <= 0) this._doWarp(maru); break;
          case 'gravity': this._doGravityFlip(); break;
          case 'wall':
          case 'moving':  soundManager.playSe('se_bounce'); break;
        }
      }
    });
  }

  _doSpring(maruBody) {
    // 固定ブースト＋現在の上向き速度を加算（乗算にしない：暴走防止）
    const curUpSpeed = Math.max(0, -maruBody.velocity.y); // 上向き成分
    const boost = (SPRING_BOOST / 60) + curUpSpeed * 0.4;
    const cappedBoost = Math.min(boost, PHYSICS.maxSpeed * 0.95);
    this.matter.body.setVelocity(maruBody, {
      x: maruBody.velocity.x * 0.4,
      y: -cappedBoost,
    });
    soundManager.playSe('se_spring');
    this._marukoro._restTimer = 0;
    this.cameras.main.shake(60, 0.004);
  }

  _doVanish(body) {
    soundManager.playSe('se_bounce');
    this.time.delayedCall(180, () => {
      try { this.matter.world.remove(body); } catch {}
    });
  }

  _doWarp(maruBody) {
    const pxUp = (60 + Math.random() * 60) * COURSE.pxPerMeter;
    this.matter.body.setPosition(maruBody, { x: maruBody.position.x, y: maruBody.position.y - pxUp });
    this.matter.body.setVelocity(maruBody, { x: 0, y: -9 });
    soundManager.playSe('se_warp');
    this._warpCooldown = 2;
    this.cameras.main.flash(200, 0, 220, 200, false);
  }

  _doGravityFlip() {
    const orig = this.matter.world.gravity.y;
    this.matter.world.gravity.y = orig * -0.6;
    this.time.delayedCall(350, () => { this.matter.world.gravity.y = orig; });
    soundManager.playSe('se_warp');
    this.cameras.main.flash(150, 253, 203, 110, false);
  }

  // -------------------------------------------------------
  //  入力
  // -------------------------------------------------------
  _onConfirm() {
    if (this._state !== 'aiming') return;
    const vel = this._launcher.confirm();
    if (vel) {
      this._marukoro.launch(vel.vx, vel.vy);
      this._trail.start();
      this._state = 'flying';
    }
  }

  _returnToTitle() {
    soundManager.stopBgm();
    this._course.destroy();
    this.scene.start('TitleScene');
  }

  // -------------------------------------------------------
  //  毎フレーム
  // -------------------------------------------------------
  update(time, delta) {
    const dt = delta / 1000;
    if (this._warpCooldown > 0) this._warpCooldown -= dt;

    this._launcher.update(dt);
    this._marukoro.update(dt);

    if (this._state === 'flying') {
      this._updateCamera(dt);
      this._updateMeters();
      this._updateBg();
      this._checkZoneBgm();
      this._drawSpeedLines();
      this._trail.update(this._marukoro.x, this._marukoro.y, dt);
      this._course.update(this.cameras.main.scrollY, dt);

      if (this._marukoro.landed) {
        this._state = 'result';
        this._trail.stop();
        this._speedGfx.clear();
        soundManager.stopBgm();
      }
    } else {
      this._speedGfx.clear();
    }

    if (this._state === 'result') {
      this._resultTimer += dt;
      if (this._resultTimer >= RESULT_DELAY) {
        this._course.destroy();
        this.scene.start('ResultScene', { meters: this._maxMeters });
      }
    }
  }

  // -------------------------------------------------------
  //  カメラ
  // -------------------------------------------------------
  _updateCamera(dt) {
    const desired = this._marukoro.y - GAME_HEIGHT * 0.55;
    if (desired < this._camTargetY) this._camTargetY = desired;

    const cur  = this.cameras.main.scrollY;
    const next = cur + (this._camTargetY - cur) * Math.min(1, dt * 8);
    this.cameras.main.setScroll(0, next);
  }

  // -------------------------------------------------------
  //  高度・ゾーン
  // -------------------------------------------------------
  _updateMeters() {
    const risen  = LAUNCH.launchPadY - this._marukoro.y;
    const meters = Math.max(0, Math.round(risen / COURSE.pxPerMeter));
    if (meters > this._maxMeters) {
      this._maxMeters = meters;
      this._meterText.setText(`${meters} m`);
      this._checkZoneAnnounce(meters);
    }
  }

  _updateBg() {
    this._bgRect.setFillStyle(getBgColor(this._maxMeters));
  }

  _checkZoneBgm() {
    const key = this._maxMeters >= 150 ? 'bgm_hell' : 'bgm_game';
    if (key !== this._currentBgmKey) {
      this._currentBgmKey = key;
      soundManager.playBgm(key);
    }
  }

  _checkZoneAnnounce(meters) {
    const zone = getZone(meters);
    if (zone === this._currentZone) return;
    this._currentZone = zone;
    if (meters < 5) return;  // 発射直後はスキップ

    // tweenが走っていれば止める
    this.tweens.killTweensOf(this._zoneLabel);
    this._zoneLabel.setText(`✦ ${zone.name} ✦`).setAlpha(0).setY(GAME_HEIGHT * 0.32);
    this.tweens.add({
      targets:  this._zoneLabel,
      alpha:    { from: 0, to: 1 },
      y:        { from: GAME_HEIGHT * 0.32, to: GAME_HEIGHT * 0.27 },
      duration: 450,
      hold:     1800,
      yoyo:     true,
      ease:     'Power2',
    });
  }

  // -------------------------------------------------------
  //  スピードライン
  // -------------------------------------------------------
  _drawSpeedLines() {
    const speed = this._marukoro.speedPxPerSec;
    this._speedGfx.clear();
    if (speed < SPEED_THRESHOLD) return;

    const alpha = Math.min(0.45, (speed - SPEED_THRESHOLD) / 700);
    const cx    = GAME_WIDTH  / 2;
    const cy    = GAME_HEIGHT / 2;
    const count = 24;
    const innerR = 52;
    const outerR = innerR + 18 + (speed - SPEED_THRESHOLD) * 0.05;

    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      this._speedGfx.lineStyle(1.5, COLORS.TRAIL, alpha);
      this._speedGfx.beginPath();
      this._speedGfx.moveTo(cx + Math.cos(a) * innerR, cy + Math.sin(a) * innerR);
      this._speedGfx.lineTo(cx + Math.cos(a) * outerR, cy + Math.sin(a) * outerR);
      this._speedGfx.strokePath();
    }
  }

  // -------------------------------------------------------
  //  描画ヘルパー
  // -------------------------------------------------------
  _drawEdgeWalls() {
    const g = this.add.graphics().setDepth(1);
    g.fillStyle(0x4a7c4e, 1);
    g.fillRect(0, -WORLD_H, 30, WORLD_H + GAME_HEIGHT);
    g.fillRect(GAME_WIDTH - 30, -WORLD_H, 30, WORLD_H + GAME_HEIGHT);
    g.lineStyle(2, 0x3a5e3c, 1);
    g.beginPath();
    g.moveTo(30, -WORLD_H); g.lineTo(30, GAME_HEIGHT);
    g.strokePath();
    g.beginPath();
    g.moveTo(GAME_WIDTH - 30, -WORLD_H); g.lineTo(GAME_WIDTH - 30, GAME_HEIGHT);
    g.strokePath();
  }

  _drawLaunchPad() {
    const g  = this.add.graphics().setDepth(3);
    const px = LAUNCH.launchPadX;
    const py = LAUNCH.launchPadY;

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
