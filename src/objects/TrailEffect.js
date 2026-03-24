/**
 * まるころの飛行軌跡エフェクト
 * ステップ4で本実装
 */
import { COLORS } from '../config.js';

const TRAIL_MAX = 30;
const TRAIL_INTERVAL = 0.04; // 秒

export class TrailEffect {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this._scene = scene;
    this._points = [];
    this._timer = 0;
    this._gfx = scene.add.graphics();
    this._active = false;
  }

  start() { this._active = true; this._points = []; }
  stop()  { this._active = false; }

  /**
   * 毎フレーム呼ぶ
   * @param {number} x
   * @param {number} y
   * @param {number} dt
   */
  update(x, y, dt) {
    if (!this._active) return;

    this._timer += dt;
    if (this._timer >= TRAIL_INTERVAL) {
      this._timer = 0;
      this._points.push({ x, y, life: 1 });
      if (this._points.length > TRAIL_MAX) this._points.shift();
    }

    // 寿命を減らす
    for (const p of this._points) {
      p.life -= dt * 1.5;
    }
    this._points = this._points.filter(p => p.life > 0);

    this._draw();
  }

  _draw() {
    this._gfx.clear();
    for (let i = 0; i < this._points.length; i++) {
      const p = this._points[i];
      const r = 4 * p.life;
      this._gfx.fillStyle(COLORS.TRAIL, p.life * 0.6);
      this._gfx.fillCircle(p.x, p.y, r);
    }
  }

  destroy() {
    this._gfx.destroy();
  }
}
