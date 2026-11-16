import type { Game } from '../app';
import { h, screen } from '../lib/dom';
import { formatDuration } from '../lib/scoring';
import { DAILY_HISTORY_LIMIT } from '../lib/storage';

export function renderRecords(game: Game): HTMLElement {
  const data = game.save.get();
  const best = data.practiceBest;

  const rows = data.daily.map((d) =>
    h(
      'div',
      { class: 'record-row' },
      h(
        'div',
        {},
        h('div', { class: 'date', text: formatDate(d.dateKey) }),
        h('div', {
          class: 'small',
          text: `${formatDuration(d.totalMs)}・最大${d.maxStreak}連続${d.hintCount > 0 ? `・ヒント${d.hintCount}回` : ''}`,
        }),
      ),
      h(
        'div',
        { class: 'center' },
        h('div', { style: 'font-weight:700', text: `${d.correctCount}/${d.total}` }),
        h('div', { class: 'small', text: `${d.score}点` }),
      ),
    ),
  );

  return screen(
    'screen-records',
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
    ),
    h('h1', { text: 'これまでの記録' }),

    h(
      'dl',
      { class: 'card stat-list' },
      statRow('プレイ回数', `${data.plays}回`),
      statRow('累計の正解数', `${data.totalCorrect}問`),
      statRow('最後に遊んだ日', data.lastPlayedDate ? formatDate(data.lastPlayedDate) : 'まだありません'),
      statRow(
        '練習モードの最高記録',
        best ? `${best.score}点（${best.correctCount}/5問正解）` : 'まだありません',
      ),
    ),

    h('h2', { text: '今日の5問の履歴' }),
    rows.length > 0
      ? h('div', { class: 'record-list' }, ...rows)
      : h('p', { class: 'empty', text: 'まだ記録がありません。「今日の5問」に挑戦してみてください。' }),

    h('div', { class: 'spacer' }),
    h('p', { class: 'note', text: `記録は最新${DAILY_HISTORY_LIMIT}日分まで、この端末のブラウザに保存されます。` }),
  );
}

function formatDate(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return key;
  return `${Number(m[2])}月${Number(m[3])}日`;
}

function statRow(label: string, value: string): HTMLElement {
  return h('div', { class: 'stat-row' }, h('dt', { text: label }), h('dd', { text: value }));
}
