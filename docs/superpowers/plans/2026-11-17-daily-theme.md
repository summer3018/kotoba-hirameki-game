# 今日の5問「共通点型」 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 今日の5問を「4問の答えに共通するテーマを5問目で文字パネルで当てる」形に変える。

**Architecture:** 今の Vite + TypeScript + 素のDOM の作りに足す。テーマつきセットを `src/data/theme-sets.json` に持ち、日付から1セットを選ぶ。`Game` の今日の5問は、そのセットの4問を今の流れで出したあと、新しい `final` 画面へ進む。練習モードは今のまま。

**Tech Stack:** TypeScript 5 / Vite 5 / Vitest 2（jsdom）/ vite-node / Web Audio（合成音）

**Spec:** `docs/superpowers/specs/2026-11-17-daily-theme-design.md`

## Global Constraints

- 作業はブランチ `feature/daily-theme` で行う。main への統合は佐俣が30セットを確かめ終えてから（main への push で GitHub Pages に自動公開されるため）。
- 連続日数・成長など新しい「記録」の仕組みは作らない。今ある保存・JSON書き出しは残す。
- 練習モードの出題・流れは変えない。
- 書き出すJSONの既存項目は意味を変えない。`DailyRecord` には足すだけ。
- 5問目: ひらがなパネルで組み立て、「1文字もどす」「すべて消す」「決定」。答え直しは3回まで。ヒントは2つ（1回目・2回目の不正解の後に1つずつ）。3回とも不正解なら正解を見せて終わる。
- 5問目の点数: 1回目の正解 200点 / 2回目 150点 / 3回目 100点 / 不正解 0点。ヒントでは減らさない。連続正解の数には入れない。
- テーマは季節に頼らない。開始日 `THEME_EPOCH = '2026-11-17'` から1日1セットずつ順に出し、使い切ったら1つ目から。
- 1〜4問目のお題・ヒント・解説・選択肢・パネル・答え、5問目のヒントに、そのセットの `spoilers`（`theme` と `themeDisplay` を自動で含む）が入っていたら検証エラー。
- 新しい文言・コメントは今のコードと同じく日本語。
- 各タスクの終わりに `npm run check`（validate → test → build）が通ること。

## Review Focus

1. **前の版の保存データが残っている端末**（今日の `dailyProgress` が旧形式の問題IDで入っている）→ 落ちずに、今日のテーマセットを最初から始める。→ Task 3・Task 4 のテスト
2. **5問目の途中で再読み込み**（1回間違えた後に閉じた）→ 5問目から再開し、答えた回数とヒントの表示が残る。→ Task 4 のテスト
3. **同じ文字が2枚あるパネル**（例: テーマ `ここ`）→ 文字ではなくパネルの位置で選ぶので、2枚とも使える。→ Task 4 のテスト
4. **端末の日付が開始日より前** → 負の日数でもセットが選べる（落ちない・範囲外にならない）。→ Task 2 のテスト
5. **公開した日に、旧形式の今日の5問をもう解き終えていた** → 「今日はおわり」の表示のまま、記録画面も落ちない（`format` が無い記録は `classic` として読む）。→ Task 3 のテスト

---

## ファイルの地図

| ファイル | 役割 | 変更 |
| --- | --- | --- |
| `src/types.ts` | `ThemeSet`・`FinalState`・`SetSummary.final` を足す | 修正 |
| `src/data/theme-sets.json` | テーマつきセットのデータ | 新規 |
| `src/data/index.ts` | `THEME_SETS` を出す | 修正 |
| `src/lib/validate.ts` | 1問の検証を関数に切り出し、セットの検証を足す | 修正 |
| `src/lib/selection.ts` | 日付からセットを選ぶ | 修正 |
| `src/lib/scoring.ts` | 5問目の点数・集計 | 修正 |
| `src/lib/storage.ts` | `DailyRecord`・`DailyProgress` に項目を足し、古いデータも読む | 修正 |
| `src/app.ts` | 今日の5問の流れに5問目を足す | 修正 |
| `src/screens/final.ts` | 5問目の画面 | 新規 |
| `src/screens/feedback.ts` / `complete.ts` / `records.ts` | ここまでの答え・5問目の結果の表示 | 修正 |
| `src/lib/audio.ts` | 5問目の正解音 `finale` | 修正 |
| `src/lib/analytics.ts` | `final_attempt` イベント | 修正 |
| `src/styles.css` | 5問目の画面・カードの光り方 | 修正 |
| `scripts/validate-questions.ts` | セットも検証する | 修正 |
| `scripts/export-theme-list.ts` | 人が確かめる一覧 `docs/theme-sets-review.md` を出す | 新規 |
| `tests/themes.test.ts` / `tests/flow.test.ts` / `tests/selection.test.ts` / `tests/scoring.test.ts` / `tests/storage.test.ts` | テスト | 新規・修正 |

---

### Task 0: ブランチを作る

- [ ] **Step 1:** `git switch -c feature/daily-theme`（`kotoba-hirameki-game` で）。`npm run check` が今の状態で通ることを確かめる。

---

### Task 1: セットの型・データ・検証

**Files:**
- Modify: `src/types.ts`, `src/data/index.ts`, `src/lib/validate.ts`, `scripts/validate-questions.ts`
- Create: `src/data/theme-sets.json`（このタスクでは3セットだけ。残りは Task 5）
- Test: `tests/themes.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // src/types.ts
  export interface ThemeSet {
    id: string;            // 'T-001'
    theme: string;         // ひらがなのみ。パネルで組み立てる正解（例 'つゆ'）
    themeDisplay: string;  // 正解後に大きく見せる表記（例 '梅雨'）
    tiles: string[];       // ひらがな1文字ずつ。theme の文字 + まぎらわしい文字3〜5個
    finalHints: [string, string];
    explanation: string;
    spoilers: string[];    // 使ってはいけない言葉（別の書き方）。theme/themeDisplay は書かなくてよい
    questions: Question[]; // ちょうど4問。並び順＝出題順（テーマから遠い順）
  }
  // src/data/index.ts
  export const THEME_SETS: ThemeSet[];
  // src/lib/validate.ts
  export function validateQuestion(q: Question, err: Report, warn: Report, opts?: { checkIdPrefix?: boolean }): void;
  export function validateThemeSets(sets: readonly ThemeSet[]): ValidationReport;
  ```
- セット内の問題IDは `T-001-1`〜`T-001-4`（`checkIdPrefix: false` で検証）。

- [ ] **Step 1: 失敗するテストを書く** `tests/themes.test.ts`

  - `test('収録データのセットはすべて検証を通る')`: `validateThemeSets(THEME_SETS).errors` が `[]`。
  - `test('お題にテーマが入っているとエラー')`: 正しいセットを複製し、`questions[0].prompt` に `themeDisplay` を足す → `errors` に `field: 'questions[0].prompt'` を含む。
  - `test('spoilers の言葉が答えに入っているとエラー')`: `spoilers: ['ばいう']` のセットで、穴埋めの `word` を `'ばいう'` に → エラー。
  - `test('パネルで theme を組み立てられないとエラー')`: `tiles` から theme の1文字を消す → エラー。同じ文字が2回要る theme（`'ここ'`）で `tiles` にその文字が1枚しかない → エラー。
  - `test('3種類のパズルがそろっていないとエラー')`: 4問とも `assoc` → エラー。
  - `test('問題が4問でないとエラー')`・`test('セットIDが重なるとエラー')`・`test('theme がひらがな以外だとエラー')`・`test('finalHints が2つでないとエラー')`。
  - `test('まぎらわしい文字が3〜5個でないと警告')`: `tiles.length - theme.length` が 2 → `warnings` に入る。
  - `test('既存の問題の検証は変わらない')`: `validateQuestions(ALL_QUESTIONS).ok === true`。

- [ ] **Step 2:** `npx vitest run tests/themes.test.ts` → FAIL（`THEME_SETS` が無い）。

- [ ] **Step 3: 実装する**
  - `validateQuestions` のループの中身を `validateQuestion` に切り出す（既存の挙動はそのまま。ID接頭辞の確認だけ `opts.checkIdPrefix !== false` のときに行う）。
  - `validateThemeSets` は、セットごとに上のテストの決まりを確かめ、4問それぞれに `validateQuestion(q, …, { checkIdPrefix: false })` を通す。Issue の `questionId` はセットID、`field` は `questions[i].prompt` のような形。
  - ネタばれ検査の対象: 各問の `prompt` `hint` `explanation` `answer`、`clues` `choices` の各要素、`tiles.join('')`、穴埋めの `display` `word`、それにセットの `finalHints`。禁止語 = `[theme, themeDisplay, ...spoilers]`。単純な部分一致。
  - `theme-sets.json` に、季節に頼らないテーマで3セット書く（Task 5 で30に増やす）。
  - `scripts/validate-questions.ts` で両方の結果を出し、どちらかにエラーがあれば終了コード1にする。

- [ ] **Step 4:** `npx vitest run tests/themes.test.ts` → PASS。`npm run validate` → エラー0。

- [ ] **Step 5: Commit** `feat(theme): テーマつきセットの型・データ・検証を追加`

---

### Task 2: 日付からセットを選ぶ

**Files:**
- Modify: `src/lib/selection.ts`
- Test: `tests/selection.test.ts`

**Interfaces:**
- Consumes: `ThemeSet`（Task 1）
- Produces:
  ```ts
  export const THEME_EPOCH = '2026-11-17';
  /** 'YYYY-MM-DD' 同士の日数差（b - a）。時差・夏時間の影響を受けないよう Date.UTC で数える */
  export function daysBetween(a: string, b: string): number;
  /** 空配列なら null */
  export function pickThemeSet(sets: readonly ThemeSet[], key: string, epoch?: string): ThemeSet | null;
  ```

- [ ] **Step 1: 失敗するテストを書く**
  - `test('開始日は1つ目のセット')`: `pickThemeSet(sets3, '2026-11-17')` が `sets3[0]`。
  - `test('1日ごとに次のセット・使い切ったら最初に戻る')`: `'2026-11-18'` → `sets3[1]`、`'2026-11-20'` → `sets3[0]`。
  - `test('開始日より前の日付でもセットが選べる')`: `'2026-11-16'` → `sets3[2]`、`'2020-01-01'` → `sets3` のどれか（`toBeDefined`、例外なし）。
  - `test('同じ日付なら必ず同じセット')`。
  - `test('セットが無ければ null')`。
  - `test('daysBetween は月・年をまたいでも正しい')`: `daysBetween('2026-12-31','2027-01-01') === 1`、`daysBetween('2026-11-17','2026-11-16') === -1`。

- [ ] **Step 2:** FAIL を確かめる。
- [ ] **Step 3:** 実装する。添え字は `((d % n) + n) % n`。
- [ ] **Step 4:** PASS を確かめる。
- [ ] **Step 5: Commit** `feat(theme): 日付からテーマセットを選ぶ処理を追加`

---

### Task 3: 5問目の点数と保存の形

**Files:**
- Modify: `src/types.ts`, `src/lib/scoring.ts`, `src/lib/storage.ts`
- Test: `tests/scoring.test.ts`, `tests/storage.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // src/types.ts
  export interface FinalResult { correct: boolean; attempts: number; points: number; given: string[]; elapsedMs: number; }
  export interface SetSummary { /* 既存の項目 */ final?: FinalResult; setId?: string; }
  // src/lib/scoring.ts
  export const FINAL_POINTS = [200, 150, 100] as const;
  export const FINAL_MAX_ATTEMPTS = 3;
  export function finalPointsFor(correct: boolean, attempt: number): number; // attempt は 1始まり
  export function summarize(results, mode, dateKey, final?: FinalResult, setId?: string): SetSummary;
  // src/lib/storage.ts
  export type DailyFormat = 'classic' | 'theme';
  export interface DailyRecord { /* 既存 */ format: DailyFormat; setId?: string; finalCorrect?: boolean; finalAttempts?: number; }
  export interface DailyProgress { /* 既存 */ setId?: string; final?: { picked: number[]; attempts: number; given: string[] }; }
  ```
- `summarize` に `final` を渡したとき: `total = results.length + 1`、`correctCount` に `final.correct` を足す、`score` に `final.points` を足す、`totalMs` に `final.elapsedMs` を足す。`maxStreak` は `results` だけで数える。
- `recordDaily` は `summary.final` があれば `format: 'theme'` と `setId`・`finalCorrect`・`finalAttempts` を入れ、無ければ `format: 'classic'`。

- [ ] **Step 1: 失敗するテストを書く**
  - scoring: `finalPointsFor(true,1)===200`、`(true,2)===150`、`(true,3)===100`、`(false,3)===0`。
  - scoring: `test('5問目つきの集計')`: 4問全問正解（ヒントなし）+ 1回目で正解 → `total 5`・`correctCount 5`・`score 100+120+120+120+200 = 660`・`maxStreak 4`。
  - storage: `test('format の無い古い記録は classic として読む')`: `parseSave` に旧形式の `daily` を渡す → `format === 'classic'`、ほかの項目は今までどおり。
  - storage: `test('theme の記録を保存して読み直せる')`: `finalCorrect`・`finalAttempts`・`setId` が残る。
  - storage: `test('5問目の途中経過を保存して読み直せる')`: `dailyProgress.final` の `picked`・`attempts`・`given` が残る。おかしな値（`attempts: 'x'`）なら `final` は捨てるが落ちない。
- [ ] **Step 2:** FAIL を確かめる。
- [ ] **Step 3:** 実装する。保存の `SAVE_KEY`・`SAVE_VERSION` は変えない（足すだけなので古いデータはそのまま読める）。
- [ ] **Step 4:** PASS と、既存の scoring/storage テストが全部通ることを確かめる。
- [ ] **Step 5: Commit** `feat(theme): 5問目の点数と保存の項目を追加`

---

### Task 4: 今日の5問の流れと5問目の画面

**Files:**
- Modify: `src/app.ts`, `src/screens/feedback.ts`, `src/screens/complete.ts`, `src/screens/records.ts`, `src/screens/play.ts`（進み具合のバーを5マスに）, `src/lib/audio.ts`, `src/lib/analytics.ts`, `src/styles.css`
- Create: `src/screens/final.ts`
- Test: `tests/flow.test.ts`

**Interfaces:**
- Consumes: `THEME_SETS`（Task 1）、`pickThemeSet`（Task 2）、`finalPointsFor`・`FINAL_MAX_ATTEMPTS`・`summarize`（Task 3）
- Produces:
  ```ts
  // src/app.ts
  export type ScreenName = /* 既存 */ | 'final';
  export interface FinalState { picked: number[]; attempts: number; given: string[]; solved: boolean; startedAt: number; lastWrong: boolean; }
  export interface Session { /* 既存 */ themeSet: ThemeSet | null; final: FinalState | null; }
  class Game {
    pickFinalTile(tileIndex: number): void;
    undoFinalTile(): void;
    clearFinalTiles(): void;
    submitFinal(): void;        // 今の picked を文字列にして判定
    finishFinal(): void;        // 結果画面へ（正解後・3回不正解後の「結果を見る」）
    answersSoFar(): string[];   // テーマセットの、今までに出た問題の正解（穴埋めは word）
  }
  // src/screens/final.ts
  export function renderFinal(game: Game): HTMLElement;
  // src/lib/audio.ts
  export type SfxName = 'tap' | 'correct' | 'incorrect' | 'clear' | 'finale';
  // src/lib/analytics.ts — EventName に 'final_attempt' を足す（detail: { setId, attempt, correct, given }）
  ```

流れ:
- 今日の5問を始めるとき `pickThemeSet(THEME_SETS, this.today)` でセットを取る。`null` なら今までどおり `pickDailySet`（`themeSet: null`）。
- 続きからの判定は `progress.setId === themeSet.id` も見る。合わなければ最初から（旧形式の途中経過はここで捨てられる）。
- 4問目の解説の画面で「次の問題へ」を押すと `final` 画面へ（`next()` の中で、テーマセットがあり `index >= questions.length` なら `finishSet` ではなく `final` へ）。
- 5問目の途中経過も `persistDailyProgress` で `final` に保存し、続きから再開できるようにする。
- 正解・3回不正解のどちらでも、`final.ts` の「結果を見る」→ `finishFinal()` → `summarize(..., finalResult, setId)` → 今の `finishSet` と同じ保存 → `complete` 画面。

画面:
- `final.ts`: 見出し「5問目　この4つに共通するのは？」、上に `answersSoFar()` の4枚のカード、答えの枠（`theme` の文字数）、ひらがなパネル、「1文字もどす」「すべて消す」「決定」、残りの回数。不正解の後は `finalHints` を出した分だけ表示し、カードに `flash` クラスをつけて一度光らせる（`lastWrong` が true の描画のときだけ）。正解したら `themeDisplay` を大きく、`explanation` と「結果を見る」。3回不正解なら「答えは」+ `themeDisplay` と `explanation` と「結果を見る」。正解時に `sfx.play('finale')`。
- `feedback.ts`: テーマセットがあるときだけ「ここまでの答え」を小さく並べる（`answersSoFar()`）。
- `play.ts`: テーマセットがあるときは進み具合のバーを5マスにし、バッジを `n/5` にする。
- `complete.ts`: `summary.final` があれば、いちばん上に「テーマ『梅雨』を当てた！（2回目）」または「テーマは『梅雨』でした」。
- `records.ts`: `format === 'theme'` の日に、テーマを当てたかどうかの印をつける。

- [ ] **Step 1: 失敗するテストを書く** `tests/flow.test.ts`（既存の `click`・`answerCurrent` の小道具を使う。テスト用のセットは `vi.mock('../src/data', …)` か、Game に渡せるようにして固定のセットを使う。どちらにするかは実装する人が決める）
  - `test('テーマ型: 4問のあと5問目に進み、1回目で正解すると結果画面に出る')`: 4問答える → 画面に「この4つに共通するのは」→ パネルで theme を押して「決定」→ `themeDisplay` が出る → 「結果を見る」→ 結果画面に `themeDisplay` と「1回目」。保存の `daily[0].format === 'theme'`・`finalCorrect === true`・`finalAttempts === 1`。
  - `test('テーマ型: 3回まちがえると正解が見えて結果画面に進める')`: 2回まちがえた時点で `finalHints[0]`・`[1]` が両方見える。3回目で `themeDisplay` が見え、「決定」が無い。「結果を見る」で `finalCorrect === false`・点数に5問目の分が入らない。
  - `test('テーマ型: 5問目の途中で閉じても、答えた回数とヒントが残って再開できる')`: 1回まちがえる → 新しい `Game` を同じ localStorage で作り「今日の5問」→ 5問目の画面で `finalHints[0]` が見え、残り2回。（Review Focus 2）
  - `test('同じ文字が2枚あるパネルは両方使える')`: theme `'ここ'` のセットで、2枚の「こ」を順に押して正解になる。（Review Focus 3）
  - `test('旧形式の今日の途中経過が残っていても、テーマセットを最初から始める')`: `dailyProgress` に旧形式（`setId` なし・別のID）を入れておく → 1問目がセットの `questions[0]`。（Review Focus 1）
  - `test('旧形式で今日を解き終えていても落ちない')`: `daily` に `format` の無い今日の記録を入れておく → タイトルが「今日はおわり」の状態で描画でき、記録画面も開ける。（Review Focus 5）
  - `test('練習モードは今までどおり5問で終わる')`: 練習モードで5問答えると、5問目の画面を通らずに結果画面。
- [ ] **Step 2:** FAIL を確かめる。
- [ ] **Step 3:** 実装する。
- [ ] **Step 4:** `npm run check` → PASS。`npm run dev` を開き、幅375pxで今日の5問を最後まで遊んで、5問目の正解・3回不正解の両方を画面で確かめる（Playwright でスクリーンショットを `docs/shot-final.png` に）。
- [ ] **Step 5: Commit** `feat(theme): 今日の5問に5問目（共通点）を追加`

---

### Task 5: 30日分のセットと確かめるための一覧

**Files:**
- Modify: `src/data/theme-sets.json`（30セットにする）, `package.json`（`themes:list` を足す）
- Create: `scripts/export-theme-list.ts`, `docs/theme-sets-review.md`（生成物）

**Interfaces:**
- Consumes: `THEME_SETS`・`validateThemeSets`（Task 1）
- Produces: `npm run themes:list` → `docs/theme-sets-review.md`

セットの書き方の決まり（設計書3・5・6節より）:
- テーマは季節に頼らない、誰でも知っている言葉。ひらがなで2〜5文字。
- 4問は「テーマから遠い順」。1問目だけでは分からず、3〜4問目で「もしかして」となる並び。
- 4問に漢字・連想・穴埋めが最低1つずつ。
- 1〜4問目の答えは、どれもテーマとはっきりつながっていること（こじつけない）。
- `spoilers` にはテーマの別の書き方（カタカナ・別の漢字・別の読み）を入れる。
- 30セットでテーマが重ならない。セット同士で同じ答えを使い回さない。

- [ ] **Step 1:** `scripts/export-theme-list.ts` を作る。今の `export-question-list.ts` と同じ作り（生成日時・件数・検証結果・確かめ方の説明）で、セットごとに「ID / テーマ（表記）/ 1〜4問目の種類・お題・正解 / パネル / ヒント2つ / 解説 / 確かめる欄（1問目だけで分かってしまわないか・別の答えになるテーマはないか・4問とテーマのつながりは自然か）」の表を出す。
- [ ] **Step 2:** 30セットを書く（T-001〜T-030）。
- [ ] **Step 3:** `npm run validate` → エラー0。`npm run themes:list` で一覧を出し、自分で一度読み、決まりに合わないセットを直す。
- [ ] **Step 4:** `npm run check` → PASS。
- [ ] **Step 5: Commit** `feat(theme): 30日分のテーマセットと確認用の一覧を追加`

---

### Task 6: 説明の書き直し

**Files:**
- Modify: `README.md`（遊び方・今日の5問・スコア・問題データ・コマンド）, `docs/open-issues.md`

- [ ] **Step 1:** README の「今日の5問」「スコア」「問題を追加するには」を新しい形に書き直す。`themes:list` を「その他のコマンド」に足す。
- [ ] **Step 2:** `docs/open-issues.md` に足す: 「テーマが30日で一巡する」（高）、「季節のテーマは日付指定の仕組みが要る」（低）、「5問目の別の答え（テーマとして正しいのに不正解になる言葉）は人の目でしか確かめられない」（高）。E欄（次にやるなら）を今の状態に合わせて直す。
- [ ] **Step 3:** `npm run check` → PASS。
- [ ] **Step 4: Commit** `docs: 共通点型の今日の5問の説明に更新`
- [ ] **Step 5:** ブランチを push する（`git push -u origin feature/daily-theme`）。**main には入れない**。佐俣に `docs/theme-sets-review.md` の確認を頼む。
