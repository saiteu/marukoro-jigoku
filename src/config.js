// ゲーム全体の定数・設定

export const GAME_WIDTH  = 480;
export const GAME_HEIGHT = 640;

// ---- カラーパレット ----
export const COLORS = {
  BG_SKY:    0xe8f4f8,  // 0m付近：水色（空）
  BG_HIGH:   0xd0b0e8,  // 200m付近：薄紫（高層）
  BG_HELL:   0x8b2020,  // 400m付近：暗い赤（地獄の入口）
  BG_DEEP:   0x1a0a0a,  // 500m以上：黒赤（深地獄）
  PLAYER:    0xffd93d,  // まるころ（黄）
  PLAYER_OUTLINE: 0xe6a800,
  WALL:      0x7bc67e,  // 通常壁（緑）
  WALL_DARK: 0x5aa85e,
  SPRING:    0xff9f43,  // バネ床（オレンジ）
  BOUNCE:    0x74b9ff,  // 跳ね返り壁（青）
  MOVING:    0xa29bfe,  // 移動壁（紫）
  VANISH:    0xfd79a8,  // 消える足場（ピンク）
  WARP:      0x00cec9,  // ワープ（シアン）
  GRAVITY:   0xfdcb6e,  // 重力変化ゾーン（金）
  LAUNCH_PAD: 0xff6b6b, // 発射台（赤）
  UI_TEXT:   0x2d3436,
  TRAIL:     0xffeaa7,  // 軌跡
};

export const CSS_COLORS = {
  PLAYER:   '#ffd93d',
  WALL:     '#7bc67e',
  UI_TEXT:  '#2d3436',
  WHITE:    '#ffffff',
  ORANGE:   '#ffb347',
  FLAME:    '#ff6348',
  YELLOW:   '#ffd93d',
};

// ---- 物理パラメータ ----
export const PHYSICS = {
  gravity:     0.15,   // Matter.js の gravity.y（低め：フワフワ飛行感）
  restitution: 0.55,   // まるころの反発係数
  friction:    0.05,   // 摩擦
  frictionAir: 0.008,  // 空気抵抗
  radius:      18,     // まるころの半径（px）
  maxSpeed:    28,     // 最大速度（px/step）：トンネリング防止
};

// ---- 発射パラメータ ----
export const LAUNCH = {
  angleMin:        10,   // 最小角度（度）
  angleMax:        170,  // 最大角度（度）
  angleSpeed:      90,   // ゲージ往復速度（度/秒）
  powerMax:        2000, // MAX時の初速（px/s）
  powerChargeTime: 1.5,  // 0→100%にかかる時間（秒）
  launchPadX:      GAME_WIDTH / 2,
  launchPadY:      GAME_HEIGHT - 60,
};

// ---- コース生成パラメータ ----
export const COURSE = {
  // 1mを何pxとして扱うか
  pxPerMeter: 8,

  // ゾーン定義（高度m基準）
  zones: [
    { minM:   0, maxM:  50,  name: 'チュートリアル', wallGap: [180, 220], wallThick: 24, gimmicks: [] },
    { minM:  50, maxM: 150,  name: '空の入口',       wallGap: [150, 200], wallThick: 20, gimmicks: ['spring', 'bounce'] },
    { minM: 150, maxM: 300,  name: '高層',           wallGap: [120, 180], wallThick: 18, gimmicks: ['spring', 'bounce', 'moving'] },
    { minM: 300, maxM: 500,  name: '地獄の入口',     wallGap: [100, 160], wallThick: 16, gimmicks: ['spring', 'bounce', 'moving', 'gravity', 'vanish'] },
    { minM: 500, maxM: 9999, name: '深地獄',         wallGap: [80,  140], wallThick: 14, gimmicks: ['spring', 'bounce', 'moving', 'gravity', 'vanish', 'warp'] },
  ],

  // コースの横幅（左右の壁の間の最小幅）
  minPassWidth: 60,

  // チャンク高さ（px）：この単位でコースを生成・破棄する
  chunkHeight: 400,
  // 何チャンク分を先読み生成するか
  preloadChunks: 3,
};

// ---- 称号テーブル ----
export const TITLES = [
  { height:    0, title: '地上をウロウロ',  emoji: '🐌' },
  { height:   50, title: '空への第一歩',    emoji: '🐥' },
  { height:  100, title: 'まだまだこれから', emoji: '🌱' },
  { height:  200, title: '雲の上まで来た',  emoji: '☁️' },
  { height:  350, title: '成層圏突破',      emoji: '🚀' },
  { height:  500, title: '地獄の入口に到達', emoji: '🔥' },
  { height:  700, title: '業火の中を進む',  emoji: '😈' },
  { height:  900, title: '奈落の底まで来た', emoji: '💀' },
  { height: 1000, title: '地獄旅行完結',    emoji: '👑' },
];

/** 高度に応じた称号オブジェクト { title, emoji } を返す */
export function getTitle(meters) {
  let current = TITLES[0];
  for (const t of TITLES) {
    if (meters >= t.height) current = t;
  }
  return current;
}

// ---- 背景グラデーション（高度→色） ----
export const BG_GRADIENT = [
  { m:   0, color: 0xe8f4f8 },  // 水色
  { m: 200, color: 0xc9a0e8 },  // 薄紫
  { m: 400, color: 0x7a1a1a },  // 暗い赤
  { m: 500, color: 0x1a0808 },  // 黒赤
];

export function getBgColor(meters) {
  const g = BG_GRADIENT;
  if (meters <= g[0].m) return g[0].color;
  if (meters >= g[g.length - 1].m) return g[g.length - 1].color;
  for (let i = 0; i < g.length - 1; i++) {
    if (meters >= g[i].m && meters < g[i + 1].m) {
      const t = (meters - g[i].m) / (g[i + 1].m - g[i].m);
      return lerpColor(g[i].color, g[i + 1].color, t);
    }
  }
  return g[0].color;
}

function lerpColor(a, b, t) {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bv = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bv;
}
