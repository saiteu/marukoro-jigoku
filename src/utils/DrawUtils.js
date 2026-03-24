/**
 * まるころ描画ユーティリティ
 * Phaserのグラフィクスオブジェクトを使ってキャラ・足場を描画
 */
import { COLORS } from '../config.js';

// まるころの表情タイプ
export const FACE = {
  NORMAL: 'normal',
  JUMP: 'jump',
  DEAD: 'dead',
  CLEAR: 'clear',
  TIRED: 'tired',    // 死亡回数多め
  PANIC: 'panic',    // 死亡回数かなり多め
};

/**
 * まるころをCanvasにドット絵風に描画
 * @param {Phaser.GameObjects.Graphics} g
 * @param {number} x 中心X
 * @param {number} y 中心Y
 * @param {number} r 半径
 * @param {string} face 表情タイプ
 * @param {number} scaleX squash&stretch X倍率
 * @param {number} scaleY squash&stretch Y倍率
 */
export function drawPlayer(g, x, y, r, face = FACE.NORMAL, scaleX = 1, scaleY = 1) {
  const rx = r * scaleX;
  const ry = r * scaleY;

  // 本体（黄色の楕円）
  g.fillStyle(COLORS.PLAYER, 1);
  g.fillEllipse(x, y, rx * 2, ry * 2);

  // アウトライン
  g.lineStyle(2, COLORS.PLAYER_OUTLINE, 1);
  g.strokeEllipse(x, y, rx * 2, ry * 2);

  // 表情描画
  const eyeOffsetX = rx * 0.28;
  const eyeOffsetY = ry * -0.1;
  const eyeR = Math.max(1.5, rx * 0.12);

  if (face === FACE.DEAD) {
    // ×目
    drawXEye(g, x - eyeOffsetX, y + eyeOffsetY, eyeR);
    drawXEye(g, x + eyeOffsetX, y + eyeOffsetY, eyeR);
    // への字口
    g.lineStyle(2, 0x2d3436, 1);
    g.beginPath();
    g.moveTo(x - rx * 0.2, y + ry * 0.35);
    g.lineTo(x + rx * 0.2, y + ry * 0.25);
    g.strokePath();
  } else if (face === FACE.CLEAR) {
    // ハート目
    drawHeartEye(g, x - eyeOffsetX, y + eyeOffsetY, eyeR);
    drawHeartEye(g, x + eyeOffsetX, y + eyeOffsetY, eyeR);
    // 笑顔
    g.lineStyle(2, 0x2d3436, 1);
    g.beginPath();
    g.arc(x, y + ry * 0.2, rx * 0.25, 0, Math.PI);
    g.strokePath();
  } else if (face === FACE.JUMP) {
    // 目を細める
    g.fillStyle(0x2d3436, 1);
    g.fillRect(x - eyeOffsetX - eyeR, y + eyeOffsetY - eyeR * 0.4, eyeR * 2, eyeR * 0.8);
    g.fillRect(x + eyeOffsetX - eyeR, y + eyeOffsetY - eyeR * 0.4, eyeR * 2, eyeR * 0.8);
    // 口（頑張り顔）
    g.lineStyle(1.5, 0x2d3436, 1);
    g.beginPath();
    g.moveTo(x - rx * 0.15, y + ry * 0.3);
    g.lineTo(x + rx * 0.15, y + ry * 0.3);
    g.strokePath();
  } else if (face === FACE.TIRED) {
    // タレ目
    g.fillStyle(0x2d3436, 1);
    g.fillEllipse(x - eyeOffsetX, y + eyeOffsetY, eyeR * 2, eyeR * 1.2);
    g.fillEllipse(x + eyeOffsetX, y + eyeOffsetY, eyeR * 2, eyeR * 1.2);
    // 汗マーク
    g.fillStyle(0x74b9ff, 1);
    g.fillCircle(x + rx * 0.7, y - ry * 0.3, eyeR * 0.8);
    // への字口
    g.lineStyle(1.5, 0x2d3436, 1);
    g.beginPath();
    g.moveTo(x - rx * 0.2, y + ry * 0.3);
    g.lineTo(x - rx * 0.05, y + ry * 0.38);
    g.lineTo(x + rx * 0.2, y + ry * 0.32);
    g.strokePath();
  } else if (face === FACE.PANIC) {
    // 驚き目（縦長）
    g.fillStyle(0x2d3436, 1);
    g.fillEllipse(x - eyeOffsetX, y + eyeOffsetY, eyeR * 1.5, eyeR * 2.5);
    g.fillEllipse(x + eyeOffsetX, y + eyeOffsetY, eyeR * 1.5, eyeR * 2.5);
    // 白目
    g.fillStyle(0xffffff, 1);
    g.fillCircle(x - eyeOffsetX, y + eyeOffsetY - eyeR * 0.3, eyeR * 0.5);
    g.fillCircle(x + eyeOffsetX, y + eyeOffsetY - eyeR * 0.3, eyeR * 0.5);
    // 叫び口
    g.fillStyle(0x2d3436, 1);
    g.fillEllipse(x, y + ry * 0.35, rx * 0.35, ry * 0.3);
  } else {
    // 通常（真ん丸目）
    g.fillStyle(0x2d3436, 1);
    g.fillCircle(x - eyeOffsetX, y + eyeOffsetY, eyeR);
    g.fillCircle(x + eyeOffsetX, y + eyeOffsetY, eyeR);
    // ハイライト
    g.fillStyle(0xffffff, 1);
    g.fillCircle(x - eyeOffsetX + eyeR * 0.4, y + eyeOffsetY - eyeR * 0.4, eyeR * 0.4);
    g.fillCircle(x + eyeOffsetX + eyeR * 0.4, y + eyeOffsetY - eyeR * 0.4, eyeR * 0.4);
    // 笑顔
    g.lineStyle(1.5, 0x2d3436, 1);
    g.beginPath();
    g.arc(x, y + ry * 0.15, rx * 0.22, 0.2, Math.PI - 0.2);
    g.strokePath();
  }
}

function drawXEye(g, cx, cy, r) {
  g.lineStyle(2, 0x2d3436, 1);
  g.beginPath();
  g.moveTo(cx - r, cy - r);
  g.lineTo(cx + r, cy + r);
  g.strokePath();
  g.beginPath();
  g.moveTo(cx + r, cy - r);
  g.lineTo(cx - r, cy + r);
  g.strokePath();
}

function drawHeartEye(g, cx, cy, r) {
  g.fillStyle(0xe84393, 1);
  // シンプルな菱形でハート近似
  g.fillTriangle(
    cx, cy + r * 1.2,
    cx - r * 1.2, cy - r * 0.3,
    cx + r * 1.2, cy - r * 0.3
  );
  g.fillCircle(cx - r * 0.5, cy - r * 0.5, r * 0.7);
  g.fillCircle(cx + r * 0.5, cy - r * 0.5, r * 0.7);
}

/**
 * 死亡時の星パーティクル用データを返す
 */
export function createDeathParticles(x, y, count = 8) {
  const particles = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const speed = 80 + Math.random() * 120;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 60,
      life: 1.0,
      color: [0xffd93d, 0xff6b6b, 0x74b9ff, 0xa29bfe][i % 4],
      size: 3 + Math.random() * 3,
    });
  }
  return particles;
}
