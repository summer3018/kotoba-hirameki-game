import { ALL_QUESTIONS } from './data';
import { EventLog } from './lib/analytics';
import { Sfx } from './lib/audio';
import { announce, clear } from './lib/dom';
import { dateKey, mulberry32, shuffle } from './lib/rng';
import { pickDailySet, pickPracticeSet, SET_SIZE, updateRecent } from './lib/selection';
import { maxStreakOf, pointsFor, summarize } from './lib/scoring';
import {
  browserStore,
  RECENT_LIMIT,
  SaveStore,
  todaysRecord,
  type SurveyAnswer,
} from './lib/storage';
import type { AnswerResult, GameMode, Question, SetSummary } from './types';
import { renderComplete } from './screens/complete';
import { renderFeedback } from './screens/feedback';
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
}

const SCREEN_TITLES: Record<ScreenName, string> = {
  title: 'ことばのひらめき',
  mode: 'モードを選ぶ',
  play: '問題',
  feedback: '結果',
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
    const questions = mode === 'daily' ? this.dailyQuestions() : this.practiceQuestions();

    let index = 0;
    let results: AnswerResult[] = [];

    if (mode === 'daily') {
      // 途中まで解いていれば続きから（同じ日・同じ問題の並びのときだけ）
      const progress = this.save.get().dailyProgress;
      const sameSet =
        progress &&
        progress.dateKey === this.today &&
        progress.questionIds.length === questions.length &&
        progress.questionIds.every((id, i) => id === questions[i]?.id);
      if (sameSet && progress.index < questions.length) {
        index = progress.index;
        results = progress.results.slice(0, index);
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
    };

    this.log.push({ name: 'mode_select', mode, detail: { resumedFrom: index } });
    this.beginQuestion();
    this.go('play');
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
      this.finishSet();
      return;
    }
    if (s.mode === 'daily') this.persistDailyProgress();
    this.beginQuestion();
    this.go('play');
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
      },
    });
  }

  private finishSet(): void {
    const s = this.session;
    if (!s) return;

    const summary = summarize(s.results, s.mode, this.today);
    s.summary = summary;

    const data = this.save.get();
    this.save.update({
      plays: data.plays + 1,
      totalCorrect: data.totalCorrect + summary.correctCount,
      lastPlayedDate: this.today,
    });

    if (s.mode === 'daily') {
      this.save.recordDaily(summary);
      this.save.update({
        dailyProgress: {
          dateKey: this.today,
          questionIds: s.questions.map((q) => q.id),
          index: s.questions.length,
          results: s.results,
        },
      });
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
