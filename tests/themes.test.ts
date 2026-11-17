import { describe, expect, it } from 'vitest';
import { ALL_QUESTIONS, THEME_SETS } from '../src/data';
import { validateQuestions, validateThemeSets } from '../src/lib/validate';
import type { AssocQuestion, FillQuestion } from '../src/types';
import { sampleSet } from './fixtures';

const fields = (sets: Parameters<typeof validateThemeSets>[0]) =>
  validateThemeSets(sets).errors.map((e) => e.field);

describe('テーマセットの検証', () => {
  it('収録データのセットはすべて検証を通る', () => {
    expect(THEME_SETS.length).toBeGreaterThan(0);
    expect(validateThemeSets(THEME_SETS).errors).toEqual([]);
  });

  it('テスト用のセットは検証を通る', () => {
    const report = validateThemeSets([sampleSet()]);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it('お題にテーマが入っているとエラー', () => {
    const set = sampleSet();
    set.questions[0]!.prompt = `${set.themeDisplay}の近くにある、${set.questions[0]!.prompt}`;
    expect(fields([set])).toContain('questions[0].prompt');
  });

  it('spoilers の言葉が答えに入っているとエラー', () => {
    const set = sampleSet({ spoilers: ['なみのり'] });
    const errs = fields([set]);
    expect(errs).toContain('questions[2].word');
  });

  it('5問目のヒントにテーマが入っているとエラー', () => {
    const set = sampleSet({ finalHints: ['うみです', 'しょっぱい水がたくさんあります'] });
    expect(fields([set])).toContain('finalHints[0]');
  });

  it('パネルで theme を組み立てられないとエラー', () => {
    const set = sampleSet({ tiles: ['み', 'や', 'ま', 'か', 'わ', 'さ'] });
    expect(fields([set])).toContain('tiles');
  });

  it('同じ文字が2回要る theme で、その文字が1枚しかないとエラー', () => {
    const set = sampleSet({ theme: 'ここ', themeDisplay: '此処', tiles: ['こ', 'あ', 'い', 'う'] });
    expect(fields([set])).toContain('tiles');
  });

  it('3種類のパズルがそろっていないとエラー', () => {
    const set = sampleSet();
    const assoc = set.questions[1] as AssocQuestion;
    set.questions[0] = { ...assoc, id: 'T-901-1' };
    set.questions[2] = { ...assoc, id: 'T-901-3', answer: 'ぞう' };
    expect(fields([set])).toContain('questions');
  });

  it('問題が4問でないとエラー', () => {
    const set = sampleSet();
    set.questions = set.questions.slice(0, 3);
    expect(fields([set])).toContain('questions');
  });

  it('セットIDが重なるとエラー', () => {
    expect(fields([sampleSet(), sampleSet()])).toContain('id');
  });

  it('theme がひらがな以外だとエラー', () => {
    const set = sampleSet({ theme: 'ウミ', tiles: ['ウ', 'ミ', 'や', 'ま', 'か'] });
    expect(fields([set])).toContain('theme');
  });

  it('finalHints が2つでないとエラー', () => {
    const set = sampleSet();
    (set as unknown as { finalHints: string[] }).finalHints = ['ひとつだけ'];
    expect(fields([set])).toContain('finalHints');
  });

  it('セットの中の問題の不備も見つける', () => {
    const set = sampleSet();
    (set.questions[2] as FillQuestion).answer = 'に';
    expect(fields([set])).toContain('questions[2].word');
  });

  it('まぎらわしい文字が3〜5個でないと警告', () => {
    const set = sampleSet({ tiles: ['み', 'や', 'う', 'ま'] });
    const report = validateThemeSets([set]);
    expect(report.errors).toEqual([]);
    expect(report.warnings.map((w) => w.field)).toContain('tiles');
  });

  it('既存の問題の検証は変わらない', () => {
    expect(validateQuestions(ALL_QUESTIONS).ok).toBe(true);
  });
});
