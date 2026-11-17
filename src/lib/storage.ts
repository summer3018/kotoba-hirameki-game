import type { AnswerResult, SetSummary } from '../types';

/**
 * localStorage の読み書き。
 * 壊れたデータが入っていてもアプリが止まらないよう、読み込みは必ず
 * 「1項目ずつ型を確かめて、おかしければ初期値に戻す」方式にしている。
 */

export const SAVE_KEY = 'kotoba-hirameki:save:v1';
export const SAVE_VERSION = 1;

/** 過去の記録を残す日数の上限 */
export const DAILY_HISTORY_LIMIT = 60;
/** 練習モードで「直近に出した問題」を覚えておく件数 */
export const RECENT_LIMIT = 20;

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** その日の今日の5問の形。classic = 前の版（5問ばらばら）、theme = 共通点型 */
export type DailyFormat = 'classic' | 'theme';

/** 1日分の結果 */
export interface DailyRecord {
  dateKey: string;
  correctCount: number;
  total: number;
  maxStreak: number;
  totalMs: number;
  hintCount: number;
  score: number;
  /** 古い記録には無い。読み込むときに classic として補う */
  format: DailyFormat;
  setId?: string;
  finalCorrect?: boolean;
  finalAttempts?: number;
}

/** 5問目（共通点）の途中経過 */
export interface FinalProgress {
  /** 答えの枠に入れたパネルの位置 */
  picked: number[];
  /** 決定を押した回数 */
  attempts: number;
  /** 決定を押したときの答え */
  given: string[];
}

/** 今日の5問の途中経過 */
export interface DailyProgress {
  dateKey: string;
  questionIds: string[];
  index: number;
  results: AnswerResult[];
  /** 共通点型のときのセットID */
  setId?: string;
  /** 5問目の途中経過 */
  final?: FinalProgress;
}

export interface PracticeBest {
  score: number;
  correctCount: number;
  totalMs: number;
  achievedAt: string;
}

export interface SurveyAnswer {
  answeredAt: string;
  fun: number | null;
  playAgain: 'yes' | 'no' | null;
  difficulty: 'easy' | 'just' | 'hard' | null;
  favoriteType: string | null;
  comment: string;
}

export interface SaveData {
  version: number;
  playerId: string;
  sound: boolean;
  plays: number;
  totalCorrect: number;
  lastPlayedDate: string | null;
  daily: DailyRecord[];
  dailyProgress: DailyProgress | null;
  practiceBest: PracticeBest | null;
  practiceRecent: string[];
  survey: SurveyAnswer | null;
  /** アンケートを一度でも表示したか（「あとで」を含む） */
  surveyPrompted: boolean;
}

export function createPlayerId(): string {
  const rnd = Math.random().toString(36).slice(2, 10);
  return `p_${Date.now().toString(36)}_${rnd}`;
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    playerId: createPlayerId(),
    sound: true,
    plays: 0,
    totalCorrect: 0,
    lastPlayedDate: null,
    daily: [],
    dailyProgress: null,
    practiceBest: null,
    practiceRecent: [],
    survey: null,
    surveyPrompted: false,
  };
}

/* ---------- 型をゆるく確かめるための小道具 ---------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fb: string): string => (typeof v === 'string' ? v : fb);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown, fb: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fb;
const bool = (v: unknown, fb: boolean): boolean => (typeof v === 'boolean' ? v : fb);

function parseResults(v: unknown): AnswerResult[] {
  if (!Array.isArray(v)) return [];
  const out: AnswerResult[] = [];
  for (const raw of v) {
    if (!isObj(raw)) continue;
    const type = raw.type;
    if (type !== 'kanji' && type !== 'assoc' && type !== 'fill') continue;
    if (typeof raw.questionId !== 'string') continue;
    out.push({
      questionId: raw.questionId,
      type,
      correct: bool(raw.correct, false),
      given: str(raw.given, ''),
      elapsedMs: num(raw.elapsedMs, 0),
      hintUsed: bool(raw.hintUsed, false),
      points: num(raw.points, 0),
    });
  }
  return out;
}

function parseDaily(v: unknown): DailyRecord[] {
  if (!Array.isArray(v)) return [];
  const out: DailyRecord[] = [];
  for (const raw of v) {
    if (!isObj(raw) || typeof raw.dateKey !== 'string') continue;
    out.push({
      dateKey: raw.dateKey,
      correctCount: num(raw.correctCount, 0),
      total: num(raw.total, 0),
      maxStreak: num(raw.maxStreak, 0),
      totalMs: num(raw.totalMs, 0),
      hintCount: num(raw.hintCount, 0),
      score: num(raw.score, 0),
      format: raw.format === 'theme' ? 'theme' : 'classic',
      ...(typeof raw.setId === 'string' ? { setId: raw.setId } : {}),
      ...(typeof raw.finalCorrect === 'boolean' ? { finalCorrect: raw.finalCorrect } : {}),
      ...(typeof raw.finalAttempts === 'number' && Number.isFinite(raw.finalAttempts)
        ? { finalAttempts: raw.finalAttempts }
        : {}),
    });
  }
  return out.slice(0, DAILY_HISTORY_LIMIT);
}

function parseProgress(v: unknown): DailyProgress | null {
  if (!isObj(v) || typeof v.dateKey !== 'string') return null;
  const ids = Array.isArray(v.questionIds)
    ? v.questionIds.filter((x): x is string => typeof x === 'string')
    : [];
  if (ids.length === 0) return null;
  const progress: DailyProgress = {
    dateKey: v.dateKey,
    questionIds: ids,
    index: Math.max(0, Math.floor(num(v.index, 0))),
    results: parseResults(v.results),
  };
  if (typeof v.setId === 'string') progress.setId = v.setId;
  const final = parseFinalProgress(v.final);
  if (final) progress.final = final;
  return progress;
}

function parseFinalProgress(v: unknown): FinalProgress | null {
  if (!isObj(v)) return null;
  const okInts = (a: unknown): a is number[] =>
    Array.isArray(a) && a.every((x) => typeof x === 'number' && Number.isInteger(x) && x >= 0);
  const okStrs = (a: unknown): a is string[] =>
    Array.isArray(a) && a.every((x) => typeof x === 'string');
  if (!okInts(v.picked) || !okStrs(v.given)) return null;
  if (typeof v.attempts !== 'number' || !Number.isInteger(v.attempts) || v.attempts < 0) return null;
  return { picked: v.picked, attempts: v.attempts, given: v.given };
}

function parseSurvey(v: unknown): SurveyAnswer | null {
  if (!isObj(v)) return null;
  const again = v.playAgain === 'yes' || v.playAgain === 'no' ? v.playAgain : null;
  const diff =
    v.difficulty === 'easy' || v.difficulty === 'just' || v.difficulty === 'hard'
      ? v.difficulty
      : null;
  return {
    answeredAt: str(v.answeredAt, ''),
    fun: typeof v.fun === 'number' && v.fun >= 1 && v.fun <= 5 ? Math.round(v.fun) : null,
    playAgain: again,
    difficulty: diff,
    favoriteType: strOrNull(v.favoriteType),
    comment: str(v.comment, ''),
  };
}

/** どんな文字列が入っていても例外を投げずに SaveData を返す */
export function parseSave(raw: string | null): SaveData {
  const base = defaultSave();
  if (!raw) return base;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return base;
  }
  if (!isObj(parsed)) return base;

  const best = parsed.practiceBest;
  return {
    version: SAVE_VERSION,
    playerId: str(parsed.playerId, base.playerId),
    sound: bool(parsed.sound, true),
    plays: Math.max(0, Math.floor(num(parsed.plays, 0))),
    totalCorrect: Math.max(0, Math.floor(num(parsed.totalCorrect, 0))),
    lastPlayedDate: strOrNull(parsed.lastPlayedDate),
    daily: parseDaily(parsed.daily),
    dailyProgress: parseProgress(parsed.dailyProgress),
    practiceBest: isObj(best)
      ? {
          score: num(best.score, 0),
          correctCount: num(best.correctCount, 0),
          totalMs: num(best.totalMs, 0),
          achievedAt: str(best.achievedAt, ''),
        }
      : null,
    practiceRecent: Array.isArray(parsed.practiceRecent)
      ? parsed.practiceRecent
          .filter((x): x is string => typeof x === 'string')
          .slice(0, RECENT_LIMIT)
      : [],
    survey: parseSurvey(parsed.survey),
    surveyPrompted: bool(parsed.surveyPrompted, false),
  };
}

/** localStorage が使えない環境（プライベートモード等）でも落ちないための退避先 */
export function memoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

export function browserStore(): KeyValueStore {
  try {
    const probe = '__kotoba_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return memoryStore();
  }
}

export class SaveStore {
  private data: SaveData;

  constructor(private readonly store: KeyValueStore) {
    this.data = parseSave(this.safeGet());
    // 読み込み時に壊れたデータを整えて書き戻しておく
    this.flush();
  }

  private safeGet(): string | null {
    try {
      return this.store.getItem(SAVE_KEY);
    } catch {
      return null;
    }
  }

  get(): SaveData {
    return this.data;
  }

  update(patch: Partial<SaveData>): SaveData {
    this.data = { ...this.data, ...patch };
    this.flush();
    return this.data;
  }

  flush(): void {
    try {
      this.store.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      /* 保存できなくてもゲームは続行する */
    }
  }

  /** 1日分の結果を記録する（同じ日が既にあれば上書き） */
  recordDaily(summary: SetSummary): void {
    const rec: DailyRecord = {
      dateKey: summary.dateKey,
      correctCount: summary.correctCount,
      total: summary.total,
      maxStreak: summary.maxStreak,
      totalMs: summary.totalMs,
      hintCount: summary.hintCount,
      score: summary.score,
      format: summary.final ? 'theme' : 'classic',
    };
    if (summary.final) {
      if (summary.setId) rec.setId = summary.setId;
      rec.finalCorrect = summary.final.correct;
      rec.finalAttempts = summary.final.attempts;
    }
    const rest = this.data.daily.filter((d) => d.dateKey !== rec.dateKey);
    const daily = [rec, ...rest]
      .sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1))
      .slice(0, DAILY_HISTORY_LIMIT);
    this.update({ daily });
  }

  /** 練習モードの最高記録を更新する（点数が同じなら速いほうを採用） */
  recordPracticeBest(summary: SetSummary): boolean {
    const cur = this.data.practiceBest;
    const better =
      !cur ||
      summary.score > cur.score ||
      (summary.score === cur.score && summary.totalMs < cur.totalMs);
    if (!better) return false;
    this.update({
      practiceBest: {
        score: summary.score,
        correctCount: summary.correctCount,
        totalMs: summary.totalMs,
        achievedAt: new Date().toISOString(),
      },
    });
    return true;
  }

  reset(): void {
    const keepId = this.data.playerId;
    this.data = { ...defaultSave(), playerId: keepId };
    this.flush();
  }
}

export function todaysRecord(data: SaveData, key: string): DailyRecord | null {
  return data.daily.find((d) => d.dateKey === key) ?? null;
}
