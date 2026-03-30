/**
 * ゾーン定義（地上 → 大気圏 → 宇宙 → 八大地獄）
 *
 * bgImage: public/assets/backgrounds/ 以下のファイル名（拡張子なし）
 *   bg_sky       : 地上・対流圏（0-200m）
 *   bg_highsky   : 成層圏・中間圏・熱圏（200-500m）
 *   bg_space     : 外気圏・宇宙空間・外宇宙（500-800m）
 *   bg_gate      : 地獄の入口（800-900m）
 *   bg_hell      : 上位地獄・等活〜叫喚（900-1300m）
 *   bg_hell_deep : 深層地獄・大叫喚〜大焦熱（1300-1600m）
 *   bg_avici     : 阿鼻地獄（1600m+）
 */
export const HELL_ZONES = [
  {
    id: 'surface',
    name: { ja: '地上', en: 'Surface' },
    heightStart: 0,
    heightEnd: 100,
    bgColor: 0x87CEEB,
    platformColor: 0x7bc67e,
    bgImage: 'bg_sky',
  },
  {
    id: 'troposphere',
    name: { ja: '対流圏', en: 'Troposphere' },
    heightStart: 100,
    heightEnd: 200,
    bgColor: 0x6BA3C8,
    platformColor: 0x8BC4E8,
    bgImage: 'bg_sky',
  },
  {
    id: 'stratosphere',
    name: { ja: '成層圏', en: 'Stratosphere' },
    heightStart: 200,
    heightEnd: 300,
    bgColor: 0x3A6B9E,
    platformColor: 0x5A8BBE,
    bgImage: 'bg_highsky',
  },
  {
    id: 'mesosphere',
    name: { ja: '中間圏', en: 'Mesosphere' },
    heightStart: 300,
    heightEnd: 400,
    bgColor: 0x1A3A6E,
    platformColor: 0x2A4A8E,
    bgImage: 'bg_highsky',
  },
  {
    id: 'thermosphere',
    name: { ja: '熱圏', en: 'Thermosphere' },
    heightStart: 400,
    heightEnd: 500,
    bgColor: 0x0A1A3E,
    platformColor: 0x1A2A5E,
    bgImage: 'bg_highsky',
  },
  {
    id: 'exosphere',
    name: { ja: '外気圏', en: 'Exosphere' },
    heightStart: 500,
    heightEnd: 600,
    bgColor: 0x050D1F,
    platformColor: 0x0F1D3F,
    bgImage: 'bg_space',
  },
  {
    id: 'space',
    name: { ja: '宇宙空間', en: 'Outer Space' },
    heightStart: 600,
    heightEnd: 700,
    bgColor: 0x000008,
    platformColor: 0x1A1A2E,
    bgImage: 'bg_space',
  },
  {
    id: 'deepspace',
    name: { ja: '外宇宙', en: 'Deep Space' },
    heightStart: 700,
    heightEnd: 800,
    bgColor: 0x0D0015,
    platformColor: 0x1A0030,
    bgImage: 'bg_space',
  },
  {
    id: 'gate',
    name: { ja: '地獄の入口', en: 'Gates of Hell' },
    heightStart: 800,
    heightEnd: 900,
    bgColor: 0x2D1B4E,
    platformColor: 0x4A3570,
    bgImage: 'bg_gate',
  },
  {
    id: 'hell1',
    name: { ja: '等活地獄', en: 'Sanjiva Hell' },
    heightStart: 900,
    heightEnd: 1000,
    bgColor: 0x8B0000,
    platformColor: 0xA52020,
    bgImage: 'bg_hell',
  },
  {
    id: 'hell2',
    name: { ja: '黒縄地獄', en: 'Kalasutra Hell' },
    heightStart: 1000,
    heightEnd: 1100,
    bgColor: 0x1A1A1A,
    platformColor: 0x333333,
    bgImage: 'bg_hell',
  },
  {
    id: 'hell3',
    name: { ja: '衆合地獄', en: 'Samghata Hell' },
    heightStart: 1100,
    heightEnd: 1200,
    bgColor: 0x4A2800,
    platformColor: 0x6B3A00,
    bgImage: 'bg_hell',
  },
  {
    id: 'hell4',
    name: { ja: '叫喚地獄', en: 'Raurava Hell' },
    heightStart: 1200,
    heightEnd: 1300,
    bgColor: 0xCC4400,
    platformColor: 0xFF6600,
    bgImage: 'bg_hell',
  },
  {
    id: 'hell5',
    name: { ja: '大叫喚地獄', en: 'Maharaurava Hell' },
    heightStart: 1300,
    heightEnd: 1400,
    bgColor: 0xFF2200,
    platformColor: 0xCC0000,
    bgImage: 'bg_hell_deep',
  },
  {
    id: 'hell6',
    name: { ja: '灼熱地獄', en: 'Tapana Hell' },
    heightStart: 1400,
    heightEnd: 1500,
    bgColor: 0xFF4400,
    platformColor: 0xFF6633,
    bgImage: 'bg_hell_deep',
  },
  {
    id: 'hell7',
    name: { ja: '大焦熱地獄', en: 'Pratapana Hell' },
    heightStart: 1500,
    heightEnd: 1600,
    bgColor: 0xFF8800,
    platformColor: 0xFFAA00,
    bgImage: 'bg_avici',
  },
  {
    id: 'hell8',
    name: { ja: '阿鼻地獄', en: 'Avici Hell' },
    heightStart: 1600,
    heightEnd: 99999,
    bgColor: 0x000000,
    platformColor: 0x1A0000,
    bgImage: 'bg_avici',
  },
];

/**
 * 指定高度に対応するゾーンを返す。
 * @param {number} height 高度（メートル）
 * @returns {object} HELL_ZONES のエントリ
 */
export function getZoneByHeight(height) {
  for (let i = HELL_ZONES.length - 1; i >= 0; i--) {
    if (height >= HELL_ZONES[i].heightStart) {
      return HELL_ZONES[i];
    }
  }
  return HELL_ZONES[0];
}
