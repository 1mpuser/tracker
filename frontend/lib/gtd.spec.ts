import { BUCKET_TABS, CLARIFY, CLARIFY_START, groupByStatus, sortGtdItems, nextActionId, findSimilar } from './gtd';
import type { GtdItem } from '@/types/api';

function item(id: number, status: GtdItem['status']): GtdItem {
  return {
    id, title: `t${id}`, notes: null, status, parentId: null,
    scheduledDate: null, scheduledTime: null, plannedDate: null, dueDate: null, priority: false,
    waitingFor: null, acceptanceCriteria: null, discussWith: null, order: id, completedAt: null,
    decidedAt: null, deferCount: 0,
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
      waitingFor: null, acceptanceCriteria: null, discussWith: null, order: over.order ?? 0, completedAt: null,
      decidedAt: null, deferCount: 0, ...over,
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

describe('nextActionId', () => {
  function step(over: Partial<GtdItem>): GtdItem {
    return {
      id: over.id ?? 0, title: 't', notes: null, status: over.status ?? 'backlog', parentId: 1,
      scheduledDate: null, scheduledTime: null, plannedDate: null, dueDate: null, priority: false,
      waitingFor: null, acceptanceCriteria: null, discussWith: null,
      order: over.order ?? 0, completedAt: null,
      decidedAt: null, deferCount: 0, ...over,
    };
  }

  it('returns null for an empty list', () => {
    expect(nextActionId([])).toBeNull();
  });

  it('returns null when no step is in backlog', () => {
    const children = [step({ id: 1, status: 'waiting' }), step({ id: 2, status: 'calendar' })];
    expect(nextActionId(children)).toBeNull();
  });

  it('returns the id of the first backlog step by order', () => {
    const children = [
      step({ id: 1, status: 'waiting', order: 0 }),
      step({ id: 2, status: 'backlog', order: 2 }),
      step({ id: 3, status: 'backlog', order: 1 }),
    ];
    expect(nextActionId(children)).toBe(3);
  });

  it('ignores done steps', () => {
    const children = [step({ id: 1, status: 'done', order: 0 }), step({ id: 2, status: 'backlog', order: 1 })];
    expect(nextActionId(children)).toBe(2);
  });
});

import {
  lastDecisionDate, staleDays, isStale, isOverdue, needsEscalation, staleItems, overdueItems,
} from './gtd';

describe('протухание и просрочка', () => {
  function task(over: Partial<GtdItem>): GtdItem {
    return {
      id: over.id ?? 1, title: over.title ?? 'задача', notes: null, status: 'backlog', parentId: null,
      scheduledDate: null, scheduledTime: null, plannedDate: null, dueDate: null, priority: false,
      waitingFor: null, acceptanceCriteria: null, discussWith: null, order: 0, completedAt: null,
      decidedAt: null, deferCount: 0, ...over,
    };
  }

  describe('lastDecisionDate', () => {
    it('возвращает null, когда нет ни decidedAt, ни plannedDate', () => {
      expect(lastDecisionDate(task({}))).toBeNull();
    });

    it('берёт дневную часть decidedAt', () => {
      expect(lastDecisionDate(task({ decidedAt: '2026-07-24T22:15:00.000Z' }))).toBe('2026-07-24');
    });

    it('свежий plannedDate перевешивает старый decidedAt', () => {
      const t = task({ decidedAt: '2026-07-24T10:00:00.000Z', plannedDate: '2026-08-08' });
      expect(lastDecisionDate(t)).toBe('2026-08-08');
    });

    it('старый plannedDate не перевешивает свежий decidedAt', () => {
      const t = task({ decidedAt: '2026-08-10T10:00:00.000Z', plannedDate: '2026-07-20' });
      expect(lastDecisionDate(t)).toBe('2026-08-10');
    });
  });

  describe('staleDays', () => {
    it('считает дни от последнего решения до сегодня', () => {
      expect(staleDays(task({ decidedAt: '2026-08-05T10:00:00.000Z' }), '2026-08-12')).toBe(7);
    });

    it('возвращает Infinity, когда решения не было вовсе', () => {
      expect(staleDays(task({}), '2026-08-12')).toBe(Infinity);
    });
  });

  describe('isStale', () => {
    it('ровно 7 дней — протухла', () => {
      expect(isStale(task({ decidedAt: '2026-08-05T10:00:00.000Z' }), '2026-08-12')).toBe(true);
    });

    it('6 дней — ещё нет', () => {
      expect(isStale(task({ decidedAt: '2026-08-06T10:00:00.000Z' }), '2026-08-12')).toBe(false);
    });

    it('свежий plannedDate спасает старую decidedAt', () => {
      const t = task({ decidedAt: '2026-07-19T10:00:00.000Z', plannedDate: '2026-08-08' });
      expect(isStale(t, '2026-08-12')).toBe(false);
    });

    it('не backlog — никогда не протухает', () => {
      const t = task({ status: 'someday', decidedAt: '2026-07-01T10:00:00.000Z' });
      expect(isStale(t, '2026-08-12')).toBe(false);
    });
  });

  describe('isOverdue', () => {
    it('вчерашняя дата в календаре — просрочка', () => {
      const t = task({ status: 'calendar', scheduledDate: '2026-08-11' });
      expect(isOverdue(t, '2026-08-12')).toBe(true);
    });

    it('сегодняшняя дата — не просрочка', () => {
      const t = task({ status: 'calendar', scheduledDate: '2026-08-12' });
      expect(isOverdue(t, '2026-08-12')).toBe(false);
    });

    it('дата у задачи не из календаря игнорируется', () => {
      const t = task({ status: 'backlog', scheduledDate: '2026-07-27' });
      expect(isOverdue(t, '2026-08-12')).toBe(false);
    });
  });

  describe('needsEscalation', () => {
    it('два откладывания — рано', () => {
      expect(needsEscalation(task({ deferCount: 2 }))).toBe(false);
    });

    it('три откладывания — пора', () => {
      expect(needsEscalation(task({ deferCount: 3 }))).toBe(true);
    });
  });

  describe('staleItems и overdueItems', () => {
    it('staleItems отдаёт только протухшие, от самых старых', () => {
      const items = [
        task({ id: 1, decidedAt: '2026-08-11T10:00:00.000Z' }),
        task({ id: 2, decidedAt: '2026-07-19T10:00:00.000Z' }),
        task({ id: 3, decidedAt: '2026-07-24T10:00:00.000Z' }),
      ];
      expect(staleItems(items, '2026-08-12').map((i) => i.id)).toEqual([2, 3]);
    });

    it('overdueItems отдаёт только просроченные, от самых старых', () => {
      const items = [
        task({ id: 1, status: 'calendar', scheduledDate: '2026-08-13' }),
        task({ id: 2, status: 'calendar', scheduledDate: '2026-08-06' }),
        task({ id: 3, status: 'calendar', scheduledDate: '2026-07-25' }),
      ];
      expect(overdueItems(items, '2026-08-12').map((i) => i.id)).toEqual([3, 2]);
    });
  });
});

describe('findSimilar', () => {
  function named(id: number, title: string, status: GtdItem['status'] = 'backlog'): GtdItem {
    return {
      id, title, notes: null, status, parentId: null,
      scheduledDate: null, scheduledTime: null, plannedDate: null, dueDate: null, priority: false,
      waitingFor: null, acceptanceCriteria: null, discussWith: null, order: id, completedAt: null,
      decidedAt: null, deferCount: 0,
    };
  }

  const items = [
    named(1, 'прибраться в квартире', 'calendar'),
    named(2, 'закончить уборку в квартире'),
    named(3, 'Сходить в качалку'),
    named(4, 'Прибраться в квартире', 'archived'),
  ];

  it('находит совпадение независимо от регистра и словоформы вокруг общего слова', () => {
    const found = findSimilar('Прибраться в квартире', items);
    expect(found.map((i) => i.id).sort()).toEqual([1, 2]);
  });

  it('не находит ничего для несвязанного текста', () => {
    expect(findSimilar('оформить гошное резюме', items)).toEqual([]);
  });

  it('исключает архивные и выполненные', () => {
    const found = findSimilar('прибраться в квартире', items);
    expect(found.map((i) => i.id)).not.toContain(4);
  });

  it('игнорирует короткие слова', () => {
    expect(findSimilar('в на из', items)).toEqual([]);
  });

  it('пустая строка ничего не находит', () => {
    expect(findSimilar('   ', items)).toEqual([]);
  });

  it('уважает limit', () => {
    expect(findSimilar('квартире', items, 1)).toHaveLength(1);
  });
});
