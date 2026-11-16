import { currentStreak, type Game } from '../app';
import { h, screen } from '../lib/dom';
import { DIFFICULTY_LABEL, MODE_LABEL, TYPE_LABEL } from '../types';
import type { AssocQuestion, FillQuestion, KanjiQuestion } from '../types';

export function renderPlay(game: Game): HTMLElement {
  const s = game.session;
  const q = game.currentQuestion();
  if (!s || !q) {
    // 想定外の状態でも行き止まりにしない
    return screen(
      'screen-play',
      h('p', { class: 'empty', text: '問題を読み込めませんでした。' }),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        text: 'ホームへもどる',
        onClick: () => game.go('title'),
      }),
    );
  }

  const streak = currentStreak(s.results);

  const body =
    q.type === 'kanji'
      ? kanjiBody(game, q)
      : q.type === 'assoc'
        ? assocBody(game, q)
        : fillBody(game, q);

  return screen(
    'screen-play',
    h(
      'div',
      { class: 'topbar' },
      h('button', {
        class: 'btn btn-quiet',
        type: 'button',
        text: 'やめる',
        onClick: () => {
          game.tap();
          game.go('title');
        },
      }),
      h(
        'div',
        { class: 'stack', style: 'gap:4px;align-items:flex-end' },
        h('span', { class: 'badge', text: `${MODE_LABEL[s.mode]} ${s.index + 1}/${s.questions.length}` }),
        streak >= 2 ? h('span', { class: 'badge', text: `${streak}問つづけて正解中` }) : null,
      ),
    ),

    progressBar(game),

    h(
      'div',
      { class: 'topbar' },
      h('span', { class: 'badge', text: TYPE_LABEL[q.type] }),
      h('span', { class: 'small', text: DIFFICULTY_LABEL[q.difficulty] }),
    ),

    h('p', { class: 'question-prompt', text: q.prompt }),

    body,

    s.hintUsed
      ? h(
          'div',
          { class: 'hint-box' },
          h('span', { class: 'hint-label', text: 'ヒント' }),
          h('span', { text: q.hint }),
        )
      : h('button', {
          class: 'btn btn-quiet',
          type: 'button',
          text: 'ヒントを見る',
          onClick: () => game.useHint(),
        }),

    h('div', { class: 'spacer' }),
  );
}

function progressBar(game: Game): HTMLElement {
  const s = game.session!;
  const cells = s.questions.map((_, i) => {
    const r = s.results[i];
    const cls =
      r !== undefined ? (r.correct ? 'done-correct' : 'done-wrong') : i === s.index ? 'current' : '';
    return h('span', { class: cls });
  });
  return h('div', { class: 'progress', 'aria-hidden': 'true' }, ...cells);
}

/* ---------------- パズル1: 漢字の組み合わせ ---------------- */

function kanjiBody(game: Game, q: KanjiQuestion): HTMLElement {
  const s = game.session!;
  const len = [...q.answer].length;
  const picked = s.picked;

  const slots = Array.from({ length: len }, (_, i) => {
    const tileIndex = picked[i];
    const char = tileIndex === undefined ? '' : (q.tiles[tileIndex] ?? '');
    return h('div', { class: `slot ${char ? 'filled' : ''}`, text: char });
  });

  const tiles = q.tiles.map((char, i) =>
    h('button', {
      class: `btn tile ${picked.includes(i) ? 'used' : ''}`,
      type: 'button',
      text: char,
      'aria-label': `漢字 ${char} を選ぶ`,
      onClick: () => game.pickTile(i),
    }),
  );

  const chosen = picked.map((i) => q.tiles[i] ?? '').join('');

  return h(
    'div',
    { class: 'stack' },
    h('div', { class: 'answer-slots' }, ...slots),
    h('div', { class: 'tile-grid' }, ...tiles),
    h(
      'div',
      { class: 'choice-grid' },
      h('button', {
        class: 'btn',
        type: 'button',
        text: '1文字もどす',
        disabled: picked.length === 0,
        onClick: () => game.undoTile(),
      }),
      h('button', {
        class: 'btn',
        type: 'button',
        text: 'すべて消す',
        disabled: picked.length === 0,
        onClick: () => game.clearTiles(),
      }),
    ),
    h('button', {
      class: 'btn btn-primary',
      type: 'button',
      text: '決定',
      disabled: picked.length !== len,
      onClick: () => game.submit(chosen),
    }),
  );
}

/* ---------------- パズル2: 言葉の連想 ---------------- */

function assocBody(game: Game, q: AssocQuestion): HTMLElement {
  const clues = q.clues.map((c) => h('li', { text: c }));
  const choices = q.choices.map((c) =>
    h('button', {
      class: 'btn choice-word',
      type: 'button',
      text: c,
      onClick: () => game.submit(c),
    }),
  );
  return h(
    'div',
    { class: 'stack' },
    h('ul', { class: 'clue-list' }, ...clues),
    h('div', { class: 'choice-list' }, ...choices),
  );
}

/* ---------------- パズル3: 穴埋め言葉 ---------------- */

function fillBody(game: Game, q: FillQuestion): HTMLElement {
  const parts = [...q.display].map((c) =>
    c === '○' ? h('span', { class: 'hole', text: '○' }) : h('span', { text: c }),
  );
  const choices = q.choices.map((c) =>
    h('button', {
      class: 'btn choice-kana',
      type: 'button',
      text: c,
      'aria-label': `${c} を入れる`,
      onClick: () => game.submit(c),
    }),
  );
  return h(
    'div',
    { class: 'stack' },
    h('div', { class: 'card' }, h('div', { class: 'fill-word' }, ...parts)),
    h('div', { class: 'choice-grid' }, ...choices),
  );
}
