/**
 * 高度ベースのコース生成（チャンク管理）
 */
import { COURSE, COLORS, GAME_WIDTH, GAME_HEIGHT, LAUNCH } from '../config.js';
import { RNG } from '../utils/RNG.js';

// 左右の固定壁（画面端）
const INNER_LEFT  = 30;
const INNER_RIGHT = GAME_WIDTH - 30;

// 壁セグメント間隔（px）
const SEG_H = 80;

// チャンク0の底面 Y（= 発射台より少し下）
const CHUNK_ORIGIN_Y = LAUNCH.launchPadY + 20;

/**
 * 高度 meters → ゾーン定義
 */
export function getZone(meters) {
  for (const z of COURSE.zones) {
    if (meters >= z.minM && meters < z.maxM) return z;
  }
  return COURSE.zones[COURSE.zones.length - 1];
}

export class CourseGenerator {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} seed
   */
  constructor(scene, seed) {
    this._scene  = scene;
    this._seed   = seed >>> 0 || 1;
    this._chunks = new Map(); // chunkIndex → ChunkData

    // spring 接触コールバック（GameScene がセット）
    this.onSpring = null;
    this.onBounce = null;
  }

  /**
   * 毎フレーム呼ぶ。カメラ上端Y を渡してチャンクを生成・破棄
   * @param {number} cameraTopY  カメラ scrollY
   * @param {number} dt
   */
  update(cameraTopY, dt) {
    const topChunk = this._yToChunkIndex(cameraTopY - COURSE.chunkHeight * COURSE.preloadChunks);
    const botChunk = this._yToChunkIndex(cameraTopY + GAME_HEIGHT + COURSE.chunkHeight);

    for (let i = botChunk; i <= topChunk; i++) {
      if (i >= 0 && !this._chunks.has(i)) {
        this._generateChunk(i);
      }
    }

    // 画面下から遠く離れたチャンクを破棄
    for (const [idx] of this._chunks) {
      if (idx < botChunk - 2) this._destroyChunk(idx);
    }

    // moving platform 更新
    for (const [, chunk] of this._chunks) {
      for (const m of chunk.moving) {
        this._tickMoving(m, dt);
      }
    }
  }

  // ワールドY → チャンクインデックス（0 = 発射台直上）
  _yToChunkIndex(worldY) {
    return Math.max(0, Math.floor((CHUNK_ORIGIN_Y - worldY) / COURSE.chunkHeight));
  }

  // チャンク底面 ワールドY
  _chunkBottomY(idx) {
    return CHUNK_ORIGIN_Y - idx * COURSE.chunkHeight;
  }

  _generateChunk(idx) {
    const rng      = new RNG((this._seed + idx * 997) >>> 0);
    const bottomY  = this._chunkBottomY(idx);
    const baseMeter = Math.round((LAUNCH.launchPadY - bottomY) / COURSE.pxPerMeter);

    const staticGfx  = this._scene.add.graphics().setDepth(2);
    const bodies     = [];
    const moving     = [];

    const segs = Math.ceil(COURSE.chunkHeight / SEG_H);
    let prevGapX = GAME_WIDTH / 2;

    for (let s = 0; s < segs; s++) {
      // セグメント中央 Y（チャンク底面から上へ）
      const segY    = bottomY - (s + 0.5) * SEG_H;
      const segMeter = Math.round((LAUNCH.launchPadY - segY) / COURSE.pxPerMeter);
      if (segMeter < 5) continue;  // 発射台直近はスキップ

      const zone   = getZone(segMeter);
      const gapW   = rng.nextInt(zone.wallGap[0], zone.wallGap[1]);

      // ギャップ中心 X（スムーズに動く）
      const maxDrift = 70;
      prevGapX = Math.min(
        Math.max(
          prevGapX + rng.nextFloat(-maxDrift, maxDrift),
          INNER_LEFT + gapW / 2 + 4,
        ),
        INNER_RIGHT - gapW / 2 - 4,
      );
      const gapX = prevGapX;

      // 左壁セグメント
      const lw = gapX - gapW / 2 - INNER_LEFT;
      if (lw > 6) {
        const lx = INNER_LEFT + lw / 2;
        this._addWallRect(lx, segY, lw, zone.wallThick, 'wall', bodies, staticGfx, COLORS.WALL, COLORS.WALL_DARK);
      }

      // 右壁セグメント
      const rw = INNER_RIGHT - (gapX + gapW / 2);
      if (rw > 6) {
        const rx = INNER_RIGHT - rw / 2;
        this._addWallRect(rx, segY, rw, zone.wallThick, 'wall', bodies, staticGfx, COLORS.WALL, COLORS.WALL_DARK);
      }

      // ギミック配置
      if (zone.gimmicks.length > 0 && rng.chance(0.28)) {
        const type = rng.pick(zone.gimmicks);
        this._placeGimmick(type, gapX, segY - SEG_H * 0.45, gapW, rng, bodies, moving, staticGfx);
      }
    }

    this._chunks.set(idx, { bodies, moving, staticGfx });
  }

  _addWallRect(x, y, w, h, label, bodies, gfx, fillColor, strokeColor) {
    const body = this._scene.matter.add.rectangle(x, y, w, h, {
      isStatic: true, label,
      friction: 0.1, restitution: 0.2,
    });
    bodies.push(body);
    gfx.fillStyle(fillColor, 1);
    gfx.fillRect(x - w / 2, y - h / 2, w, h);
    gfx.lineStyle(2, strokeColor, 1);
    gfx.strokeRect(x - w / 2, y - h / 2, w, h);
  }

  _placeGimmick(type, gapX, y, gapW, rng, bodies, moving, staticGfx) {
    const scene = this._scene;
    const w     = Math.min(gapW * 0.55, 72);
    const h     = 14;
    const x     = gapX + rng.nextFloat(-gapW * 0.15, gapW * 0.15);

    switch (type) {
      case 'spring': {
        const body = scene.matter.add.rectangle(x, y, w, h, {
          isStatic: true, label: 'spring',
          restitution: 0.01, friction: 0.9,
        });
        bodies.push(body);
        // 本体
        staticGfx.fillStyle(COLORS.SPRING, 1);
        staticGfx.fillRect(x - w / 2, y - h / 2, w, h);
        // コイル装飾
        staticGfx.lineStyle(2, 0xcc5500, 1);
        const coils = 5;
        for (let i = 0; i < coils; i++) {
          const cx = x - w / 2 + (w / coils) * (i + 0.5);
          staticGfx.beginPath();
          staticGfx.moveTo(cx - w / coils / 2, y + h / 2);
          staticGfx.lineTo(cx,                  y - h / 4);
          staticGfx.lineTo(cx + w / coils / 2,  y + h / 2);
          staticGfx.strokePath();
        }
        break;
      }

      case 'bounce': {
        // 左右の壁際に貼り付くバウンス壁
        const side = rng.chance(0.5) ? 'left' : 'right';
        const bw   = 14;
        const bh   = 56;
        const bx   = side === 'left' ? INNER_LEFT + bw / 2 + 2 : INNER_RIGHT - bw / 2 - 2;
        const body = scene.matter.add.rectangle(bx, y, bw, bh, {
          isStatic: true, label: 'bounce',
          restitution: 1.4, friction: 0,
        });
        bodies.push(body);
        staticGfx.fillStyle(COLORS.BOUNCE, 1);
        staticGfx.fillRect(bx - bw / 2, y - bh / 2, bw, bh);
        // 反射矢印
        staticGfx.lineStyle(2, 0x0984e3, 1);
        staticGfx.strokeRect(bx - bw / 2, y - bh / 2, bw, bh);
        const dir = side === 'left' ? 1 : -1;
        staticGfx.fillStyle(0xffffff, 0.7);
        staticGfx.fillTriangle(
          bx + dir * bw * 0.2, y,
          bx - dir * bw * 0.3, y - bh * 0.2,
          bx - dir * bw * 0.3, y + bh * 0.2,
        );
        break;
      }

      case 'moving': {
        const gfx  = scene.add.graphics().setDepth(2);
        const body = scene.matter.add.rectangle(x, y, w, h, {
          isStatic: true, label: 'moving',
          restitution: 0.3, friction: 0.05,
        });
        bodies.push(body);
        const m = {
          body, gfx, w, h,
          centerX: x, y,
          range: gapW * 0.28,
          speed: 1.2 + rng.nextFloat(0, 0.8),
          phase: rng.nextFloat(0, Math.PI * 2),
          elapsed: 0,
        };
        moving.push(m);
        this._drawMoving(m);
        break;
      }

      case 'vanish': {
        // 踏むと消える足場（接触イベントで破棄）
        const body = scene.matter.add.rectangle(x, y, w, h, {
          isStatic: true, label: 'vanish',
          restitution: 0.2, friction: 0.5,
        });
        bodies.push(body);
        staticGfx.fillStyle(COLORS.VANISH, 1);
        staticGfx.fillRect(x - w / 2, y - h / 2, w, h);
        staticGfx.lineStyle(2, 0xd63577, 1);
        staticGfx.strokeRect(x - w / 2, y - h / 2, w, h);
        // 点滅表現（縦線）
        staticGfx.lineStyle(1, 0xffffff, 0.4);
        for (let i = 1; i < 4; i++) {
          const lx = x - w / 2 + (w / 4) * i;
          staticGfx.beginPath();
          staticGfx.moveTo(lx, y - h / 2);
          staticGfx.lineTo(lx, y + h / 2);
          staticGfx.strokePath();
        }
        break;
      }

      case 'warp': {
        // ワープゲート（接触で上方へ飛ぶ）
        const body = scene.matter.add.rectangle(x, y, w, h, {
          isStatic: true, label: 'warp',
          isSensor: true,  // センサー（貫通）
        });
        bodies.push(body);
        staticGfx.fillStyle(COLORS.WARP, 0.7);
        staticGfx.fillRect(x - w / 2, y - h / 2, w, h);
        staticGfx.lineStyle(2, 0x00b5b0, 1);
        staticGfx.strokeRect(x - w / 2, y - h / 2, w, h);
        // 中央 ★
        staticGfx.fillStyle(0xffffff, 0.9);
        // ダイヤ形（★の代替）
        staticGfx.fillTriangle(x, y - h * 0.4, x - h * 0.3, y, x + h * 0.3, y);
        staticGfx.fillTriangle(x, y + h * 0.4, x - h * 0.3, y, x + h * 0.3, y);
        break;
      }

      case 'gravity': {
        // 重力変化ゾーン（センサー）
        const bh2 = 50;
        const body = scene.matter.add.rectangle(x, y, gapW * 0.8, bh2, {
          isStatic: true, label: 'gravity',
          isSensor: true,
        });
        bodies.push(body);
        staticGfx.fillStyle(COLORS.GRAVITY, 0.35);
        staticGfx.fillRect(x - gapW * 0.4, y - bh2 / 2, gapW * 0.8, bh2);
        staticGfx.lineStyle(1, COLORS.GRAVITY, 0.6);
        staticGfx.strokeRect(x - gapW * 0.4, y - bh2 / 2, gapW * 0.8, bh2);
        break;
      }
    }
  }

  _tickMoving(m, dt) {
    m.elapsed += dt;
    const newX = m.centerX + Math.sin(m.elapsed * m.speed * Math.PI + m.phase) * m.range;
    this._scene.matter.body.setPosition(m.body, { x: newX, y: m.y });
    this._drawMoving(m, newX);
  }

  _drawMoving(m, overrideX) {
    const cx = overrideX !== undefined ? overrideX : m.centerX;
    m.gfx.clear();
    m.gfx.fillStyle(COLORS.MOVING, 1);
    m.gfx.fillRect(cx - m.w / 2, m.y - m.h / 2, m.w, m.h);
    m.gfx.lineStyle(2, 0x6c5ce7, 1);
    m.gfx.strokeRect(cx - m.w / 2, m.y - m.h / 2, m.w, m.h);
    // 矢印
    m.gfx.fillStyle(0xffffff, 0.6);
    m.gfx.fillTriangle(
      cx - 8, m.y, cx - 14, m.y - 4, cx - 14, m.y + 4,
    );
    m.gfx.fillTriangle(
      cx + 8, m.y, cx + 14, m.y - 4, cx + 14, m.y + 4,
    );
  }

  _destroyChunk(idx) {
    const chunk = this._chunks.get(idx);
    if (!chunk) return;
    for (const body of chunk.bodies) {
      try { this._scene.matter.world.remove(body); } catch {}
    }
    for (const m of chunk.moving) {
      try { this._scene.matter.world.remove(m.body); } catch {}
      m.gfx.destroy();
    }
    chunk.staticGfx.destroy();
    this._chunks.delete(idx);
  }

  destroy() {
    for (const [idx] of this._chunks) this._destroyChunk(idx);
  }
}
