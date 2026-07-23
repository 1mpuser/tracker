import { BUCKET_TABS, CLARIFY, CLARIFY_START, groupByStatus, sortGtdItems } from './gtd';
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

describe('sortGtdItems', () => {
  function it2(over: Partial<GtdItem>): GtdItem {
    return {
      id: over.id ?? 0, title: 't', notes: null, status: 'backlog', parentId: null,
      scheduledDate: null, plannedDate: null, dueDate: null, priority: false,
      waitingFor: null, order: over.order ?? 0, completedAt: null, ...over,
    };
  }

  it('puts priority items first', () => {
    const r = sortGtdItems([it2({ id: 1, order: 0 }), it2({ id: 2, order: 1, priority: true })]);
    expect(r.map((i) => i.id)).toEqual([2, 1]);
  });

  it('sorts by nearest dueDate within same priority, no-due last', () => {
    const r = sortGtdItems([
      it2({ id: 1, order: 0, dueDate: null }),
      it2({ id: 2, order: 1, dueDate: '2026-08-01' }),
      it2({ id: 3, order: 2, dueDate: '2026-07-25' }),
    ]);
    expect(r.map((i) => i.id)).toEqual([3, 2, 1]);
  });

  it('breaks ties by order and does not mutate input', () => {
    const input = [it2({ id: 1, order: 2 }), it2({ id: 2, order: 1 })];
    const r = sortGtdItems(input);
    expect(r.map((i) => i.id)).toEqual([2, 1]);
    expect(input.map((i) => i.id)).toEqual([1, 2]);
  });
});
