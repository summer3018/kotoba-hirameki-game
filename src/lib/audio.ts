/**
 * 効果音。音声ファイルは使わず Web Audio API で波形を合成する。
 * （著作権の心配がなく、読み込み待ちも発生しない）
 *
 * ブラウザの自動再生制限に従い、AudioContext は
 * 「最初のタップ／クリック」が起きるまで作らない。
 */

export type SfxName = 'tap' | 'correct' | 'incorrect' | 'clear' | 'finale';

interface Tone {
  freq: number;
  /** 開始からの遅れ（秒） */
  at: number;
  /** 長さ（秒） */
  dur: number;
  type: OscillatorType;
  gain: number;
}

const PATTERNS: Record<SfxName, Tone[]> = {
  // ボタン操作音：短くて主張しない
  tap: [{ freq: 660, at: 0, dur: 0.06, type: 'sine', gain: 0.16 }],
  // 正解音：上がっていく3音で「ひらめいた」感じ
  correct: [
    { freq: 784, at: 0, dur: 0.1, type: 'sine', gain: 0.2 },
    { freq: 988, at: 0.08, dur: 0.1, type: 'sine', gain: 0.2 },
    { freq: 1319, at: 0.16, dur: 0.22, type: 'sine', gain: 0.18 },
  ],
  // 不正解音：下がるが、きつくならないよう三角波でやわらかく
  incorrect: [
    { freq: 392, at: 0, dur: 0.12, type: 'triangle', gain: 0.16 },
    { freq: 330, at: 0.1, dur: 0.18, type: 'triangle', gain: 0.14 },
  ],
  // 5問クリア音：短いファンファーレ
  clear: [
    { freq: 523, at: 0, dur: 0.12, type: 'sine', gain: 0.18 },
    { freq: 659, at: 0.1, dur: 0.12, type: 'sine', gain: 0.18 },
    { freq: 784, at: 0.2, dur: 0.14, type: 'sine', gain: 0.18 },
    { freq: 1047, at: 0.33, dur: 0.34, type: 'sine', gain: 0.2 },
  ],
  // 5問目の正解音：かけ上がる音のあとに和音を重ねて、いちばん大きな「わかった！」に
  finale: [
    { freq: 523, at: 0, dur: 0.08, type: 'sine', gain: 0.16 },
    { freq: 659, at: 0.06, dur: 0.08, type: 'sine', gain: 0.16 },
    { freq: 784, at: 0.12, dur: 0.08, type: 'sine', gain: 0.16 },
    { freq: 1047, at: 0.18, dur: 0.1, type: 'sine', gain: 0.18 },
    { freq: 1319, at: 0.24, dur: 0.1, type: 'sine', gain: 0.18 },
    { freq: 1047, at: 0.36, dur: 0.6, type: 'triangle', gain: 0.16 },
    { freq: 1319, at: 0.36, dur: 0.6, type: 'sine', gain: 0.12 },
    { freq: 1568, at: 0.36, dur: 0.7, type: 'sine', gain: 0.12 },
  ],
};

type AudioCtor = typeof AudioContext;

function getCtor(): AudioCtor | null {
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private enabled: boolean;
  private unsupported = false;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    if (value) void this.unlock();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** ユーザー操作の中から呼ぶこと。自動再生制限を越えるための解錠。 */
  async unlock(): Promise<void> {
    if (this.unsupported) return;
    if (!this.ctx) {
      const Ctor = getCtor();
      if (!Ctor) {
        this.unsupported = true;
        return;
      }
      try {
        this.ctx = new Ctor();
      } catch {
        this.unsupported = true;
        return;
      }
    }
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        /* 解錠できなければ無音のまま進める */
      }
    }
  }

  play(name: SfxName): void {
    if (!this.enabled || this.unsupported) return;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') {
      // まだ解錠されていない場合は解錠だけ試み、今回は鳴らさない
      void this.unlock();
      return;
    }
    const now = ctx.currentTime;
    for (const tone of PATTERNS[name]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone.type;
      osc.frequency.setValueAtTime(tone.freq, now + tone.at);
      // 耳に痛くならないよう、立ち上がりと余韻をなめらかに
      gain.gain.setValueAtTime(0.0001, now + tone.at);
      gain.gain.exponentialRampToValueAtTime(tone.gain, now + tone.at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.at + tone.dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + tone.at);
      osc.stop(now + tone.at + tone.dur + 0.02);
    }
  }
}
