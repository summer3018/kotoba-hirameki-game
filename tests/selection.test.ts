import { describe, expect, it } from 'vitest';
import { ALL_QUESTIONS } from '../src/data';
import { dateKey, mulberry32 } from '../src/lib/rng';
import {
  daysBetween,
  pickDailySet,
  pickPracticeSet,
  pickThemeSet,
  SET_SIZE,
  THEME_EPOCH,
  updateRecent,
} from '../src/lib/selection';
import { sampleSet } from './fixtures';

const ids = (qs: { id: string }[]): string[] => qs.map((q) => q.id);

describe('今日の5問', () => {
  it('同じ日付なら何度選んでも同じ問題・同じ順番になる', () => {
    const a = pickDailySet(ALL_QUESTIONS, '2026-11-17');
    const b = pickDailySet(ALL_QUESTIONS, '2026-11-17');
    expect(ids(a)).toEqual(ids(b));
  });

  it('日付が変われば別の組み合わせになる', () => {
    const a = ids(pickDailySet(ALL_QUESTIONS, '2026-11-17'));
    const b = ids(pickDailySet(ALL_QUESTIONS, '2026-11-18'));
    expect(a).not.toEqual(b);
  });

  it('必ず5問そろう', () => {
    for (const d of ['2026-01-01', '2026-06-15', '2027-03-03']) {
      expect(pickDailySet(ALL_QUESTIONS, d)).toHaveLength(SET_SIZE);
    }
  });

  it('1セットの中で同じ問題が重複しない', () => {
    for (let i = 1; i <= 60; i += 1) {
      const key = `2026-12-${String(i % 28 || 1).padStart(2, '0')}`;
      const set = ids(pickDailySet(ALL_QUESTIONS, key));
      expect(new Set(set).size).toBe(set.length);
    }
  });

  it('3形式がどれも入る（偏りすぎない）', () => {
    for (let i = 0; i < 40; i += 1) {
      const set = pickDailySet(ALL_QUESTIONS, `test-${i}`);
      const types = new Set(set.map((q) => q.type));
      expect(types.size).toBe(3);
    }
  });

  it('1年分どの日でも必ず5問返る', () => {
    const start = new Date(2026, 0, 1);
    for (let i = 0; i < 365; i += 1) {
      const d = new Date(start.getTime());
      d.setDate(start.getDate() + i);
      expect(pickDailySet(ALL_QUESTIONS, dateKey(d))).toHaveLength(SET_SIZE);
    }
  });
});

describe('練習モード', () => {
  it('毎回5問そろう', () => {
    for (let i = 0; i < 20; i += 1) {
      expect(pickPracticeSet(ALL_QUESTIONS, [], SET_SIZE, mulberry32(i))).toHaveLength(SET_SIZE);
    }
  });

  it('直前に出した問題を避ける', () => {
    const recent = ids(pickPracticeSet(ALL_QUESTIONS, [], SET_SIZE, mulberry32(1)));
    const next = ids(pickPracticeSet(ALL_QUESTIONS, recent, SET_SIZE, mulberry32(2)));
    expect(next.some((id) => recent.includes(id))).toBe(false);
  });

  it('出題順は毎回同じにならない', () => {
    const a = ids(pickPracticeSet(ALL_QUESTIONS, [], SET_SIZE, mulberry32(11)));
    const b = ids(pickPracticeSet(ALL_QUESTIONS, [], SET_SIZE, mulberry32(22)));
    expect(a).not.toEqual(b);
  });

  it('全問を遊び終えて候補が尽きても止まらない', () => {
    const everything = ALL_QUESTIONS.map((q) => q.id);
    const set = pickPracticeSet(ALL_QUESTIONS, everything, SET_SIZE, mulberry32(7));
    expect(set).toHaveLength(SET_SIZE);
  });

  it('問題が5問未満しかなくても重複を許して5問返す', () => {
    const tiny = ALL_QUESTIONS.slice(0, 2);
    const set = pickPracticeSet(tiny, [], SET_SIZE, mulberry32(3));
    expect(set).toHaveLength(SET_SIZE);
  });

  it('問題が0問でも例外を投げない', () => {
    expect(pickPracticeSet([], [], SET_SIZE, mulberry32(3))).toEqual([]);
  });
});

describe('直近に出した問題の記録', () => {
  it('新しいものを前に足し、上限で切る', () => {
    const r = updateRecent(['c', 'd'], ['a', 'b'], 3);
    expect(r).toEqual(['a', 'b', 'c']);
  });
});

describe('日付キー', () => {
  it('ローカル日付をYYYY-MM-DDで返す', () => {
    expect(dateKey(new Date(2026, 10, 17))).toBe('2026-11-17');
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('テーマセットの選び方', () => {
  const sets3 = [
    sampleSet({ id: 'T-A' }),
    sampleSet({ id: 'T-B' }),
    sampleSet({ id: 'T-C' }),
  ];

  it('開始日は1つ目のセット', () => {
    expect(THEME_EPOCH).toBe('2026-11-17');
    expect(pickThemeSet(sets3, '2026-11-17')?.id).toBe('T-A');
  });

  it('1日ごとに次のセット・使い切ったら最初に戻る', () => {
    expect(pickThemeSet(sets3, '2026-11-18')?.id).toBe('T-B');
    expect(pickThemeSet(sets3, '2026-11-20')?.id).toBe('T-A');
  });

  it('開始日より前の日付でもセットが選べる', () => {
    expect(pickThemeSet(sets3, '2026-11-16')?.id).toBe('T-C');
    expect(pickThemeSet(sets3, '2020-01-01')).toBeDefined();
    expect(pickThemeSet(sets3, '2020-01-01')).not.toBeNull();
  });

  it('同じ日付なら必ず同じセット', () => {
    expect(pickThemeSet(sets3, '2027-03-05')).toBe(pickThemeSet(sets3, '2027-03-05'));
  });

  it('セットが無ければ null', () => {
    expect(pickThemeSet([], '2026-11-17')).toBeNull();
  });

  it('daysBetween は月・年をまたいでも正しい', () => {
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2026-11-17', '2026-11-16')).toBe(-1);
    expect(daysBetween('2026-11-17', '2027-11-17')).toBe(365);
  });
});
