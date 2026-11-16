import type { Game } from '../app';
import { h, screen } from '../lib/dom';
import type { SurveyAnswer } from '../lib/storage';

type Draft = Omit<SurveyAnswer, 'answeredAt'>;

const FAVORITE_OPTIONS = ['漢字の組み合わせ', '言葉の連想', '穴埋め言葉', '決められない'];

let draft: Draft | null = null;
let loadedFor: string | null = null;

function ensureDraft(game: Game): Draft {
  const saved = game.save.get().survey;
  const key = saved?.answeredAt ?? 'new';
  if (!draft || loadedFor !== key) {
    draft = saved
      ? {
          fun: saved.fun,
          playAgain: saved.playAgain,
          difficulty: saved.difficulty,
          favoriteType: saved.favoriteType,
          comment: saved.comment,
        }
      : { fun: null, playAgain: null, difficulty: null, favoriteType: null, comment: '' };
    loadedFor = key;
  }
  return draft;
}

/** 回答を捨てて次回また読み込ませる */
function resetDraft(): void {
  draft = null;
  loadedFor = null;
}

export function renderSurvey(game: Game): HTMLElement {
  const d = ensureDraft(game);

  const back = (): void => {
    game.tap();
    resetDraft();
    game.go(game.session?.summary ? 'complete' : 'title');
  };

  return screen(
    'screen-survey',
    h(
      'div',
      { class: 'topbar' },
      h('button', { class: 'btn btn-quiet', type: 'button', text: '← もどる', onClick: back }),
      h('span', { class: 'badge', text: '任意' }),
    ),
    h('h1', { text: 'アンケート' }),
    h('p', {
      class: 'lead',
      text: '今後の改善のためにお聞かせください。答えたくない項目は飛ばして構いません。',
    }),

    // 1. 面白さ
    h(
      'div',
      { class: 'card field' },
      h('span', { class: 'label', text: '1. このゲームは面白かったですか？' }),
      h('p', { class: 'small', text: '1＝つまらない ／ 5＝とても面白い' }),
      h(
        'div',
        { class: 'scale' },
        ...[1, 2, 3, 4, 5].map((n) =>
          h('button', {
            class: `btn ${d.fun === n ? 'selected' : ''}`,
            type: 'button',
            text: String(n),
            'aria-pressed': d.fun === n ? 'true' : 'false',
            onClick: () => {
              d.fun = n;
              game.tap();
              game.render();
            },
          }),
        ),
      ),
    ),

    // 2. 再訪意向
    h(
      'div',
      { class: 'card field' },
      h('span', { class: 'label', text: '2. また遊びたいですか？' }),
      h(
        'div',
        { class: 'choice-grid' },
        choiceButton(game, 'はい', d.playAgain === 'yes', () => {
          d.playAgain = 'yes';
        }),
        choiceButton(game, 'いいえ', d.playAgain === 'no', () => {
          d.playAgain = 'no';
        }),
      ),
    ),

    // 3. 難易度
    h(
      'div',
      { class: 'card field' },
      h('span', { class: 'label', text: '3. 難易度はどうでしたか？' }),
      h(
        'div',
        { class: 'choice-list' },
        choiceButton(game, '簡単', d.difficulty === 'easy', () => {
          d.difficulty = 'easy';
        }),
        choiceButton(game, 'ちょうどよい', d.difficulty === 'just', () => {
          d.difficulty = 'just';
        }),
        choiceButton(game, '難しい', d.difficulty === 'hard', () => {
          d.difficulty = 'hard';
        }),
      ),
    ),

    // 4. 好きな形式
    h(
      'div',
      { class: 'card field' },
      h('span', { class: 'label', text: '4. どの問題形式が一番好きですか？' }),
      h(
        'div',
        { class: 'choice-list' },
        ...FAVORITE_OPTIONS.map((label) =>
          choiceButton(game, label, d.favoriteType === label, () => {
            d.favoriteType = label;
          }),
        ),
      ),
    ),

    // 5. 自由記述
    h(
      'div',
      { class: 'card field' },
      h('span', { class: 'label', text: '5. 改善してほしい点はありますか？' }),
      h('textarea', {
        placeholder: '自由にお書きください（任意）',
        maxlength: '1000',
        value: d.comment,
        'aria-label': '改善してほしい点',
        onInput: (ev: Event) => {
          d.comment = (ev.target as HTMLTextAreaElement).value;
        },
      }),
    ),

    h('div', { class: 'spacer' }),
    h(
      'div',
      { class: 'btn-row' },
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        text: '回答を保存する',
        onClick: () => {
          game.tap();
          game.saveSurvey({ ...d });
          resetDraft();
          game.go(game.session?.summary ? 'complete' : 'title');
        },
      }),
      h('button', { class: 'btn btn-quiet', type: 'button', text: '答えずにもどる', onClick: back }),
    ),
    h('p', {
      class: 'note',
      text: '回答はこの端末に保存され、設定画面からJSONで書き出せます。自動で送信されることはありません。',
    }),
  );
}

function choiceButton(
  game: Game,
  label: string,
  selected: boolean,
  apply: () => void,
): HTMLElement {
  return h('button', {
    class: `btn ${selected ? 'selected' : ''}`,
    type: 'button',
    text: label,
    'aria-pressed': selected ? 'true' : 'false',
    onClick: () => {
      apply();
      game.tap();
      game.render();
    },
  });
}
