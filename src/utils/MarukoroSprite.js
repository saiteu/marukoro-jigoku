/**
 * まるころ スプライトシート生成（スライム型リデザイン版）
 * 192×32px（6フレーム各32×32）をCanvas 2Dで描画し返す
 *
 * フレーム配置：
 *  0: 通常 (ニコニコ)
 *  1: 瞬き
 *  2: ジャンプ (縦伸び・嬉しい)
 *  3: 落下   (焦り顔・汗)
 *  4: 着地   (横潰れ)
 *  5: ダメージ (赤みがかり・×目)
 */

const FRAME_W = 32;

// ----------------------------------------------------------------
// 公開API
// ----------------------------------------------------------------
export function createMarukoroCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width  = FRAME_W * 6;
  canvas.height = FRAME_W;
  const ctx = canvas.getContext('2d');

  const frames = [
    { body: 'normal', face: 'normal' },
    { body: 'normal', face: 'blink'  },
    { body: 'jump',   face: 'jump'   },
    { body: 'fall',   face: 'fall'   },
    { body: 'land',   face: 'land'   },
    { body: 'damage', face: 'damage' },
  ];

  frames.forEach((frame, i) => {
    const offsetX = i * FRAME_W;
    // フレーム内にクリップして隣フレームへのはみ出しを防ぐ
    ctx.save();
    ctx.beginPath();
    ctx.rect(offsetX, 0, FRAME_W, FRAME_W);
    ctx.clip();

    _drawSlimeBody(ctx, offsetX, frame.body);
    _drawHighlight(ctx, offsetX);
    _drawCheeks(ctx, offsetX);
    _drawFace(ctx, offsetX, frame.face);

    ctx.restore();
  });

  return canvas;
}

// ----------------------------------------------------------------
// ボディ描画
// ----------------------------------------------------------------
function _drawSlimeBody(ctx, offsetX, type) {
  const cx = offsetX + 16;

  let top, bottom, side, cy;
  let lightColor, mainColor, shadowColor;

  switch (type) {
    case 'jump':
      // 縦に伸びた雫型
      top = 2; bottom = 31; side = 10; cy = 17;
      lightColor = '#A8E8F8'; mainColor = '#7DD8F0'; shadowColor = '#5ABCD8';
      break;
    case 'land':
      // 横に潰れた形
      top = 10; bottom = 28; side = 20; cy = 21;
      lightColor = '#A8E8F8'; mainColor = '#7DD8F0'; shadowColor = '#5ABCD8';
      break;
    case 'damage':
      // 赤みがかった色
      top = 4; bottom = 30; side = 14; cy = 17;
      lightColor = '#F8C8A8'; mainColor = '#F8A888'; shadowColor = '#D87858';
      break;
    default:
      // normal / blink
      top = 4; bottom = 30; side = 14; cy = 17;
      lightColor = '#A8E8F8'; mainColor = '#7DD8F0'; shadowColor = '#5ABCD8';
  }

  // 雫型パス
  ctx.beginPath();
  ctx.moveTo(cx, top);
  ctx.bezierCurveTo(cx + side, top,      cx + side, bottom - 2, cx, bottom);
  ctx.bezierCurveTo(cx - side, bottom - 2, cx - side, top,      cx, top);
  ctx.closePath();

  // ラジアルグラデーション（立体感）
  const grad = ctx.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, 16);
  grad.addColorStop(0,   lightColor);
  grad.addColorStop(0.5, mainColor);
  grad.addColorStop(1,   shadowColor);
  ctx.fillStyle = grad;
  ctx.fill();

  // 下部の影（同じパスに重ね塗り）
  const shadowGrad = ctx.createRadialGradient(cx, bottom - 2, 2, cx, bottom - 2, 12);
  const isDamage = type === 'damage';
  shadowGrad.addColorStop(0, isDamage ? 'rgba(180,80,50,0.4)' : 'rgba(70,150,180,0.4)');
  shadowGrad.addColorStop(1, isDamage ? 'rgba(180,80,50,0)'   : 'rgba(70,150,180,0)');
  ctx.fillStyle = shadowGrad;
  ctx.fill();
}

// ----------------------------------------------------------------
// ハイライト
// ----------------------------------------------------------------
function _drawHighlight(ctx, offsetX) {
  const cx = offsetX + 16;

  // 大きなハイライト（左上）
  ctx.beginPath();
  ctx.ellipse(cx - 5, 10, 5, 4, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fill();

  // 小さなハイライト
  ctx.beginPath();
  ctx.ellipse(cx - 2, 15, 2, 1.5, -0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fill();
}

// ----------------------------------------------------------------
// ほっぺ
// ----------------------------------------------------------------
function _drawCheeks(ctx, offsetX) {
  const cx = offsetX + 16;

  ctx.beginPath();
  ctx.ellipse(cx - 7, 20, 4, 3, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,182,193,0.5)';
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(cx + 7, 20, 4, 3, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,182,193,0.5)';
  ctx.fill();
}

// ----------------------------------------------------------------
// 表情ディスパッチャー
// ----------------------------------------------------------------
function _drawFace(ctx, offsetX, type) {
  switch (type) {
    case 'normal': _drawFaceNormal(ctx, offsetX); break;
    case 'blink':  _drawFaceBlink(ctx, offsetX);  break;
    case 'jump':   _drawFaceJump(ctx, offsetX);   break;
    case 'fall':   _drawFaceFall(ctx, offsetX);   break;
    case 'land':   _drawFaceLand(ctx, offsetX);   break;
    case 'damage': _drawFaceDamage(ctx, offsetX); break;
  }
}

// ----------------------------------------------------------------
// 各表情
// ----------------------------------------------------------------

/** フレーム0：通常（ニコニコ） */
function _drawFaceNormal(ctx, offsetX) {
  const cx = offsetX + 16;

  // 目
  ctx.beginPath();
  ctx.ellipse(cx - 5, 17, 2, 2.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#1A1A2E';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 5, 17, 2, 2.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#1A1A2E';
  ctx.fill();

  // 目のハイライト
  ctx.beginPath();
  ctx.ellipse(cx - 4, 16, 0.8, 0.8, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 6, 16, 0.8, 0.8, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fill();

  // 笑顔
  ctx.beginPath();
  ctx.arc(cx, 22, 4, 0.2, Math.PI - 0.2);
  ctx.strokeStyle = '#4A9AB5';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** フレーム1：瞬き */
function _drawFaceBlink(ctx, offsetX) {
  const cx = offsetX + 16;

  // 閉じた目（上向きアーチ）
  ctx.beginPath();
  ctx.moveTo(cx - 7, 17);
  ctx.quadraticCurveTo(cx - 5, 15, cx - 3, 17);
  ctx.strokeStyle = '#1A1A2E';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx + 3, 17);
  ctx.quadraticCurveTo(cx + 5, 15, cx + 7, 17);
  ctx.strokeStyle = '#1A1A2E';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 笑顔（通常と同じ）
  ctx.beginPath();
  ctx.arc(cx, 22, 4, 0.2, Math.PI - 0.2);
  ctx.strokeStyle = '#4A9AB5';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** フレーム2：ジャンプ（わーっと嬉しい） */
function _drawFaceJump(ctx, offsetX) {
  const cx = offsetX + 16;

  // キラキラした目（大きめ）
  ctx.beginPath();
  ctx.ellipse(cx - 5, 17, 2.5, 3, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#1A1A2E';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 5, 17, 2.5, 3, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#1A1A2E';
  ctx.fill();

  // 大きなハイライト
  ctx.beginPath();
  ctx.ellipse(cx - 4, 15.5, 1.2, 1.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 6, 15.5, 1.2, 1.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fill();

  // わーっと開いた口
  ctx.beginPath();
  ctx.arc(cx, 22, 4, 0, Math.PI);
  ctx.fillStyle = '#2A6A85';
  ctx.fill();
}

/** フレーム3：落下（焦り顔） */
function _drawFaceFall(ctx, offsetX) {
  const cx = offsetX + 16;

  // 下がった目
  ctx.beginPath();
  ctx.ellipse(cx - 5, 18, 2, 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#1A1A2E';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 5, 18, 2, 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#1A1A2E';
  ctx.fill();

  // への字口（逆弧）
  ctx.beginPath();
  ctx.arc(cx, 25, 3, Math.PI + 0.3, -0.3);
  ctx.strokeStyle = '#4A9AB5';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 焦り汗
  ctx.beginPath();
  ctx.ellipse(cx + 10, 12, 2, 3, 0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(100,200,240,0.7)';
  ctx.fill();
}

/** フレーム4：着地（横潰れ） */
function _drawFaceLand(ctx, offsetX) {
  const cx = offsetX + 16;
  const cy  = 20;

  // ギュッと閉じた目（斜め線）
  ctx.beginPath();
  ctx.moveTo(cx - 7, cy - 2);
  ctx.lineTo(cx - 3, cy - 4);
  ctx.strokeStyle = '#1A1A2E';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx + 3, cy - 4);
  ctx.lineTo(cx + 7, cy - 2);
  ctx.strokeStyle = '#1A1A2E';
  ctx.lineWidth = 2;
  ctx.stroke();

  // グワッと開いた口
  ctx.beginPath();
  ctx.ellipse(cx, cy + 3, 5, 3, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#2A6A85';
  ctx.fill();
}

/** フレーム5：ダメージ（×目・への字） */
function _drawFaceDamage(ctx, offsetX) {
  const cx = offsetX + 16;

  // ×目（左）
  ctx.beginPath();
  ctx.moveTo(cx - 7, 14); ctx.lineTo(cx - 3, 18);
  ctx.moveTo(cx - 3, 14); ctx.lineTo(cx - 7, 18);
  ctx.strokeStyle = '#1A1A2E';
  ctx.lineWidth = 2;
  ctx.stroke();

  // ×目（右）
  ctx.beginPath();
  ctx.moveTo(cx + 3, 14); ctx.lineTo(cx + 7, 18);
  ctx.moveTo(cx + 7, 14); ctx.lineTo(cx + 3, 18);
  ctx.strokeStyle = '#1A1A2E';
  ctx.lineWidth = 2;
  ctx.stroke();

  // への字口
  ctx.beginPath();
  ctx.arc(cx, 25, 3, Math.PI + 0.3, -0.3);
  ctx.strokeStyle = '#4A9AB5';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}
