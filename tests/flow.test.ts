// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { Game } from '../src/app';
import { SET_SIZE } from '../src/lib/selection';
import type { Question } from '../src/types';

/**
 * 画面を実際に組み立てて、ボタンを押して最後まで進めるかを確かめる。
 * 「進行不能バグがないこと」をここで担保する。
 */

let root: HTMLElement;

beforeEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById('app') as HTMLElement;
});

function newGame(): Game {
  const game = new Game(root);
  game.start();
  return game;
}

function buttons(): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll('button'));
}

function click(label: string): void {
  const btn = buttons().find((b) => b.textContent?.trim() === label);
  if (!btn) {
    throw new Error(
      `「${label}」のボタンが見つかりません。今ある: ${buttons()
        .map((b) => b.textContent?.trim())
        .join(' / ')}`,
    );
  }
  if (btn.disabled) throw new Error(`「${label}」は押せない状態です`);
  btn.click();
}

function text(): string {
  return root.textContent ?? '';
}

/** 今の問題に、正解または不正解で答える（すべて画面のボタン操作で行う） */
function answerCurrent(game: Game, correct: boolean): void {
  const q = game.currentQuestion();
  if (!q) throw new Error('問題がありません');

  if (q.type === 'assoc' || q.type === 'fill') {
    const target = correct ? q.answer : q.choices.find((c) => c !== q.answer)!;
    click(target);
    return;
  }

  // 漢字: タイルを順に押して「決定」
  const chars = correct ? [...q.answer] : wrongKanji(q);
  for (const c of chars) {
    const tile = buttons().find(
      (b) => b.classList.contains('tile') && !b.classList.contains('used') && b.textContent === c,
    );
    if (!tile) throw new Error(`タイル「${c}」が見つかりません`);
    tile.click();
  }
  click('決定');
}

/** 正解にならない並びを作る */
function wrongKanji(q: Extract<Question, { type: 'kanji' }>): string[] {
  const len = [...q.answer].length;
  const reversed = [...q.answer].reverse();
  if (reversed.join('') !== q.answer) return reversed;
  // 回文のような熟語なら、別のタイルを混ぜる
  const other = q.tiles.find((t) => !q.answer.includes(t))!;
  return [other, ...[...q.answer].slice(1, len)];
}

/** 5問を最後まで進める */
function playSet(game: Game, pattern: boolean[]): void {
  for (let i = 0; i < SET_SIZE; i += 1) {
    expect(game.screen, `${i + 1}問目が表示されていない`).toBe('play');
    answerCurrent(game, pattern[i] ?? true);
    expect(game.screen).toBe('feedback');
    click(i === SET_SIZE - 1 ? '結果を見る' : '次の問題へ');
  }
  expect(game.screen).toBe('complete');
}

describe('基本の流れ', () => {
  it('タイトルから5問クリアまで進める（今日の5問）', () => {
    const game = newGame();
    expect(game.screen).toBe('title');
    expect(text()).toContain('ことばのひらめき');

    click('あそぶ');
    expect(game.screen).toBe('mode');

    click('はじめる'); // 今日の5問
    expect(game.screen).toBe('play');

    playSet(game, [true, true, true, true, true]);
    expect(text()).toContain('5問おわり');
    expect(game.session?.summary?.correctCount).toBe(5);
  });

  it('練習モードも最後まで進める', () => {
    const game = newGame();
    game.startSet('practice');
    playSet(game, [true, false, true, true, false]);
    expect(game.session?.summary?.correctCount).toBe(3);
  });

  it('不正解でも止まらずに次へ進める', () => {
    const game = newGame();
    game.startSet('practice');
    playSet(game, [false, false, false, false, false]);
    expect(game.session?.summary?.correctCount).toBe(0);
    expect(game.session?.summary?.score).toBe(0);
  });

  it('5問とも3形式の判定が働く', () => {
    const game = newGame();
    game.startSet('practice');
    const seen = new Set<string>();
    for (let i = 0; i < SET_SIZE; i += 1) {
      const q = game.currentQuestion()!;
      seen.add(q.type);
      answerCurrent(game, true);
      expect(game.session?.lastResult?.correct).toBe(true);
      click(i === SET_SIZE - 1 ? '結果を見る' : '次の問題へ');
    }
    expect(seen.size).toBe(3);
  });
});

describe('今日の5問', () => {
  it('同じ日に開き直すと同じ問題が出る', () => {
    const a = newGame();
    a.startSet('daily');
    const first = a.session!.questions.map((q) => q.id);

    const b = new Game(root);
    b.start();
    b.startSet('daily');
    expect(b.session!.questions.map((q) => q.id)).toEqual(first);
  });

  it('途中でやめても続きから再開できる', () => {
    const game = newGame();
    game.startSet('daily');
    const ids = game.session!.questions.map((q) => q.id);

    answerCurrent(game, true);
    click('次の問題へ');
    answerCurrent(game, true);
    click('次の問題へ');
    expect(game.session!.index).toBe(2);
    click('やめる');
    expect(game.screen).toBe('title');

    const again = new Game(root);
    again.start();
    expect(again.dailyStatus()).toBe('in-progress');
    expect(again.dailyProgressCount()).toBe(2);
    again.startSet('daily');
    expect(again.session!.index).toBe(2);
    expect(again.session!.questions.map((q) => q.id)).toEqual(ids);
    expect(again.session!.results).toHaveLength(2);
  });

  it('解き終えると済み扱いになり、記録に残る', () => {
    const game = newGame();
    game.startSet('daily');
    playSet(game, [true, true, false, true, true]);
    expect(game.dailyStatus()).toBe('done');
    expect(game.save.get().daily).toHaveLength(1);
    expect(game.save.get().daily[0]!.correctCount).toBe(4);
  });

  it('今日の分を終えたあとも練習モードは遊べる', () => {
    const game = newGame();
    game.startSet('daily');
    playSet(game, [true, true, true, true, true]);

    click('練習モードで もう5問');
    expect(game.screen).toBe('play');
    playSet(game, [true, true, true, true, true]);
    expect(game.save.get().plays).toBe(2);
  });
});

describe('ヒント', () => {
  it('ヒントを押すと内容が出て、点数が下がり、記録に残る', () => {
    const game = newGame();
    game.startSet('practice');
    const q = game.currentQuestion()!;

    click('ヒントを見る');
    expect(text()).toContain(q.hint);

    answerCurrent(game, true);
    expect(game.session!.lastResult!.hintUsed).toBe(true);
    expect(game.session!.lastResult!.points).toBe(50);
    expect(game.log.all().some((e) => e.name === 'hint_used')).toBe(true);
  });
});

describe('スコア', () => {
  it('連続正解でボーナスが付く', () => {
    const game = newGame();
    game.startSet('practice');
    playSet(game, [true, true, true, true, true]);
    // 100 + 120*4 = 580
    expect(game.session!.summary!.score).toBe(580);
    expect(game.session!.summary!.maxStreak).toBe(5);
  });

  it('練習モードの最高記録が保存される', () => {
    const game = newGame();
    game.startSet('practice');
    playSet(game, [true, true, true, true, true]);
    expect(game.save.get().practiceBest?.score).toBe(580);
  });
});

describe('プレイログ', () => {
  it('検証に必要なイベントが一通り記録される', () => {
    const game = newGame();
    game.startSet('practice');
    click('ヒントを見る');
    playSet(game, [true, false, true, true, true]);
    click('もう一度 練習する');

    const names = new Set(game.log.all().map((e) => e.name));
    for (const expected of [
      'game_start',
      'mode_select',
      'question_start',
      'answer_submit',
      'answer_correct',
      'answer_incorrect',
      'hint_used',
      'set_complete',
      'replay_start',
    ]) {
      expect(names.has(expected as never), `${expected} が記録されていない`).toBe(true);
    }
  });
});

describe('画面の行き来', () => {
  it('記録・設定・アンケートを開いて戻れる', () => {
    const game = newGame();
    click('これまでの記録');
    expect(game.screen).toBe('records');
    click('← もどる');
    expect(game.screen).toBe('title');

    click('設定');
    expect(game.screen).toBe('settings');
    click('アンケートに答える');
    expect(game.screen).toBe('survey');
    click('← もどる');
    expect(game.screen).toBe('title');
  });

  it('アンケートに答えると保存され、書き出しに含まれる', () => {
    const game = newGame();
    game.go('survey');
    click('4');
    click('はい');
    click('ちょうどよい');
    click('言葉の連想');
    const area = root.querySelector('textarea') as HTMLTextAreaElement;
    area.value = 'もっと問題がほしい';
    area.dispatchEvent(new window.Event('input'));
    click('回答を保存する');

    const survey = game.save.get().survey;
    expect(survey?.fun).toBe(4);
    expect(survey?.playAgain).toBe('yes');
    expect(survey?.difficulty).toBe('just');
    expect(survey?.favoriteType).toBe('言葉の連想');
    expect(survey?.comment).toBe('もっと問題がほしい');
  });

  it('アンケートを答えずに戻ってもゲームは続けられる', () => {
    const game = newGame();
    game.startSet('practice');
    playSet(game, [true, true, true, true, true]);
    expect(text()).toContain('アンケートのお願い');
    click('あとで');
    expect(game.save.get().survey).toBeNull();
    click('ホームへ');
    expect(game.screen).toBe('title');
  });
});

describe('設定', () => {
  it('効果音のオン・オフが保存される', () => {
    const game = newGame();
    game.go('settings');
    expect(game.save.get().sound).toBe(true);
    click('オン');
    expect(game.save.get().sound).toBe(false);
    click('オフ');
    expect(game.save.get().sound).toBe(true);
  });

  it('データ削除は2段階で確認してから消える', () => {
    const game = newGame();
    game.startSet('practice');
    playSet(game, [true, true, true, true, true]);
    game.go('settings');

    click('すべて消す');
    expect(text()).toContain('本当に消す');
    click('やめる');
    expect(game.save.get().plays).toBe(1);

    click('すべて消す');
    click('本当に消す');
    expect(game.save.get().plays).toBe(0);
    expect(game.log.count()).toBe(0);
    expect(game.screen).toBe('title');
  });
});

describe('壊れた保存データ', () => {
  it('localStorageにごみが入っていても起動できる', () => {
    window.localStorage.setItem('kotoba-hirameki:save:v1', 'こわれています');
    window.localStorage.setItem('kotoba-hirameki:events:v1', '{');
    const game = newGame();
    expect(game.screen).toBe('title');
    game.startSet('practice');
    playSet(game, [true, true, true, true, true]);
    expect(game.session?.summary?.correctCount).toBe(5);
  });

  it('進捗の問題IDが今日の問題と食い違っていれば最初から始める', () => {
    window.localStorage.setItem(
      'kotoba-hirameki:save:v1',
      JSON.stringify({
        dailyProgress: {
          dateKey: new Date().toISOString().slice(0, 10),
          questionIds: ['存在しない-1', '存在しない-2'],
          index: 2,
          results: [],
        },
      }),
    );
    const game = newGame();
    game.startSet('daily');
    expect(game.session!.index).toBe(0);
  });
});
