/**
 * 問題データの自動検証を実行する。
 *
 *   npm run validate
 *
 * 練習モードの問題と、今日の5問のテーマセットの両方を確かめる。
 * エラーが1件でもあれば終了コード1で終わる（CIやコミット前チェックに使える）。
 * 確かめられるのは形式だけで、意味の正しさ・正解の一意性は保証しない。
 */
import { ALL_QUESTIONS, THEME_SETS } from '../src/data';
import {
  formatReport,
  formatThemeReport,
  validateQuestions,
  validateThemeSets,
} from '../src/lib/validate';

const report = validateQuestions(ALL_QUESTIONS);
console.log(formatReport(report));

const themeReport = validateThemeSets(THEME_SETS);
console.log('');
console.log(formatThemeReport(themeReport));

if (!report.ok || !themeReport.ok) {
  process.exitCode = 1;
}
