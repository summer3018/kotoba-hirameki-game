import type { AssocQuestion, FillQuestion, KanjiQuestion, Question, QuestionType } from '../types';

/**
 * 問題データの自動検証。
 *
 * ここで確かめられるのは「形式が仕様どおりか」までで、
 * 意味の正しさ・正解が1つに定まるかは判定できない。
 * 意味の確認は docs/questions-review.md を人が読んで行う。
 */

export interface Issue {
  level: 'error' | 'warn';
  questionId: string;
  field: string;
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  total: number;
  countsByType: Record<QuestionType, number>;
  errors: Issue[];
  warnings: Issue[];
}

/** 形式ごとの必要問題数 */
export const MIN_PER_TYPE = 20;
/** 全体の必要問題数 */
export const MIN_TOTAL = 60;

const ID_PREFIX: Record<QuestionType, string> = { kanji: 'K', assoc: 'A', fill: 'F' };

/** 漢字1文字（CJK統合漢字 + 々） */
const KANJI_RE = /^[一-鿿々]$/u;
/** ひらがな1文字（長音符を含む） */
const KANA_RE = /^[ぁ-ゖー]$/u;

/** 制御文字が混ざっていないか（表示崩れ・コピペ事故の検出） */
function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i += 1) {
    const code = s.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

function isFilledString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

export function validateQuestions(questions: readonly Question[]): ValidationReport {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const countsByType: Record<QuestionType, number> = { kanji: 0, assoc: 0, fill: 0 };
  const seenIds = new Set<string>();

  const err = (questionId: string, field: string, message: string): void => {
    errors.push({ level: 'error', questionId, field, message });
  };
  const warn = (questionId: string, field: string, message: string): void => {
    warnings.push({ level: 'warn', questionId, field, message });
  };

  questions.forEach((q, i) => {
    const id = isFilledString(q?.id) ? q.id : `(index ${i})`;

    // --- 1. IDの重複 ---
    if (!isFilledString(q?.id)) {
      err(id, 'id', 'idが空です');
    } else if (seenIds.has(q.id)) {
      err(id, 'id', 'idが重複しています');
    } else {
      seenIds.add(q.id);
    }

    // --- 5. 形式ごとのデータ仕様 ---
    // JSONを直接書き換えたときの事故も拾えるよう、型注釈ではなく値を見て判定する
    const rawType: unknown = (q as unknown as { type?: unknown } | undefined)?.type;
    if (rawType !== 'kanji' && rawType !== 'assoc' && rawType !== 'fill') {
      err(id, 'type', `typeが不正です: ${String(rawType)}`);
      return;
    }
    countsByType[q.type] += 1;

    if (isFilledString(q.id) && !q.id.startsWith(`${ID_PREFIX[q.type]}-`)) {
      warn(id, 'id', `idの接頭辞が形式と一致しません（期待: ${ID_PREFIX[q.type]}-）`);
    }

    // --- 2. 共通の必須項目 ---
    for (const field of ['prompt', 'hint', 'explanation', 'category'] as const) {
      if (!isFilledString(q[field])) err(id, field, `${field}が空です`);
    }
    if (q.difficulty !== 1 && q.difficulty !== 2 && q.difficulty !== 3) {
      err(id, 'difficulty', 'difficultyは1〜3で指定してください');
    }

    // --- 4. 不正な文字列 ---
    for (const [field, value] of Object.entries(q)) {
      const texts: unknown[] = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
      for (const t of texts) {
        if (typeof t !== 'string') continue;
        if (hasControlChar(t)) err(id, field, '制御文字が含まれています');
        if (t !== t.trim()) err(id, field, '前後に余分な空白があります');
        if (/undefined|null|TODO|ＴＯＤＯ|\?\?\?/.test(t)) {
          err(id, field, `仮置きの文字列が残っています: ${t}`);
        }
      }
    }

    // --- 3. 正解と選択肢・使用可能文字の整合 ---
    if (q.type === 'kanji') validateKanji(q, err, warn);
    else if (q.type === 'assoc') validateAssoc(q, err, warn);
    else validateFill(q, err, warn);
  });

  // --- 6. 問題数 ---
  if (questions.length < MIN_TOTAL) {
    errors.push({
      level: 'error',
      questionId: '(全体)',
      field: 'count',
      message: `問題数が足りません: ${questions.length} / ${MIN_TOTAL}`,
    });
  }
  for (const t of ['kanji', 'assoc', 'fill'] as const) {
    if (countsByType[t] < MIN_PER_TYPE) {
      errors.push({
        level: 'error',
        questionId: '(全体)',
        field: `count.${t}`,
        message: `${t}の問題数が足りません: ${countsByType[t]} / ${MIN_PER_TYPE}`,
      });
    }
  }

  return {
    ok: errors.length === 0,
    total: questions.length,
    countsByType,
    errors,
    warnings,
  };
}

type Report = (questionId: string, field: string, message: string) => void;

/** お題に書かれた「◯文字」を数値にする。見つからなければ null */
function promptLength(prompt: string): number | null {
  const m = /([0-9０-９一二三四五六七八九])文字/.exec(prompt);
  if (!m) return null;
  const ch = m[1]!;
  const tables = ['0123456789', '０１２３４５６７８９', '〇一二三四五六七八九'];
  for (const table of tables) {
    const n = table.indexOf(ch);
    if (n >= 0) return n;
  }
  return null;
}

function validateKanji(q: KanjiQuestion, err: Report, warn: Report): void {
  const id = q.id;

  if (!Array.isArray(q.tiles) || q.tiles.length < 4) {
    err(id, 'tiles', 'tilesは4文字以上の配列にしてください');
    return;
  }
  if (q.tiles.length > 8) warn(id, 'tiles', `tilesが多すぎて押しにくい可能性: ${q.tiles.length}`);
  for (const t of q.tiles) {
    if (!KANJI_RE.test(t)) err(id, 'tiles', `漢字1文字ではありません: ${String(t)}`);
  }

  if (!isFilledString(q.answer)) {
    err(id, 'answer', 'answerが空です');
    return;
  }
  const answerChars = [...q.answer];
  if (answerChars.length < 2 || answerChars.length > 4) {
    err(id, 'answer', `answerは2〜4文字にしてください: ${q.answer}`);
  }
  for (const c of answerChars) {
    if (!KANJI_RE.test(c)) err(id, 'answer', `漢字以外が含まれます: ${c}`);
  }

  // 正解の各文字が、重複も含めて tiles から作れるか
  const pool = [...q.tiles];
  for (const c of answerChars) {
    const at = pool.indexOf(c);
    if (at === -1) {
      err(id, 'answer', `tilesから作れない文字があります: ${c}`);
    } else {
      pool.splice(at, 1);
    }
  }

  if (q.tiles.length <= answerChars.length) {
    warn(id, 'tiles', 'ダミーの文字がなく、全部使うだけで正解になります');
  }

  // 「◯文字」の表記と正解の長さが食い違っていないか
  const want = isFilledString(q.prompt) ? promptLength(q.prompt) : null;
  if (want === null) {
    warn(id, 'prompt', 'お題に「◯文字」の指定がありません（答えが絞りにくくなります）');
  } else if (want !== answerChars.length) {
    err(id, 'prompt', `お題の「${want}文字」と正解「${q.answer}」の長さが一致しません`);
  }

  if (isFilledString(q.hint) && q.hint.includes(q.answer)) {
    err(id, 'hint', 'ヒントに正解がそのまま含まれています');
  }
  if (isFilledString(q.prompt) && q.prompt.includes(q.answer)) {
    err(id, 'prompt', 'お題に正解がそのまま含まれています');
  }
}

function validateAssoc(q: AssocQuestion, err: Report, warn: Report): void {
  const id = q.id;

  if (!Array.isArray(q.clues) || q.clues.length < 2) {
    err(id, 'clues', 'cluesは2つ以上にしてください');
  } else {
    if (q.clues.length > 4) warn(id, 'clues', `手がかりが多すぎます: ${q.clues.length}`);
    for (const c of q.clues) {
      if (!isFilledString(c)) err(id, 'clues', '空の手がかりがあります');
    }
    if (new Set(q.clues).size !== q.clues.length) err(id, 'clues', '同じ手がかりが重複しています');
  }

  if (!Array.isArray(q.choices) || q.choices.length !== 4) {
    err(id, 'choices', 'choicesはちょうど4つにしてください');
    return;
  }
  for (const c of q.choices) {
    if (!isFilledString(c)) err(id, 'choices', '空の選択肢があります');
  }
  if (new Set(q.choices).size !== q.choices.length) {
    err(id, 'choices', '選択肢が重複しています');
  }
  if (!isFilledString(q.answer)) {
    err(id, 'answer', 'answerが空です');
    return;
  }
  if (!q.choices.includes(q.answer)) {
    err(id, 'answer', `answerがchoicesに含まれていません: ${q.answer}`);
  }
  for (const c of q.clues ?? []) {
    if (typeof c === 'string' && c.includes(q.answer)) {
      err(id, 'clues', `手がかりに正解がそのまま含まれています: ${c}`);
    }
  }
  if (isFilledString(q.hint) && q.hint.includes(q.answer)) {
    err(id, 'hint', 'ヒントに正解がそのまま含まれています');
  }
}

function validateFill(q: FillQuestion, err: Report, warn: Report): void {
  const id = q.id;

  if (!isFilledString(q.display)) {
    err(id, 'display', 'displayが空です');
    return;
  }
  const holes = [...q.display].filter((c) => c === '○').length;
  if (holes !== 1) {
    err(id, 'display', `displayには○をちょうど1つ入れてください（現在: ${holes}）`);
    return;
  }

  if (!Array.isArray(q.choices) || q.choices.length !== 4) {
    err(id, 'choices', 'choicesはちょうど4つにしてください');
  } else {
    for (const c of q.choices) {
      if (!KANA_RE.test(c)) err(id, 'choices', `ひらがな1文字ではありません: ${String(c)}`);
    }
    if (new Set(q.choices).size !== q.choices.length) {
      err(id, 'choices', '選択肢が重複しています');
    }
  }

  if (!isFilledString(q.answer) || [...q.answer].length !== 1) {
    err(id, 'answer', 'answerはひらがな1文字にしてください');
    return;
  }
  if (Array.isArray(q.choices) && !q.choices.includes(q.answer)) {
    err(id, 'answer', `answerがchoicesに含まれていません: ${q.answer}`);
  }
  if (!isFilledString(q.word)) {
    err(id, 'word', 'wordが空です');
    return;
  }
  const completed = q.display.replace('○', q.answer);
  if (completed !== q.word) {
    err(
      id,
      'word',
      `display(${q.display})にanswer(${q.answer})を入れると「${completed}」になり、word「${q.word}」と一致しません`,
    );
  }
  if ([...q.word].length < 3) {
    warn(id, 'word', `言葉が短すぎて推測しにくい可能性: ${q.word}`);
  }
  if (isFilledString(q.hint) && q.hint.includes(q.word)) {
    err(id, 'hint', 'ヒントに完成形がそのまま含まれています');
  }
}

export function formatReport(report: ValidationReport): string {
  const lines: string[] = [];
  lines.push('=== 問題データ検証 ===');
  lines.push(
    `合計 ${report.total}問 ` +
      `(漢字:${report.countsByType.kanji} / 連想:${report.countsByType.assoc} / 穴埋め:${report.countsByType.fill})`,
  );
  lines.push(`エラー: ${report.errors.length}件 / 警告: ${report.warnings.length}件`);
  if (report.errors.length > 0) {
    lines.push('');
    lines.push('--- エラー ---');
    for (const e of report.errors) lines.push(`  [${e.questionId}] ${e.field}: ${e.message}`);
  }
  if (report.warnings.length > 0) {
    lines.push('');
    lines.push('--- 警告 ---');
    for (const w of report.warnings) lines.push(`  [${w.questionId}] ${w.field}: ${w.message}`);
  }
  lines.push('');
  lines.push(
    report.ok
      ? '形式の検証は通過しました。ただし意味の正しさ・正解の一意性は自動では保証できません。'
      : 'エラーがあります。修正してください。',
  );
  return lines.join('\n');
}
