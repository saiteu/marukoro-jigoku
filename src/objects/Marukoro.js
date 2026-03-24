/**
 * まるころ本体（Matter.js物理ボディ）
 */
import Phaser from 'phaser';
import { PHYSICS, COLORS } from '../config.js';
import { drawPlayer, FACE } from '../utils/DrawUtils.js';
import { soundManager } from '../systems/SoundManager.js';

const SQUASH_SPEED = 18;  // スケール補間速度

export class Marukoro {
  constructor(scene, x, y) {
    this._scene  = scene;
    this._radius = PHYSICS.radius;
    this._face   = FACE.NORMAL;

    this._scaleX    = 1;
    this._scaleY    = 1;
    this._tgtScaleX = 1;
    this._tgtScaleY = 1;

    this._launched  = false;
    this._landed    = false;
    this._restTimer = 0;  // 静止継続時間（秒）

    this._body = scene.matter.add.circle(x, y, this._radius, {
      restitution: PHYSICS.restitution,
      friction:    PHYSICS.friction,
      frictionAir: PHYSICS.frictionAir,
      label: 'marukoro',
      isStatic: true,
    });

    this._gfx = scene.add.graphics().setDepth(10);

    // バウンド検出用（直前のvy）
    this._prevVy = 0;
  }

  get x() { return this._body.position.x; }
  get y() { return this._body.position.y; }
  get launched() { return this._launched; }
  get landed()   { return this._landed; }

  /** 速度（px/s） */
  get speedPxPerSec() {
    const { x, y } = this._body.velocity;
    return Math.sqrt(x * x + y * y) * 60;
  }

  /** 速度ベクトル（px/s） */
  get velocity() {
    return { x: this._body.velocity.x * 60, y: this._body.velocity.y * 60 };
  }

  /** 発射 */
  launch(vx, vy) {
    this._scene.matter.body.setStatic(this._body, false);
    // Matter.js の速度は px/frame ではなく px/step — Phaser は 60fps 前提で秒速/60
    this._scene.matter.body.setVelocity(this._body, {
      x: vx / 60,
      y: vy / 60,
    });
    this._launched = true;
    this._face = FACE.JUMP;
    // 発射時：縦伸び
    this._tgtScaleX = 0.7;
    this._tgtScaleY = 1.5;
    soundManager.playSe('se_launch');
  }

  update(dt) {
    if (this._launched && !this._landed) {
      // NaN ガード：物理が壊れたら強制着地
      if (isNaN(this._body.position.x) || isNaN(this._body.position.y)) {
        this._landed = true;
        return;
      }
      this._capSpeed();
      this._updateSquash(dt);
      this._checkLanded(dt);
    }

    this._scaleX += (this._tgtScaleX - this._scaleX) * SQUASH_SPEED * dt;
    this._scaleY += (this._tgtScaleY - this._scaleY) * SQUASH_SPEED * dt;

    this._draw();

    const vy = this._body.velocity.y;
    // バウンド検出：vy が正→負に転じた（上向きに跳ね返った）
    if (this._launched && this._prevVy > 0.5 && vy < -0.3) {
      this._onBounce();
    }
    this._prevVy = vy;
  }

  _capSpeed() {
    const { x, y } = this._body.velocity;
    const speed = Math.sqrt(x * x + y * y);
    if (speed > PHYSICS.maxSpeed) {
      const s = PHYSICS.maxSpeed / speed;
      this._scene.matter.body.setVelocity(this._body, { x: x * s, y: y * s });
    }
  }

  _onBounce() {
    soundManager.playSe('se_bounce');
    this._tgtScaleX = 1.4;
    this._tgtScaleY = 0.6;
    this._restTimer = 0;
  }

  _updateSquash(dt) {
    const vx = this._body.velocity.x;
    const vy = this._body.velocity.y;
    const speed = Math.sqrt(vx * vx + vy * vy);

    if (speed > 2) {
      this._face = FACE.JUMP;
      // 速度方向に伸びる
      const angle = Math.atan2(vy, vx);
      const stretch = Math.min(0.4, speed * 0.03);
      const sx = 1 - stretch * Math.abs(Math.sin(angle));
      const sy = 1 + stretch * Math.abs(Math.cos(angle));
      this._tgtScaleX = sx;
      this._tgtScaleY = sy;
    } else {
      this._tgtScaleX = 1;
      this._tgtScaleY = 1;
    }
  }

  _checkLanded(dt) {
    const vx = this._body.velocity.x;
    const vy = this._body.velocity.y;
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed < 0.08) {
      this._restTimer += dt;
      if (this._restTimer > 0.8) {
        this._landed = true;
        this._face = FACE.TIRED;
        this._tgtScaleX = 1.3;
        this._tgtScaleY = 0.8;
        soundManager.playSe('se_land');
      }
    } else {
      this._restTimer = 0;
    }
  }

  _draw() {
    this._gfx.clear();
    drawPlayer(
      this._gfx, this.x, this.y, this._radius,
      this._face, this._scaleX, this._scaleY,
    );
  }

  destroy() {
    this._scene.matter.world.remove(this._body);
    this._gfx.destroy();
  }
}
