import { ALL_QUESTIONS, THEME_SETS } from './data';
import { EventLog } from './lib/analytics';
import { Sfx } from './lib/audio';
import { announce, clear } from './lib/dom';
import { dateKey, mulberry32, shuffle } from './lib/rng';
import {
  pickDailySet,
  pickPracticeSet,
  pickThemeSet,
  SET_SIZE,
  updateRecent,
} from './lib/selection';
import { FINAL_MAX_ATTEMPTS, finalPointsFor, maxStreakOf, pointsFor, summarize } from './lib/scoring';
import {
  browserStore,
  RECENT_LIMIT,
  SaveStore,
  todaysRecord,
  type SurveyAnswer,
} from './lib/storage';
import type {
  AnswerResult,
  FinalResult,
  GameMode,
  Question,
  SetSummary,
  ThemeSet,
} from './types';
import { renderComplete } from './screens/complete';
import { renderFeedback } from './screens/feedback';
import { renderFinal } from './screens/final';
import { renderMode } from './screens/mode';
import { renderPlay } from './screens/play';
import { renderRecords } from './screens/records';
import { renderSettings } from './screens/settings';
import { renderSurvey } from './screens/survey';
import { renderTitle } from './screens/title';

export type ScreenName =
  | 'title'
  | 'mode'
  | 'play'
  | 'feedback'
  | 'final'
  | 'complete'
  | 'records'
  | 'settings'
  | 'survey';

export type DailyStatus = 'none' | 'in-progress' | 'done';

export interface Session {
  mode: GameMode;
  questions: Question[];
  index: number;
  results: AnswerResult[];
  /** 今の問題を表示し始めた時刻 */
  questionStartedAt: number;
  /** 今の問題でヒントを使ったか */
  hintUsed: boolean;
  /** 漢字パズルで選んだタイルの位置 */
  picked: number[];
  /** 直前の回答結果（正誤結果画面で使う） */
  lastResult: AnswerResult | null;
  summary: SetSummary | null;
  /** 今日の5問（共通点型）のセット。練習モード・旧形式では null */
  themeSet: ThemeSet | null;
  /** 5問目の状態。5問目に入るまでは null */
  final: FinalState | null;
}

/** 5問目（共通点のテーマ当て）の状態 */
export interface FinalState {
  /** 答えの枠に入れたパネルの位置（同じ文字が複数あっても区別できるよう位置で持つ） */
  picked: number[];
  /** 決定を押した回数 */
  attempts: number;
  /** 決定を押したときの答え */
  given: string[];
  solved: boolean;
  startedAt: number;
  /** 直前の決定が不正解だったか（カードを一度光らせるのに使う） */
  lastWrong: boolean;
}

const SCREEN_TITLES: Record<ScreenName, string> = {
  title: 'ことばのひらめき',
  mode: 'モードを選ぶ',
  play: '問題',
  feedback: '結果',
  final: '5問目 この4つに共通するのは？',
  complete: '5問おわり',
  records: '記録',
  settings: '設定',
  survey: 'アンケート',
};

export class Game {
  readonly save: SaveStore;
  readonly log: EventLog;
  readonly sfx: Sfx;

  screen: ScreenName = 'title';
  session: Session | null = null;
  /** 今日の日付（起動時に確定させ、プレイ中に日付をまたいでもセットは崩さない） */
  today: string = dateKey();
  /** 直前のセットで最高記録を更新したか */
  newBest = false;
  /** 今日の5問のテーマセット（テストから差し替えられるようにしてある） */
  themeSets: readonly ThemeSet[] = THEME_SETS;

  constructor(private readonly root: HTMLElement) {
    const store = browserStore();
    this.save = new SaveStore(store);
    this.log = new EventLog(store, this.save.get().playerId);
    this.sfx = new Sfx(this.save.get().sound);
  }

  /* ---------------- 画面遷移 ---------------- */

  start(): void {
    this.log.push({ name: 'game_start', detail: { plays: this.save.get().plays } });
    this.go('title');
  }

  go(screen: ScreenName): void {
    this.screen = screen;
    this.render();
    announce(SCREEN_TITLES[screen]);
    // 画面を切り替えたら先頭に戻す（スクロールしていないときは何もしない）
    if (window.scrollY > 0) window.scrollTo({ top: 0 });
  }

  render(): void {
    clear(this.root);
    this.root.appendChild(this.view());
  }

  private view(): HTMLElement {
    switch (this.screen) {
      case 'mode':
        return renderMode(this);
      case 'play':
        return renderPlay(this);
      case 'feedback':
        return renderFeedback(this);
      case 'final':
        return renderFinal(this);
      case 'complete':
        return renderComplete(this);
      case 'records':
        return renderRecords(this);
      case 'settings':
        return renderSettings(this);
      case 'survey':
        return renderSurvey(this);
      case 'title':
      default:
        return renderTitle(this);
    }
  }

  /** ボタン操作音。ユーザー操作の中から呼ぶ */
  tap(): void {
    void this.sfx.unlock();
    this.sfx.play('tap');
  }

  /* ---------------- 今日の5問の状態 ---------------- */

  dailyStatus(): DailyStatus {
    const data = this.save.get();
    if (todaysRecord(data, this.today)) return 'done';
    const progress = data.dailyProgress;
    if (progress && progress.dateKey === this.today && progress.index > 0) return 'in-progress';
    return 'none';
  }

  dailyProgressCount(): number {
    const progress = this.save.get().dailyProgress;
    if (!progress || progress.dateKey !== this.today) return 0;
    return Math.min(progress.index, SET_SIZE);
  }

  /* ---------------- セットの開始 ---------------- */

  startSet(mode: GameMode): void {
    this.newBest = false;
    const themeSet = mode === 'daily' ? pickThemeSet(this.themeSets, this.today) : null;
    const questions =
      mode === 'daily'
        ? themeSet
          ? [...themeSet.questions]
          : this.dailyQuestions()
        : this.practiceQuestions();

    let index = 0;
    let results: AnswerResult[] = [];
    let final: FinalState | null = null;

    if (mode === 'daily') {
      // 途中まで解いていれば続きから（同じ日・同じセット・同じ問題の並びのときだけ）
      const progress = this.save.get().dailyProgress;
      const sameSet =
        progress &&
        progress.dateKey === this.today &&
        (progress.setId ?? null) === (themeSet?.id ?? null) &&
        progress.questionIds.length === questions.length &&
        progress.questionIds.every((id, i) => id === questions[i]?.id);
      if (sameSet && progress.index < questions.length) {
        index = progress.index;
        results = progress.results.slice(0, index);
      } else if (
        sameSet &&
        themeSet &&
        progress.results.length >= questions.length &&
        !todaysRecord(this.save.get(), this.today)
      ) {
        // 5問目の途中から
        index = questions.length;
        results = progress.results.slice(0, questions.length);
        final = {
          picked: [],
          attempts: 0,
          given: [],
          solved: false,
          startedAt: Date.now(),
          lastWrong: false,
        };
        if (progress.final) {
          final.attempts = Math.min(progress.final.attempts, FINAL_MAX_ATTEMPTS);
          final.given = progress.final.given.slice(0, final.attempts);
          final.solved = final.given.includes(themeSet.theme);
          final.picked = progress.final.picked.filter((i) => i < themeSet.tiles.length);
        }
      }
    }

    this.session = {
      mode,
      questions,
      index,
      results,
      questionStartedAt: Date.now(),
      hintUsed: false,
      picked: [],
      lastResult: null,
      summary: null,
      themeSet,
      final,
    };

    this.log.push({ name: 'mode_select', mode, detail: { resumedFrom: index } });
    if (final) {
      this.go('final');
      return;
    }
    this.beginQuestion();
    this.go('play');
  }

  /** 進み具合の表示に使う、このセットの問題数（共通点型は5問目を含む） */
  totalSteps(): number {
    const s = this.session;
    if (!s) return SET_SIZE;
    return s.questions.length + (s.themeSet ? 1 : 0);
  }

  private dailyQuestions(): Question[] {
    return pickDailySet(ALL_QUESTIONS, this.today, SET_SIZE);
  }

  private practiceQuestions(): Question[] {
    const recent = this.save.get().practiceRecent;
    return pickPracticeSet(ALL_QUESTIONS, recent, SET_SIZE, Math.random);
  }

  /** 練習モードの出題順をもう少し散らすための補助（テストから使う） */
  static shuffleQuestions(questions: readonly Question[], seed: number): Question[] {
    return shuffle(questions, mulberry32(seed));
  }

  /* ---------------- 1問の進行 ---------------- */

  currentQuestion(): Question | null {
    const s = this.session;
    if (!s) return null;
    return s.questions[s.index] ?? null;
  }

  private beginQuestion(): void {
    const s = this.session;
    const q = this.currentQuestion();
    if (!s || !q) return;
    s.questionStartedAt = Date.now();
    s.hintUsed = false;
    s.picked = [];
    this.log.push({
      name: 'question_start',
      mode: s.mode,
      questionId: q.id,
      questionType: q.type,
      detail: { position: s.index + 1 },
    });
  }

  useHint(): void {
    const s = this.session;
    const q = this.currentQuestion();
    if (!s || !q || s.hintUsed) return;
    s.hintUsed = true;
    this.tap();
    this.log.push({
      name: 'hint_used',
      mode: s.mode,
      questionId: q.id,
      questionType: q.type,
      elapsedMs: Date.now() - s.questionStartedAt,
    });
    this.render();
  }

  /** 漢字パズル: タイルを選ぶ／取り消す */
  pickTile(tileIndex: number): void {
    const s = this.session;
    const q = this.currentQuestion();
    if (!s || !q || q.type !== 'kanji') return;
    if (s.picked.includes(tileIndex)) return;
    if (s.picked.length >= [...q.answer].length) return;
    s.picked = [...s.picked, tileIndex];
    this.tap();
    this.render();
  }

  undoTile(): void {
    const s = this.session;
    if (!s || s.picked.length === 0) return;
    s.picked = s.picked.slice(0, -1);
    this.tap();
    this.render();
  }

  clearTiles(): void {
    const s = this.session;
    if (!s || s.picked.length === 0) return;
    s.picked = [];
    this.tap();
    this.render();
  }

  submit(given: string): void {
    const s = this.session;
    const q = this.currentQuestion();
    if (!s || !q) return;

    const elapsedMs = Date.now() - s.questionStartedAt;
    const correct = given === q.answer;
    const streakAfter = correct ? currentStreak(s.results) + 1 : 0;
    const points = pointsFor(correct, s.hintUsed, streakAfter);

    const result: AnswerResult = {
      questionId: q.id,
      type: q.type,
      correct,
      given,
      elapsedMs,
      hintUsed: s.hintUsed,
      points,
    };
    s.results = [...s.results, result];
    s.lastResult = result;

    const base = {
      mode: s.mode,
      questionId: q.id,
      questionType: q.type,
      elapsedMs,
      correct,
      hintUsed: s.hintUsed,
    } as const;
    this.log.push({ name: 'answer_submit', ...base, detail: { given } });
    this.log.push({ name: correct ? 'answer_correct' : 'answer_incorrect', ...base });

    void this.sfx.unlock();
    this.sfx.play(correct ? 'correct' : 'incorrect');

    if (s.mode === 'daily') this.persistDailyProgress();
    this.go('feedback');
  }

  next(): void {
    const s = this.session;
    if (!s) return;
    this.tap();
    s.index += 1;
    if (s.index >= s.questions.length) {
      if (s.themeSet && s.mode === 'daily') {
        this.beginFinal();
        return;
      }
      this.finishSet();
      return;
    }
    if (s.mode === 'daily') this.persistDailyProgress();
    this.beginQuestion();
    this.go('play');
  }

  /* ---------------- 5問目（共通点のテーマ当て） ---------------- */

  private beginFinal(): void {
    const s = this.session;
    if (!s || !s.themeSet) return;
    s.final = {
      picked: [],
      attempts: 0,
      given: [],
      solved: false,
      startedAt: Date.now(),
      lastWrong: false,
    };
    this.persistDailyProgress();
    this.go('final');
  }

  /** 5問目が終わったか（正解した／3回まちがえた） */
  finalEnded(): boolean {
    const f = this.session?.final;
    if (!f) return false;
    return f.solved || f.attempts >= FINAL_MAX_ATTEMPTS;
  }

  pickFinalTile(tileIndex: number): void {
    const s = this.session;
    const f = s?.final;
    const set = s?.themeSet;
    if (!f || !set || this.finalEnded()) return;
    if (tileIndex < 0 || tileIndex >= set.tiles.length) return;
    if (f.picked.includes(tileIndex)) return;
    if (f.picked.length >= [...set.theme].length) return;
    f.picked = [...f.picked, tileIndex];
    f.lastWrong = false;
    this.tap();
    this.render();
  }

  undoFinalTile(): void {
    const f = this.session?.final;
    if (!f || f.picked.length === 0 || this.finalEnded()) return;
    f.picked = f.picked.slice(0, -1);
    f.lastWrong = false;
    this.tap();
    this.render();
  }

  clearFinalTiles(): void {
    const f = this.session?.final;
    if (!f || f.picked.length === 0 || this.finalEnded()) return;
    f.picked = [];
    f.lastWrong = false;
    this.tap();
    this.render();
  }

  /** 今の答えの枠の文字列 */
  finalAnswer(): string {
    const s = this.session;
    if (!s?.final || !s.themeSet) return '';
    return s.final.picked.map((i) => s.themeSet!.tiles[i] ?? '').join('');
  }

  submitFinal(): void {
    const s = this.session;
    const f = s?.final;
    const set = s?.themeSet;
    if (!s || !f || !set || this.finalEnded()) return;
    if (f.picked.length !== [...set.theme].length) return;

    const given = this.finalAnswer();
    const correct = given === set.theme;
    f.attempts += 1;
    f.given = [...f.given, given];
    f.solved = correct;
    f.lastWrong = !correct;
    f.picked = [];

    this.log.push({
      name: 'final_attempt',
      mode: s.mode,
      correct,
      elapsedMs: Date.now() - f.startedAt,
      detail: { setId: set.id, attempt: f.attempts, correct, given },
    });

    void this.sfx.unlock();
    this.sfx.play(correct ? 'finale' : 'incorrect');
    this.persistDailyProgress();
    this.render();
  }

  /** 5問目のあと「結果を見る」 */
  finishFinal(): void {
    const s = this.session;
    const f = s?.final;
    if (!s || !f || !this.finalEnded()) return;
    this.tap();
    const result: FinalResult = {
      correct: f.solved,
      attempts: f.attempts,
      points: finalPointsFor(f.solved, f.attempts),
      given: f.given,
      elapsedMs: Math.max(0, Date.now() - f.startedAt),
    };
    this.finishSet(result);
  }

  /** テーマセットの、今までに出た問題の正解（穴埋めは完成した言葉）。5問目では4つ全部 */
  answersSoFar(): string[] {
    const s = this.session;
    if (!s?.themeSet) return [];
    const n = s.final ? s.questions.length : Math.min(s.results.length, s.questions.length);
    return s.questions.slice(0, n).map((q) => (q.type === 'fill' ? q.word : q.answer));
  }

  private persistDailyProgress(): void {
    const s = this.session;
    if (!s || s.mode !== 'daily') return;
    this.save.update({
      dailyProgress: {
        dateKey: this.today,
        questionIds: s.questions.map((q) => q.id),
        index: Math.min(s.results.length, s.questions.length),
        results: s.results,
        ...(s.themeSet ? { setId: s.themeSet.id } : {}),
        ...(s.final
          ? { final: { picked: s.final.picked, attempts: s.final.attempts, given: s.final.given } }
          : {}),
      },
    });
  }

  private finishSet(final?: FinalResult): void {
    const s = this.session;
    if (!s) return;

    const summary = summarize(s.results, s.mode, this.today, final, s.themeSet?.id);
    s.summary = summary;

    const data = this.save.get();
    this.save.update({
      plays: data.plays + 1,
      totalCorrect: data.totalCorrect + summary.correctCount,
      lastPlayedDate: this.today,
    });

    if (s.mode === 'daily') {
      this.save.recordDaily(summary);
      this.persistDailyProgress();
      this.newBest = false;
    } else {
      this.newBest = this.save.recordPracticeBest(summary);
      this.save.update({
        practiceRecent: updateRecent(
          this.save.get().practiceRecent,
          s.questions.map((q) => q.id),
          RECENT_LIMIT,
        ),
      });
    }

    this.log.push({
      name: 'set_complete',
      mode: s.mode,
      detail: {
        correctCount: summary.correctCount,
        total: summary.total,
        score: summary.score,
        maxStreak: summary.maxStreak,
        totalMs: summary.totalMs,
        hintCount: summary.hintCount,
        ...(summary.final
          ? {
              setId: summary.setId ?? null,
              finalCorrect: summary.final.correct,
              finalAttempts: summary.final.attempts,
            }
          : {}),
      },
    });

    void this.sfx.unlock();
    this.sfx.play('clear');
    this.go('complete');
  }

  /** 結果画面からもう一度遊ぶ */
  replay(mode: GameMode): void {
    this.tap();
    this.log.push({ name: 'replay_start', mode });
    this.startSet(mode);
  }

  /* ---------------- アンケート ---------------- */

  /** 初回の5問が終わったあと、まだ案内していなければ出す */
  shouldOfferSurvey(): boolean {
    const data = this.save.get();
    return data.survey === null && !data.surveyPrompted;
  }

  dismissSurvey(): void {
    this.tap();
    this.save.update({ surveyPrompted: true });
    this.render();
  }

  saveSurvey(answer: Omit<SurveyAnswer, 'answeredAt'>): void {
    const full: SurveyAnswer = { ...answer, answeredAt: new Date().toISOString() };
    this.save.update({ survey: full, surveyPrompted: true });
    this.log.push({
      name: 'survey_submit',
      detail: {
        fun: full.fun,
        playAgain: full.playAgain,
        difficulty: full.difficulty,
        favoriteType: full.favoriteType,
        hasComment: full.comment.trim().length > 0,
      },
    });
  }

  /* ---------------- 設定 ---------------- */

  toggleSound(): void {
    const next = !this.save.get().sound;
    this.save.update({ sound: next });
    this.sfx.setEnabled(next);
    if (next) this.sfx.play('tap');
    this.render();
  }

  resetAll(): void {
    this.save.reset();
    this.log.clear();
    this.session = null;
    this.sfx.setEnabled(this.save.get().sound);
    this.go('title');
  }

  /** 結果画面で使う、1問ずつの振り返り */
  reviewRows(): { result: AnswerResult; question: Question | undefined }[] {
    const s = this.session;
    if (!s) return [];
    return s.results.map((result) => ({
      result,
      question: s.questions.find((q) => q.id === result.questionId),
    }));
  }

  maxStreak(): number {
    return maxStreakOf(this.session?.results ?? []);
  }
}

/** いま何問つづけて正解しているか */
export function currentStreak(results: readonly AnswerResult[]): number {
  let n = 0;
  for (let i = results.length - 1; i >= 0; i -= 1) {
    if (results[i]!.correct) n += 1;
    else break;
  }
  return n;
}
