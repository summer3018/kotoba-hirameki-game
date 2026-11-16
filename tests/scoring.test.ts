import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  formatSeconds,
  maxStreakOf,
  POINT_CORRECT,
  POINT_CORRECT_WITH_HINT,
  POINT_STREAK_BONUS,
  pointsFor,
  summarize,
} from '../src/lib/scoring';
import type { AnswerResult } from '../src/types';

function result(correct: boolean, over: Partial<AnswerResult> = {}): AnswerResult {
  return {
    questionId: 'K-001',
    type: 'kanji',
    correct,
    given: 'x',
    elapsedMs: 1000,
    hintUsed: false,
    points: 0,
    ...over,
  };
}

describe('点数の計算', () => {
  it('不正解は0点', () => {
    expect(pointsFor(false, false, 0)).toBe(0);
    expect(pointsFor(false, true, 0)).toBe(0);
  });

  it('正解は100点', () => {
    expect(pointsFor(true, false, 1)).toBe(POINT_CORRECT);
  });

  it('ヒントを使った正解は50点', () => {
    expect(pointsFor(true, true, 1)).toBe(POINT_CORRECT_WITH_HINT);
  });

  it('2問つづけて正解するとボーナスが付く', () => {
    expect(pointsFor(true, false, 2)).toBe(POINT_CORRECT + POINT_STREAK_BONUS);
    expect(pointsFor(true, true, 3)).toBe(POINT_CORRECT_WITH_HINT + POINT_STREAK_BONUS);
  });

  it('時間では減点しない', () => {
    expect(pointsFor(true, false, 1)).toBe(pointsFor(true, false, 1));
  });
});

describe('連続正解', () => {
  it('最大の連続数を数える', () => {
    const rs = [result(true), result(true), result(false), result(true)];
    expect(maxStreakOf(rs)).toBe(2);
  });

  it('全問不正解なら0', () => {
    expect(maxStreakOf([result(false), result(false)])).toBe(0);
  });

  it('空なら0', () => {
    expect(maxStreakOf([])).toBe(0);
  });
});

describe('5問の集計', () => {
  it('正解数・点数・時間・ヒント数をまとめる', () => {
    const rs = [
      result(true, { points: 100, elapsedMs: 5000 }),
      result(true, { points: 120, elapsedMs: 4000 }),
      result(false, { points: 0, elapsedMs: 8000, hintUsed: true }),
      result(true, { points: 50, elapsedMs: 3000, hintUsed: true }),
      result(true, { points: 120, elapsedMs: 2000 }),
    ];
    const s = summarize(rs, 'daily', '2026-11-17');
    expect(s.correctCount).toBe(4);
    expect(s.total).toBe(5);
    expect(s.score).toBe(390);
    expect(s.totalMs).toBe(22000);
    expect(s.hintCount).toBe(2);
    expect(s.maxStreak).toBe(2);
    expect(s.mode).toBe('daily');
    expect(s.dateKey).toBe('2026-11-17');
  });
});

describe('時間の表示', () => {
  it('1分未満は秒だけ', () => {
    expect(formatDuration(45000)).toBe('45秒');
  });

  it('1分以上は分と秒', () => {
    expect(formatDuration(95000)).toBe('1分35秒');
  });

  it('1問ごとは小数1桁', () => {
    expect(formatSeconds(12340)).toBe('12.3秒');
  });

  it('負の値でも壊れない', () => {
    expect(formatDuration(-100)).toBe('0秒');
    expect(formatSeconds(-100)).toBe('0.0秒');
  });
});
