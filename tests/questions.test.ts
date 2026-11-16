import { describe, expect, it } from 'vitest';
import { ALL_QUESTIONS } from '../src/data';
import { MIN_PER_TYPE, MIN_TOTAL, validateQuestions } from '../src/lib/validate';
import type { FillQuestion, KanjiQuestion } from '../src/types';

describe('問題データ', () => {
  const report = validateQuestions(ALL_QUESTIONS);

  it('自動検証でエラーが出ない', () => {
    expect(report.errors).toEqual([]);
  });

  it('警告も出ていない', () => {
    expect(report.warnings).toEqual([]);
  });

  it(`合計${MIN_TOTAL}問以上ある`, () => {
    expect(report.total).toBeGreaterThanOrEqual(MIN_TOTAL);
  });

  it(`3形式それぞれ${MIN_PER_TYPE}問以上ある`, () => {
    expect(report.countsByType.kanji).toBeGreaterThanOrEqual(MIN_PER_TYPE);
    expect(report.countsByType.assoc).toBeGreaterThanOrEqual(MIN_PER_TYPE);
    expect(report.countsByType.fill).toBeGreaterThanOrEqual(MIN_PER_TYPE);
  });

  it('問題IDが重複していない', () => {
    const ids = ALL_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('漢字パズルの正解は、並んだ漢字だけで必ず作れる', () => {
    const kanji = ALL_QUESTIONS.filter((q): q is KanjiQuestion => q.type === 'kanji');
    for (const q of kanji) {
      const pool = [...q.tiles];
      for (const c of [...q.answer]) {
        const at = pool.indexOf(c);
        expect(at, `${q.id}: ${c} が tiles にない`).toBeGreaterThanOrEqual(0);
        pool.splice(at, 1);
      }
    }
  });

  it('穴埋めは ○ に正解を入れると完成形に一致する', () => {
    const fill = ALL_QUESTIONS.filter((q): q is FillQuestion => q.type === 'fill');
    for (const q of fill) {
      expect(q.display.replace('○', q.answer), q.id).toBe(q.word);
    }
  });
});

describe('検証ロジック自体', () => {
  it('IDの重複をエラーにする', () => {
    const dup = [ALL_QUESTIONS[0]!, ALL_QUESTIONS[0]!];
    const r = validateQuestions(dup);
    expect(r.errors.some((e) => e.field === 'id' && e.message.includes('重複'))).toBe(true);
  });

  it('tilesから作れない正解をエラーにする', () => {
    const broken = {
      ...(ALL_QUESTIONS.find((q) => q.type === 'kanji') as KanjiQuestion),
      id: 'K-999',
      answer: '雪原',
      prompt: '作れない2文字の言葉',
    };
    const r = validateQuestions([broken]);
    expect(r.errors.some((e) => e.message.includes('tilesから作れない文字'))).toBe(true);
  });

  it('お題の文字数と正解の長さの食い違いをエラーにする', () => {
    const base = ALL_QUESTIONS.find((q) => q.type === 'kanji') as KanjiQuestion;
    const broken = { ...base, id: 'K-998', prompt: 'これは3文字の言葉です' };
    const r = validateQuestions([broken]);
    expect(r.errors.some((e) => e.field === 'prompt')).toBe(true);
  });

  it('ヒントに正解が書かれているとエラーにする', () => {
    const base = ALL_QUESTIONS.find((q) => q.type === 'kanji') as KanjiQuestion;
    const broken = { ...base, id: 'K-997', hint: `答えは${base.answer}です` };
    const r = validateQuestions([broken]);
    expect(r.errors.some((e) => e.field === 'hint')).toBe(true);
  });

  it('問題数が足りなければエラーにする', () => {
    const r = validateQuestions([ALL_QUESTIONS[0]!]);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.field === 'count')).toBe(true);
  });
});
