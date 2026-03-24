/**
 * localStorageによるハイスコア保存
 */
const STORAGE_KEY = 'marukoro_jigoku_v2';

const DEFAULT_SAVE = {
  highScore: 0,   // 最高到達距離（m）
  playCount: 0,   // プレイ回数
  version: 2,
};

export class SaveManager {
  constructor() {
    this._data = this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SAVE };
      return { ...DEFAULT_SAVE, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_SAVE };
    }
  }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data));
    } catch (e) {
      console.warn('SaveManager: 保存失敗', e);
    }
  }

  getHighScore() {
    return this._data.highScore;
  }

  /** スコアを保存。更新された場合 true を返す */
  submitScore(meters) {
    this._data.playCount++;
    const isNew = meters > this._data.highScore;
    if (isNew) this._data.highScore = meters;
    this._save();
    return isNew;
  }

  getPlayCount() {
    return this._data.playCount;
  }

  reset() {
    this._data = { ...DEFAULT_SAVE };
    this._save();
  }
}

export const saveManager = new SaveManager();
