import type { Game } from '../app';
import { h, screen } from '../lib/dom';
import { FINAL_MAX_ATTEMPTS } from '../lib/scoring';

/**
 * 5問目: 1〜4問目の答えに共通するテーマを、ひらがなのパネルで組み立てて当てる。
 */
export function renderFinal(game: Game): HTMLElement {
  const s = game.session;
  const f = s?.final ?? null;
  const set = s?.themeSet ?? null;

  if (!s || !f || !set) {
    return screen(
      'screen-final',
      h('p', { class: 'empty', text: '問題を読み込めませんでした。' }),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        text: 'ホームへもどる',
        onClick: () => game.go('title'),
      }),
    );
  }

  const ended = game.finalEnded();
  const total = game.totalSteps();
  const len = [...set.theme].length;
  const left = FINAL_MAX_ATTEMPTS - f.attempts;
  const hintsShown = set.finalHints.slice(0, Math.min(f.attempts, set.finalHints.length));

  const cards = game.answersSoFar().map((a, i) =>
    h('div', {
      class: `clue-card ${f.lastWrong ? 'flash' : ''} ${f.solved ? 'solved' : ''}`,
      style: `animation-delay:${i * 60}ms`,
      text: a,
    }),
  );

  const top = h(
    'div',
    { class: 'topbar' },
    ended
      ? h('span')
      : h('button', {
          class: 'btn btn-quiet',
          type: 'button',
          text: 'やめる',
          onClick: () => {
            game.tap();
            game.go('title');
          },
        }),
    h('span', { class: 'badge badge-final', text: `今日の5問 ${total}/${total}` }),
  );

  const progress = h(
    'div',
    { class: 'progress', 'aria-hidden': 'true' },
    ...s.questions.map((_, i) => {
      const r = s.results[i];
      return h('span', { class: r ? (r.correct ? 'done-correct' : 'done-wrong') : '' });
    }),
    h('span', { class: f.solved ? 'done-correct' : ended ? 'done-wrong' : 'current' }),
  );

  const heading = h(
    'div',
    { class: 'final-heading' },
    h('div', { class: 'final-label', text: '5問目' }),
    h('p', { class: 'question-prompt', text: 'この4つに共通するのは？' }),
  );

  const cardRow = h('div', { class: 'clue-cards' }, ...cards);

  const hints =
    hintsShown.length > 0 && !f.solved
      ? h(
          'div',
          { class: 'stack' },
          ...hintsShown.map((t) =>
            h('div', { class: 'hint-box' }, h('span', { class: 'hint-label', text: 'ヒント' }), h('span', { text: t })),
          ),
        )
      : null;

  if (ended) {
    return screen(
      'screen-final',
      top,
      progress,
      heading,
      cardRow,
      f.solved
        ? h(
            'div',
            { class: 'final-reveal solved' },
            h('div', { class: 'spark' }, h('i'), h('i'), h('i'), h('i'), h('i'), h('i')),
            h('div', { class: 'verdict-text', text: 'ひらめいた！' }),
            h('div', { class: 'final-theme', text: set.themeDisplay }),
            h('p', { class: 'small center', text: `${f.attempts}回目で正解` }),
          )
        : h(
            'div',
            { class: 'final-reveal' },
            h('div', { class: 'verdict-text', text: '答えは' }),
            h('div', { class: 'final-theme', text: set.themeDisplay }),
          ),
      h('div', { class: 'card' }, h('p', { text: set.explanation })),
      h('div', { class: 'spacer' }),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        text: '結果を見る',
        onClick: () => game.finishFinal(),
      }),
    );
  }

  const slots = Array.from({ length: len }, (_, i) => {
    const tileIndex = f.picked[i];
    const char = tileIndex === undefined ? '' : (set.tiles[tileIndex] ?? '');
    return h('div', { class: `slot ${char ? 'filled' : ''}`, text: char });
  });

  const tiles = set.tiles.map((char, i) =>
    h('button', {
      class: `btn tile final-tile ${f.picked.includes(i) ? 'used' : ''}`,
      type: 'button',
      text: char,
      'aria-label': `${char} を入れる`,
      onClick: () => game.pickFinalTile(i),
    }),
  );

  return screen(
    'screen-final',
    top,
    progress,
    heading,
    cardRow,
    f.lastWrong ? h('p', { class: 'final-miss center', text: 'おしい！ もう一度' }) : null,
    hints,
    h('div', { class: 'answer-slots' }, ...slots),
    h('div', { class: 'tile-grid' }, ...tiles),
    h(
      'div',
      { class: 'choice-grid' },
      h('button', {
        class: 'btn',
        type: 'button',
        text: '1文字もどす',
        disabled: f.picked.length === 0,
        onClick: () => game.undoFinalTile(),
      }),
      h('button', {
        class: 'btn',
        type: 'button',
        text: 'すべて消す',
        disabled: f.picked.length === 0,
        onClick: () => game.clearFinalTiles(),
      }),
    ),
    h('button', {
      class: 'btn btn-primary',
      type: 'button',
      text: '決定',
      disabled: f.picked.length !== len,
      onClick: () => game.submitFinal(),
    }),
    h('p', { class: 'small center', text: `答えられるのは あと${left}回` }),
    h('div', { class: 'spacer' }),
  );
}
