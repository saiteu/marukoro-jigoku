/**
 * ゲームシーン（Arcade Physics 版）
 *
 * 足場から足場へ渡り歩くゲーム
 * - 通常足場（全高度）：緑色・静止
 * - 移動足場（200m以上）：青色・左右移動
 * - 消える足場（350m以上）：オレンジ・3秒で消滅
 *
 * チェックポイント制：100mごとにCP、落下時はリトライ可能
 */
import Phaser from 'phaser';
import {
  COLORS, CSS_COLORS,
  GAME_WIDTH, GAME_HEIGHT,
  LAUNCH, COURSE,
} from '../config.js';
import { TrailEffect } from '../objects/TrailEffect.js';
import { soundManager } from '../systems/SoundManager.js';
import { i18n } from '../i18n/index.js';
import { HELL_ZONES, getZoneByHeight } from '../config/hellZones.js';

// URLパラメータ ?debug=true でデバッグモード有効
const DEBUG_MODE = new URLSearchParams(window.location.search).get('debug') === 'true';

// ---- ライフ ----
const MAX_LIVES = 2;

// ---- 空中横移動 ----
const AIR_ACCEL     = 20;
const AIR_MAX_SPEED = 400;
const AIR_DRAG      = 0.92;

const LAUNCH_X = LAUNCH.launchPadX;
const LAUNCH_Y = LAUNCH.launchPadY;
const RADIUS   = 18;
const WALL_H   = 8000;
const WALL_W   = 30;

// ---- 足場共通 ----
const PLATFORM_H         = 16;
const SAFETY_ZONE_PX     = 500;

// ---- 足場生成パラメータ（高度依存） ----
const PLATFORM_CONFIG = {
  getWidth(height) {
    if (height < 200) return Phaser.Math.Between(120, 200);
    if (height < 500) return Phaser.Math.Between(80,  160);
    if (height < 900) return Phaser.Math.Between(60,  120);
    return Phaser.Math.Between(40, 100);
  },
  getGapY(height) {
    if (height < 200) return Phaser.Math.Between(120, 160);
    if (height < 500) return Phaser.Math.Between(150, 200);
    if (height < 900) return Phaser.Math.Between(180, 240);
    return Phaser.Math.Between(200, 280);
  },
  minDistance: 80,
};

// ---- 足場種別閾値 ----
const MOVING_START_M  = 200;
const VANISH_START_M  = 350;

// ---- 移動足場 ----
const MOVING_RANGE    = 100;
const MOVING_DURATION = 1500;

// ---- 消える足場 ----
const VANISH_DELAY    = 3000;
const VANISH_WARN     = 2000;

// ---- 足場カラー（移動・消えるは固定色で種別識別） ----
const COLOR_MOVING  = 0x74b9ff;
const COLOR_VANISH  = 0xff9f43;


// ---- チェックポイント ----
const CP_INTERVAL_M = 100;   // 100mごとにCPライン

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  // ------------------------------------------------------------------
  // preload
  // ------------------------------------------------------------------
  preload() {
    this.load.image('marukoro',    'assets/images/marukoro.png');
    this.load.image('platform_a',  'assets/images/platform_a.png');
    this.load.image('platform_b',  'assets/images/platform_b.png');
    this.load.image('platform_c',  'assets/images/platform_c.png');
  }

  // ------------------------------------------------------------------
  // create
  // ------------------------------------------------------------------
  create() {
    soundManager.unlock();
    soundManager.playBgm('bgm_game');

    this._createTextures();

    // ---- 背景（スクリーン固定・Tweenで色変化） ----
    const wallCY = GAME_HEIGHT / 2 - WALL_H / 2;
    this._bgRect = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2,
      GAME_WIDTH, GAME_HEIGHT,
      HELL_ZONES[0].bgColor,
    ).setDepth(0).setScrollFactor(0);

    // ---- 壁（静的ボディ） ----
    this._walls = this.physics.add.staticGroup();
    // 左右の壁：高反発・摩擦なし
    const leftWall = this._walls.create(WALL_W / 2, wallCY, 'wallPx')
      .setDisplaySize(WALL_W, WALL_H + GAME_HEIGHT)
      .setTint(COLORS.WALL).refreshBody();
    leftWall.setBounce(0.8);
    const rightWall = this._walls.create(GAME_WIDTH - WALL_W / 2, wallCY, 'wallPx')
      .setDisplaySize(WALL_W, WALL_H + GAME_HEIGHT)
      .setTint(COLORS.WALL).refreshBody();
    rightWall.setBounce(0.8);
    // 床
    this._walls.create(GAME_WIDTH / 2, GAME_HEIGHT + 16, 'wallPx')
      .setDisplaySize(GAME_WIDTH, 32)
      .setTint(COLORS.WALL).refreshBody();

    this._drawLaunchPad();

    // ---- まるころ（Arcade Physics Image） ----
    this._ball = this.physics.add.image(LAUNCH_X, LAUNCH_Y, 'marukoro');
    this._ball.setDisplaySize(32, 32);
    this._ball.setScale(32 / this._ball.width, 32 / this._ball.height);
    this._ball.body.setSize(28, 26);
    this._ball.body.setOffset(2, 4);
    this._ball.setBounce(0.7);
    this._ball.setCollideWorldBounds(false);
    this._ball.setMaxVelocity(2000, 3000);
    this._ball.setDragX(200);
    this._ball.setDepth(10);
    this._ball.body.allowGravity = false;

    // 壁との衝突
    this.physics.add.collider(this._ball, this._walls, (ball) => {
      if (ball.body.blocked.left || ball.body.blocked.right) {
        // 左右の壁：高反発を維持
        ball.setBounce(0.7);
        if (this._bounceSeCooldown <= 0) {
          soundManager.playSe('se_bounce');
          this._bounceSeCooldown = 100;
        }
      } else {
        // 床：速度に応じて反発を下げる
        ball.setBounce(Math.abs(ball.body.velocity.y) < 200 ? 0.1 : 0.6);
      }
    });

    // ---- 通常足場 ----
    this._platformGroup = this.physics.add.staticGroup();
    this.physics.add.collider(
      this._ball, this._platformGroup,
      (ball, plat) => this._onLandPlatform(ball, plat),
    );

    // ---- 移動足場 ----
    this._movingGroup = this.physics.add.staticGroup();
    this.physics.add.collider(
      this._ball, this._movingGroup,
      (ball, plat) => this._onLandPlatform(ball, plat),
    );

    // ---- 消える足場 ----
    this._vanishGroup = this.physics.add.staticGroup();
    this.physics.add.collider(
      this._ball, this._vanishGroup,
      (ball, plat) => {
        this._onLandPlatform(ball, plat);
        if (!plat.vanishStarted && ball.body.bottom - plat.body.top <= 20) {
          plat.vanishStarted = true;
          this._startVanishTimer(plat);
        }
      },
    );

    // ---- CPライン（physics不要・高度監視で判定）----
    this._cpLines = [];

    // ---- エフェクト ----
    this._trail = new TrailEffect(this);

    // ---- 射出 UI グラフィクス ----
    this._trajectoryGfx = this.add.graphics().setDepth(20).setScrollFactor(1);
    this._hintText = this.add.text(
      GAME_WIDTH / 2, GAME_HEIGHT - 20,
      i18n.t('aimHint'),
      { fontFamily: "'Press Start 2P'", fontSize: '7px', color: '#ffffff',
        stroke: '#000', strokeThickness: 2 },
    ).setOrigin(0.5, 1).setDepth(21).setScrollFactor(0).setVisible(false);

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

    // ---- キーボード ----
    this.input.keyboard.on('keydown-ESC', () => this._returnToTitle());
    this._cursors   = this.input.keyboard.createCursorKeys();
    this._keyA      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this._keyD      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this._spaceKey  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // ---- ポインター（各1回だけ登録）----
    this._mobileLeft  = false;
    this._mobileRight = false;

    this.input.on('pointerdown', (pointer) => {
      if (this._state !== 'aiming') return;
      if (!this._canLaunch) return;
      this._isCharging  = true;
      this._chargeStart = this.time.now;
      this._aimPower    = 400;
      this._updateAimAngle(pointer);
    });

    this.input.on('pointermove', (pointer) => {
      if (this._state === 'flying') {
        if (!pointer.isDown) return;
        if (pointer.x < this.scale.width / 2) {
          this._mobileLeft = true; this._mobileRight = false;
        } else {
          this._mobileLeft = false; this._mobileRight = true;
        }
        return;
      }
      // エイム中：長押しで角度追従
      if (this._state === 'aiming' && this._isCharging && pointer.isDown) {
        this._updateAimAngle(pointer);
      }
    });

    this.input.on('pointerup', () => {
      // 飛行中：モバイル横移動停止
      this._mobileLeft  = false;
      this._mobileRight = false;
      // エイム中：発射
      if (this._state !== 'aiming') return;
      if (!this._isCharging || !this._canLaunch) return;
      if (this.time.now - this._chargeStart < 300) {
        this._isCharging = false;
        this._aimPower   = 400;
        return;
      }
      this._isCharging = false;
      this._doLaunch();
    });

    // ---- SE クールダウン ----
    this._bounceSeCooldown = 0;
    this._landSeCooldown   = 0;

    // ---- 状態 ----
    this._state          = 'aiming';
    this._launched       = false;
    this._gameOverFlag   = false;
    this._launchTime     = 0;

    // ---- 射出状態 ----
    this._canLaunch      = false;   // 発射可能か
    this._isCharging     = false;   // マウス/タッチチャージ中か
    this._isKeyCharging  = false;   // キーボードチャージ中か
    this._aimAngle       = 90;      // 現在の角度
    this._aimPower       = 400;     // 現在のパワー
    this._chargeStart    = 0;       // チャージ開始時刻
    this._relaunchFlag   = false;
    this._isRelaunch     = false;
    this._isLandingAnim  = false;
    this._hasLanded      = false;
    this._relaunchPos    = null;
    this._maxMeters      = 0;
    this._maxHeight      = 0;
    this._currentZoneId  = HELL_ZONES[0].id;
    this._pastApex       = false;
    this._restTimer      = 0;
    this._stuckTimer     = 0;
    this._lastStuckY     = 0;
    this._nextPlatformY  = LAUNCH_Y - SAFETY_ZONE_PX;

    // ---- チェックポイント ----
    this._lastCpHeight = 0;
    this._lastCpY      = null;
    this._retryCount = 0;
    this._retryUI    = [];

    // ---- ライフ ----
    this._lives = MAX_LIVES;
    this._createLivesUI();

    // ---- デッドゾーン ----
    this._deadZoneY     = LAUNCH_Y + 100;
    this._returningFlag = false;
    this._createDeadZone();

    // ---- デバッグ ----
    this._debug      = DEBUG_MODE;
    this._lastSafeX  = LAUNCH_X;
    this._lastSafeY  = LAUNCH_Y;
    this._keyUp      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this._keyC       = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    this._keyCPrev   = false;
    if (this._debug) this._setupDebugMode();

    // ゲーム開始時に発射可能状態に
    this._showLaunchUI();
  }

  // ------------------------------------------------------------------
  // テクスチャ動的生成
  // ------------------------------------------------------------------
  _createTextures() {
    if (!this.textures.exists('wallPx')) {
      const g = this.make.graphics({ add: false });
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, 1, 1);
      g.generateTexture('wallPx', 1, 1);
      g.destroy();
    }
  }

  // ------------------------------------------------------------------
  // 足場着地共通コールバック
  // ------------------------------------------------------------------
  _onLandPlatform(ball, plat) {
    if (this._state === 'aiming') return;  // エイミング中は反発係数を変えない
    if (ball.body.bottom - plat.body.top > 20) {
      ball.setVelocityY(Math.abs(ball.body.velocity.y));
    } else {
      const vy = Math.abs(ball.body.velocity.y);
      ball.setBounce(vy < 200 ? 0.1 : 0.6);
      if (vy < 400 && !this._hasLanded && this._landSeCooldown <= 0) {
        this._hasLanded = true;
        soundManager.playSe('se_land');
        this._landSeCooldown = 500;
        this._playLandAnimation();
      }
    }
  }

  // ------------------------------------------------------------------
  // 入力
  // ------------------------------------------------------------------
  _returnToTitle() {
    soundManager.stopBgm();
    this.scene.start('TitleScene');
  }

  // ------------------------------------------------------------------
  // update
  // ------------------------------------------------------------------
  update(_time, delta) {
    const dt = Math.min(delta / 1000, 0.05);

    if (this._bounceSeCooldown > 0) this._bounceSeCooldown -= delta;
    if (this._landSeCooldown   > 0) this._landSeCooldown   -= delta;

    this._generatePlatforms();
    this._cleanupPlatforms();

    switch (this._state) {
      case 'aiming': {
        // 動く足場に乗っている場合は追従して _relaunchPos を更新
        // ※ prevX はこのフレームの最初（まだ古い値）なので dx が正確に出る
        if (this._isRelaunch && this._relaunchPos) {
          const moving = this._getMovingPlatformUnder();
          if (moving && moving.prevX != null) {
            const dx = moving.x - moving.prevX;
            if (dx !== 0) {
              this._relaunchPos.x = Phaser.Math.Clamp(
                this._relaunchPos.x + dx,
                WALL_W + RADIUS,
                GAME_WIDTH - WALL_W - RADIUS,
              );
            }
          }
        }

        const aimX = (this._isRelaunch && this._relaunchPos) ? this._relaunchPos.x : LAUNCH_X;
        const aimY = (this._isRelaunch && this._relaunchPos) ? this._relaunchPos.y : LAUNCH_Y;
        this._ball.body.reset(aimX, aimY);
        this._tickAiming();
        break;
      }
      case 'flying':
        this._tickFlying(dt);
        this._trail.update(this._ball.x, this._ball.y, dt);
        break;
    }

    // 動く足場の prevX をフレーム末尾で更新（次フレームの差分計算に使う）
    this._movingGroup.getChildren().forEach(p => { if (p.active) p.prevX = p.x; });

    if (this._debug) this._tickDebug();
  }

  // ------------------------------------------------------------------
  // エイム tick（update の aiming case から呼ぶ）
  // ------------------------------------------------------------------
  _tickAiming() {
    if (!this._canLaunch) {
      this._trajectoryGfx.clear();
      return;
    }

    // 左右キーで角度調整
    if (this._cursors.left.isDown || this._keyA.isDown) {
      this._aimAngle = Math.min(170, this._aimAngle + 2);
    }
    if (this._cursors.right.isDown || this._keyD.isDown) {
      this._aimAngle = Math.max(10, this._aimAngle - 2);
    }

    // ---- キーボードチャージ（スペース）----
    if (this._spaceKey.isDown) {
      if (!this._isKeyCharging) {
        this._isKeyCharging = true;
        this._chargeStart   = this.time.now;
      }
      this._aimPower = Math.min(2000, this._aimPower + 12);
    } else if (this._isKeyCharging) {
      // スペースを離した → 300ms以上なら発射
      this._isKeyCharging = false;
      if (this.time.now - this._chargeStart >= 300 && this._canLaunch) {
        this._doLaunch();
        return;
      }
      // 300ms未満はキャンセル
      this._aimPower = 400;
    }

    // ---- マウス/タッチチャージ：パワー増加のみ（発射はpointerupで行う）----
    if (this._isCharging) {
      this._aimPower = Math.min(2000, this._aimPower + 12);
    }

    this._drawTrajectory();
  }

  _doLaunch() {
    if (!this._canLaunch) return;
    this._canLaunch     = false;
    this._isCharging    = false;
    this._isKeyCharging = false;

    // 発射直後500ms は入力を無効化（誤発火防止）
    this.input.enabled = false;
    this.time.delayedCall(500, () => { this.input.enabled = true; });

    const rad = Phaser.Math.DegToRad(this._aimAngle);
    const vx  =  Math.cos(rad) * this._aimPower;
    const vy  = -Math.sin(rad) * this._aimPower;

    // 発射前に縦に伸びる → onComplete で実際の発射処理
    this.tweens.killTweensOf(this._ball);
    this.tweens.add({
      targets:  this._ball,
      scaleX:   0.7,
      scaleY:   1.3,
      duration: 100,
      ease:     'Power2.easeOut',
      onComplete: () => {
        this._ball.setScale(1.0);
        this._ball.body.allowGravity = true;
        this._ball.setVelocity(vx, vy);
        this._trail.start();
        this._trajectoryGfx.clear();
        this._hintText.setVisible(false);

        this._state        = 'flying';
        this._launched     = true;
        this._gameOverFlag = false;
        this._isRelaunch   = false;
        this._launchTime   = this.time.now;
        this._aimPower     = 400;

        soundManager.playSe('se_launch');
      },
    });
  }

  _drawTrajectory() {
    this._trajectoryGfx.clear();
    const ox  = this._ball.x;
    const oy  = this._ball.y;
    const rad = Phaser.Math.DegToRad(this._aimAngle);
    const g   = this.physics.world.gravity.y / 3600;

    let x   = ox;
    let y   = oy;
    let dvx =  Math.cos(rad) * this._aimPower / 60;
    let dvy = -Math.sin(rad) * this._aimPower / 60;

    for (let i = 0; i < 25; i++) {
      x += dvx;
      y += dvy;
      dvy += g;
      if (i % 2 === 0) {
        const alpha = Math.max(0, 0.8 - i * 0.03);
        this._trajectoryGfx.fillStyle(0xffffff, alpha);
        this._trajectoryGfx.fillCircle(x, y, 3);
      }
    }

    // パワーゲージ（ボール右横）
    const ratio = (this._aimPower - 400) / (2000 - 400);
    const barH  = 60;
    const barW  = 8;
    const bx    = ox + 25;
    const by    = oy - barH / 2;
    this._trajectoryGfx.fillStyle(0x222222, 0.8);
    this._trajectoryGfx.fillRect(bx, by, barW, barH);
    const fc = ratio < 0.5 ? 0x00ff00 : ratio < 0.8 ? 0xffff00 : 0xff0000;
    this._trajectoryGfx.fillStyle(fc, 1);
    this._trajectoryGfx.fillRect(bx, by + barH * (1 - ratio), barW, barH * ratio);
  }

  _updateAimAngle(pointer) {
    const dx    = pointer.worldX - this._ball.x;
    const dy    = pointer.worldY - this._ball.y;
    const angle = Phaser.Math.RadToDeg(Math.atan2(-dy, dx));
    this._aimAngle = Phaser.Math.Clamp(angle, 10, 170);
  }

  // ------------------------------------------------------------------
  // フライト tick
  // ------------------------------------------------------------------
  _tickFlying(dt) {
    // ---- 空中横移動 ----
    const body = this._ball.body;
    const goLeft  = this._cursors.left.isDown  || this._keyA.isDown || this._mobileLeft;
    const goRight = this._cursors.right.isDown || this._keyD.isDown || this._mobileRight;

    if (goLeft) {
      body.velocity.x = Math.max(body.velocity.x - AIR_ACCEL, -AIR_MAX_SPEED);
    } else if (goRight) {
      body.velocity.x = Math.min(body.velocity.x + AIR_ACCEL,  AIR_MAX_SPEED);
    } else {
      body.velocity.x *= AIR_DRAG;
      if (Math.abs(body.velocity.x) < 5) body.velocity.x = 0;
    }

    const by = this._ball.y;
    const vy = this._ball.body.velocity.y;

    if (vy > 800) this._ball.setVelocityY(800);

    if (!this._pastApex && vy > 0) this._pastApex = true;


    // デバッグ用：発射台より上にいる間は安全位置を記録
    if (this._debug && by < LAUNCH_Y - 10) {
      this._lastSafeX = this._ball.x;
      this._lastSafeY = by;
    }

    // カメラ追従
    const lerpT  = this._pastApex ? 0.06 : 0.13;
    const desired = by - GAME_HEIGHT * 0.55;
    const cur     = this.cameras.main.scrollY;
    this.cameras.main.setScroll(0, cur + (desired - cur) * lerpT);

    // スコア（上昇中のみ更新）
    const currentHeight = LAUNCH_Y - by;
    if (currentHeight > this._maxHeight) {
      this._maxHeight = currentHeight;
      this._maxMeters = Math.floor(this._maxHeight / COURSE.pxPerMeter);

      // 背景ゾーン判定
      const newZone = getZoneByHeight(this._maxMeters);
      if (newZone.id !== this._currentZoneId) {
        this._currentZoneId = newZone.id;
        this.tweens.killTweensOf(this._bgRect);
        const fromColor = Phaser.Display.Color.IntegerToColor(this._bgRect.fillColor);
        const toColor   = Phaser.Display.Color.IntegerToColor(newZone.bgColor);
        this.tweens.addCounter({
          from:     0,
          to:       1,
          duration: 2000,
          ease:     'Linear',
          onUpdate: (tween) => {
            const t = tween.getValue();
            const r = Math.round(fromColor.red   + (toColor.red   - fromColor.red)   * t);
            const g = Math.round(fromColor.green + (toColor.green - fromColor.green) * t);
            const b = Math.round(fromColor.blue  + (toColor.blue  - fromColor.blue)  * t);
            this._bgRect.setFillStyle(Phaser.Display.Color.GetColor(r, g, b));
          },
        });
        this._showZoneName(newZone.name[i18n.lang] ?? newZone.name.ja);
      }
    }
    if (!this._meterText.visible) this._meterText.setVisible(true);
    this._meterText.setText(`↑ ${this._maxMeters}m`);

    // 着地静止
    const onGroundNow   = this._ball.body.blocked.down;
    const totalSpeedNow = Math.sqrt(
      this._ball.body.velocity.x ** 2 + this._ball.body.velocity.y ** 2,
    );
    if (totalSpeedNow < 50 && onGroundNow) {
      this._ball.setVelocity(0, 0);
      this._ball.setBounce(0);
    }

    // スタック検知
    if (Math.abs(by - this._lastStuckY) < 10) {
      this._stuckTimer += dt;
      if (this._stuckTimer > 3.0 && !this._gameOverFlag) {
        this._gameOverFlag = true;
        this._onFallDetected();
        return;
      }
    } else {
      this._stuckTimer = 0;
      this._lastStuckY = by;
    }

    if (!this._launched || this._gameOverFlag) return;

    // CPライン通過チェック（毎フレーム）
    this._checkCpLines();

    // 着地アニメーション中はダメージ・再発射判定をスキップ
    if (this._isLandingAnim) return;

    // 発射直後1秒間はゲームオーバー判定をスキップ
    if (this.time.now - this._launchTime < 1000) return;

    const vx         = this._ball.body.velocity.x;
    const totalSpeed = Math.sqrt(vx * vx + vy * vy);
    const onGround   = this._ball.body.blocked.down;
    const fellBelow  = by > this._deadZoneY + 50;

    if (totalSpeed < 30) {
      this._restTimer += dt;
    } else {
      this._restTimer = 0;
    }
    const trulyStopped = this._restTimer >= 0.3;

    // 優先1：発射台より下 → 落下判定
    if (fellBelow) {
      this._gameOverFlag = true;
      this._onFallDetected();
      return;
    }
    // 優先2：足場の上で静止 → 再発射
    if (trulyStopped && onGround && !fellBelow) {
      this._gameOverFlag = true;
      this._triggerRelaunch();
      return;
    }
    // 優先3：空中で静止 → 落下判定
    if (trulyStopped && !onGround && !fellBelow) {
      this._gameOverFlag = true;
      this._onFallDetected();
      return;
    }
  }

  // ------------------------------------------------------------------
  // CPライン生成（ゲーム開始時に全ライン事前作成）
  // ------------------------------------------------------------------
  _createCpLines() {
    this._cpLines = [];
    for (let h = CP_INTERVAL_M; h <= 2000; h += CP_INTERVAL_M) {
      const y = LAUNCH_Y - h * COURSE.pxPerMeter;

      // 点線グラフィック
      const gfx = this.add.graphics().setDepth(5);
      gfx.lineStyle(1, 0xFFD700, 0.5);
      for (let x = 0; x < GAME_WIDTH; x += 20) {
        gfx.lineBetween(x, y, x + 10, y);
      }

      // 高度アイコン（ワールド座標）
      const icon = this.add.text(8, y - 8, `📍${h}m`, {
        fontFamily: "'Press Start 2P'",
        fontSize:   '6px',
        color:      '#FFD700',
        stroke:     '#000000',
        strokeThickness: 2,
      }).setDepth(6);

      this._cpLines.push({ height: h, y, reached: false, gfx, icon });
    }
  }

  _clearCpLines() {
    this._cpLines.forEach(cp => {
      if (cp.gfx)  cp.gfx.destroy();
      if (cp.icon) cp.icon.destroy();
    });
    this._cpLines      = [];
    this._lastCpHeight = 0;
    this._lastCpY      = null;
  }

  // ------------------------------------------------------------------
  // CPライン通過チェック（_tickFlying から毎フレーム呼ぶ）
  // ------------------------------------------------------------------
  _checkCpLines() {
    const by = this._ball.y;
    this._cpLines.forEach(cp => {
      if (cp.reached) return;
      if (by > cp.y) return;   // まだラインに届いていない

      cp.reached = true;
      // ラインを明るく
      cp.gfx.clear();
      cp.gfx.lineStyle(2, 0xFFD700, 0.9);
      for (let x = 0; x < GAME_WIDTH; x += 20) {
        cp.gfx.lineBetween(x, cp.y, x + 10, cp.y);
      }

      this._lastCpHeight = cp.height;
      this._lastCpY      = cp.y;
      this._deadZoneY    = cp.y;
      this._updateDeadZone(cp.y);
      this._showCheckpointEffect();
      soundManager.playSe('se_checkpoint');
    });
  }

  // ------------------------------------------------------------------
  // 復帰位置計算（最終CPより上の直近足場）
  // ------------------------------------------------------------------
  _getRevivePosition() {
    if (!this._lastCpY) return { x: LAUNCH_X, y: LAUNCH_Y };
    const cpY = this._lastCpY;
    const above = [
      ...this._platformGroup.getChildren(),
      ...this._movingGroup.getChildren(),
      ...this._vanishGroup.getChildren(),
    ].filter(p => p.y < cpY && p.y > cpY - 400);

    if (above.length === 0) return { x: GAME_WIDTH / 2, y: cpY - 40 };

    above.sort((a, b) => b.y - a.y);
    const nearest = above[0];
    return { x: nearest.x, y: nearest.y - PLATFORM_H - RADIUS };
  }

  // ------------------------------------------------------------------
  // チェックポイント通過演出
  // ------------------------------------------------------------------
  _showCheckpointEffect() {
    const cam = this.cameras.main;

    const startY = cam.centerY - 50 + cam.scrollY;
    const endY1  = cam.centerY - 100 + cam.scrollY;
    const endY2  = cam.centerY - 150 + cam.scrollY;
    const cpText = this.add.text(
      cam.centerX, startY,
      i18n.t('checkpoint'),
      { fontSize: '28px', color: '#FFD700', stroke: '#000000', strokeThickness: 5 },
    ).setOrigin(0.5).setScrollFactor(0).setDepth(40).setAlpha(0).setScale(0.5);

    this.tweens.add({
      targets: cpText, alpha: 1, scale: 1, y: endY1, duration: 300, ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: cpText, alpha: 0, y: endY2, duration: 500, delay: 1000,
          onComplete: () => cpText.destroy(),
        });
      },
    });
  }

  // ------------------------------------------------------------------
  // ライフ UI
  // ------------------------------------------------------------------
  _getLivesString() {
    return '♥'.repeat(this._lives) + '♡'.repeat(MAX_LIVES - this._lives);
  }

  _createLivesUI() {
    this._livesText = this.add.text(16, 50, this._getLivesString(), {
      fontSize:        '20px',
      color:           '#ff4444',
      stroke:          '#000000',
      strokeThickness: 3,
    }).setScrollFactor(0).setDepth(100);
  }

  // ------------------------------------------------------------------
  // 着地スライムアニメーション
  // ------------------------------------------------------------------
  _playLandAnimation() {
    this._isLandingAnim = true;
    this.tweens.killTweensOf(this._ball);
    this.tweens.add({
      targets: this._ball, scaleX: 1.6, scaleY: 0.5, duration: 80, ease: 'Power2.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: this._ball, scaleX: 0.7, scaleY: 1.4, duration: 100, ease: 'Power2.easeOut',
          onComplete: () => {
            this.tweens.add({
              targets: this._ball, scaleX: 1.2, scaleY: 0.9, duration: 80, ease: 'Power2.easeOut',
              onComplete: () => {
                this.tweens.add({
                  targets: this._ball, scaleX: 1.0, scaleY: 1.0, duration: 100, ease: 'Elastic.easeOut',
                  onComplete: () => { this._isLandingAnim = false; },
                });
              },
            });
          },
        });
      },
    });
  }

  // ------------------------------------------------------------------
  // ライフ減少演出
  // ------------------------------------------------------------------
  _playLoseLifeEffect() {
    // ハート拡大
    this.tweens.add({
      targets:  this._livesText,
      scaleX:   1.5,
      scaleY:   1.5,
      duration: 150,
      yoyo:     true,
      ease:     'Power2',
    });

    // 画面を一瞬赤く
    const flash = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2,
      GAME_WIDTH, GAME_HEIGHT,
      0xff0000, 0.3,
    ).setScrollFactor(0).setDepth(99);
    this.tweens.add({
      targets:  flash,
      alpha:    0,
      duration: 400,
      onComplete: () => flash.destroy(),
    });

    // まるころ点滅
    this.tweens.add({
      targets:  this._ball,
      alpha:    0,
      duration: 100,
      yoyo:     true,
      repeat:   4,
      onComplete: () => this._ball.setAlpha(1),
    });
  }

  // ------------------------------------------------------------------
  // デッドゾーン侵入処理（ライフ制）
  // ------------------------------------------------------------------
  _onEnterDeadZone() {
    if (this._returningFlag) return;
    this._returningFlag = true;

    // ぷるぷる震え
    this.tweens.killTweensOf(this._ball);
    this.tweens.add({
      targets:  this._ball,
      x:        this._ball.x + 5,
      duration: 50,
      yoyo:     true,
      repeat:   4,
      ease:     'Power1',
    });

    // ライフ減少
    this._lives = Math.max(0, this._lives - 1);
    this._livesText.setText(this._getLivesString());
    this._playLoseLifeEffect();

    // ライフ0 → ゲームオーバー
    if (this._lives <= 0) {
      this.time.delayedCall(1000, () => {
        this._returningFlag = false;
        this._triggerGameOver();
      });
      return;
    }

    // ライフ残あり → CP or スタートに戻る
    this._retryCount++;
    this.time.delayedCall(800, () => {
      if (this._lastCpHeight > 0) {
        // CP送還（直近足場へ復帰）
        const revivePos = this._getRevivePosition();
        const cpY = revivePos.y;

        if (this._nextPlatformY < cpY - 100) {
          this._nextPlatformY = cpY - 100;
        }

        this.cameras.main.pan(
          GAME_WIDTH / 2, cpY, 500, 'Power2', false,
          (_cam, progress) => {
            if (progress === 1) {
              this._returningFlag  = false;
              this._relaunchPos    = { x: revivePos.x, y: cpY };
              this._isRelaunch     = true;
              this._gameOverFlag   = false;
              this._launched       = false;
              this._restTimer      = 0;
              this._stuckTimer     = 0;
              this._lastStuckY     = cpY;
              this._ball.body.allowGravity = true;
              this.time.delayedCall(50, () => this._showLaunchUI());
            }
          },
        );
      } else {
        // スタートに戻る
        this._returningFlag = false;
        this._isRelaunch    = false;
        this._relaunchPos   = null;
        this._gameOverFlag  = false;
        this._launched      = false;
        this._showLaunchUI();
      }
    });
  }

  // ------------------------------------------------------------------
  // デッドゾーン
  // ------------------------------------------------------------------
  _createDeadZone() {
    const initY = this._deadZoneY;

    // 赤い半透明エリア（ライン下の広いゾーン）
    this._deadZoneRect = this.add.rectangle(
      GAME_WIDTH / 2, initY + 200,
      GAME_WIDTH, 400,
      0xff0000, 0.18,
    ).setScrollFactor(1).setDepth(2);

    // 境界ライン
    this._deadZoneLine = this.add.rectangle(
      GAME_WIDTH / 2, initY,
      GAME_WIDTH, 4,
      0xff0000, 0.8,
    ).setScrollFactor(1).setDepth(3);

    // DEAD ZONEテキスト
    this._deadZoneText = this.add.text(
      GAME_WIDTH / 2, initY + 18,
      i18n.t('deadZone'),
      { fontSize: '11px', color: '#ff4444', stroke: '#000000', strokeThickness: 2 },
    ).setOrigin(0.5).setScrollFactor(1).setDepth(3);
  }

  _updateDeadZone(newY) {
    this.tweens.add({
      targets:  this._deadZoneLine,
      y:        newY,
      duration: 500,
      ease:     'Power2',
    });
    this.tweens.add({
      targets:  this._deadZoneText,
      y:        newY + 18,
      duration: 500,
      ease:     'Power2',
    });
    this.tweens.add({
      targets:  this._deadZoneRect,
      y:        newY + 200,
      duration: 500,
      ease:     'Power2',
    });
  }

  // ------------------------------------------------------------------
  // 強制送還
  // ------------------------------------------------------------------
  _forcedReturn() {
    if (this._returningFlag) return;
    this._returningFlag = true;
    this._retryCount++;

    const msg = this.add.text(
      this.cameras.main.centerX,
      this.cameras.main.centerY,
      i18n.t('returnToCP'),
      { fontSize: '18px', color: '#ffffff', stroke: '#000000', strokeThickness: 4 },
    ).setOrigin(0.5).setScrollFactor(0).setDepth(50);

    this.time.delayedCall(800, () => {
      msg.destroy();
      const revivePos2 = this._getRevivePosition();
      const cpY = revivePos2.y;

      this.cameras.main.pan(
        GAME_WIDTH / 2, cpY, 500, 'Power2', false,
        (_cam, progress) => {
          if (progress === 1) {
            this._returningFlag  = false;
            this._relaunchPos    = { x: revivePos2.x, y: cpY };
            this._isRelaunch     = true;
            this._gameOverFlag   = false;
            this._launched       = false;
            this._restTimer      = 0;
            this._stuckTimer     = 0;
            this._lastStuckY     = cpY;
            this._ball.body.allowGravity = true;
            this.time.delayedCall(50, () => this._showLaunchUI());
          }
        },
      );
    });
  }

  // ------------------------------------------------------------------
  // ゾーン名表示
  // ------------------------------------------------------------------
  _showZoneName(name) {
    const t = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.68, name, {
      fontFamily: "'Press Start 2P'",
      fontSize:   '14px',
      color:      '#ffffff',
      stroke:     '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(35).setAlpha(0);

    this.tweens.add({
      targets:  t,
      alpha:    { from: 0, to: 1 },
      duration: 500,
      yoyo:     true,
      hold:     1000,
      onComplete: () => t.destroy(),
    });
  }

  // ------------------------------------------------------------------
  // 落下検知（チェックポイント有無で分岐）
  // ------------------------------------------------------------------
  _onFallDetected() {
    // デバッグ無敵：CPか安全位置に戻す
    if (this._debug) {
      // リセット先：最後のCP > lastSafeY > 発射台の200px上 の優先順
      const resetY = this._lastCpHeight > 0
        ? (this._lastCpY ?? LAUNCH_Y)
        : Math.min(this._lastSafeY, LAUNCH_Y - 200);
      // body.reset でphysicsボディも確実に移動
      this._ball.body.reset(LAUNCH_X, resetY);
      this._ball.body.velocity.set(0, -600);
      this._gameOverFlag = false;
      this._restTimer    = 0;
      this._stuckTimer   = 0;
      this._lastStuckY   = resetY;
      return;
    }

    this._trail.stop();
    this._ball.setVelocity(0, 0);
    this._ball.body.allowGravity = false;

    this._onEnterDeadZone();
  }

  // ------------------------------------------------------------------
  // スタート地点へ戻る（CP未通過時の落下）
  // ------------------------------------------------------------------
  _returnToStart() {
    if (this._returningFlag) return;
    this._returningFlag = true;
    this._retryCount++;

    const msg = this.add.text(
      this.cameras.main.centerX,
      this.cameras.main.centerY,
      i18n.t('returnToStart'),
      { fontSize: '16px', color: '#ffffff', stroke: '#000000', strokeThickness: 4 },
    ).setOrigin(0.5).setScrollFactor(0).setDepth(50);

    this.time.delayedCall(1000, () => {
      msg.destroy();
      this._returningFlag = false;
      this._isRelaunch    = false;
      this._relaunchPos   = null;
      this._gameOverFlag  = false;
      this._launched      = false;
      this._showLaunchUI();
    });
  }

  // ------------------------------------------------------------------
  // リトライ UI
  // ------------------------------------------------------------------
  _showRetryUI() {
    this._retryUI = [];
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    const bg = this.add.rectangle(cx, cy, 380, 210, 0x000000, 0.75)
      .setScrollFactor(0).setDepth(50);
    this._retryUI.push(bg);

    // 枠線
    const border = this.add.graphics().setScrollFactor(0).setDepth(50);
    border.lineStyle(2, 0xffd700, 1);
    border.strokeRect(cx - 190, cy - 105, 380, 210);
    this._retryUI.push(border);

    const title = this.add.text(cx, cy - 68, '落ちた！', {
      fontFamily: "'Press Start 2P'",
      fontSize: '18px',
      color: '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(51);
    this._retryUI.push(title);

    const h = this._lastCpHeight;
    const cpInfo = this.add.text(cx, cy - 28, `最終CP：${h}m`, {
      fontFamily: "'Press Start 2P'",
      fontSize: '12px',
      color: '#FFD700',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(51);
    this._retryUI.push(cpInfo);

    const bestInfo = this.add.text(cx, cy + 4, `最高記録：${this._maxMeters}m`, {
      fontFamily: "'Press Start 2P'",
      fontSize: '9px',
      color: '#aaaaaa',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(51);
    this._retryUI.push(bestInfo);

    // リトライボタン
    const retryBg = this.add.rectangle(cx - 88, cy + 55, 160, 34, 0x00aa44)
      .setScrollFactor(0).setDepth(51)
      .setInteractive({ useHandCursor: true });
    retryBg.on('pointerover',  () => retryBg.setFillStyle(0x00cc55));
    retryBg.on('pointerout',   () => retryBg.setFillStyle(0x00aa44));
    retryBg.on('pointerdown',  () => {
      soundManager.playSe('se_retry');
      this._retryFromCheckpoint();
    });
    this._retryUI.push(retryBg);

    const retryTxt = this.add.text(cx - 88, cy + 55, 'CPから再スタート', {
      fontFamily: "'Press Start 2P'",
      fontSize: '8px',
      color: '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(52);
    this._retryUI.push(retryTxt);

    // ギブアップボタン
    const giveupBg = this.add.rectangle(cx + 88, cy + 55, 130, 34, 0xaa2222)
      .setScrollFactor(0).setDepth(51)
      .setInteractive({ useHandCursor: true });
    giveupBg.on('pointerover',  () => giveupBg.setFillStyle(0xcc3333));
    giveupBg.on('pointerout',   () => giveupBg.setFillStyle(0xaa2222));
    giveupBg.on('pointerdown',  () => {
      soundManager.playSe('se_select');
      this._destroyRetryUI();
      this._triggerGameOver();
    });
    this._retryUI.push(giveupBg);

    const giveupTxt = this.add.text(cx + 88, cy + 55, 'ギブアップ', {
      fontFamily: "'Press Start 2P'",
      fontSize: '8px',
      color: '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(52);
    this._retryUI.push(giveupTxt);
  }

  _destroyRetryUI() {
    this._retryUI.forEach(obj => obj.destroy());
    this._retryUI = [];
  }

  // ------------------------------------------------------------------
  // CPからの再スタート
  // ------------------------------------------------------------------
  _retryFromCheckpoint() {
    this._destroyRetryUI();
    this._retryCount++;

    this._relaunchPos  = { x: LAUNCH_X, y: this._lastCpY ?? LAUNCH_Y };
    this._isRelaunch   = true;
    this._gameOverFlag = false;
    this._launched     = false;

    // ボタンのpointerdownが同フレームで_onConfirmを発火させないよう
    // 1フレーム待ってから発射UIを表示する
    this.time.delayedCall(50, () => {
      this._showLaunchUI();
    });
  }

  // ------------------------------------------------------------------
  // 再発射 / ゲームオーバー
  // ------------------------------------------------------------------
  _triggerRelaunch() {
    if (this._relaunchFlag) return;
    this._relaunchFlag = true;

    this._relaunchPos = { x: this._ball.x, y: this._ball.y };
    this._trail.stop();
    this._ball.setVelocity(0, 0);
    this._ball.body.allowGravity = false;

    // メッセージなし・200ms後に即ゲージ表示
    this.time.delayedCall(200, () => {
      this._ball.body.allowGravity = true;
      this._relaunchFlag = false;
      this._gameOverFlag = false;
      this._launched     = false;
      this._isRelaunch   = true;
      this._showLaunchUI();
    });
  }

  _showLaunchUI() {
    this._state         = 'aiming';
    this._pastApex      = false;
    this._restTimer     = 0;
    this._stuckTimer    = 0;
    this._lastStuckY    = 0;
    this._hasLanded     = false;
    this._isLandingAnim = false;
    this._ball.setBounce(0.7);

    // 射出状態リセット
    this._canLaunch     = true;
    this._isCharging    = false;
    this._isKeyCharging = false;
    this._aimAngle      = 90;
    this._aimPower      = 400;
    this._hintText.setVisible(true);

    if (this._isRelaunch && this._relaunchPos) {
      const scrollY = this._relaunchPos.y - GAME_HEIGHT * 0.55;
      this.cameras.main.setScroll(0, scrollY);
    } else {
      this.cameras.main.setScroll(0, 0);
      this._ball.body.reset(LAUNCH_X, LAUNCH_Y);
      this._ball.body.allowGravity = false;
      this._clearAllPlatforms();
      this._clearCpLines();
      this._createCpLines();
      this._nextPlatformY = LAUNCH_Y - SAFETY_ZONE_PX;
      // デッドゾーンを初期位置に戻す
      this._deadZoneY = LAUNCH_Y + 100;
      this._updateDeadZone(LAUNCH_Y + 100);
    }
  }

  _triggerGameOver() {
    if (this._gameOverFlag && this._state !== 'flying') return;  // 多重発火防止
    this._gameOverFlag = true;
    this._canLaunch    = false;
    this.input.enabled = false;

    this._trail.stop();
    this._ball.setVelocity(0, 0);
    this._ball.body.allowGravity = false;
    this._clearAllPlatforms();
    this._clearCpLines();

    // GAME OVER テキスト
    const goText = this.add.text(
      GAME_WIDTH / 2, GAME_HEIGHT / 2,
      i18n.t('gameOver'),
      {
        fontFamily:      "'Press Start 2P'",
        fontSize:        '36px',
        color:           '#ff0000',
        stroke:          '#000000',
        strokeThickness: 6,
      },
    ).setOrigin(0.5).setScrollFactor(0).setDepth(100).setAlpha(0);

    this.tweens.add({
      targets:  goText,
      alpha:    1,
      duration: 500,
      onComplete: () => {
        this.time.delayedCall(1000, () => {
          soundManager.stopBgm();
          this.scene.start('ResultScene', {
            meters:     this._maxMeters,
            retryCount: this._retryCount,
            livesLeft:  this._lives,
          });
        });
      },
    });
  }

  // ------------------------------------------------------------------
  // 足場 生成 / 削除
  // ------------------------------------------------------------------
  _generatePlatforms() {
    const targetY = this.cameras.main.scrollY - 400;
    while (this._nextPlatformY > targetY) {
      this._spawnPlatformAt(this._nextPlatformY);
      const meters = Math.floor((LAUNCH_Y - this._nextPlatformY) / COURSE.pxPerMeter);
      this._nextPlatformY -= PLATFORM_CONFIG.getGapY(meters);
    }

    // CP 送還後などで足場が不足している区間を補填
    this._fillMissingPlatforms();
  }

  _fillMissingPlatforms() {
    const topY    = this.cameras.main.scrollY - 100;
    const bottomY = this._deadZoneY != null ? this._deadZoneY : LAUNCH_Y;

    // カメラ表示範囲内（topY〜bottomY）の足場数を確認
    const allPlatforms = [
      ...this._platformGroup.getChildren(),
      ...this._movingGroup.getChildren(),
      ...this._vanishGroup.getChildren(),
    ];
    const visibleCount = allPlatforms.filter(p => p.y > topY && p.y < bottomY).length;

    // 3個未満なら補填生成
    if (visibleCount < 3) {
      let fillY = bottomY - 200;
      while (fillY > topY) {
        this._spawnPlatformAt(fillY);
        const fm = Math.floor((LAUNCH_Y - fillY) / COURSE.pxPerMeter);
        fillY -= PLATFORM_CONFIG.getGapY(fm);
      }
    }
  }

  _spawnPlatformAt(y) {
    const meters   = Math.floor((LAUNCH_Y - y) / COURSE.pxPerMeter);
    const w        = PLATFORM_CONFIG.getWidth(meters);
    const minX     = WALL_W + w / 2 + 4;
    const maxX     = GAME_WIDTH - WALL_W - w / 2 - 4;
    const x        = Phaser.Math.Between(minX, maxX);
    const imageKey = this._getPlatformImageKey(getZoneByHeight(meters).id);

    if (this._isOverlapping(x, y)) return;

    if (meters >= VANISH_START_M && Math.random() < 0.3) {
      this._spawnVanishPlatform(x, y, w);
    } else if (meters >= MOVING_START_M && Math.random() < 0.3) {
      this._spawnMovingPlatform(x, y, w);
    } else {
      this._spawnNormalPlatform(x, y, w, imageKey);
    }
  }

  _getPlatformImageKey(zoneId) {
    if (['surface','troposphere','stratosphere','mesosphere','thermosphere','exosphere'].includes(zoneId)) {
      return 'platform_a';
    }
    if (['space','deepspace','gate'].includes(zoneId)) {
      return 'platform_b';
    }
    return 'platform_c'; // 地獄ゾーン
  }

  _isOverlapping(x, y) {
    const all = [
      ...this._platformGroup.getChildren(),
      ...this._movingGroup.getChildren(),
      ...this._vanishGroup.getChildren(),
    ];
    return all.some(p =>
      Math.abs(p.x - x) < PLATFORM_CONFIG.minDistance &&
      Math.abs(p.y - y) < 40,
    );
  }

  _getMovingPlatformUnder() {
    if (!this._ball.body.blocked.down) return null;
    const bottom = this._ball.body.bottom;
    const cx     = this._ball.x;
    return this._movingGroup.getChildren().find(p =>
      p.active &&
      Math.abs(bottom - p.body.top) < 10 &&
      cx > p.body.left &&
      cx < p.body.right,
    ) ?? null;
  }

  _spawnNormalPlatform(x, y, w, imageKey = 'platform_a') {
    const plat = this.add.nineslice(x, y, imageKey, null, w, PLATFORM_H, 8, 8, 0, 0);
    this.physics.add.existing(plat, true);
    plat.body.setSize(w, PLATFORM_H);
    this._platformGroup.add(plat);
  }

  _spawnMovingPlatform(x, y, w) {
    const meters   = Math.floor((LAUNCH_Y - y) / COURSE.pxPerMeter);
    const imageKey = this._getPlatformImageKey(getZoneByHeight(meters).id);

    const plat = this.add.nineslice(x, y, imageKey, null, w, PLATFORM_H, 8, 8, 0, 0);
    plat.setTint(COLOR_MOVING);
    this.physics.add.existing(plat, true);
    plat.body.setSize(w, PLATFORM_H);
    this._movingGroup.add(plat);
    plat.prevX = x;

    const minX  = WALL_W + w / 2 + 4;
    const maxX  = GAME_WIDTH - WALL_W - w / 2 - 4;
    const range = Math.min(MOVING_RANGE, Math.min(x - minX, maxX - x));

    this.tweens.add({
      targets:  plat,
      x:        x + range,
      duration: MOVING_DURATION,
      yoyo:     true,
      repeat:   -1,
      ease:     'Sine.InOut',
      onUpdate: () => { if (plat?.active) plat.body.reset(plat.x, plat.y); },
    });
  }

  _spawnVanishPlatform(x, y, w) {
    const meters   = Math.floor((LAUNCH_Y - y) / COURSE.pxPerMeter);
    const imageKey = this._getPlatformImageKey(getZoneByHeight(meters).id);

    const plat = this.add.nineslice(x, y, imageKey, null, w, PLATFORM_H, 8, 8, 0, 0);
    plat.setTint(COLOR_VANISH);
    this.physics.add.existing(plat, true);
    plat.body.setSize(w, PLATFORM_H);
    this._vanishGroup.add(plat);
    plat.vanishStarted = false;
  }

  _startVanishTimer(plat) {
    this.time.delayedCall(VANISH_WARN, () => {
      if (!plat?.active) return;
      this.tweens.add({
        targets: plat, alpha: 0,
        duration: 150, yoyo: true, repeat: 6,
      });
    });
    this.time.delayedCall(VANISH_DELAY, () => {
      if (plat?.active) plat.destroy();
    });
  }

  _cleanupPlatforms() {
    const cameraLimit = this.cameras.main.scrollY + GAME_HEIGHT + 300;

    // デッドゾーンより上の足場は絶対に削除しない
    const safeLimit = this._deadZoneY != null
      ? this._deadZoneY + 200
      : LAUNCH_Y + 200;

    // 2つのうち大きい方（より下）を削除基準にする
    const limit = Math.max(cameraLimit, safeLimit);

    this._platformGroup.getChildren()
      .filter(p => p.y > limit).forEach(p => p.destroy());

    this._movingGroup.getChildren()
      .filter(p => p.y > limit).forEach(p => {
        this.tweens.killTweensOf(p);
        p.destroy();
      });

    this._vanishGroup.getChildren()
      .filter(p => p.y > limit).forEach(p => p.destroy());
  }

  _clearAllPlatforms() {
    this._platformGroup.clear(true, true);
    this._movingGroup.getChildren().slice().forEach(p => {
      this.tweens.killTweensOf(p);
      p.destroy();
    });
    this._vanishGroup.clear(true, true);
  }


  // ------------------------------------------------------------------
  // デバッグモード
  // ------------------------------------------------------------------
  _setupDebugMode() {
    // 左上バッジ
    this.add.text(8, 8, '🔧 DEBUG MODE', {
      fontFamily: "'Press Start 2P'",
      fontSize:   '9px',
      color:      '#ff4444',
      stroke:     '#000', strokeThickness: 2,
    }).setDepth(60).setScrollFactor(0);

    // 右下デバッグ情報
    this._debugText = this.add.text(GAME_WIDTH - 8, GAME_HEIGHT - 8, '', {
      fontFamily: 'monospace',
      fontSize:   '11px',
      color:      '#00ff88',
      stroke:     '#000', strokeThickness: 2,
      align:      'right',
    }).setDepth(60).setScrollFactor(0).setOrigin(1, 1);
  }

  _tickDebug() {
    // ↑キー長押し：高速上昇
    if (this._keyUp.isDown && this._state === 'flying') {
      this._ball.body.allowGravity = true;
      this._ball.setVelocityY(-900);
    }

    // Cキー（エッジ検出）：最寄りCP即発動
    const cNow = this._keyC.isDown;
    if (cNow && !this._keyCPrev) this._debugActivateNearestCP();
    this._keyCPrev = cNow;

    // デバッグ情報更新
    if (this._debugText) {
      const vx = Math.round(this._ball.body.velocity.x);
      const vy = Math.round(this._ball.body.velocity.y);
      const by = Math.round(this._ball.y);
      const og = this._ball.body.blocked.down ? 'YES' : 'no';
      this._debugText.setText(
        `Y: ${by}\n` +
        `vx: ${vx}  vy: ${vy}\n` +
        `最高: ${this._maxMeters}m\n` +
        `CP: ${this._lastCpHeight}m\n` +
        `onGround: ${og}`,
      );
    }
  }

  _debugActivateNearestCP() {
    // 直近の未通過CPラインを発動
    let nearest = null;
    let minDist = Infinity;
    this._cpLines.forEach(cp => {
      const dist = Math.abs(this._ball.y - cp.y);
      if (!cp.reached && dist < minDist) {
        minDist = dist;
        nearest = cp;
      }
    });
    if (!nearest) return;

    nearest.reached    = true;
    nearest.gfx.clear();
    nearest.gfx.lineStyle(2, 0xFFD700, 0.9);
    for (let x = 0; x < GAME_WIDTH; x += 20) {
      nearest.gfx.lineBetween(x, nearest.y, x + 10, nearest.y);
    }
    this._lastCpHeight = nearest.height;
    this._lastCpY      = nearest.y;
    this._deadZoneY    = nearest.y;
    this._updateDeadZone(nearest.y);
    this._showCheckpointEffect();
    soundManager.playSe('se_checkpoint');
  }

  // ------------------------------------------------------------------
  // 描画ヘルパー
  // ------------------------------------------------------------------
  _drawLaunchPad() {
    const g  = this.add.graphics().setDepth(3);
    const px = LAUNCH_X;
    const py = LAUNCH_Y;

    // 発射台本体（LAUNCH_Y + 14 = 床上面に乗せる）
    g.fillStyle(COLORS.LAUNCH_PAD, 1);
    g.fillRect(px - 52, py + 14, 104, 14);
    g.lineStyle(3, 0xbb0000, 1);
    g.strokeRect(px - 52, py + 14, 104, 14);

    this.add.text(px, py - 4, '↑ LAUNCH', {
      fontFamily: "'Press Start 2P'",
      fontSize: '7px',
      color: CSS_COLORS.WHITE,
    }).setOrigin(0.5, 1).setDepth(4);
  }
}
