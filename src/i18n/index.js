import { ja } from './ja.js';
import { en } from './en.js';

const LANGS = { ja, en };

class I18n {
  constructor() {
    const browserLang = navigator.language.startsWith('ja') ? 'ja' : 'en';
    this.lang = localStorage.getItem('lang') || browserLang;
  }

  /** キーに対応するテキストを返す。{n} を値で置換できる */
  t(key, vars = {}) {
    let str = LANGS[this.lang]?.[key] ?? LANGS['ja'][key] ?? key;
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(`{${k}}`, v);
    }
    return str;
  }

  setLang(lang) {
    this.lang = lang;
    localStorage.setItem('lang', lang);
  }

  getTitles() {
    return LANGS[this.lang].titles;
  }

  getTitle(meters) {
    const titles = this.getTitles();
    let result = titles[0];
    for (const t of titles) {
      if (meters >= t.height) result = t;
    }
    return result;
  }
}

export const i18n = new I18n();
