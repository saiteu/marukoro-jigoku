/**
 * 発射コントローラー（リニューアル版）
 * - 左右キー / A・D キーで角度調整
 * - スペース長押し or タップ長押しでパワーチャージ、離したら発射
 * - 放物線プレビュー + パワーゲージをワールド座標で描画
 */
import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, CSS_COLORS } from '../config.js';
import { soundManager } from '../systems/SoundManager.js';

const ANGLE_SPEED        = 2;      // deg / frame (60fps 基準)
const ANGLE_MIN          = 10;
const ANGLE_MAX          = 170;
const POWER_MIN          = 400;
const POWER_MAX          = 1200;
const POWER_CHARGE_SPEED = 8;      // power / frame (60fps 基準)
const MIN_CHARGE_TIME    = 300;    // 最低チャージ時間（ms）

export class LaunchController {
  constructor(scene) {
    this._scene   = scene;
    this._active  = false;
    this._angle   = 90;
    this._power   = POWER_MIN;
    this._originX = 0;
    this._originY = 0;

    // チャージ状態
    this._spaceCharging   = false;
    this._pointerCharging = false;
    this._pendingFire     = false;
    this._chargeStartTime = 0;

    // グラフィクス（ワールド座標）
    this._gfx = scene.add.graphics().setDepth(20).setScrollFactor(1);

    // キーボード
    this._cursors  = scene.input.keyboard.createCursorKeys();
    this._keyA     = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this._keyD     = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this._spaceKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // タッチ / マウス
    scene.input.on('pointerdown', (p) => this._onPointerDown(p));
    scene.input.on('pointermove', (p) => this._onPointerMove(p));
    scene.input.on('pointerup',   ()  => this._onPointerUp());

    // ヒントテキスト（画面固定）
    this._hintText = scene.add.text(
      GAME_WIDTH / 2, GAME_HEIGHT - 20,
      '←→: 角度   長押し: チャージ   離す: 発射',
      { fontFamily: "'Press Start 2P'", fontSize: '7px', color: CSS_COLORS.WHITE,
        stroke: '#000', strokeThickness: 2 },
    ).setOrigin(0.5, 1).setDepth(21).setScrollFactor(0).setVisible(false);
  }

  /**
   * エイム開始
   * @param {number} worldX  ボールのワールド X 座標
   * @param {number} worldY  ボールのワールド Y 座標
   */
  start(worldX, worldY) {
    this._originX         = worldX;
    this._originY         = worldY;
    this._angle           = 90;
    this._power           = POWER_MIN;
    this._spaceCharging   = false;
    this._pointerCharging = false;
    this._pendingFire     = false;
    this._active          = true;
    this._hintText.setVisible(true);
  }

  /**
   * 毎フレーム呼び出す。
   * 発射時に { vx, vy } を返す。それ以外は null。
   * @param {number} delta  Phaser の delta (ms)
   */
  update(delta) {
    if (!this._active) return null;

    // pointerup からの発射予約
    if (this._pendingFire) {
      return this._doFire();
    }

    const dt = delta / 16.667; // 60fps 基準に正規化

    // 角度調整（キー）
    if (this._cursors.left.isDown || this._keyA.isDown) {
      this._angle = Math.max(ANGLE_MIN, this._angle - ANGLE_SPEED * dt);
    }
    if (this._cursors.right.isDown || this._keyD.isDown) {
      this._angle = Math.min(ANGLE_MAX, this._angle + ANGLE_SPEED * dt);
    }

    // スペース長押しチャージ
    if (this._spaceKey.isDown) {
      this._spaceCharging = true;
      this._power = Math.min(POWER_MAX, this._power + POWER_CHARGE_SPEED * dt);
    } else if (this._spaceCharging) {
      // スペースを離した → 発射
      this._spaceCharging = false;
      return this._doFire();
    }

    // タッチ長押しチャージ
    if (this._pointerCharging) {
      this._power = Math.min(POWER_MAX, this._power + POWER_CHARGE_SPEED * dt);
    }

    this._draw();
    return null;
  }

  // ---- ポインターイベント ----------------------------------------

  _onPointerDown(pointer) {
    if (!this._active) return;
    this._pointerCharging = true;
    this._chargeStartTime = this._scene.time.now;
    this._power = POWER_MIN;
    this._updateAngleFromPointer(pointer);
  }

  _onPointerMove(pointer) {
    if (!this._active) return;
    if (!pointer.isDown) return;
    this._updateAngleFromPointer(pointer);
  }

  _onPointerUp() {
    if (!this._active) return;
    if (!this._pointerCharging) return;
    this._pointerCharging = false;

    // 最低チャージ時間未満のクリックは発射しない
    if (this._scene.time.now - this._chargeStartTime < MIN_CHARGE_TIME) {
      this._power = POWER_MIN;
      return;
    }

    // update() の先頭で処理させるためフラグ
    this._pendingFire = true;
  }

  _updateAngleFromPointer(pointer) {
    const dx    = pointer.worldX - this._originX;
    const dy    = pointer.worldY - this._originY;
    const angle = Phaser.Math.RadToDeg(Math.atan2(-dy, dx));
    this._angle = Phaser.Math.Clamp(angle, ANGLE_MIN, ANGLE_MAX);
  }

  // ---- 発射 -------------------------------------------------------

  _doFire() {
    this._active          = false;
    this._spaceCharging   = false;
    this._pointerCharging = false;
    this._pendingFire     = false;
    this._gfx.clear();
    this._hintText.setVisible(false);

    soundManager.playSe('se_launch');

    const rad = Phaser.Math.DegToRad(this._angle);
    return {
      vx:  Math.cos(rad) * this._power,
      vy: -Math.sin(rad) * this._power,
    };
  }

  // ---- 描画 -------------------------------------------------------

  _draw() {
    this._gfx.clear();

    const ox      = this._originX;
    const oy      = this._originY;
    const rad     = Phaser.Math.DegToRad(this._angle);
    const gravity = this._scene.physics.world.gravity.y;

    // 放物線予測（点線）
    let x   = ox;
    let y   = oy;
    let dvx = Math.cos(rad)  * this._power / 60;
    let dvy = -Math.sin(rad) * this._power / 60;

    for (let i = 0; i < 20; i++) {
      x  += dvx;
      y  += dvy;
      dvy += gravity / 3600;

      if (i % 2 === 0) {
        const alpha = Math.max(0, 0.8 - i * 0.035);
        this._gfx.fillStyle(0xffffff, alpha);
        this._gfx.fillCircle(x, y, 3);
      }
    }

    // パワーゲージ（ボール右横）
    const ratio = (this._power - POWER_MIN) / (POWER_MAX - POWER_MIN);
    const barH  = 60;
    const barW  = 8;
    const bx    = ox + 25;
    const by    = oy - barH / 2;

    // 背景
    this._gfx.fillStyle(0x222222, 0.8);
    this._gfx.fillRect(bx, by, barW, barH);

    // 塗り
    const fillColor = ratio < 0.5 ? 0x00ff00 : ratio < 0.8 ? 0xffff00 : 0xff0000;
    this._gfx.fillStyle(fillColor, 1);
    this._gfx.fillRect(bx, by + barH * (1 - ratio), barW, barH * ratio);
  }

  destroy() {
    this._gfx.destroy();
    this._hintText.destroy();
  }
}
