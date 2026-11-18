import type { Question } from '../types';
import { shuffle } from './rng';

/** 答えの文字が隣どうしに並ばない並びを探すときの、やり直しの上限 */
const MAX_TRIES = 30;

/**
 * パネル（タイル）の並びを入れ替える。
 * データでは正解の文字が先頭に続けて書かれているので、そのまま出すと
 * 「左から押せば正解」になってしまう。答えが正しい順で隣どうしに並ぶ並びは避ける。
 * どうしても避けられない（文字が答えだけ）ときは、最後に並べ替えた結果を返す。
 */
export function arrangeTiles(tiles: readonly string[], answer: string, rand: () => number): string[] {
  let out = shuffle(tiles, rand);
  for (let i = 0; i < MAX_TRIES && out.join('').includes(answer); i += 1) {
    out = shuffle(tiles, rand);
  }
  return out;
}

/**
 * 1問ぶんの、タップする場所の並びを入れ替えた写しを返す（元のデータは変えない）。
 * 種の決まった rand を渡せば、同じ日に開き直しても同じ並びになる。
 */
export function arrangeQuestion(q: Question, rand: () => number): Question {
  if (q.type === 'kanji') return { ...q, tiles: arrangeTiles(q.tiles, q.answer, rand) };
  return { ...q, choices: shuffle(q.choices, rand) };
}
