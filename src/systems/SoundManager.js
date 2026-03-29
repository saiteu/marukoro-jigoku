/**
 * サウンド管理
 * 実ファイル（ogg/wav/mp3）があればそれを再生、なければWeb Audio APIで生成
 * BGM: .ogg → .mp3 の順で試みる
 * SE:  .wav → .mp3 の順で試みる
 */

export class SoundManager {
  constructor() {
    this._ctx          = null;
    this._bgmSource    = null;
    this._bgmGain      = null;
    this._seGain       = null;
    this._bgmVolume    = 0.5;
    this._seVolume     = 0.7;
    this._enabled      = true;
    this._currentBgm   = null;
    this._unlocked     = false;
    this._bufferCache  = {};   // URL → AudioBuffer キャッシュ
    this._bgmLoopId    = null;
  }

  // ユーザーインタラクション後に呼ぶ（自動再生ポリシー対策）
  async unlock() {
    if (this._unlocked) return;
    try {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();

      this._bgmGain = this._ctx.createGain();
      this._bgmGain.gain.value = this._bgmVolume;
      this._bgmGain.connect(this._ctx.destination);

      this._seGain = this._ctx.createGain();
      this._seGain.gain.value = this._seVolume;
      this._seGain.connect(this._ctx.destination);

      if (this._ctx.state === 'suspended') await this._ctx.resume();
      this._unlocked = true;
    } catch (e) {
      console.warn('SoundManager: AudioContext初期化失敗', e);
    }
  }

  setEnabled(enabled) {
    this._enabled = enabled;
    if (this._bgmGain) this._bgmGain.gain.value = enabled ? this._bgmVolume : 0;
    if (this._seGain)  this._seGain.gain.value  = enabled ? this._seVolume  : 0;
  }

  isEnabled() { return this._enabled; }

  // ------------------------------------------------------------------
  // BGM 再生（loop=trueでループ、falseで1回再生）
  // ------------------------------------------------------------------
  async playBgm(key, loop = true) {
    if (!this._unlocked) return;
    if (this._currentBgm === key) return;
    this.stopBgm();
    this._currentBgm = key;

    if (!this._enabled) return;

    // .ogg → .mp3 の順で試みる
    for (const ext of ['.ogg', '.mp3']) {
      const buffer = await this._loadAudioFile(`/assets/sounds/${key}${ext}`);
      if (buffer) {
        this._playBuffer(buffer, loop, this._bgmGain);
        return;
      }
    }
    // ファイルなし → 生成音
    this._playGeneratedBgm(key, loop);
  }

  stopBgm() {
    if (this._bgmLoopId) { clearTimeout(this._bgmLoopId); this._bgmLoopId = null; }
    if (this._bgmSource) {
      try { this._bgmSource.stop(); } catch {}
      this._bgmSource = null;
    }
    this._currentBgm = null;
  }

  // ------------------------------------------------------------------
  // SE 再生
  // ------------------------------------------------------------------
  async playSe(key) {
    if (!this._unlocked || !this._enabled) return;

    // .wav → .mp3 の順で試みる
    for (const ext of ['.wav', '.mp3']) {
      const buffer = await this._loadAudioFile(`/assets/sounds/${key}${ext}`);
      if (buffer) {
        this._playBuffer(buffer, false, this._seGain);
        return;
      }
    }
    // ファイルなし → 生成音
    this._playGeneratedSe(key);
  }

  // ------------------------------------------------------------------
  // 内部: ファイルロード（キャッシュ付き）
  // ------------------------------------------------------------------
  async _loadAudioFile(url) {
    if (this._bufferCache[url] !== undefined) return this._bufferCache[url];
    try {
      const res = await fetch(url);
      if (!res.ok) { this._bufferCache[url] = null; return null; }
      const ab = await res.arrayBuffer();
      const buf = await this._ctx.decodeAudioData(ab);
      this._bufferCache[url] = buf;
      return buf;
    } catch {
      this._bufferCache[url] = null;
      return null;
    }
  }

  _playBuffer(buffer, loop, gainNode) {
    const source = this._ctx.createBufferSource();
    source.buffer = buffer;
    source.loop   = loop;
    source.connect(gainNode);
    source.start();
    if (loop) this._bgmSource = source;
    return source;
  }

  // ------------------------------------------------------------------
  // Web Audio API フォールバック音源生成
  // ------------------------------------------------------------------
  _playGeneratedBgm(key, loop = true) {
    if (!this._ctx) return;
    const melodies = {
      bgm_title: [
        [523, 0.2], [659, 0.2], [784, 0.2], [1047, 0.4],
        [784, 0.2], [659, 0.2], [523, 0.4], [0, 0.2],
        [440, 0.2], [523, 0.2], [659, 0.4], [523, 0.2],
        [440, 0.2], [392, 0.4], [0, 0.4],
      ],
      bgm_game: [
        [330, 0.1], [392, 0.1], [494, 0.1], [587, 0.2],
        [494, 0.1], [440, 0.1], [392, 0.2], [0, 0.1],
        [330, 0.1], [294, 0.1], [330, 0.2], [0, 0.1],
        [440, 0.15], [494, 0.15], [587, 0.3], [0, 0.2],
      ],
      bgm_result: [
        [523, 0.15], [659, 0.15], [784, 0.15], [1047, 0.4],
        [880, 0.15], [784, 0.15], [659, 0.4], [0, 0.2],
        [784, 0.15], [880, 0.15], [1047, 0.4], [880, 0.15],
        [784, 0.15], [659, 0.6], [0, 0.3],
      ],
    };
    const melody = melodies[key] || melodies.bgm_game;
    const totalDuration = melody.reduce((s, [, d]) => s + d, 0);
    const play = () => {
      if (this._currentBgm !== key) return;
      let t = this._ctx.currentTime;
      for (const [freq, dur] of melody) {
        if (freq > 0) this._beep(freq, dur * 0.85, t, this._bgmGain, 'square', 0.08);
        t += dur;
      }
      if (loop) {
        this._bgmLoopId = setTimeout(play, totalDuration * 1000 - 50);
      }
    };
    play();
  }

  _playGeneratedSe(key) {
    if (!this._ctx) return;
    const t = this._ctx.currentTime;
    const g = this._seGain;
    switch (key) {
      case 'se_launch':
        this._beep(80,  0.06, t,        g, 'sawtooth', 0.5);
        this._beep(160, 0.06, t + 0.04, g, 'sawtooth', 0.45);
        this._beep(320, 0.08, t + 0.08, g, 'sawtooth', 0.4);
        this._noise(0.12, t, g, 0.3);
        break;
      case 'se_bounce':
        this._beep(220, 0.03, t,        g, 'square', 0.35);
        this._beep(330, 0.04, t + 0.02, g, 'square', 0.25);
        this._noise(0.04, t, g, 0.2);
        break;
      case 'se_land':
        this._noise(0.12, t, g, 0.35);
        this._beep(110, 0.1, t, g, 'sawtooth', 0.3);
        break;
      case 'se_checkpoint':
        [523, 659, 784, 1047].forEach((f, i) => {
          this._beep(f, 0.1, t + i * 0.08, g, 'square', 0.25);
        });
        break;
      case 'se_retry':
        this._beep(440, 0.06, t,        g, 'square', 0.25);
        this._beep(330, 0.06, t + 0.07, g, 'square', 0.25);
        this._beep(220, 0.1,  t + 0.14, g, 'square', 0.3);
        break;
      case 'se_select':
        this._beep(660, 0.05, t,        g, 'square', 0.2);
        this._beep(880, 0.05, t + 0.05, g, 'square', 0.2);
        break;
      case 'se_record':
        [523, 659, 784, 1047, 1319].forEach((f, i) => {
          this._beep(f, 0.12, t + i * 0.09, g, 'square', 0.28);
        });
        break;
      case 'se_charge':
        this._beep(440 + Math.random() * 200, 0.04, t, g, 'square', 0.15);
        break;
      case 'se_start':
        [330, 392, 494, 659].forEach((f, i) => {
          this._beep(f, 0.08, t + i * 0.07, g, 'square', 0.28);
        });
        break;
      default:
        this._beep(440, 0.05, t, g, 'square', 0.2);
    }
  }

  _beep(freq, dur, startTime, gainNode, type = 'square', volume = 0.3) {
    const osc = this._ctx.createOscillator();
    const env = this._ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(volume, startTime);
    env.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
    osc.connect(env);
    env.connect(gainNode);
    osc.start(startTime);
    osc.stop(startTime + dur + 0.01);
  }

  _noise(dur, startTime, gainNode, volume = 0.2) {
    const bufSize = Math.floor(this._ctx.sampleRate * dur);
    const buf  = this._ctx.createBuffer(1, bufSize, this._ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * volume;
    const src = this._ctx.createBufferSource();
    src.buffer = buf;
    const env = this._ctx.createGain();
    env.gain.setValueAtTime(volume, startTime);
    env.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
    src.connect(env);
    env.connect(gainNode);
    src.start(startTime);
  }
}

export const soundManager = new SoundManager();
