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
import { LaunchController } from '../objects/LaunchController.js';
import { TrailEffect } from '../objects/TrailEffect.js';
import { soundManager } from '../systems/SoundManager.js';

// URLパラメータ ?debug=true でデバッグモード有効
const DEBUG_MODE = new URLSearchParams(window.location.search).get('debug') === 'true';

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
const PLATFORM_H         = 14;
const PLATFORM_W_MIN     = 100;
const PLATFORM_W_MAX     = 200;
const PLATFORM_SPACE_MIN = 120;
const PLATFORM_SPACE_MAX = 180;
const SAFETY_ZONE_PX     = 500;

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

// ---- 背景グラデーション ----
const BG_COLORS = [
  { height:    0, color: 0xe8f4f8, name: '地上' },
  { height:  100, color: 0xc8e6c9, name: '草原' },
  { height:  200, color: 0xb3d9f7, name: '空' },
  { height:  350, color: 0x9b59b6, name: '高層' },
  { height:  500, color: 0x6b2d8b, name: '宇宙の入口' },
  { height:  700, color: 0x2d1b4e, name: '暗黒' },
  { height:  900, color: 0x8b0000, name: '地獄の入口' },
  { height: 1000, color: 0x1a0000, name: '地獄' },
];

function getPlatformColor(meters) {
  if (meters < 100) return 0x7bc67e;
  if (meters < 200) return 0x5bafd6;
  if (meters < 350) return 0x9b59b6;
  if (meters < 500) return 0xe67e22;
  if (meters < 700) return 0xe74c3c;
  return 0x555555;
}

// ---- チェックポイント ----
const CP_INTERVAL_M = 100;   // 100mごとにCP
const CP_PLATFORM_W = 300;   // CP足場の幅
const CP_POLE_H     = 40;    // 旗ポールの高さ
const CP_FLAG_W     = 20;    // 旗の幅

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

    // ---- 背景（スクリーン固定・Tweenで色変化） ----
    const wallCY = GAME_HEIGHT / 2 - WALL_H / 2;
    this._bgRect = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2,
      GAME_WIDTH, GAME_HEIGHT,
      BG_COLORS[0].color,
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
    this._ball = this.physics.add.image(LAUNCH_X, LAUNCH_Y, 'ballTex');
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

    // ---- CP足場 ----
    this._checkpointGroup = this.physics.add.staticGroup();
    this.physics.add.collider(
      this._ball, this._checkpointGroup,
      (ball, cp) => {
        this._onLandPlatform(ball, cp);
        // 上から着地 + 未通過のときだけ発動
        if (!cp.reached && ball.body.bottom - cp.body.top <= 20) {
          cp.reached = true;
          cp.setTint(0xff8c00);  // 通過済み：濃いオレンジ
          if (cp._flagGfx) this._drawFlag(cp._flagGfx, cp._flagX, cp.y - PLATFORM_H / 2, true);
          this._checkpoints.lastReachedY      = cp.y - PLATFORM_H / 2 - RADIUS;
          this._checkpoints.lastReachedHeight = cp.meters;
          this._showCheckpointEffect(cp);
          soundManager.playSe('se_checkpoint');
        }
      },
    );

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

    // ---- 空中横移動 キー ----
    this._cursors   = this.input.keyboard.createCursorKeys();
    this._keyA      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this._keyD      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);

    // ---- 空中横移動 モバイル ----
    this._mobileLeft  = false;
    this._mobileRight = false;
    this.input.on('pointermove', (pointer) => {
      if (this._state !== 'flying') return;
      if (!pointer.isDown) return;
      if (pointer.x < this.scale.width / 2) {
        this._mobileLeft  = true;
        this._mobileRight = false;
      } else {
        this._mobileLeft  = false;
        this._mobileRight = true;
      }
    });
    this.input.on('pointerup', () => {
      this._mobileLeft  = false;
      this._mobileRight = false;
    });

    // ---- SE クールダウン ----
    this._bounceSeCooldown = 0;
    this._landSeCooldown   = 0;

    // ---- 状態 ----
    this._state          = 'aiming';
    this._launched       = false;
    this._gameOverFlag   = false;
    this._relaunchFlag   = false;
    this._isRelaunch     = false;
    this._relaunchPos    = null;
    this._maxMeters      = 0;
    this._maxHeight      = 0;
    this._currentBgIndex = 0;
    this._pastApex       = false;
    this._restTimer      = 0;
    this._stuckTimer     = 0;
    this._lastStuckY     = 0;
    this._nextPlatformY  = LAUNCH_Y - SAFETY_ZONE_PX;

    // ---- チェックポイント ----
    this._checkpoints = {
      lastReachedY:      LAUNCH_Y,
      lastReachedHeight: 0,
      list:              [],
    };
    this._nextCpM    = CP_INTERVAL_M;
    this._retryCount = 0;
    this._retryUI    = [];

    // ---- デバッグ ----
    this._debug      = DEBUG_MODE;
    this._lastSafeX  = LAUNCH_X;
    this._lastSafeY  = LAUNCH_Y;
    this._keyUp      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this._keyC       = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    this._keyCPrev   = false;
    if (this._debug) this._setupDebugMode();
  }

  // ------------------------------------------------------------------
  // テクスチャ動的生成
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
  // 足場着地共通コールバック
  // ------------------------------------------------------------------
  _onLandPlatform(ball, plat) {
    if (this._state === 'aiming') return;  // エイミング中は反発係数を変えない
    if (ball.body.bottom - plat.body.top > 20) {
      ball.setVelocityY(Math.abs(ball.body.velocity.y));
    } else {
      const vy = Math.abs(ball.body.velocity.y);
      ball.setBounce(vy < 200 ? 0.1 : 0.6);
      if (vy < 400 && this._landSeCooldown <= 0) {
        soundManager.playSe('se_land');
        this._landSeCooldown = 500;
      }
    }
  }

  // ------------------------------------------------------------------
  // 入力
  // ------------------------------------------------------------------
  _onConfirm() {
    if (this._state !== 'aiming') return;
    const vel = this._launcher.confirm();
    if (vel) {
      this._ball.body.allowGravity = true;
      this._ball.setVelocity(vel.vx, vel.vy);
      this._trail.start();
      this._state        = 'flying';
      this._launched     = true;
      this._gameOverFlag = false;
      this._isRelaunch   = false;
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
  update(_time, delta) {
    const dt = Math.min(delta / 1000, 0.05);

    if (this._bounceSeCooldown > 0) this._bounceSeCooldown -= delta;
    if (this._landSeCooldown   > 0) this._landSeCooldown   -= delta;

    this._launcher.update(dt);

    this._generatePlatforms();
    this._cleanupPlatforms();
    this._generateCheckpoints();

    switch (this._state) {
      case 'aiming': {
        const aimX = (this._isRelaunch && this._relaunchPos) ? this._relaunchPos.x : LAUNCH_X;
        const aimY = (this._isRelaunch && this._relaunchPos) ? this._relaunchPos.y : LAUNCH_Y;
        this._ball.body.reset(aimX, aimY);
        break;
      }
      case 'flying':
        this._tickFlying(dt);
        this._trail.update(this._ball.x, this._ball.y, dt);
        break;
    }

    if (this._debug) this._tickDebug();
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
      let targetIdx = 0;
      for (let i = 0; i < BG_COLORS.length; i++) {
        if (this._maxMeters >= BG_COLORS[i].height) targetIdx = i;
      }
      if (targetIdx !== this._currentBgIndex) {
        this._currentBgIndex = targetIdx;
        this.tweens.killTweensOf(this._bgRect);
        const fromColor = Phaser.Display.Color.IntegerToColor(this._bgRect.fillColor);
        const toColor   = Phaser.Display.Color.IntegerToColor(BG_COLORS[targetIdx].color);
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
        this._showZoneName(BG_COLORS[targetIdx].name);
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

    const vx         = this._ball.body.velocity.x;
    const totalSpeed = Math.sqrt(vx * vx + vy * vy);
    const onGround   = this._ball.body.blocked.down;
    const fellBelow  = by > LAUNCH_Y;

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
  // チェックポイント生成 / 描画
  // ------------------------------------------------------------------
  _generateCheckpoints() {
    const targetY = this.cameras.main.scrollY - 200;
    while (true) {
      const cpY = LAUNCH_Y - this._nextCpM * COURSE.pxPerMeter;
      if (cpY < targetY) break;   // カメラより上に達したら終了
      this._spawnCheckpoint(cpY, this._nextCpM);
      this._nextCpM += CP_INTERVAL_M;
    }
  }

  _spawnCheckpoint(y, meters) {
    const cx    = GAME_WIDTH / 2;
    const flagX = cx - CP_PLATFORM_W / 2 + 16;  // 足場左端から少し内側

    // CP足場（物理ボディ付き）
    const cp = this._checkpointGroup.create(cx, y, 'wallPx')
      .setDisplaySize(CP_PLATFORM_W, PLATFORM_H)
      .setTint(0xffd700)
      .refreshBody();
    cp.reached = false;
    cp.meters  = meters;
    cp._flagX  = flagX;

    // 旗グラフィック（足場上面から立てる）
    const gfx = this.add.graphics().setDepth(13);
    this._drawFlag(gfx, flagX, y - PLATFORM_H / 2, false);
    cp._flagGfx = gfx;

    // 高度ラベル
    const label = this.add.text(cx, y - PLATFORM_H / 2 - CP_POLE_H - 6, `${meters}m`, {
      fontFamily: "'Press Start 2P'",
      fontSize:   '8px',
      color:      '#ffd700',
      stroke: '#000', strokeThickness: 2,
    }).setDepth(13).setOrigin(0.5, 1);
    cp._label = label;

    this._checkpoints.list.push({ y, meters, cp });
  }

  // x, y = ポール根本（足場の上面）
  _drawFlag(gfx, x, y, gold) {
    gfx.clear();
    // ポール（下から上へ）
    gfx.fillStyle(0xcccccc, 1);
    gfx.fillRect(x - 1, y - CP_POLE_H, 2, CP_POLE_H);
    // 旗（ポール上部から右へ三角形）
    const fc = gold ? 0xffd700 : 0xffffff;
    gfx.fillStyle(fc, 1);
    gfx.fillTriangle(
      x,             y - CP_POLE_H,
      x + CP_FLAG_W, y - CP_POLE_H + CP_FLAG_W * 0.5,
      x,             y - CP_POLE_H + CP_FLAG_W,
    );
    if (gold) {
      gfx.lineStyle(1, 0xfffaaa, 1);
      gfx.strokeTriangle(
        x,             y - CP_POLE_H,
        x + CP_FLAG_W, y - CP_POLE_H + CP_FLAG_W * 0.5,
        x,             y - CP_POLE_H + CP_FLAG_W,
      );
    }
  }

  // ------------------------------------------------------------------
  // チェックポイント通過演出
  // ------------------------------------------------------------------
  _showCheckpointEffect(cp) {
    const cam = this.cameras.main;

    // ---- 1. テキストポップアップ ----
    const startY = cam.centerY - 50 + cam.scrollY;
    const endY1  = cam.centerY - 100 + cam.scrollY;
    const endY2  = cam.centerY - 150 + cam.scrollY;
    const cpText = this.add.text(
      cam.centerX,
      startY,
      'CHECKPOINT!',
      {
        fontSize: '28px',
        color:    '#FFD700',
        stroke:   '#000000',
        strokeThickness: 5,
      },
    ).setOrigin(0.5).setScrollFactor(0).setDepth(40).setAlpha(0).setScale(0.5);

    this.tweens.add({
      targets:  cpText,
      alpha:    1,
      scale:    1,
      y:        endY1,
      duration: 300,
      ease:     'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets:  cpText,
          alpha:    0,
          y:        endY2,
          duration: 500,
          delay:    1000,
          onComplete: () => cpText.destroy(),
        });
      },
    });

    // ---- 2. CP足場が白く光る ----
    if (cp) {
      this.tweens.addCounter({
        from:     0,
        to:       1,
        duration: 100,
        yoyo:     true,
        repeat:   2,
        onUpdate: (tween) => {
          const v = tween.getValue();
          const r = Math.round(0xff);
          const g = Math.round(0x8c + (0xff - 0x8c) * (1 - v));
          const b = Math.round(0x00 + 0xff * (1 - v));
          cp.setTint(Phaser.Display.Color.GetColor(r, g, b));
        },
        onComplete: () => cp.setTint(0xff8c00),
      });
    }

    // ---- 3. パーティクル（Phaser 3.60+ API）----
    if (cp) {
      const px = cp.x;
      const py = cp.y;
      const key = '__cpParticle';
      if (!this.textures.exists(key)) {
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0xffffff, 1);
        g.fillCircle(4, 4, 4);
        g.generateTexture(key, 8, 8);
        g.destroy();
      }
      const emitter = this.add.particles(px, py, key, {
        speed:    { min: 50, max: 150 },
        angle:    { min: 240, max: 300 },
        scale:    { start: 0.8, end: 0 },
        lifespan: 800,
        quantity: 15,
        tint:     [0xFFD700, 0xFFFFFF, 0xFF8C00],
        gravityY: 200,
      }).setDepth(35);
      this.time.delayedCall(200, () => emitter.destroy());
    }
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
      const resetY = this._checkpoints.lastReachedHeight > 0
        ? this._checkpoints.lastReachedY          // 最後のCP位置
        : Math.min(this._lastSafeY, LAUNCH_Y - 200); // 最低でも200px上
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

    if (this._checkpoints.lastReachedHeight > 0) {
      this._showRetryUI();
    } else {
      this._triggerGameOver();
    }
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

    const h = this._checkpoints.lastReachedHeight;
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

    this._relaunchPos  = { x: LAUNCH_X, y: this._checkpoints.lastReachedY };
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

    const text = this.add.text(
      this.cameras.main.centerX,
      this.cameras.main.centerY - 50,
      'もう一度とばす！',
      { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff',
        stroke: '#000000', strokeThickness: 4 },
    ).setOrigin(0.5).setScrollFactor(0).setDepth(30);

    this.time.delayedCall(500, () => {
      text.destroy();
      this._ball.body.allowGravity = true;
      this._relaunchFlag = false;
      this._gameOverFlag = false;
      this._launched     = false;
      this._isRelaunch   = true;
      this._showLaunchUI();
    });
  }

  _showLaunchUI() {
    this._state      = 'aiming';
    this._pastApex   = false;
    this._restTimer  = 0;
    this._stuckTimer = 0;
    this._lastStuckY = 0;
    this._ball.setBounce(0.7);

    if (this._isRelaunch && this._relaunchPos) {
      const scrollY = this._relaunchPos.y - GAME_HEIGHT * 0.55;
      this.cameras.main.setScroll(0, scrollY);
      this._launcher.start(this._relaunchPos.x, GAME_HEIGHT * 0.55);
    } else {
      this.cameras.main.setScroll(0, 0);
      this._launcher.start();
      this._clearAllPlatforms();
      this._clearCheckpoints();
      this._nextPlatformY = LAUNCH_Y - SAFETY_ZONE_PX;
      this._nextCpM       = CP_INTERVAL_M;
      this._checkpoints   = { lastReachedY: LAUNCH_Y, lastReachedHeight: 0, list: [] };
    }
  }

  _triggerGameOver() {
    this._trail.stop();
    this._ball.setVelocity(0, 0);
    this._ball.body.allowGravity = false;
    this._clearAllPlatforms();
    this._clearCheckpoints();

    this.time.delayedCall(800, () => {
      soundManager.stopBgm();
      this.scene.start('ResultScene', {
        meters:     this._maxMeters,
        retryCount: this._retryCount,
      });
    });
  }

  // ------------------------------------------------------------------
  // 足場 生成 / 削除
  // ------------------------------------------------------------------
  _generatePlatforms() {
    const targetY = this.cameras.main.scrollY - 400;
    while (this._nextPlatformY > targetY) {
      this._spawnPlatformAt(this._nextPlatformY);
      this._nextPlatformY -= Phaser.Math.Between(PLATFORM_SPACE_MIN, PLATFORM_SPACE_MAX);
    }
  }

  _spawnPlatformAt(y) {
    const meters = Math.floor((LAUNCH_Y - y) / COURSE.pxPerMeter);
    const w = Phaser.Math.Between(PLATFORM_W_MIN, PLATFORM_W_MAX);
    const minX = WALL_W + w / 2 + 4;
    const maxX = GAME_WIDTH - WALL_W - w / 2 - 4;
    const x = Phaser.Math.Between(minX, maxX);

    if (meters >= VANISH_START_M && Math.random() < 0.3) {
      this._spawnVanishPlatform(x, y, w);
    } else if (meters >= MOVING_START_M && Math.random() < 0.3) {
      this._spawnMovingPlatform(x, y, w);
    } else {
      this._spawnNormalPlatform(x, y, w, getPlatformColor(meters));
    }
  }

  _spawnNormalPlatform(x, y, w, color = 0x7bc67e) {
    this._platformGroup.create(x, y, 'wallPx')
      .setDisplaySize(w, PLATFORM_H)
      .setTint(color)
      .refreshBody();
  }

  _spawnMovingPlatform(x, y, w) {
    const plat = this._movingGroup.create(x, y, 'wallPx')
      .setDisplaySize(w, PLATFORM_H)
      .setTint(COLOR_MOVING)
      .refreshBody();

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
      onUpdate: () => { if (plat?.active) plat.refreshBody(); },
    });
  }

  _spawnVanishPlatform(x, y, w) {
    const plat = this._vanishGroup.create(x, y, 'wallPx')
      .setDisplaySize(w, PLATFORM_H)
      .setTint(COLOR_VANISH)
      .refreshBody();
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
    const limit = this.cameras.main.scrollY + GAME_HEIGHT + 300;

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

  _clearCheckpoints() {
    this._checkpoints.list.forEach(entry => {
      if (entry.cp?._flagGfx) entry.cp._flagGfx.destroy();
      if (entry.cp?._label)   entry.cp._label.destroy();
    });
    this._checkpointGroup.clear(true, true);
    this._checkpoints.list = [];
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
        `CP: ${this._checkpoints.lastReachedHeight}m\n` +
        `onGround: ${og}`,
      );
    }
  }

  _debugActivateNearestCP() {
    let nearest = null;
    let minDist = Infinity;
    this._checkpoints.list.forEach(entry => {
      const cp   = entry.cp;
      const dist = Math.abs(this._ball.y - cp.y);
      if (!cp.reached && dist < minDist) {
        minDist = dist;
        nearest = cp;
      }
    });
    if (!nearest) return;

    nearest.reached = true;
    nearest.setTint(0xff8c00);
    if (nearest._flagGfx) {
      this._drawFlag(nearest._flagGfx, nearest._flagX, nearest.y - PLATFORM_H / 2, true);
    }
    this._checkpoints.lastReachedY      = nearest.y - PLATFORM_H / 2 - RADIUS;
    this._checkpoints.lastReachedHeight = nearest.meters;
    this._showCheckpointEffect(nearest);
    soundManager.playSe('se_checkpoint');
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
