import { describe, expect, it } from 'vitest';
import { buildExport, EVENT_LIMIT, EventLog } from '../src/lib/analytics';
import {
  DAILY_HISTORY_LIMIT,
  defaultSave,
  memoryStore,
  parseSave,
  SAVE_KEY,
  SaveStore,
} from '../src/lib/storage';
import type { SetSummary } from '../src/types';

function summary(over: Partial<SetSummary> = {}): SetSummary {
  return {
    mode: 'daily',
    dateKey: '2026-11-17',
    correctCount: 4,
    total: 5,
    maxStreak: 3,
    totalMs: 60000,
    hintCount: 1,
    score: 440,
    ...over,
  };
}

describe('保存データの読み込み', () => {
  it('何も無ければ初期値を返す', () => {
    const s = parseSave(null);
    expect(s.plays).toBe(0);
    expect(s.sound).toBe(true);
    expect(s.daily).toEqual([]);
    expect(s.playerId).toMatch(/^p_/);
  });

  it('壊れたJSONでも例外を投げず初期値に戻す', () => {
    expect(() => parseSave('{これはJSONではない')).not.toThrow();
    expect(parseSave('{これはJSONではない').plays).toBe(0);
  });

  it('配列や数値が入っていても初期値に戻す', () => {
    expect(parseSave('[1,2,3]').plays).toBe(0);
    expect(parseSave('42').plays).toBe(0);
    expect(parseSave('"文字列"').plays).toBe(0);
  });

  it('一部の項目だけ型が違っても、他の項目は生かす', () => {
    const raw = JSON.stringify({
      playerId: 'p_keepme',
      plays: 'たくさん',
      sound: 'yes',
      totalCorrect: 12,
      daily: 'こわれている',
    });
    const s = parseSave(raw);
    expect(s.playerId).toBe('p_keepme');
    expect(s.plays).toBe(0);
    expect(s.sound).toBe(true);
    expect(s.totalCorrect).toBe(12);
    expect(s.daily).toEqual([]);
  });

  it('途中経過の中に壊れた回答が混ざっていても取り除く', () => {
    const raw = JSON.stringify({
      dailyProgress: {
        dateKey: '2026-11-17',
        questionIds: ['K-001', 'A-001'],
        index: 1,
        results: [
          { questionId: 'K-001', type: 'kanji', correct: true, given: '学生', elapsedMs: 1, hintUsed: false, points: 100 },
          { questionId: 'X', type: 'よくわからない', correct: true },
          'ごみ',
        ],
      },
    });
    const s = parseSave(raw);
    expect(s.dailyProgress?.results).toHaveLength(1);
  });

  it('format の無い古い記録は classic として読む', () => {
    const raw = JSON.stringify({
      daily: [
        { dateKey: '2026-11-16', correctCount: 3, total: 5, maxStreak: 2, totalMs: 1, hintCount: 0, score: 300 },
      ],
    });
    const rec = parseSave(raw).daily[0]!;
    expect(rec.format).toBe('classic');
    expect(rec.score).toBe(300);
    expect(rec.total).toBe(5);
    expect(rec.finalCorrect).toBeUndefined();
  });

  it('5問目の途中経過を保存して読み直せる', () => {
    const raw = JSON.stringify({
      dailyProgress: {
        dateKey: '2026-11-17',
        questionIds: ['T-001-1'],
        index: 4,
        results: [],
        setId: 'T-001',
        final: { picked: [2, 0], attempts: 1, given: ['いう'] },
      },
    });
    const p = parseSave(raw).dailyProgress!;
    expect(p.setId).toBe('T-001');
    expect(p.final).toEqual({ picked: [2, 0], attempts: 1, given: ['いう'] });
  });

  it('5問目の途中経過がおかしな値なら捨てるが落ちない', () => {
    const raw = JSON.stringify({
      dailyProgress: {
        dateKey: '2026-11-17',
        questionIds: ['T-001-1'],
        index: 4,
        results: [],
        setId: 'T-001',
        final: { picked: 'x', attempts: 'x', given: 3 },
      },
    });
    const p = parseSave(raw).dailyProgress!;
    expect(p.setId).toBe('T-001');
    expect(p.final).toBeUndefined();
  });

  it('アンケートの5段階が範囲外なら無効にする', () => {
    const raw = JSON.stringify({ survey: { fun: 99, playAgain: 'maybe', comment: 'よかった' } });
    const s = parseSave(raw);
    expect(s.survey?.fun).toBeNull();
    expect(s.survey?.playAgain).toBeNull();
    expect(s.survey?.comment).toBe('よかった');
  });
});

describe('SaveStore', () => {
  it('更新した内容が保存先に書き込まれる', () => {
    const store = memoryStore();
    const save = new SaveStore(store);
    save.update({ plays: 3 });
    const raw = store.getItem(SAVE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).plays).toBe(3);
  });

  it('壊れたデータを読み込んでも初期化して動き続ける', () => {
    const store = memoryStore();
    store.setItem(SAVE_KEY, 'こわれています');
    const save = new SaveStore(store);
    expect(save.get().plays).toBe(0);
    expect(JSON.parse(store.getItem(SAVE_KEY)!).plays).toBe(0);
  });

  it('同じ日の記録は上書きされる', () => {
    const save = new SaveStore(memoryStore());
    save.recordDaily(summary({ score: 100 }));
    save.recordDaily(summary({ score: 400 }));
    expect(save.get().daily).toHaveLength(1);
    expect(save.get().daily[0]!.score).toBe(400);
  });

  it('5問目の無い記録は classic として保存する', () => {
    const save = new SaveStore(memoryStore());
    save.recordDaily(summary());
    expect(save.get().daily[0]!.format).toBe('classic');
  });

  it('theme の記録を保存して読み直せる', () => {
    const store = memoryStore();
    const save = new SaveStore(store);
    save.recordDaily(
      summary({
        setId: 'T-001',
        final: { correct: true, attempts: 2, points: 150, given: ['あい', 'うみ'], elapsedMs: 9000 },
      }),
    );
    const rec = parseSave(store.getItem(SAVE_KEY)).daily[0]!;
    expect(rec.format).toBe('theme');
    expect(rec.setId).toBe('T-001');
    expect(rec.finalCorrect).toBe(true);
    expect(rec.finalAttempts).toBe(2);
  });

  it('履歴は上限を超えない', () => {
    const save = new SaveStore(memoryStore());
    for (let i = 1; i <= DAILY_HISTORY_LIMIT + 10; i += 1) {
      save.recordDaily(summary({ dateKey: `2026-01-${String(i).padStart(2, '0')}` }));
    }
    expect(save.get().daily.length).toBeLessThanOrEqual(DAILY_HISTORY_LIMIT);
  });

  it('練習モードの最高記録は点数が上がったときだけ更新する', () => {
    const save = new SaveStore(memoryStore());
    expect(save.recordPracticeBest(summary({ mode: 'practice', score: 300 }))).toBe(true);
    expect(save.recordPracticeBest(summary({ mode: 'practice', score: 200 }))).toBe(false);
    expect(save.recordPracticeBest(summary({ mode: 'practice', score: 500 }))).toBe(true);
    expect(save.get().practiceBest?.score).toBe(500);
  });

  it('同点なら速いほうを採用する', () => {
    const save = new SaveStore(memoryStore());
    save.recordPracticeBest(summary({ mode: 'practice', score: 300, totalMs: 60000 }));
    expect(save.recordPracticeBest(summary({ mode: 'practice', score: 300, totalMs: 30000 }))).toBe(
      true,
    );
    expect(save.get().practiceBest?.totalMs).toBe(30000);
  });

  it('リセットしても匿名の識別子は保つ', () => {
    const save = new SaveStore(memoryStore());
    const id = save.get().playerId;
    save.update({ plays: 10 });
    save.reset();
    expect(save.get().plays).toBe(0);
    expect(save.get().playerId).toBe(id);
  });

  it('保存先が書き込みに失敗してもゲームは落ちない', () => {
    const broken = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
      removeItem: () => {},
    };
    expect(() => new SaveStore(broken).update({ plays: 1 })).not.toThrow();
  });
});

describe('プレイログ', () => {
  it('イベントを記録して読み出せる', () => {
    const log = new EventLog(memoryStore(), 'p_test');
    log.push({ name: 'game_start' });
    log.push({ name: 'answer_correct', questionId: 'K-001', correct: true });
    expect(log.count()).toBe(2);
    expect(log.all()[0]!.playerId).toBe('p_test');
    expect(log.all()[0]!.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('上限を超えると古いものから捨てる', () => {
    const log = new EventLog(memoryStore(), 'p_test');
    for (let i = 0; i < EVENT_LIMIT + 50; i += 1) {
      log.push({ name: 'question_start', detail: { i } });
    }
    expect(log.count()).toBe(EVENT_LIMIT);
    expect(log.all()[0]!.detail?.i).toBe(50);
  });

  it('壊れたログは捨てて作り直す', () => {
    const store = memoryStore();
    store.setItem('kotoba-hirameki:events:v1', 'こわれています');
    const log = new EventLog(store, 'p_test');
    expect(log.count()).toBe(0);
    expect(() => log.push({ name: 'game_start' })).not.toThrow();
  });

  it('書き出し用のJSONに個人情報が入らない', () => {
    const save = defaultSave();
    const log = new EventLog(memoryStore(), save.playerId);
    log.push({ name: 'game_start' });
    const bundle = buildExport(save, log.all());
    const text = JSON.stringify(bundle);
    expect(bundle.app).toBe('kotoba-hirameki-game');
    expect(bundle.events).toHaveLength(1);
    expect(text).not.toMatch(/@/);
    expect(Object.keys(bundle)).toEqual([
      'app',
      'schemaVersion',
      'exportedAt',
      'playerId',
      'summary',
      'dailyRecords',
      'survey',
      'events',
    ]);
  });
});
