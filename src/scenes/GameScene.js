/**
 * ゲームシーン（Arcade Physics 版）
 *
 * 足場から足場へ渡り歩くゲーム
 * - 通常足場（全高度）：緑色・静止
 * - 移動足場（200m以上）：青色・左右移動
 * - 消える足場（350m以上）：オレンジ・3秒で消滅
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

const LAUNCH_X = LAUNCH.launchPadX;
const LAUNCH_Y = LAUNCH.launchPadY;
const RADIUS   = 18;
const WALL_H   = 8000;
const WALL_W   = 30;

// ---- 足場共通 ----
const PLATFORM_H         = 14;
const PLATFORM_W_MIN     = 100;
const PLATFORM_W_MAX     = 200;
const PLATFORM_SPACE_MIN = 120;   // 縦間隔最小（px）
const PLATFORM_SPACE_MAX = 180;   // 縦間隔最大（px）必ずクリア可能な範囲
const SAFETY_ZONE_PX     = 500;   // 発射台から上方500px以内は足場なし

// ---- 足場種別閾値 ----
const MOVING_START_M  = 200;   // 移動足場出現（m）
const VANISH_START_M  = 350;   // 消える足場出現（m）

// ---- 移動足場 ----
const MOVING_RANGE    = 100;   // 左右移動幅（px）
const MOVING_DURATION = 1500;  // 往復時間（ms）

// ---- 消える足場 ----
const VANISH_DELAY    = 3000;  // 消えるまでの時間（ms）
const VANISH_WARN     = 2000;  // 点滅警告開始（ms）

// ---- 足場カラー ----
const COLOR_NORMAL  = 0x44cc66;  // 緑
const COLOR_MOVING  = 0x74b9ff;  // 青
const COLOR_VANISH  = 0xff9f43;  // オレンジ

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
    this._ball.setDragX(200);
    this._ball.setDepth(10);
    this._ball.body.allowGravity = false;

    // 壁との衝突
    this.physics.add.collider(this._ball, this._walls, (ball) => {
      ball.setBounce(Math.abs(ball.body.velocity.y) < 200 ? 0.1 : 0.6);
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
        // 上から初接触で消滅タイマー開始
        if (!plat.vanishStarted && ball.body.bottom - plat.body.top <= 20) {
          plat.vanishStarted = true;
          this._startVanishTimer(plat);
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

    // ---- 状態 ----
    this._state          = 'aiming';
    this._launched       = false;
    this._gameOverFlag   = false;
    this._relaunchFlag   = false;
    this._isRelaunch     = false;
    this._relaunchPos    = null;
    this._maxMeters      = 0;
    this._maxHeight      = 0;
    this._pastApex       = false;
    this._restTimer      = 0;
    this._stuckTimer     = 0;
    this._lastStuckY     = 0;
    // 足場生成カーソル（安全地帯の直上から開始）
    this._nextPlatformY  = LAUNCH_Y - SAFETY_ZONE_PX;
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
    if (ball.body.bottom - plat.body.top > 20) {
      // 下から当たった → 押し返す
      ball.setVelocityY(Math.abs(ball.body.velocity.y));
    } else {
      // 上から乗った → 速度に応じて反発を下げる
      ball.setBounce(Math.abs(ball.body.velocity.y) < 200 ? 0.1 : 0.6);
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
  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.05);

    this._launcher.update(dt);

    // 足場はエイミング中も生成して事前に見せる
    this._generatePlatforms();
    this._cleanupPlatforms();

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
  }

  // ------------------------------------------------------------------
  // フライト tick
  // ------------------------------------------------------------------
  _tickFlying(dt) {
    const by = this._ball.y;
    const vy = this._ball.body.velocity.y;

    // 下方向 800px/s キャップ
    if (vy > 800) this._ball.setVelocityY(800);

    // 頂点検出
    if (!this._pastApex && vy > 0) this._pastApex = true;

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
      this._bgRect.setFillStyle(getBgColor(this._maxMeters));
    }
    if (!this._meterText.visible) this._meterText.setVisible(true);
    this._meterText.setText(`↑ ${this._maxMeters}m`);

    // 着地静止：低速 + onGround なら完全停止
    const onGroundNow   = this._ball.body.blocked.down;
    const totalSpeedNow = Math.sqrt(
      this._ball.body.velocity.x ** 2 + this._ball.body.velocity.y ** 2,
    );
    if (totalSpeedNow < 50 && onGroundNow) {
      this._ball.setVelocity(0, 0);
      this._ball.setBounce(0);
    }

    // スタック検知（3秒以上同じ高度 → ゲームオーバー）
    if (Math.abs(by - this._lastStuckY) < 10) {
      this._stuckTimer += dt;
      if (this._stuckTimer > 3.0 && !this._gameOverFlag) {
        this._gameOverFlag = true;
        this._triggerGameOver();
        return;
      }
    } else {
      this._stuckTimer = 0;
      this._lastStuckY = by;
    }

    // ゲームオーバー / 再発射判定
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

    // 優先1：発射台より下 → ゲームオーバー
    if (fellBelow) {
      this._gameOverFlag = true;
      this._triggerGameOver();
      return;
    }
    // 優先2：足場の上で静止 → 再発射
    if (trulyStopped && onGround && !fellBelow) {
      this._gameOverFlag = true;
      this._triggerRelaunch();
      return;
    }
    // 優先3：空中で静止 → ゲームオーバー
    if (trulyStopped && !onGround && !fellBelow) {
      this._gameOverFlag = true;
      this._triggerGameOver();
      return;
    }
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
    this._state     = 'aiming';
    this._pastApex  = false;
    this._restTimer = 0;
    this._ball.setBounce(0.6);

    if (this._isRelaunch && this._relaunchPos) {
      const scrollY = this._relaunchPos.y - GAME_HEIGHT * 0.55;
      this.cameras.main.setScroll(0, scrollY);
      this._launcher.start(this._relaunchPos.x, GAME_HEIGHT * 0.55);
    } else {
      this.cameras.main.setScroll(0, 0);
      this._launcher.start();
      this._clearAllPlatforms();
      this._nextPlatformY = LAUNCH_Y - SAFETY_ZONE_PX;
    }
  }

  _triggerGameOver() {
    this._trail.stop();
    this._ball.setVelocity(0, 0);
    this._ball.body.allowGravity = false;
    this._clearAllPlatforms();

    this.time.delayedCall(800, () => {
      soundManager.stopBgm();
      this.scene.start('ResultScene', { meters: this._maxMeters });
    });
  }

  _clearAllPlatforms() {
    this._platformGroup.clear(true, true);
    // 移動足場はtweenを止めてから削除
    this._movingGroup.getChildren().slice().forEach(p => {
      this.tweens.killTweensOf(p);
      p.destroy();
    });
    this._vanishGroup.clear(true, true);
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
      this._spawnNormalPlatform(x, y, w);
    }
  }

  _spawnNormalPlatform(x, y, w) {
    this._platformGroup.create(x, y, 'wallPx')
      .setDisplaySize(w, PLATFORM_H)
      .setTint(COLOR_NORMAL)
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
    // 2秒後に点滅開始
    this.time.delayedCall(VANISH_WARN, () => {
      if (!plat?.active) return;
      this.tweens.add({
        targets: plat, alpha: 0,
        duration: 150, yoyo: true, repeat: 6,
      });
    });
    // 3秒後に消滅
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

  // ------------------------------------------------------------------
  // 消える足場タイマー
  // ------------------------------------------------------------------

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
