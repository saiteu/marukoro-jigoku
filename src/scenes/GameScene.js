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

// ---- 通常足場定数 ----
const PLATFORM_START_M   = 20;    // 出現開始高度（m）
const PLATFORM_W         = 90;    // 幅（px）
const PLATFORM_H         = 14;    // 高さ（px）
const PLATFORM_SPACE_MIN = 180;   // 最小間隔（px）
const PLATFORM_SPACE_MAX = 320;   // 最大間隔（px）
const PLATFORM_COLOR     = 0x888888; // 灰色

// ---- バネ床定数 ----
const SPRING_START_M   = 100;   // 出現開始高度（m）
const SPRING_W         = 80;    // 幅（px）
const SPRING_H         = 14;    // 高さ（px）
const SPRING_SPACE_MIN = 220;   // 最小間隔（px）
const SPRING_SPACE_MAX = 380;   // 最大間隔（px）

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
    this._ball.body.allowGravity = false;   // エイミング中は重力を止める

    // 壁との衝突判定（着地速度が遅い場合は反発を下げる）
    this.physics.add.collider(this._ball, this._walls, (ball) => {
      const absVy = Math.abs(ball.body.velocity.y);
      if (absVy < 200) {
        ball.setBounce(0.1);
      } else {
        ball.setBounce(0.6);
      }
    });

    // ---- 通常足場（上面のみ衝突） ----
    this._platformGroup = this.physics.add.staticGroup();
    this.physics.add.collider(this._ball, this._platformGroup, (ball, platform) => {
      const playerBottom = ball.body.bottom;
      const platformTop  = platform.body.top;
      if (playerBottom - platformTop > 20) {
        // 下から当たった場合は押し返す
        ball.setVelocityY(Math.abs(ball.body.velocity.y));
      } else {
        // 上から乗った場合：着地速度に応じて反発を下げる
        ball.setBounce(Math.abs(ball.body.velocity.y) < 200 ? 0.1 : 0.6);
      }
    });
    this._nextPlatformY = LAUNCH_Y - PLATFORM_START_M * COURSE.pxPerMeter;

    // ---- ギミック：バネ床（上面のみ発動・下からは通り抜け・クールダウン付き） ----
    this._springGroup = this.physics.add.staticGroup();
    this.physics.add.collider(
      this._ball,
      this._springGroup,
      (ball, spring) => {
        // クールダウン中は無視（processCallback でも弾くが念のため）
        if (spring.activated) return;
        spring.activated = true;

        const randomX = Phaser.Math.Between(-150, 150);
        ball.setVelocityX(randomX);
        ball.setVelocityY(-1200);
        soundManager.playSe('se_spring');

        // 1秒後にクールダウン解除
        this.time.delayedCall(1000, () => {
          if (spring && spring.active) spring.activated = false;
        });
      },
      (ball, spring) => {
        // クールダウン中 or 下から当たった場合は衝突を無効化
        if (spring.activated) return false;
        return ball.body.bottom - spring.body.top <= 20;
      },
    );
    this._nextSpringY = LAUNCH_Y - SPRING_START_M * COURSE.pxPerMeter;

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
    this._isRelaunch     = false;   // 足場からの再発射かどうか
    this._relaunchPos    = null;    // 再発射時のボール位置（world座標）
    this._maxMeters      = 0;
    this._maxHeight      = 0;
    this._pastApex       = false;
    this._restTimer      = 0;
    this._stuckTimer     = 0;
    this._lastStuckY     = 0;
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

    switch (this._state) {
      case 'aiming': {
        // 通常：発射台に固定　再発射：着地した足場位置に固定
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

    // ---- 速度上限：下方向 800px/s を超えたらキャップ ----
    if (vy > 800) this._ball.setVelocityY(800);

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

    // ---- 着地静止：onGround で低速なら完全停止 ----
    const onGroundNow = this._ball.body.blocked.down;
    const totalSpeedNow = Math.sqrt(
      this._ball.body.velocity.x ** 2 + this._ball.body.velocity.y ** 2,
    );
    if (totalSpeedNow < 50 && onGroundNow) {
      this._ball.setVelocity(0, 0);
      this._ball.setBounce(0);
    }

    // ---- 足場・バネ床：生成 & 後片付け ----
    this._generatePlatforms();
    this._cleanupPlatforms();
    this._generateSprings();
    this._cleanupSprings();

    // ---- スタック検知：同じ高度に3秒以上いたらゲームオーバー ----
    if (Math.abs(this._ball.y - this._lastStuckY) < 10) {
      this._stuckTimer += dt;
      if (this._stuckTimer > 3.0 && !this._gameOverFlag) {
        this._gameOverFlag = true;
        this._triggerGameOver();
        return;
      }
    } else {
      this._stuckTimer  = 0;
      this._lastStuckY  = this._ball.y;
    }

    // ---- ゲームオーバー / 再発射判定 ----
    if (!this._launched || this._gameOverFlag) return;

    const vx         = this._ball.body.velocity.x;
    const totalSpeed = Math.sqrt(vx * vx + vy * vy);
    const onGround   = this._ball.body.blocked.down;
    // 発射台 Y を超えたら「落下」とみなす（+100 バッファを外す）
    const fellBelow  = this._ball.y > LAUNCH_Y;

    // 低速継続タイマー：0.3秒以上 totalSpeed < 30 が続いたら「本当に停止」
    if (totalSpeed < 30) {
      this._restTimer += dt;
    } else {
      this._restTimer = 0;
    }
    const trulyStopped = this._restTimer >= 0.3;

    // 優先1：発射台より下に落下 → ゲームオーバー（最優先・必ず return）
    if (fellBelow) {
      this._gameOverFlag = true;
      this._triggerGameOver();
      return;
    }

    // 優先2：足場の上で静止（落下していない場合のみ）→ 再発射チャンス
    if (trulyStopped && onGround && !fellBelow) {
      this._gameOverFlag = true;
      this._triggerRelaunch();
      return;
    }

    // 優先3：空中で静止（落下していない場合のみ）→ ゲームオーバー
    if (trulyStopped && !onGround && !fellBelow) {
      this._gameOverFlag = true;
      this._triggerGameOver();
      return;
    }
  }

  _triggerRelaunch() {
    if (this._relaunchFlag) return;
    this._relaunchFlag = true;

    // 着地位置を記録してから止める
    this._relaunchPos = { x: this._ball.x, y: this._ball.y };

    this._trail.stop();
    this._ball.setVelocity(0, 0);
    this._ball.body.allowGravity = false;

    const text = this.add.text(
      this.cameras.main.centerX,
      this.cameras.main.centerY - 50,
      'もう一度とばす！',
      {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
      },
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
      // 足場位置でカメラをセット、矢印もボールの画面位置から出す
      const scrollY   = this._relaunchPos.y - GAME_HEIGHT * 0.55;
      this.cameras.main.setScroll(0, scrollY);
      this._launcher.start(this._relaunchPos.x, GAME_HEIGHT * 0.55);
    } else {
      // 通常：発射台に戻す
      this.cameras.main.setScroll(0, 0);
      this._launcher.start();
      // 足場・バネをリセット（通常ゲームオーバーからの再開時）
      this._platformGroup.clear(true, true);
      this._nextPlatformY = LAUNCH_Y - PLATFORM_START_M * COURSE.pxPerMeter;
      this._springGroup.clear(true, true);
      this._nextSpringY = LAUNCH_Y - SPRING_START_M * COURSE.pxPerMeter;
    }
  }

  _triggerGameOver() {
    this._trail.stop();
    this._ball.setVelocity(0, 0);
    this._ball.body.allowGravity = false;
    // 遷移前に全オブジェクトをクリア
    this._platformGroup.clear(true, true);
    this._springGroup.clear(true, true);

    this.time.delayedCall(800, () => {
      soundManager.stopBgm();
      this.scene.start('ResultScene', { meters: this._maxMeters });
    });
  }

  // ------------------------------------------------------------------
  // 通常足場 生成 / 削除
  // ------------------------------------------------------------------
  _generatePlatforms() {
    // 出現高度に到達していなければ生成しない
    if (this._maxHeight < PLATFORM_START_M * COURSE.pxPerMeter) return;
    const targetY = this.cameras.main.scrollY - 400;
    while (this._nextPlatformY > targetY) {
      this._spawnPlatform(this._nextPlatformY);
      this._nextPlatformY -= Phaser.Math.Between(PLATFORM_SPACE_MIN, PLATFORM_SPACE_MAX);
    }
  }

  _spawnPlatform(y) {
    const minX = WALL_W + PLATFORM_W / 2 + 4;
    const maxX = GAME_WIDTH - WALL_W - PLATFORM_W / 2 - 4;
    const x = Phaser.Math.Between(minX, maxX);
    // バネ床の真上 200px 以内には生成しない
    if (this._isNearSpring(x, y)) return;
    this._platformGroup.create(x, y, 'wallPx')
      .setDisplaySize(PLATFORM_W, PLATFORM_H)
      .setTint(PLATFORM_COLOR)
      .refreshBody();
  }

  _isNearSpring(x, y) {
    for (const spring of this._springGroup.getChildren()) {
      if (
        Math.abs(spring.x - x) < 200 &&
        spring.y - y < 200 &&
        spring.y - y > 0
      ) {
        return true;
      }
    }
    return false;
  }

  _cleanupPlatforms() {
    const limit = this.cameras.main.scrollY + GAME_HEIGHT + 300;
    const toRemove = this._platformGroup.getChildren().filter(p => p.y > limit);
    toRemove.forEach(p => p.destroy());
  }

  // ------------------------------------------------------------------
  // バネ床 生成 / 削除
  // ------------------------------------------------------------------
  _generateSprings() {
    // カメラ上端より 400px 先まで生成しておく
    const targetY = this.cameras.main.scrollY - 400;
    while (this._nextSpringY > targetY) {
      this._spawnSpring(this._nextSpringY);
      this._nextSpringY -= Phaser.Math.Between(SPRING_SPACE_MIN, SPRING_SPACE_MAX);
    }
  }

  _spawnSpring(y) {
    const minX = WALL_W + SPRING_W / 2 + 4;
    const maxX = GAME_WIDTH - WALL_W - SPRING_W / 2 - 4;
    const x = Phaser.Math.Between(minX, maxX);
    const spring = this._springGroup.create(x, y, 'wallPx')
      .setDisplaySize(SPRING_W, SPRING_H)
      .setTint(0xFFD93D)
      .refreshBody();
    spring.activated = false;
  }

  _cleanupSprings() {
    // カメラ下端より 300px 以下のバネを削除
    // getChildren() は生配列なのでスナップショットをとってからループ
    const limit = this.cameras.main.scrollY + GAME_HEIGHT + 300;
    const toRemove = this._springGroup.getChildren().filter(s => s.y > limit);
    toRemove.forEach(s => s.destroy());
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
