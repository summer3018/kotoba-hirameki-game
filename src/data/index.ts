import type { AssocQuestion, FillQuestion, KanjiQuestion, Question } from '../types';
import kanjiRaw from './questions.kanji.json';
import assocRaw from './questions.assoc.json';
import fillRaw from './questions.fill.json';

/**
 * 問題データの読み込み口。
 *
 * 問題を追加したいときは questions.*.json にレコードを足すだけでよい。
 * （実装側はこのファイル以外、JSONの置き場所を知らない）
 */

export const KANJI_QUESTIONS = kanjiRaw as unknown as KanjiQuestion[];
export const ASSOC_QUESTIONS = assocRaw as unknown as AssocQuestion[];
export const FILL_QUESTIONS = fillRaw as unknown as FillQuestion[];

export const ALL_QUESTIONS: Question[] = [
  ...KANJI_QUESTIONS,
  ...ASSOC_QUESTIONS,
  ...FILL_QUESTIONS,
];

export function findQuestion(id: string): Question | undefined {
  return ALL_QUESTIONS.find((q) => q.id === id);
}
