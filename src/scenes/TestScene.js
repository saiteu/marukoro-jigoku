/**
 * TestScene - Arcade Physics 版
 *
 * 【仕様】
 * - Phaser Arcade Physics（gravity.y=800）
 * - 発射・スコア・力尽きた判定を仕様通りに実装
 * - update ループ内での無条件 setVelocity 禁止
 * - スコアは上昇中のみ更新
 * - 力尽きた判定 = player.y > launchY AND |vy| < 50
 */
import Phaser from 'phaser';

const W           = 480;
const H           = 640;
const RADIUS      = 18;
const LAUNCH_X    = W / 2;
const LAUNCH_Y    = H - 80;   // 560px：スコア基準 Y

const ANGLE_MIN   = 10;
const ANGLE_MAX   = 170;
const ANGLE_SPD   = 120;       // 度/秒

const POWER_SPD   = 2.0;       // 0→1 の往復速度
// gravity=1500, v0=2000 → max height = 2000²/(2×1500) ≈ 1333px ≈ 133m
const POWER_MAX   = 2000;      // px/s（Arcade Physics の velocity 単位）

const PX_PER_M    = 10;        // 10px = 1m

// 壁の高さ（カメラが追うフライト全域をカバー）
const WALL_H      = 8000;
const WALL_W      = 30;

export class TestScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TestScene' });
  }

  // ------------------------------------------------------------------
  // create
  // ------------------------------------------------------------------
  create() {
    // ---- テクスチャ生成（初回のみ） ----
    this._createTextures();

    // ---- 背景 ----
    this.add.rectangle(W / 2, H / 2 - WALL_H / 2, W, WALL_H + H, 0xe8f4f8).setDepth(0);

    // ---- 壁（静的ボディ） ----
    // left / right / floor を staticGroup で作成
    const wallCY = H / 2 - WALL_H / 2;   // 壁の中心 Y（上方向に伸びる）

    this._walls = this.physics.add.staticGroup();

    this._walls.create(WALL_W / 2, wallCY, 'wallPx')
      .setDisplaySize(WALL_W, WALL_H + H)
      .setTint(0x4a7c4e).refreshBody();

    this._walls.create(W - WALL_W / 2, wallCY, 'wallPx')
      .setDisplaySize(WALL_W, WALL_H + H)
      .setTint(0x4a7c4e).refreshBody();

    this._walls.create(W / 2, H + 16, 'wallPx')
      .setDisplaySize(W, 32)
      .setTint(0x7bc67e).refreshBody();

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

    // ---- UI ----
    this._uiGfx = this.add.graphics().setDepth(15).setScrollFactor(0);

    this._hintText = this.add.text(W / 2, H - 16, 'SPACE / タップ で角度を決める', {
      fontFamily: 'monospace', fontSize: '11px', color: '#333333',
    }).setOrigin(0.5, 1).setDepth(20).setScrollFactor(0);

    this._meterText = this.add.text(12, 12, '', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ffd93d',
      stroke: '#000000', strokeThickness: 3,
    }).setDepth(20).setScrollFactor(0).setVisible(false);

    // ---- 入力 ----
    this.input.keyboard.on('keydown-SPACE', () => this._onTap());
    this.input.on('pointerdown', () => this._onTap());

    // ---- 状態 ----
    this._phase       = 'angle';   // 'angle' | 'power' | 'flying' | 'result'
    this._angle       = 90;
    this._angleDir    = 1;
    this._power       = 0;
    this._powerDir    = 1;
    this._launched    = false;
    this._maxHeight   = 0;         // 最高到達高度（px）
    this._pastApex    = false;     // 頂点通過フラグ（カメラ制御用）
    this._resultTimer = 0;
  }

  // ------------------------------------------------------------------
  // テクスチャ動的生成（create ごとに再生成しないよう存在チェック）
  // ------------------------------------------------------------------
  _createTextures() {
    if (!this.textures.exists('ballTex')) {
      const g = this.make.graphics({ add: false });
      g.fillStyle(0xffd93d, 1);
      g.fillCircle(RADIUS, RADIUS, RADIUS);
      g.lineStyle(2, 0xe6a800, 1);
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
  // タップ / SPACE
  // ------------------------------------------------------------------
  _onTap() {
    if (this._phase === 'angle') {
      this._phase    = 'power';
      this._power    = 0;
      this._powerDir = 1;
      this._hintText.setText('SPACE / タップ でパワーを決める');
      console.log(`[TEST] 角度確定: ${this._angle.toFixed(1)}°`);

    } else if (this._phase === 'power') {
      this._phase    = 'flying';
      this._launched = true;
      this._hintText.setVisible(false);
      this._uiGfx.clear();

      // 発射：setVelocity は発射時の1回のみ
      this._ball.body.allowGravity = true;
      const speed = this._power * POWER_MAX;
      const rad   = Phaser.Math.DegToRad(this._angle);
      this._ball.setVelocity(
        Math.cos(rad) * speed,
        -Math.sin(rad) * speed,   // 上方向はマイナス
      );

      console.log(
        `[TEST] 発射 angle=${this._angle.toFixed(1)}° ` +
        `power=${(this._power * 100).toFixed(0)}% speed=${speed.toFixed(0)}px/s`,
      );
    }
  }

  // ------------------------------------------------------------------
  // update
  // ------------------------------------------------------------------
  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.05);

    switch (this._phase) {
      case 'angle':  this._tickAngle(dt);  break;
      case 'power':  this._tickPower(dt);  break;
      case 'flying': this._tickFlying(dt); break;
      case 'result':
        this._resultTimer += dt;
        if (this._resultTimer >= 2.0) {
          this.scene.start('ResultScene', { meters: Math.floor(this._maxHeight / PX_PER_M) });
        }
        break;
    }
  }

  // ------------------------------------------------------------------
  // フェーズ tick
  // ------------------------------------------------------------------
  _tickAngle(dt) {
    this._angle += this._angleDir * ANGLE_SPD * dt;
    if (this._angle >= ANGLE_MAX) { this._angle = ANGLE_MAX; this._angleDir = -1; }
    if (this._angle <= ANGLE_MIN) { this._angle = ANGLE_MIN; this._angleDir =  1; }

    // エイミング中はボールを発射台に固定
    this._ball.body.reset(LAUNCH_X, LAUNCH_Y);
    this._drawAngleArrow();
  }

  _tickPower(dt) {
    this._power += this._powerDir * POWER_SPD * dt;
    if (this._power >= 1) { this._power = 1; this._powerDir = -1; }
    if (this._power <= 0) { this._power = 0; this._powerDir =  1; }

    this._ball.body.reset(LAUNCH_X, LAUNCH_Y);
    this._drawPowerUI();
  }

  _tickFlying(dt) {
    const bx = this._ball.x;
    const by = this._ball.y;
    const vy = this._ball.body.velocity.y;

    // ---- 頂点検出（vy > 0 = 下降開始） ----
    if (!this._pastApex && vy > 0) {
      this._pastApex = true;
    }

    // ---- カメラ追従 ----
    // 初回上昇中：lerpT=0.13（素早く追従）
    // 頂点通過後：lerpT=0.06（緩く追従し、落下が画面内に収まる）
    const lerpT  = this._pastApex ? 0.06 : 0.13;
    const desired = by - H * 0.55;
    const cur     = this.cameras.main.scrollY;
    this.cameras.main.setScroll(0, cur + (desired - cur) * lerpT);

    // ---- スコア：上昇中のみ最高記録を更新（仕様通り） ----
    const currentHeight = LAUNCH_Y - by;
    if (currentHeight > this._maxHeight) {
      this._maxHeight = currentHeight;
      console.log(`[TEST] Height: ${Math.floor(this._maxHeight / PX_PER_M)}m`);
    }
    if (!this._meterText.visible) this._meterText.setVisible(true);
    this._meterText.setText(`↑ ${Math.floor(this._maxHeight / PX_PER_M)}m`);

    // ---- 力尽きた判定（仕様通り） ----
    // 条件1: 発射台 Y より下に戻った（by > LAUNCH_Y）
    // 条件2: 縦速度が十分に小さい（|vy| < 50）
    // タイマー・フレームカウント不使用
    if (by > LAUNCH_Y && Math.abs(vy) < 50) {
      this._phase = 'result';
      console.log(`[TEST] ✅ 力尽きた！ Max: ${Math.floor(this._maxHeight / PX_PER_M)}m`);
    }
  }

  // ------------------------------------------------------------------
  // 描画
  // ------------------------------------------------------------------
  _drawAngleArrow() {
    this._uiGfx.clear();
    const rad = Phaser.Math.DegToRad(this._angle);
    const len = 80;
    const sx  = LAUNCH_X, sy = LAUNCH_Y;
    const ex  = sx + Math.cos(rad) * len;
    const ey  = sy - Math.sin(rad) * len;

    this._uiGfx.lineStyle(3, 0xffffff, 1);
    this._uiGfx.beginPath();
    this._uiGfx.moveTo(sx, sy);
    this._uiGfx.lineTo(ex, ey);
    this._uiGfx.strokePath();

    const hl = 12, ha = 0.4;
    for (const a of [rad - ha, rad + ha]) {
      this._uiGfx.beginPath();
      this._uiGfx.moveTo(ex, ey);
      this._uiGfx.lineTo(ex - hl * Math.cos(a), ey + hl * Math.sin(a));
      this._uiGfx.strokePath();
    }
  }

  _drawPowerUI() {
    this._uiGfx.clear();

    const rad = Phaser.Math.DegToRad(this._angle);
    const len = 60 + this._power * 40;
    const sx  = LAUNCH_X, sy = LAUNCH_Y;
    const ex  = sx + Math.cos(rad) * len;
    const ey  = sy - Math.sin(rad) * len;

    this._uiGfx.lineStyle(3, 0xff8800, 1);
    this._uiGfx.beginPath();
    this._uiGfx.moveTo(sx, sy);
    this._uiGfx.lineTo(ex, ey);
    this._uiGfx.strokePath();

    const gx = W - 36, gy = H - 150, gh = 120, gw = 20;
    this._uiGfx.lineStyle(2, 0xffffff, 0.8);
    this._uiGfx.strokeRect(gx - gw / 2, gy, gw, gh);

    const fillH     = gh * this._power;
    const fillColor = this._power > 0.8 ? 0xff4444
                    : this._power > 0.5 ? 0xffaa00
                    : 0x44ff88;
    this._uiGfx.fillStyle(fillColor, 1);
    this._uiGfx.fillRect(gx - gw / 2, gy + gh - fillH, gw, fillH);
  }
}
