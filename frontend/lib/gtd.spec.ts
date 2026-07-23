import { BUCKET_TABS, CLARIFY, CLARIFY_START, groupByStatus } from './gtd';
import type { GtdItem } from '@/types/api';

function item(id: number, status: GtdItem['status']): GtdItem {
  return {
    id, title: `t${id}`, notes: null, status, parentId: null,
    scheduledDate: null, waitingFor: null, order: id, completedAt: null,
  };
}

describe('CLARIFY funnel', () => {
  it('starts at the actionable question', () => {
    expect(CLARIFY_START).toBe('actionable');
    expect(CLARIFY[CLARIFY_START]).toBeDefined();
    expect(CLARIFY[CLARIFY_START].prompt).toMatch(/делать/i);
  });

  it('routes the "не за 5 минут" path to backlog', () => {
    const fiveMin = CLARIFY['fiveMin'];
    const backlog = fiveMin.options.find((o) => o.route?.status === 'backlog');
    expect(backlog).toBeDefined();
  });

  it('routes the calendar option and asks for a date', () => {
    const cal = CLARIFY['when'].options.find((o) => o.route?.status === 'calendar');
    expect(cal?.route?.needs).toBe('date');
  });

  it('every option either advances (next) or routes, never both empty', () => {
    for (const q of Object.values(CLARIFY)) {
      for (const o of q.options) {
        expect(Boolean(o.next) || Boolean(o.route)).toBe(true);
      }
    }
  });
});

describe('groupByStatus', () => {
  it('buckets items by their status', () => {
    const grouped = groupByStatus([item(1, 'inbox'), item(2, 'backlog'), item(3, 'inbox')]);
    expect(grouped.inbox.map((i) => i.id)).toEqual([1, 3]);
    expect(grouped.backlog.map((i) => i.id)).toEqual([2]);
    expect(grouped.done).toEqual([]);
  });
});

describe('BUCKET_TABS', () => {
  it('lists inbox first and covers every status', () => {
    expect(BUCKET_TABS[0].status).toBe('inbox');
    expect(BUCKET_TABS.map((b) => b.status)).toEqual([
      'inbox', 'backlog', 'calendar', 'project', 'waiting', 'someday', 'reference', 'done', 'archived',
    ]);
  });
});
