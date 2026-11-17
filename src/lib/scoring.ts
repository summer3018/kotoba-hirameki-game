import type { AnswerResult, FinalResult, GameMode, SetSummary } from '../types';

/** 1問正解の基本点 */
export const POINT_CORRECT = 100;
/** ヒントを使って正解したときの点 */
export const POINT_CORRECT_WITH_HINT = 50;
/** 連続正解2問目以降に付く上乗せ */
export const POINT_STREAK_BONUS = 20;

/** 5問目（共通点）で正解したときの点。1回目・2回目・3回目の順 */
export const FINAL_POINTS = [200, 150, 100] as const;
/** 5問目で決定を押せる回数 */
export const FINAL_MAX_ATTEMPTS = 3;

/** 5問目の点数。attempt は正解したときの回数（1始まり）。ヒントでは減らさない */
export function finalPointsFor(correct: boolean, attempt: number): number {
  if (!correct) return 0;
  return FINAL_POINTS[attempt - 1] ?? 0;
}

/**
 * 1問ぶんの点数。
 * 「正解100点／ヒントを使ったら50点／2問つづけて正解するごとに+20点」だけの単純な方式。
 * 時間では減点しない（焦らせないため）。
 */
export function pointsFor(correct: boolean, hintUsed: boolean, streakAfter: number): number {
  if (!correct) return 0;
  const base = hintUsed ? POINT_CORRECT_WITH_HINT : POINT_CORRECT;
  const bonus = streakAfter >= 2 ? POINT_STREAK_BONUS : 0;
  return base + bonus;
}

/** 回答結果の並びから、連続正解の最大値を出す */
export function maxStreakOf(results: readonly AnswerResult[]): number {
  let best = 0;
  let cur = 0;
  for (const r of results) {
    cur = r.correct ? cur + 1 : 0;
    if (cur > best) best = cur;
  }
  return best;
}

export function summarize(
  results: readonly AnswerResult[],
  mode: GameMode,
  dateKey: string,
  final?: FinalResult,
  setId?: string,
): SetSummary {
  const summary: SetSummary = {
    mode,
    dateKey,
    correctCount: results.filter((r) => r.correct).length,
    total: results.length,
    // 連続正解は1〜4問目だけで数える（5問目は別の扱い）
    maxStreak: maxStreakOf(results),
    totalMs: results.reduce((sum, r) => sum + r.elapsedMs, 0),
    hintCount: results.filter((r) => r.hintUsed).length,
    score: results.reduce((sum, r) => sum + r.points, 0),
  };
  if (final) {
    summary.total += 1;
    if (final.correct) summary.correctCount += 1;
    summary.score += final.points;
    summary.totalMs += final.elapsedMs;
    summary.final = final;
  }
  if (setId) summary.setId = setId;
  return summary;
}

/** ミリ秒を「1分23秒」の形にする */
export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}分${sec}秒` : `${sec}秒`;
}

/** ミリ秒を「12.3秒」の形にする（1問ごとの表示用） */
export function formatSeconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}秒`;
}
