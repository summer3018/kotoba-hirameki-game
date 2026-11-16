import type { Game } from '../app';
import { h, screen } from '../lib/dom';
import { formatDuration, formatSeconds } from '../lib/scoring';
import { MODE_LABEL, TYPE_LABEL } from '../types';
import type { Question } from '../types';

function answerText(q: Question | undefined): string {
  if (!q) return '―';
  return q.type === 'fill' ? q.word : q.answer;
}

export function renderComplete(game: Game): HTMLElement {
  const s = game.session;
  const summary = s?.summary ?? null;

  if (!s || !summary) {
    return screen(
      'screen-complete',
      h('p', { class: 'empty', text: '結果を表示できませんでした。' }),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        text: 'ホームへもどる',
        onClick: () => game.go('title'),
      }),
    );
  }

  const praise =
    summary.correctCount === summary.total
      ? '全問正解です。みごとなひらめきでした。'
      : summary.correctCount >= 3
        ? 'いい調子です。'
        : 'おつかれさまでした。答えを知れば次はひらめきます。';

  const reviews = game.reviewRows().map(({ result, question }) =>
    h(
      'div',
      { class: 'review-item' },
      h('span', { class: `mark ${result.correct ? 'ok' : 'ng'}`, text: result.correct ? '○' : '×' }),
      h('span', { class: 'word', text: answerText(question) }),
      h('span', { class: 'small', text: question ? TYPE_LABEL[question.type] : '' }),
      h('span', { class: 'meta', text: formatSeconds(result.elapsedMs) }),
    ),
  );

  return screen(
    'screen-complete',
    h(
      'div',
      { class: 'topbar' },
      h('span', { class: 'badge', text: `${MODE_LABEL[s.mode]} 終了` }),
      game.newBest ? h('span', { class: 'badge', text: '自己ベスト更新' }) : null,
    ),

    h('h1', { class: 'center', text: '5問おわり' }),
    h(
      'div',
      { class: 'score-big' },
      `${summary.correctCount}`,
      h('small', { text: ` / ${summary.total}問 正解` }),
    ),
    h('p', { class: 'lead center', text: praise }),

    h(
      'dl',
      { class: 'card stat-list' },
      statRow('スコア', `${summary.score}点`),
      statRow('最大の連続正解', `${summary.maxStreak}問`),
      statRow('かかった時間', formatDuration(summary.totalMs)),
      statRow('ヒント', summary.hintCount > 0 ? `${summary.hintCount}問で使用` : '使わずにクリア'),
    ),

    h('h2', { text: 'ふりかえり' }),
    h('div', { class: 'review-list' }, ...reviews),

    game.shouldOfferSurvey() ? surveyInvite(game) : null,

    h('div', { class: 'spacer' }),

    h(
      'div',
      { class: 'btn-row' },
      s.mode === 'practice'
        ? h('button', {
            class: 'btn btn-primary',
            type: 'button',
            text: 'もう一度 練習する',
            onClick: () => game.replay('practice'),
          })
        : h('button', {
            class: 'btn btn-primary',
            type: 'button',
            text: '練習モードで もう5問',
            onClick: () => game.replay('practice'),
          }),
      h('button', {
        class: 'btn',
        type: 'button',
        text: 'ホームへ',
        onClick: () => {
          game.tap();
          game.go('title');
        },
      }),
    ),
  );
}

function surveyInvite(game: Game): HTMLElement {
  return h(
    'div',
    { class: 'card stack' },
    h('h2', { text: 'アンケートのお願い' }),
    h('p', {
      class: 'small',
      text: '5問おつかれさまでした。よろしければ5つの質問にお答えください（1分ほど・任意）。答えなくても続けて遊べます。',
    }),
    h(
      'div',
      { class: 'choice-grid' },
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        text: '答える',
        onClick: () => {
          game.tap();
          game.go('survey');
        },
      }),
      h('button', {
        class: 'btn',
        type: 'button',
        text: 'あとで',
        onClick: () => game.dismissSurvey(),
      }),
    ),
  );
}

function statRow(label: string, value: string): HTMLElement {
  return h('div', { class: 'stat-row' }, h('dt', { text: label }), h('dd', { text: value }));
}
