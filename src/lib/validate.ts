import type {
  AssocQuestion,
  FillQuestion,
  KanjiQuestion,
  Question,
  QuestionType,
  ThemeSet,
} from '../types';

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

    const type = validateQuestion(q, err, warn, { fallbackId: id });
    if (type) countsByType[type] += 1;
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

export type Report = (questionId: string, field: string, message: string) => void;

/**
 * 1問ぶんの形式の検証。ID の重複と問題数は見ない（呼ぶ側で見る）。
 * 形式（type）が正しければその値を、不正なら null を返す。
 */
export function validateQuestion(
  q: Question,
  err: Report,
  warn: Report,
  opts: { checkIdPrefix?: boolean; fallbackId?: string } = {},
): QuestionType | null {
  const id = isFilledString(q?.id) ? q.id : (opts.fallbackId ?? '(id なし)');

  // --- 5. 形式ごとのデータ仕様 ---
  // JSONを直接書き換えたときの事故も拾えるよう、型注釈ではなく値を見て判定する
  const rawType: unknown = (q as unknown as { type?: unknown } | undefined)?.type;
  if (rawType !== 'kanji' && rawType !== 'assoc' && rawType !== 'fill') {
    err(id, 'type', `typeが不正です: ${String(rawType)}`);
    return null;
  }

  if (opts.checkIdPrefix !== false && isFilledString(q.id) && !q.id.startsWith(`${ID_PREFIX[q.type]}-`)) {
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
  return q.type;
}

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

/* ---------------- テーマつきセット（共通点型） ---------------- */

/** 1セットの問題数（5問目のテーマ当ては含まない） */
export const THEME_SET_QUESTIONS = 4;
/** 5問目のパネルに混ぜる、まぎらわしい文字の数の目安 */
export const THEME_DECOY_MIN = 3;
export const THEME_DECOY_MAX = 5;

/** 1問の中で、テーマが漏れていないか調べる文字列を項目名つきで並べる */
function spoilerTargets(q: Question): [string, string][] {
  const out: [string, string][] = [
    ['prompt', q.prompt],
    ['hint', q.hint],
    ['explanation', q.explanation],
    ['answer', q.answer],
  ];
  if (q.type === 'kanji') out.push(['tiles', q.tiles.join('')]);
  if (q.type === 'assoc') {
    q.clues.forEach((c) => out.push(['clues', c]));
    q.choices.forEach((c) => out.push(['choices', c]));
  }
  if (q.type === 'fill') {
    out.push(['display', q.display], ['word', q.word]);
    q.choices.forEach((c) => out.push(['choices', c]));
  }
  return out.filter(([, v]) => typeof v === 'string');
}

/**
 * テーマつきセットの検証。
 * 形式・ネタばれ（テーマの言葉が1〜4問目や5問目のヒントに出ていないか）・
 * パネルで正解を組み立てられるかを見る。別の答えになるテーマが無いかは人が確かめる。
 */
export function validateThemeSets(sets: readonly ThemeSet[]): ValidationReport {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const countsByType: Record<QuestionType, number> = { kanji: 0, assoc: 0, fill: 0 };
  const seenSetIds = new Set<string>();
  const seenQuestionIds = new Set<string>();

  sets.forEach((set, si) => {
    const sid = isFilledString(set?.id) ? set.id : `(set ${si})`;
    const err: Report = (_q, field, message) =>
      errors.push({ level: 'error', questionId: sid, field, message });
    const warn: Report = (_q, field, message) =>
      warnings.push({ level: 'warn', questionId: sid, field, message });

    if (!isFilledString(set?.id)) err(sid, 'id', 'idが空です');
    else if (seenSetIds.has(set.id)) err(sid, 'id', 'idが重複しています');
    else seenSetIds.add(set.id);

    // テーマ
    const themeOk = isFilledString(set.theme) && [...set.theme].every((c) => KANA_RE.test(c));
    if (!themeOk) err(sid, 'theme', `themeはひらがなだけで書いてください: ${String(set.theme)}`);
    if (!isFilledString(set.themeDisplay)) err(sid, 'themeDisplay', 'themeDisplayが空です');
    if (!isFilledString(set.explanation)) err(sid, 'explanation', 'explanationが空です');

    // パネル
    if (!Array.isArray(set.tiles) || set.tiles.some((t) => !KANA_RE.test(t))) {
      err(sid, 'tiles', 'tilesはひらがな1文字ずつの配列にしてください');
    } else if (themeOk) {
      const pool = [...set.tiles];
      for (const c of [...set.theme]) {
        const at = pool.indexOf(c);
        if (at === -1) err(sid, 'tiles', `tilesでthemeを組み立てられません（足りない文字: ${c}）`);
        else pool.splice(at, 1);
      }
      const decoys = set.tiles.length - [...set.theme].length;
      if (decoys < THEME_DECOY_MIN || decoys > THEME_DECOY_MAX) {
        warn(sid, 'tiles', `まぎらわしい文字は${THEME_DECOY_MIN}〜${THEME_DECOY_MAX}個にしてください（現在: ${decoys}）`);
      }
    }

    // 5問目のヒント
    if (!Array.isArray(set.finalHints) || set.finalHints.length !== 2) {
      err(sid, 'finalHints', 'finalHintsはちょうど2つにしてください');
    } else {
      set.finalHints.forEach((h, i) => {
        if (!isFilledString(h)) err(sid, `finalHints[${i}]`, 'ヒントが空です');
      });
    }

    // 1〜4問目
    const questions = Array.isArray(set.questions) ? set.questions : [];
    if (questions.length !== THEME_SET_QUESTIONS) {
      err(sid, 'questions', `問題はちょうど${THEME_SET_QUESTIONS}問にしてください（現在: ${questions.length}）`);
    }
    const types = new Set<QuestionType>();
    questions.forEach((q, qi) => {
      const prefix = `questions[${qi}]`;
      if (isFilledString(q?.id)) {
        if (seenQuestionIds.has(q.id)) err(sid, `${prefix}.id`, `問題のidが重複しています: ${q.id}`);
        seenQuestionIds.add(q.id);
      } else {
        err(sid, `${prefix}.id`, 'idが空です');
      }
      const t = validateQuestion(
        q,
        (_id, field, message) => err(sid, `${prefix}.${field}`, message),
        (_id, field, message) => warn(sid, `${prefix}.${field}`, message),
        { checkIdPrefix: false, fallbackId: sid },
      );
      if (t) {
        types.add(t);
        countsByType[t] += 1;
      }
    });
    if (types.size < 3) err(sid, 'questions', '漢字・連想・穴埋めを最低1問ずつ入れてください');

    // ネタばれ
    const banned = [set.theme, set.themeDisplay, ...(Array.isArray(set.spoilers) ? set.spoilers : [])]
      .filter(isFilledString);
    const check = (field: string, text: string): void => {
      const hit = banned.find((b) => text.includes(b));
      if (hit) err(sid, field, `テーマの言葉「${hit}」が入っています（ネタばれ）`);
    };
    questions.forEach((q, qi) => {
      if (!q || typeof q !== 'object') return;
      for (const [field, text] of spoilerTargets(q)) check(`questions[${qi}].${field}`, text);
    });
    if (Array.isArray(set.finalHints)) {
      set.finalHints.forEach((h, i) => {
        if (typeof h === 'string') check(`finalHints[${i}]`, h);
      });
    }
  });

  return {
    ok: errors.length === 0,
    total: sets.length,
    countsByType,
    errors,
    warnings,
  };
}

/** テーマセットの検証結果を読みやすい文字列にする */
export function formatThemeReport(report: ValidationReport): string {
  const lines: string[] = [];
  lines.push('=== テーマセット検証 ===');
  lines.push(`合計 ${report.total}セット`);
  lines.push(`エラー: ${report.errors.length}件 / 警告: ${report.warnings.length}件`);
  for (const [title, list] of [['--- エラー ---', report.errors], ['--- 警告 ---', report.warnings]] as const) {
    if (list.length === 0) continue;
    lines.push('', title);
    for (const e of list) lines.push(`  [${e.questionId}] ${e.field}: ${e.message}`);
  }
  lines.push('');
  lines.push(
    report.ok
      ? '形式の検証は通過しました。テーマとのつながり・別の答えの有無は人が確かめてください。'
      : 'エラーがあります。修正してください。',
  );
  return lines.join('\n');
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
