import type { GameMode, QuestionType } from '../types';
import type { KeyValueStore, SaveData } from './storage';

/**
 * 市場検証用のプレイログ。
 *
 * 収集するのは「どの問題でどれだけ時間がかかり、正解したか」だけ。
 * 氏名・連絡先・位置情報などの個人情報は一切扱わない。
 * 保存先は端末の localStorage のみで、どこにも自動送信しない。
 */

export const EVENT_KEY = 'kotoba-hirameki:events:v1';

/** 保持するイベント数の上限。超えたら古いものから捨てる */
export const EVENT_LIMIT = 500;

export type EventName =
  | 'game_start'
  | 'mode_select'
  | 'question_start'
  | 'answer_submit'
  | 'answer_correct'
  | 'answer_incorrect'
  | 'set_complete'
  | 'hint_used'
  | 'replay_start'
  | 'survey_submit';

export interface GameEvent {
  /** イベント発生時刻（ISO8601） */
  ts: string;
  name: EventName;
  /** 匿名のローカル識別子。端末内だけで使う */
  playerId: string;
  mode?: GameMode;
  questionId?: string;
  questionType?: QuestionType;
  /** 回答にかかったミリ秒 */
  elapsedMs?: number;
  correct?: boolean;
  hintUsed?: boolean;
  /** その他の補足（正解数など） */
  detail?: Record<string, string | number | boolean | null>;
}

export type EventPayload = Omit<GameEvent, 'ts' | 'playerId'>;

export class EventLog {
  private events: GameEvent[];

  constructor(
    private readonly store: KeyValueStore,
    private playerId: string,
  ) {
    this.events = this.load();
  }

  private load(): GameEvent[] {
    let raw: string | null = null;
    try {
      raw = this.store.getItem(EVENT_KEY);
    } catch {
      return [];
    }
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (e): e is GameEvent =>
          typeof e === 'object' && e !== null && typeof (e as GameEvent).name === 'string',
      );
    } catch {
      // 壊れていたら捨てて作り直す（ゲームは止めない）
      return [];
    }
  }

  setPlayerId(id: string): void {
    this.playerId = id;
  }

  push(payload: EventPayload): void {
    const event: GameEvent = {
      ts: new Date().toISOString(),
      playerId: this.playerId,
      ...payload,
    };
    this.events.push(event);
    if (this.events.length > EVENT_LIMIT) {
      this.events = this.events.slice(this.events.length - EVENT_LIMIT);
    }
    this.flush();
  }

  all(): readonly GameEvent[] {
    return this.events;
  }

  count(): number {
    return this.events.length;
  }

  clear(): void {
    this.events = [];
    this.flush();
  }

  private flush(): void {
    try {
      this.store.setItem(EVENT_KEY, JSON.stringify(this.events));
    } catch {
      // 容量超過などで書けないときは、半分に減らしてもう一度だけ試す
      this.events = this.events.slice(Math.floor(this.events.length / 2));
      try {
        this.store.setItem(EVENT_KEY, JSON.stringify(this.events));
      } catch {
        /* それでもだめなら諦める。ゲームの進行は妨げない */
      }
    }
  }
}

export interface ExportBundle {
  app: string;
  schemaVersion: number;
  exportedAt: string;
  playerId: string;
  summary: {
    plays: number;
    totalCorrect: number;
    lastPlayedDate: string | null;
    dailyRecords: number;
    practiceBest: SaveData['practiceBest'];
  };
  dailyRecords: SaveData['daily'];
  survey: SaveData['survey'];
  events: readonly GameEvent[];
}

export function buildExport(save: SaveData, events: readonly GameEvent[]): ExportBundle {
  return {
    app: 'kotoba-hirameki-game',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    playerId: save.playerId,
    summary: {
      plays: save.plays,
      totalCorrect: save.totalCorrect,
      lastPlayedDate: save.lastPlayedDate,
      dailyRecords: save.daily.length,
      practiceBest: save.practiceBest,
    },
    dailyRecords: save.daily,
    survey: save.survey,
    events,
  };
}

/** ブラウザでJSONファイルとして保存させる */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Safari で即時 revoke すると失敗することがあるので少し待つ
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
