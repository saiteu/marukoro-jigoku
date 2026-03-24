/**
 * シード付き乱数生成（xorshift32）
 * 同じシードなら同じ数列が再現できる
 */
export class RNG {
  constructor(seed) {
    this.seed = seed >>> 0; // 32bit符号なし整数に正規化
    if (this.seed === 0) this.seed = 1;
  }

  // 0〜1の浮動小数点乱数
  next() {
    let x = this.seed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x >>> 0;
    return (this.seed >>> 0) / 4294967296;
  }

  // min〜max（整数）の乱数
  nextInt(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  // min〜max（浮動小数点）の乱数
  nextFloat(min, max) {
    return this.next() * (max - min) + min;
  }

  // 確率チェック（0〜1）
  chance(probability) {
    return this.next() < probability;
  }

  // 配列からランダムに1つ選ぶ
  pick(array) {
    return array[this.nextInt(0, array.length - 1)];
  }
}

// タイムスタンプベースのランダムシード生成
export function generateSeed() {
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
}
