export const ja = {
  // タイトル画面
  titleLine1: 'まるころ',
  titleLine2: '地獄旅行',
  subtitle:   '〜どこまで飛べるか〜',
  btnStart:   'あそぶ',
  bestScore:  '🏆 最高記録',
  meters:     'm',

  // ゲーム画面
  checkpoint:    'CHECKPOINT!',
  returnToCP:    '📍 チェックポイントに戻る',
  gameOver:      'GAME OVER',
  deadZone:      '⚠ DEAD ZONE',
  returnToStart: 'やり直し！スタートへ戻る...',
  aimHint:       '←→: 角度   長押し: チャージ   離す: 発射',

  // リザルト画面
  newRecord:   '🏆 NEW RECORD! 🏆',
  retry:       '🔄 もう一度旅に出る',
  share:       '🐦 地獄を報告する',
  bestHeight:  '最高記録',
  livesLeft:   '残ライフ',
  noRetry:     'ノーリトライ！',
  retryLabel:  'リトライ：{n}回',

  // 称号（全ゾーン対応）
  titles: [
    { height:    0, title: '地上をウロウロ',           emoji: '🌱', comment: 'まだまだこれから！' },
    { height:  100, title: '対流圏に突入',             emoji: '☁️', comment: '雲の上まで来たよ' },
    { height:  200, title: '成層圏を突破',             emoji: '✈️', comment: '飛行機より高い！' },
    { height:  300, title: '中間圏へ到達',             emoji: '🌠', comment: '流れ星が見える…' },
    { height:  400, title: '熱圏でオーロラを見る',     emoji: '🌌', comment: 'きれい…怖い…' },
    { height:  500, title: '外気圏の果てへ',           emoji: '🛸', comment: 'もう地球が見えない' },
    { height:  600, title: '宇宙空間に飛び出した',     emoji: '🚀', comment: '無重力の世界へ' },
    { height:  700, title: '外宇宙の闇に消える',       emoji: '🌑', comment: 'ここは…どこだ？' },
    { height:  800, title: '地獄の入口に立つ',         emoji: '😰', comment: 'まだ引き返せる…' },
    { height:  900, title: '等活地獄に踏み込む',       emoji: '⚔️', comment: '後悔しても遅い' },
    { height: 1000, title: '黒縄地獄の縄に縛られる',   emoji: '🖤', comment: 'もう逃げられない' },
    { height: 1100, title: '衆合地獄で押し潰される',   emoji: '💢', comment: '息ができない…' },
    { height: 1200, title: '叫喚地獄で叫び続ける',     emoji: '😱', comment: '誰にも聞こえない' },
    { height: 1300, title: '大叫喚地獄の業火の中へ',   emoji: '🔥', comment: 'もう人間じゃない' },
    { height: 1400, title: '灼熱地獄で焼き尽くされる', emoji: '♨️', comment: '魂まで燃える' },
    { height: 1500, title: '大焦熱地獄の白熱の中に',   emoji: '😈', comment: '神すら諦めた場所' },
    { height: 1600, title: '阿鼻地獄に到達',           emoji: '👑', comment: '伝説になった' },
  ],
};
