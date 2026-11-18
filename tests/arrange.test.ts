import { describe, expect, it } from 'vitest';
import { arrangeQuestion, arrangeTiles } from '../src/lib/arrange';
import { mulberry32 } from '../src/lib/rng';
import type { AssocQuestion, KanjiQuestion } from '../src/types';
import { sampleSet } from './fixtures';

const sorted = (xs: readonly string[]) => [...xs].sort();
const set = sampleSet();
const kanji = set.questions[0] as KanjiQuestion; // 砂浜 / 砂浜石山
const assoc = set.questions[1] as AssocQuestion; // くじら が先頭

describe('タップする場所の並べ替え', () => {
  it('漢字のタイルは同じ文字のまま並びだけ変わる', () => {
    const out = arrangeQuestion(kanji, mulberry32(1)) as KanjiQuestion;
    expect(sorted(out.tiles)).toEqual(sorted(kanji.tiles));
    expect(out.answer).toBe(kanji.answer);
  });

  it('元の問題データは書き換えない', () => {
    const before = [...assoc.choices];
    arrangeQuestion(assoc, mulberry32(3));
    expect(assoc.choices).toEqual(before);
  });

  it('同じ種なら同じ並びになる（途中から再開しても変わらない）', () => {
    const a = arrangeQuestion(assoc, mulberry32(42)) as AssocQuestion;
    const b = arrangeQuestion(assoc, mulberry32(42)) as AssocQuestion;
    expect(a.choices).toEqual(b.choices);
  });

  it('正解の選択肢が毎回1番上には来ない', () => {
    const positions = new Set<number>();
    for (let seed = 1; seed <= 40; seed += 1) {
      const out = arrangeQuestion(assoc, mulberry32(seed)) as AssocQuestion;
      positions.add(out.choices.indexOf(assoc.answer));
    }
    expect(positions.size).toBe(4);
  });

  it('正解の文字が、正しい順で隣どうしに並ばない', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const out = arrangeTiles(['砂', '浜', '石', '山'], '砂浜', mulberry32(seed));
      expect(out.join('')).not.toContain('砂浜');
    }
  });

  it('どう並べても答えが隣どうしになってしまう場合は、そのまま並べ替えた結果を返す', () => {
    const out = arrangeTiles(['う', 'み'], 'うみ', mulberry32(5));
    expect(sorted(out)).toEqual(['う', 'み']);
  });
});
