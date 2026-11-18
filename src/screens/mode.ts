import type { Game } from '../app';
import { h, screen } from '../lib/dom';
import {
  FINAL_POINTS,
  POINT_CORRECT,
  POINT_CORRECT_WITH_HINT,
  POINT_STREAK_BONUS,
} from '../lib/scoring';
import { todaysRecord } from '../lib/storage';

export function renderMode(game: Game): HTMLElement {
  const status = game.dailyStatus();
  const record = todaysRecord(game.save.get(), game.today);
  const best = game.save.get().practiceBest;

  const dailyLabel =
    status === 'done'
      ? '今日の5問（クリア済み）'
      : status === 'in-progress'
        ? `今日の5問のつづき（${game.dailyProgressCount()}/5）`
        : '今日の5問';

  const dailyNote =
    status === 'done'
      ? record
        ? `今日の結果: ${record.correctCount}/${record.total}問正解・${record.score}点`
        : '今日の分は終わっています'
      : '同じ日なら、いつ開いても同じ問題です';

  return screen(
    'screen-mode',
    h(
      'div',
      { class: 'topbar' },
      h('button', {
        class: 'btn btn-quiet',
        type: 'button',
        text: '← もどる',
        onClick: () => {
          game.tap();
          game.go('title');
        },
      }),
      h('span', { class: 'badge', text: game.today }),
    ),
    h('h1', { text: 'モードを選ぶ' }),

    h(
      'div',
      { class: 'card stack' },
      h('h2', { text: dailyLabel }),
      h('p', { class: 'small', text: dailyNote }),
      status === 'done'
        ? h('button', {
            class: 'btn',
            type: 'button',
            text: '今日の結果を見る',
            onClick: () => {
              game.tap();
              game.go('records');
            },
          })
        : h('button', {
            class: 'btn btn-primary',
            type: 'button',
            text: status === 'in-progress' ? 'つづきから' : 'はじめる',
            onClick: () => {
              game.tap();
              game.startSet('daily');
            },
          }),
    ),

    h(
      'div',
      { class: 'card stack' },
      h('h2', { text: '練習モード' }),
      h('p', {
        class: 'small',
        text: best
          ? `何度でも5問。最高記録 ${best.score}点（${best.correctCount}/5問正解）`
          : '何度でも5問。出題順は毎回変わります',
      }),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        text: 'はじめる',
        onClick: () => {
          game.tap();
          game.startSet('practice');
        },
      }),
    ),

    scoreRules(),

    h('div', { class: 'spacer' }),
    h('p', {
      class: 'note',
      text: '時間制限はありません。落ち着いて考えてください。',
    }),
  );
}

/** はじめる前に見せる、点数のきまり */
function scoreRules(): HTMLElement {
  const [first, second, third] = FINAL_POINTS;
  const items = [
    `1〜4問目: 正解 ${POINT_CORRECT}点（ヒントを使うと ${POINT_CORRECT_WITH_HINT}点）`,
    `つづけて正解すると、2問目から +${POINT_STREAK_BONUS}点`,
    `5問目（今日の5問だけ）: 1回目で当てると ${first}点・2回目 ${second}点・3回目 ${third}点。ヒントで答えを開いても減りません`,
    'かかった時間は点数に関係ありません',
  ];
  return h(
    'div',
    { class: 'card stack' },
    h('h2', { text: '点数のきまり' }),
    h('ul', { class: 'rule-list' }, ...items.map((t) => h('li', { class: 'small', text: t }))),
  );
}
