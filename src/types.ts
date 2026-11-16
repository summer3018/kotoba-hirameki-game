/**
 * ことばのひらめき（仮） 型定義
 *
 * 問題データの形式はここだけを見れば分かるようにしてある。
 * 問題を追加するときは src/data/questions.*.json にレコードを足すだけでよい。
 */

export type QuestionType = 'kanji' | 'assoc' | 'fill';

/** 1=やさしい 2=ふつう 3=すこし難しい */
export type Difficulty = 1 | 2 | 3;

interface QuestionBase {
  /** 一意の問題ID（例: K-001 / A-001 / F-001） */
  id: string;
  type: QuestionType;
  /** 問題文（お題） */
  prompt: string;
  /** ヒントボタンで表示する内容。正解そのものは書かない */
  hint: string;
  /** 正誤判定のあとに表示する解説 */
  explanation: string;
  difficulty: Difficulty;
  /** 分類タグ（例: 生活, 学校, 自然） */
  category: string;
}

/** パズル1: 漢字の組み合わせ */
export interface KanjiQuestion extends QuestionBase {
  type: 'kanji';
  /** 画面に並べる使用可能文字（1文字ずつ） */
  tiles: string[];
  /** 正解の熟語 */
  answer: string;
}

/** パズル2: 言葉の連想 */
export interface AssocQuestion extends QuestionBase {
  type: 'assoc';
  /** 問題として提示する手がかり（3つ程度） */
  clues: string[];
  /** 4つの選択肢 */
  choices: string[];
  answer: string;
}

/** パズル3: 穴埋め言葉 */
export interface FillQuestion extends QuestionBase {
  type: 'fill';
  /** 「ひ○めき」のように ○ を1つだけ含む表示 */
  display: string;
  /** 1文字ずつの選択肢 */
  choices: string[];
  /** ○ に入る1文字 */
  answer: string;
  /** 完成した言葉 */
  word: string;
}

export type Question = KanjiQuestion | AssocQuestion | FillQuestion;

export const TYPE_LABEL: Record<QuestionType, string> = {
  kanji: '漢字の組み合わせ',
  assoc: '言葉の連想',
  fill: '穴埋め言葉',
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  1: 'やさしい',
  2: 'ふつう',
  3: 'すこし難しい',
};

export type GameMode = 'daily' | 'practice';

export const MODE_LABEL: Record<GameMode, string> = {
  daily: '今日の5問',
  practice: '練習モード',
};

/** 1問ぶんの回答結果 */
export interface AnswerResult {
  questionId: string;
  type: QuestionType;
  correct: boolean;
  /** プレイヤーが選んだ答え */
  given: string;
  /** 回答にかかったミリ秒 */
  elapsedMs: number;
  hintUsed: boolean;
  /** その問題で得た点数 */
  points: number;
}

/** 5問ぶんの集計 */
export interface SetSummary {
  mode: GameMode;
  dateKey: string;
  correctCount: number;
  total: number;
  maxStreak: number;
  totalMs: number;
  hintCount: number;
  score: number;
}
