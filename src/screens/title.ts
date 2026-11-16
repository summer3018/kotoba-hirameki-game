import type { Game } from '../app';
import { h, screen } from '../lib/dom';

export function renderTitle(game: Game): HTMLElement {
  const data = game.save.get();
  const status = game.dailyStatus();

  const statusText =
    status === 'done'
      ? '今日の5問はクリア済みです'
      : status === 'in-progress'
        ? `今日の5問は ${game.dailyProgressCount()}問目まで進んでいます`
        : '今日の5問はまだ挑戦していません';

  return screen(
    'screen-title',
    h(
      'div',
      { class: 'title-hero center' },
      h('h1', { class: 'title-mark', text: 'ことばのひらめき' }),
      h('p', { class: 'title-copy', text: '1日3分、言葉でひらめく。' }),
    ),
    h(
      'div',
      { class: 'card center stack' },
      h('p', { class: 'small', text: statusText }),
      data.plays > 0
        ? h('p', { class: 'small', text: `これまでのプレイ: ${data.plays}回 / 正解 ${data.totalCorrect}問` })
        : h('p', { class: 'small', text: '漢字・連想・穴埋めの3種類を5問ずつ。制限時間はありません。' }),
    ),
    h('div', { class: 'spacer' }),
    h(
      'div',
      { class: 'btn-row' },
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        text: 'あそぶ',
        onClick: () => {
          game.tap();
          game.go('mode');
        },
      }),
      h('button', {
        class: 'btn',
        type: 'button',
        text: 'これまでの記録',
        onClick: () => {
          game.tap();
          game.go('records');
        },
      }),
      h('button', {
        class: 'btn btn-quiet',
        type: 'button',
        text: '設定',
        onClick: () => {
          game.tap();
          game.go('settings');
        },
      }),
    ),
    h('p', {
      class: 'note center',
      text: '記録はこの端末のブラウザにだけ保存されます。',
    }),
  );
}
