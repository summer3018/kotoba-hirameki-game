import type { ThemeSet } from '../src/types';

/**
 * テスト用のテーマセット。検証をすべて通る形にしてある。
 * 呼ぶたびに新しいオブジェクトを返すので、テストの中で書き換えてよい。
 */
export function sampleSet(overrides: Partial<ThemeSet> = {}): ThemeSet {
  const base: ThemeSet = {
    id: 'T-901',
    theme: 'うみ',
    themeDisplay: '海',
    tiles: ['み', 'や', 'う', 'ま', 'か', 'わ'],
    finalHints: ['夏に出かける人が多い場所です', 'しょっぱい水がたくさんあります'],
    explanation: '砂浜・くじら・なみのり・かもめは、どれも海に関係があります。',
    spoilers: ['ウミ'],
    questions: [
      {
        id: 'T-901-1',
        type: 'kanji',
        prompt: '砂でおおわれた、波打ちぎわを表す2文字の言葉',
        tiles: ['砂', '浜', '石', '山'],
        answer: '砂浜',
        hint: 'はだしで歩くと足あとがつきます',
        explanation: '砂浜は、砂でおおわれた浜辺のことです。',
        difficulty: 1,
        category: '自然',
      },
      {
        id: 'T-901-2',
        type: 'assoc',
        prompt: '3つの手がかりから連想される言葉は？',
        clues: ['大きなひれがある', 'とても体が大きい', '頭からしおをふく'],
        choices: ['くじら', 'ぞう', 'きりん', 'うし'],
        answer: 'くじら',
        hint: '魚ではなく哺乳類です',
        explanation: '正解はくじら。世界でいちばん大きな動物の仲間です。',
        difficulty: 1,
        category: '生き物',
      },
      {
        id: 'T-901-3',
        type: 'fill',
        prompt: '○に入るひらがなは？',
        display: 'なみ○り',
        choices: ['の', 'に', 'が', 'と'],
        answer: 'の',
        word: 'なみのり',
        hint: 'ボードに乗って遊びます',
        explanation: 'なみのりは、波に乗って遊ぶことです。',
        difficulty: 1,
        category: '遊び',
      },
      {
        id: 'T-901-4',
        type: 'assoc',
        prompt: '3つの手がかりから連想される言葉は？',
        clues: ['白い鳥', '港でよく見かける', 'ミャーミャーと鳴く'],
        choices: ['かもめ', 'すずめ', 'からす', 'はと'],
        answer: 'かもめ',
        hint: '船のまわりを飛んでいることがあります',
        explanation: '正解はかもめ。水辺にすむ鳥です。',
        difficulty: 2,
        category: '生き物',
      },
    ],
  };
  return { ...structuredClone(base), ...overrides };
}
