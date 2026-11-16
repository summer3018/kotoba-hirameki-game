import './styles.css';
import { Game } from './app';

const root = document.getElementById('app');

if (root) {
  const game = new Game(root);
  // 想定外の例外でも真っ白にならないよう、最後の受け皿を用意する
  window.addEventListener('error', (ev) => {
    console.error('[kotoba-hirameki] 予期しないエラー', ev.error);
  });
  game.start();
} else {
  document.body.textContent = '画面の初期化に失敗しました。ページを再読み込みしてください。';
}
