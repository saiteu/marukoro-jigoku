/**
 * 角度＋パワー発射コントローラー
 */
import { LAUNCH, GAME_WIDTH, GAME_HEIGHT, CSS_COLORS } from '../config.js';
import { soundManager } from '../systems/SoundManager.js';

const PAD_X  = LAUNCH.launchPadX;
const PAD_Y  = LAUNCH.launchPadY;
const ARROW_LEN = 80;

export class LaunchController {
  constructor(scene) {
    this._scene    = scene;
    this._phase    = 'angle';   // 'angle' | 'power' | 'done'
    this._angle    = 90;
    this._power    = 0;
    this._angleDir = 1;
    this._powerDir = 1;
    this._active   = false;
    this._result   = null;

    this._gfx  = scene.add.graphics().setDepth(20).setScrollFactor(0);
    this._uiGfx = scene.add.graphics().setDepth(20).setScrollFactor(0);

    // ヒントテキスト
    this._hintText = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 24,
      'タップ / SPACE で角度を決める', {
        fontFamily: "'Press Start 2P'",
        fontSize: '8px',
        color: CSS_COLORS.WHITE,
      }
    ).setOrigin(0.5, 1).setDepth(21).setScrollFactor(0);
  }

  start() {
    this._phase    = 'angle';
    this._angle    = 90;
    this._power    = 0;
    this._angleDir = 1;
    this._powerDir = 1;
    this._active   = true;
    this._result   = null;
    this._hintText.setVisible(true);
  }

  /**
   * タップ / スペースで各フェーズを確定
   * @returns {{ vx, vy } | null}
   */
  confirm() {
    if (!this._active) return null;
    if (this._phase === 'angle') {
      this._phase = 'power';
      soundManager.playSe('se_select');
      this._hintText.setText('タップ / SPACE でパワーを決める');
      return null;
    }
    if (this._phase === 'power') {
      this._phase  = 'done';
      this._active = false;
      this._result = this._calcVelocity();
      this._gfx.clear();
      this._uiGfx.clear();
      this._hintText.setVisible(false);
      return this._result;
    }
    return null;
  }

  update(dt) {
    if (!this._active) return;

    if (this._phase === 'angle') {
      this._angle += this._angleDir * LAUNCH.angleSpeed * dt;
      if (this._angle >= LAUNCH.angleMax) { this._angle = LAUNCH.angleMax; this._angleDir = -1; }
      if (this._angle <= LAUNCH.angleMin) { this._angle = LAUNCH.angleMin; this._angleDir =  1; }
      // チャージSEを断続的に
      if (Math.random() < 0.08) soundManager.playSe('se_charge');
    }

    if (this._phase === 'power') {
      this._power += this._powerDir * dt / LAUNCH.powerChargeTime;
      if (this._power >= 1) { this._power = 1; this._powerDir = -1; }
      if (this._power <= 0) { this._power = 0; this._powerDir =  1; }
      soundManager.playSe('se_charge');
    }

    this._draw();
  }

  _calcVelocity() {
    const speed = this._power * LAUNCH.powerMax;
    const rad   = (this._angle * Math.PI) / 180;
    return {
      vx:  Math.cos(rad) * speed,
      vy: -Math.sin(rad) * speed,   // 上向き = 負
    };
  }

  _draw() {
    this._gfx.clear();
    this._uiGfx.clear();

    // 発射台から伸びる矢印
    const rad = (this._angle * Math.PI) / 180;
    const ax  = PAD_X + Math.cos(rad) * ARROW_LEN;
    const ay  = (GAME_HEIGHT - 60) - Math.sin(rad) * ARROW_LEN;  // 画面座標（scroll factor 0）

    const bright = this._phase === 'power'
      ? `rgba(255,${Math.round(80 + this._power * 175)},0,1)`
      : '#ffffff';

    this._gfx.lineStyle(3, this._phase === 'power' ? 0xff6b00 : 0xffffff, 1);
    this._gfx.beginPath();
    this._gfx.moveTo(PAD_X, GAME_HEIGHT - 60);
    this._gfx.lineTo(ax, ay);
    this._gfx.strokePath();

    // 矢尻
    const headLen = 10;
    const headAngle = 0.4;
    this._gfx.lineStyle(3, this._phase === 'power' ? 0xff6b00 : 0xffffff, 1);
    this._gfx.beginPath();
    this._gfx.moveTo(ax, ay);
    this._gfx.lineTo(
      ax - headLen * Math.cos(rad - headAngle),
      ay + headLen * Math.sin(rad - headAngle),
    );
    this._gfx.strokePath();
    this._gfx.beginPath();
    this._gfx.moveTo(ax, ay);
    this._gfx.lineTo(
      ax - headLen * Math.cos(rad + headAngle),
      ay + headLen * Math.sin(rad + headAngle),
    );
    this._gfx.strokePath();

    // パワーゲージ（フェーズ2のみ）
    if (this._phase === 'power') {
      const gx = GAME_WIDTH - 40;
      const gy = GAME_HEIGHT - 140;
      const gh = 120;
      const gw = 20;

      // 外枠
      this._uiGfx.lineStyle(2, 0xffffff, 0.8);
      this._uiGfx.strokeRect(gx - gw / 2, gy, gw, gh);

      // 塗り（下から上）
      const fillH = gh * this._power;
      const fillColor = this._power > 0.8 ? 0xff4444
        : this._power > 0.5 ? 0xffaa00
        : 0x44ff88;
      this._uiGfx.fillStyle(fillColor, 1);
      this._uiGfx.fillRect(gx - gw / 2, gy + gh - fillH, gw, fillH);

      // POWER ラベル
      // （テキストオブジェクトは毎フレーム生成しないため static テキストで代用済み）
    }
  }

  destroy() {
    this._gfx.destroy();
    this._uiGfx.destroy();
    this._hintText.destroy();
  }
}
