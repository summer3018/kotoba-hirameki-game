import type { Game } from '../app';
import { buildExport, downloadJson } from '../lib/analytics';
import { h, screen } from '../lib/dom';

/** 「本当に消す？」の2段階確認は、ブラウザのダイアログを使わず画面内で行う */
let confirmingReset = false;

export function renderSettings(game: Game): HTMLElement {
  const data = game.save.get();
  const soundOn = data.sound;

  return screen(
    'screen-settings',
    h(
      'div',
      { class: 'topbar' },
      h('button', {
        class: 'btn btn-quiet',
        type: 'button',
        text: '← もどる',
        onClick: () => {
          confirmingReset = false;
          game.tap();
          game.go('title');
        },
      }),
    ),
    h('h1', { text: '設定' }),

    h(
      'div',
      { class: 'card' },
      h(
        'div',
        { class: 'switch-row' },
        h('span', { style: 'font-weight:700', text: '効果音' }),
        h('button', {
          class: `btn ${soundOn ? 'selected' : ''}`,
          type: 'button',
          text: soundOn ? 'オン' : 'オフ',
          'aria-pressed': soundOn ? 'true' : 'false',
          onClick: () => game.toggleSound(),
        }),
      ),
      h('p', {
        class: 'note',
        text: '音はブラウザの決まりにより、最初の操作のあとから鳴り始めます。',
      }),
    ),

    h(
      'div',
      { class: 'card stack' },
      h('h2', { text: 'アンケート' }),
      h('p', {
        class: 'small',
        text: data.survey
          ? '回答済みです。内容はいつでも書き直せます。'
          : 'このゲームの感想を5つの質問でお聞かせください（任意）。',
      }),
      h('button', {
        class: 'btn',
        type: 'button',
        text: data.survey ? '回答を見直す' : 'アンケートに答える',
        onClick: () => {
          game.tap();
          game.go('survey');
        },
      }),
    ),

    h(
      'div',
      { class: 'card stack' },
      h('h2', { text: 'プレイ記録の書き出し' }),
      h('p', {
        class: 'small',
        text: `この端末に保存されている記録（${game.log.count()}件のイベントとアンケート）をJSONファイルとして保存できます。`,
      }),
      h('button', {
        class: 'btn',
        type: 'button',
        text: 'JSONをダウンロード',
        onClick: () => {
          game.tap();
          const bundle = buildExport(game.save.get(), game.log.all());
          downloadJson(`kotoba-hirameki_${game.today}.json`, bundle);
        },
      }),
      h('p', {
        class: 'note',
        text: '集めているのは問題ごとの正誤・所要時間・ヒント使用などの操作の記録だけです。氏名や連絡先は含みません。',
      }),
    ),

    h(
      'div',
      { class: 'card stack' },
      h('h2', { text: 'データを消す' }),
      h('p', { class: 'small', text: '記録・設定・アンケート・プレイログをすべて消します。元には戻せません。' }),
      confirmingReset
        ? h(
            'div',
            { class: 'choice-grid' },
            h('button', {
              class: 'btn',
              type: 'button',
              text: 'やめる',
              onClick: () => {
                confirmingReset = false;
                game.tap();
                game.render();
              },
            }),
            h('button', {
              class: 'btn btn-primary',
              type: 'button',
              text: '本当に消す',
              onClick: () => {
                confirmingReset = false;
                game.resetAll();
              },
            }),
          )
        : h('button', {
            class: 'btn',
            type: 'button',
            text: 'すべて消す',
            onClick: () => {
              confirmingReset = true;
              game.tap();
              game.render();
            },
          }),
    ),

    h('div', { class: 'spacer' }),
    h(
      'div',
      { class: 'stack' },
      h('p', { class: 'note', text: `端末内の識別子: ${data.playerId}` }),
      h('p', {
        class: 'note',
        text: 'この識別子は端末の中だけで使う匿名の文字列です。外部に送信されることはありません。',
      }),
    ),
  );
}
