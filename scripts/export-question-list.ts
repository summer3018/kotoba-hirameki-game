/**
 * 人が目で確かめるための問題一覧を docs/questions-review.md に書き出す。
 *
 *   npm run questions:list
 *
 * 自動検証（npm run validate）で分かるのは形式だけなので、
 * 「意味が通るか」「正解が1つに定まるか」はこの一覧を読んで判断する。
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ALL_QUESTIONS, ASSOC_QUESTIONS, FILL_QUESTIONS, KANJI_QUESTIONS } from '../src/data';
import { DIFFICULTY_LABEL } from '../src/types';
import { validateQuestions } from '../src/lib/validate';

const OUT = resolve(process.cwd(), 'docs/questions-review.md');

/** 表のセルを壊さないように整える */
function cell(s: string): string {
  return s.replace(/\|/g, '/').replace(/\n/g, ' ');
}

const report = validateQuestions(ALL_QUESTIONS);
const lines: string[] = [];

lines.push('# 問題一覧（人による確認用）');
lines.push('');
lines.push('このファイルは `npm run questions:list` で自動生成されます。直接編集しないでください。');
lines.push('');
lines.push(`- 生成日時: ${new Date().toISOString()}`);
lines.push(
  `- 問題数: 合計 ${report.total}問（漢字 ${report.countsByType.kanji} / 連想 ${report.countsByType.assoc} / 穴埋め ${report.countsByType.fill}）`,
);
lines.push(`- 自動検証: エラー ${report.errors.length}件 / 警告 ${report.warnings.length}件`);
lines.push('');
lines.push('## 確認のしかた');
lines.push('');
lines.push('自動検証では次のことは判定できません。必ず人の目で確認してください。');
lines.push('');
lines.push('1. お題と正解の意味が合っているか');
lines.push('2. 正解以外にも当てはまる答えが作れてしまわないか（とくに漢字の組み合わせ）');
lines.push('3. ヒントが正解を直接言ってしまっていないか、逆に関係のない内容になっていないか');
lines.push('4. 解説の説明が事実として正しいか');
lines.push('5. 一般的な日本語話者が短時間で解ける水準か（専門知識が要らないか）');
lines.push('6. 不快感を与える表現が含まれていないか');
lines.push('');
lines.push('確認して問題があれば、該当する `src/data/questions.*.json` を直してから');
lines.push('`npm run validate` と `npm run questions:list` を再実行してください。');
lines.push('');

lines.push('## パズル1: 漢字の組み合わせ');
lines.push('');
lines.push('※ 別解の有無は自動では判定できません。並んだ漢字から、お題にも当てはまる別の熟語が作れてしまわないか、人が確認してください。');
lines.push('');
lines.push('| ID | お題 | 使える漢字 | 正解 | 文字数 | ヒント | 解説 | 難易度 | 分類 |');
lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const q of KANJI_QUESTIONS) {
  lines.push(
    `| ${q.id} | ${cell(q.prompt)} | ${cell(q.tiles.join(' '))} | **${cell(q.answer)}** | ${[...q.answer].length} | ${cell(q.hint)} | ${cell(q.explanation)} | ${DIFFICULTY_LABEL[q.difficulty]} | ${cell(q.category)} |`,
  );
}
lines.push('');

lines.push('## パズル2: 言葉の連想');
lines.push('');
lines.push('| ID | 手がかり | 選択肢 | 正解 | ヒント | 解説 | 難易度 | 分類 |');
lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const q of ASSOC_QUESTIONS) {
  lines.push(
    `| ${q.id} | ${cell(q.clues.join(' / '))} | ${cell(q.choices.join(' / '))} | **${cell(q.answer)}** | ${cell(q.hint)} | ${cell(q.explanation)} | ${DIFFICULTY_LABEL[q.difficulty]} | ${cell(q.category)} |`,
  );
}
lines.push('');

lines.push('## パズル3: 穴埋め言葉');
lines.push('');
lines.push('※ 正解以外の選択肢を入れても別の言葉になってしまわないか、人が確認してください。');
lines.push('');
lines.push('| ID | 表示 | 選択肢 | 正解 | 完成形 | 他の選択肢を入れた形 | ヒント | 解説 | 難易度 | 分類 |');
lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const q of FILL_QUESTIONS) {
  const others = q.choices
    .filter((c) => c !== q.answer)
    .map((c) => q.display.replace('○', c))
    .join(' / ');
  lines.push(
    `| ${q.id} | ${cell(q.display)} | ${cell(q.choices.join(' / '))} | **${cell(q.answer)}** | ${cell(q.word)} | ${cell(others)} | ${cell(q.hint)} | ${cell(q.explanation)} | ${DIFFICULTY_LABEL[q.difficulty]} | ${cell(q.category)} |`,
  );
}
lines.push('');

if (report.errors.length > 0 || report.warnings.length > 0) {
  lines.push('## 自動検証で出た指摘');
  lines.push('');
  for (const i of [...report.errors, ...report.warnings]) {
    lines.push(`- ${i.level === 'error' ? 'エラー' : '警告'} [${i.questionId}] ${i.field}: ${i.message}`);
  }
  lines.push('');
}

writeFileSync(OUT, `${lines.join('\n')}\n`, 'utf8');
console.log(`問題一覧を書き出しました: ${OUT}`);
console.log(`合計 ${report.total}問`);
