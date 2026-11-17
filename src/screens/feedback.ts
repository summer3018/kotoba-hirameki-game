import type { Game } from '../app';
import { h, screen } from '../lib/dom';
import { formatSeconds } from '../lib/scoring';
import type { Question } from '../types';

/** 画面に見せる「答え」の形。穴埋めは完成した言葉を見せる */
function answerText(q: Question): string {
  return q.type === 'fill' ? q.word : q.answer;
}

export function renderFeedback(game: Game): HTMLElement {
  const s = game.session;
  const result = s?.lastResult ?? null;
  const q = game.currentQuestion();

  if (!s || !result || !q) {
    return screen(
      'screen-feedback',
      h('p', { class: 'empty', text: '結果を表示できませんでした。' }),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        text: 'ホームへもどる',
        onClick: () => game.go('title'),
      }),
    );
  }

  const isLast = s.index + 1 >= s.questions.length;
  const toFinal = isLast && s.themeSet !== null;

  return screen(
    'screen-feedback',
    h('div', { class: 'topbar' }, h('span', { class: 'badge', text: `${s.index + 1}/${game.totalSteps()}` })),

    result.correct
      ? h(
          'div',
          { class: 'verdict correct' },
          h('div', { class: 'verdict-mark', text: '○' }),
          h('div', { class: 'verdict-text', text: 'ひらめいた！' }),
        )
      : h(
          'div',
          { class: 'verdict wrong' },
          h('div', { class: 'verdict-mark', text: '…' }),
          h('div', { class: 'verdict-text', text: 'おしい。答えはこちらです' }),
        ),

    result.correct
      ? h('div', { class: 'spark' }, h('i'), h('i'), h('i'), h('i'))
      : null,

    h(
      'div',
      { class: 'card stack' },
      h('div', { class: 'answer-reveal', text: answerText(q) }),
      q.type === 'fill' && !result.correct
        ? h('p', { class: 'small center', text: `選んだ文字: ${result.given}` })
        : null,
      q.type !== 'fill' && !result.correct && result.given
        ? h('p', { class: 'small center', text: `選んだ答え: ${result.given}` })
        : null,
      h('p', { text: q.explanation }),
    ),

    h(
      'dl',
      { class: 'stat-list' },
      statRow('かかった時間', formatSeconds(result.elapsedMs)),
      statRow('この問題の点数', `${result.points}点`),
      result.hintUsed ? statRow('ヒント', '使用しました') : null,
    ),

    h('div', { class: 'spacer' }),

    h('button', {
      class: 'btn btn-primary',
      type: 'button',
      text: toFinal ? '5問目へ' : isLast ? '結果を見る' : '次の問題へ',
      onClick: () => game.next(),
    }),
  );
}

function statRow(label: string, value: string): HTMLElement {
  return h('div', { class: 'stat-row' }, h('dt', { text: label }), h('dd', { text: value }));
}
