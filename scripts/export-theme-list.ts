/**
 * 今日の5問（共通点型）のテーマセットを、人が確かめるための一覧にして
 * docs/theme-sets-review.md に書き出す。
 *
 *   npm run themes:list
 *
 * 自動検証で分かるのは形式とネタばれ（テーマの言葉がそのまま出ていないか）まで。
 * テーマとのつながりが自然か・別の答えにならないかは、この一覧を読んで判断する。
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { THEME_SETS } from '../src/data';
import { THEME_EPOCH } from '../src/lib/selection';
import { TYPE_LABEL, type Question } from '../src/types';
import { validateThemeSets } from '../src/lib/validate';

const OUT = resolve(process.cwd(), 'docs/theme-sets-review.md');

function cell(s: string): string {
  return s.replace(/\|/g, '/').replace(/\n/g, ' ');
}

function answerOf(q: Question): string {
  return q.type === 'fill' ? q.word : q.answer;
}

/** 開始日から i 日目の日付 */
function dayOf(i: number): string {
  const [y, m, d] = THEME_EPOCH.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d! + i));
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

const report = validateThemeSets(THEME_SETS);
const lines: string[] = [];

lines.push('# テーマセット一覧（人による確認用）');
lines.push('');
lines.push('このファイルは `npm run themes:list` で自動生成されます。直接編集しないでください。');
lines.push('');
lines.push(`- 生成日時: ${new Date().toISOString()}`);
lines.push(`- セット数: ${THEME_SETS.length}（開始日 ${THEME_EPOCH} から1日1セット、使い切ったら最初に戻る）`);
lines.push(`- 自動検証: エラー ${report.errors.length}件 / 警告 ${report.warnings.length}件`);
lines.push('');
lines.push('## 確かめること');
lines.push('');
lines.push('1. **1問目だけでテーマが分かってしまわないか。** 1問目がいちばん遠く、4問目がいちばん分かりやすい並びになっているか');
lines.push('2. **4つの答えが、どれも自然にテーマとつながるか。** こじつけになっていないか');
lines.push('3. **別の答えにならないか。** 4つの答えに共通する、テーマ以外の言葉（パネルで作れるもの）がないか');
lines.push('4. 1〜4問目それぞれの正解が1つに決まるか（練習モードの問題と同じ確かめ方）');
lines.push('5. ヒント・解説の内容が事実として正しいか');
lines.push('');
lines.push('直すときは `src/data/theme-sets.json` を書き換えて、`npm run validate` と `npm run themes:list` を実行し直してください。');
lines.push('');

lines.push('## 早見表');
lines.push('');
lines.push('| ID | 最初に出る日 | テーマ | 1問目 | 2問目 | 3問目 | 4問目 |');
lines.push('| --- | --- | --- | --- | --- | --- | --- |');
THEME_SETS.forEach((set, i) => {
  const qs = set.questions.map((q) => cell(answerOf(q)));
  lines.push(`| ${set.id} | ${dayOf(i)} | **${cell(set.themeDisplay)}**（${cell(set.theme)}） | ${qs.join(' | ')} |`);
});
lines.push('');

lines.push('## セットごとの詳細');
lines.push('');
for (const set of THEME_SETS) {
  lines.push(`### ${set.id}　${set.themeDisplay}（${set.theme}）`);
  lines.push('');
  lines.push('| 問 | 種類 | お題・手がかり | 選択肢・パネル | 正解 | ヒント |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  set.questions.forEach((q, i) => {
    const prompt =
      q.type === 'assoc' ? q.clues.join(' / ') : q.type === 'fill' ? `${q.display}（${q.prompt}）` : q.prompt;
    const options = q.type === 'kanji' ? q.tiles.join(' ') : q.choices.join(' / ');
    lines.push(
      `| ${i + 1} | ${TYPE_LABEL[q.type]} | ${cell(prompt)} | ${cell(options)} | **${cell(answerOf(q))}** | ${cell(q.hint)} |`,
    );
  });
  lines.push('');
  lines.push(`- 5問目のパネル: ${set.tiles.join(' ')}`);
  lines.push(`- 5問目のヒント: ①${set.finalHints[0]} ②${set.finalHints[1]}`);
  lines.push(`- 解説: ${set.explanation}`);
  lines.push(`- 使ってはいけない言葉: ${[set.theme, set.themeDisplay, ...set.spoilers].join('・')}`);
  lines.push('- 確認: [ ] 1問目で分からない　[ ] つながりが自然　[ ] 別の答えがない');
  lines.push('');
}

if (report.errors.length > 0 || report.warnings.length > 0) {
  lines.push('## 自動検証で出た指摘');
  lines.push('');
  for (const i of [...report.errors, ...report.warnings]) {
    lines.push(`- ${i.level === 'error' ? 'エラー' : '警告'} [${i.questionId}] ${i.field}: ${i.message}`);
  }
  lines.push('');
}

writeFileSync(OUT, `${lines.join('\n')}\n`, 'utf8');
console.log(`テーマセット一覧を書き出しました: ${OUT}`);
console.log(`合計 ${THEME_SETS.length}セット`);
