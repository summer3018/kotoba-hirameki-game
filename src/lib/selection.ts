import type { GameMode, Question, QuestionType } from '../types';
import { hashString, mulberry32, shuffle } from './rng';

export const SET_SIZE = 5;

const TYPES: QuestionType[] = ['kanji', 'assoc', 'fill'];

function byType(pool: readonly Question[]): Record<QuestionType, Question[]> {
  const map: Record<QuestionType, Question[]> = { kanji: [], assoc: [], fill: [] };
  for (const q of pool) map[q.type].push(q);
  return map;
}

/**
 * 1セット分を組み立てる共通処理。
 * 3形式がなるべく均等に混ざるように、まず各形式から1問ずつ取り、
 * 残りは全体から埋める。
 */
function buildSet(pool: readonly Question[], rand: () => number, size: number): Question[] {
  if (pool.length === 0) return [];

  const buckets = byType(pool);
  const picked: Question[] = [];
  const used = new Set<string>();

  for (const t of shuffle(TYPES, rand)) {
    if (picked.length >= size) break;
    const bucket = buckets[t];
    if (bucket.length === 0) continue;
    const q = shuffle(bucket, rand)[0]!;
    picked.push(q);
    used.add(q.id);
  }

  const rest = shuffle(
    pool.filter((q) => !used.has(q.id)),
    rand,
  );
  for (const q of rest) {
    if (picked.length >= size) break;
    picked.push(q);
    used.add(q.id);
  }

  // 問題数が足りないときは重複を許して埋める（停止しないことを優先）
  if (picked.length < size) {
    const loop = shuffle(pool, rand);
    let i = 0;
    while (picked.length < size) {
      picked.push(loop[i % loop.length]!);
      i += 1;
    }
  }

  return shuffle(picked, rand).slice(0, size);
}

/**
 * 今日の5問。日付キーが同じなら、何度開いても必ず同じ5問・同じ順番になる。
 */
export function pickDailySet(
  pool: readonly Question[],
  key: string,
  size: number = SET_SIZE,
): Question[] {
  const rand = mulberry32(hashString(`kotoba-daily:${key}`));
  return buildSet(pool, rand, size);
}

/**
 * 練習モード。直近に出した問題を避けて選ぶ。
 * 避けた結果 候補が足りなくなったときは全体から選び直す（遊べなくならないように）。
 */
export function pickPracticeSet(
  pool: readonly Question[],
  recentIds: readonly string[],
  size: number = SET_SIZE,
  rand: () => number = Math.random,
): Question[] {
  const recent = new Set(recentIds);
  const fresh = pool.filter((q) => !recent.has(q.id));
  const source = fresh.length >= size ? fresh : pool;
  return buildSet(source, rand, size);
}

/** 直近に出した問題IDの保持リストを更新する */
export function updateRecent(
  recentIds: readonly string[],
  newIds: readonly string[],
  limit: number,
): string[] {
  return [...newIds, ...recentIds].slice(0, limit);
}

export function modeLabelOf(mode: GameMode): string {
  return mode === 'daily' ? '今日の5問' : '練習モード';
}
