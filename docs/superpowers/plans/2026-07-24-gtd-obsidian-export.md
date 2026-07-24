# GTD C.3 — авто-экспорт Заметок в Obsidian — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Автоматически экспортировать `reference`-пункты GTD в Obsidian: изолированный `obsidian`-модуль (чистые хелперы + fs-запись, env-gated, graceful), интеграция в `GtdService.update`/`remove` + bulk-синк на старте, и инфраструктура (docker volume в `main-obsidian/GTD` через env).

**Architecture:** Backend пишет один `.md` на заметку в смонтированный `/vault`. Чистые хелперы (`noteFilename`/`noteContent`) — TDD. `ObsidianService` — fs + env, все ошибки проглатываются (экспорт не роняет API). Хост-путь vault — через `${OBSIDIAN_VAULT_DIR}` в compose.

**Tech Stack:** NestJS + Prisma, Bun, Jest, Docker Compose. Спека: `docs/superpowers/specs/2026-07-24-gtd-obsidian-export-design.md`.

## Global Constraints

- Рантайм — **Bun** (`bunx jest`, `bun run build`).
- Экспорт **никогда не бросает** в вызывающий код: все fs-операции в try/catch с лог-варнингом; при отсутствии `OBSIDIAN_EXPORT_DIR` — тихий no-op.
- Сервисные тесты мокают зависимости напрямую; чистые хелперы тестируются как функции.
- Только `reference`-пункты. Односторонний экспорт.
- Коммиты частые, по одному на задачу; **без** trailer `Co-Authored-By`.

**Предусловие:** `bun install` в `backend/`; postgres поднят. Backend-команды из `backend/`.

---

### Task 1: `obsidian`-модуль — чистые хелперы + `ObsidianService`

**Files:**
- Create: `backend/src/obsidian/obsidian.helpers.ts`, `backend/src/obsidian/obsidian.service.ts`, `backend/src/obsidian/obsidian.module.ts`
- Test: `backend/src/obsidian/obsidian.helpers.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export function noteFilename(item: { id: number; title: string }): string  // "<slug>-<id>.md"
  export function noteContent(item: { id: number; title: string; notes: string | null }, exported: string): string
  // ObsidianService.syncNote(item), .removeNote(id), .syncAllReference(items) — все async, все проглатывают ошибки
  ```

- [ ] **Step 1: Написать падающие тесты хелперов**

Create `backend/src/obsidian/obsidian.helpers.spec.ts`:
```ts
import { noteContent, noteFilename } from './obsidian.helpers';

describe('noteFilename', () => {
  it('keeps a normal title and appends -id.md', () => {
    expect(noteFilename({ id: 5, title: 'Полезная ссылка' })).toBe('Полезная ссылка-5.md');
  });
  it('sanitizes filesystem-unsafe characters', () => {
    expect(noteFilename({ id: 6, title: 'a/b:c*?' })).toBe('a-b-c-6.md');
  });
  it('falls back to zametka for an empty/blank title', () => {
    expect(noteFilename({ id: 7, title: '   ' })).toBe('zametka-7.md');
  });
  it('truncates very long titles to <= 80 slug chars', () => {
    const long = 'x'.repeat(200);
    const name = noteFilename({ id: 8, title: long });
    expect(name.endsWith('-8.md')).toBe(true);
    expect(name.length).toBeLessThanOrEqual(80 + '-8.md'.length);
  });
});

describe('noteContent', () => {
  it('builds frontmatter + notes body', () => {
    const md = noteContent({ id: 5, title: 'Ссылка', notes: 'тело заметки' }, '2026-07-24');
    expect(md).toContain('title: "Ссылка"');
    expect(md).toContain('gtdId: 5');
    expect(md).toContain('source: tracker-gtd');
    expect(md).toContain('exported: 2026-07-24');
    expect(md.trimEnd().endsWith('тело заметки')).toBe(true);
  });
  it('uses an empty body when notes is null', () => {
    const md = noteContent({ id: 9, title: 'T', notes: null }, '2026-07-24');
    expect(md).toContain('gtdId: 9');
    expect(md.split('---')[2].trim()).toBe('');
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run (из `backend/`): `bunx jest obsidian.helpers.spec.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать хелперы**

Create `backend/src/obsidian/obsidian.helpers.ts`:
```ts
export function noteFilename(item: { id: number; title: string }): string {
  let slug = item.title.replace(/[\/\\:*?"<>|\r\n]+/g, '-');
  slug = slug.replace(/-+/g, '-').replace(/^-+|-+$/g, '').trim();
  if (slug.length > 80) slug = slug.slice(0, 80).replace(/-+$/, '');
  if (!slug) slug = 'zametka';
  return `${slug}-${item.id}.md`;
}

export function noteContent(
  item: { id: number; title: string; notes: string | null },
  exported: string,
): string {
  const fm = [
    '---',
    `title: "${item.title.replace(/"/g, '\\"')}"`,
    `gtdId: ${item.id}`,
    'source: tracker-gtd',
    `exported: ${exported}`,
    '---',
    '',
    item.notes ?? '',
    '',
  ];
  return fm.join('\n');
}
```

- [ ] **Step 4: Запустить — проходит**

Run (из `backend/`): `bunx jest obsidian.helpers.spec.ts`
Expected: PASS.

- [ ] **Step 5: `ObsidianService` + модуль**

Create `backend/src/obsidian/obsidian.service.ts`:
```ts
import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { noteContent, noteFilename } from './obsidian.helpers';
import { formatDate, todayDate } from '../common/date.util';

interface RefItem {
  id: number;
  title: string;
  notes: string | null;
  status?: string;
}

@Injectable()
export class ObsidianService {
  private readonly logger = new Logger(ObsidianService.name);

  private dir(): string | null {
    return process.env.OBSIDIAN_EXPORT_DIR || null;
  }

  private async removeById(dir: string, id: number): Promise<void> {
    const suffix = `-${id}.md`;
    const entries = await fs.readdir(dir).catch(() => [] as string[]);
    await Promise.all(
      entries.filter((f) => f.endsWith(suffix)).map((f) => fs.unlink(path.join(dir, f)).catch(() => undefined)),
    );
  }

  async syncNote(item: RefItem): Promise<void> {
    const dir = this.dir();
    if (!dir) return;
    try {
      await fs.mkdir(dir, { recursive: true });
      await this.removeById(dir, item.id);
      const file = path.join(dir, noteFilename(item));
      await fs.writeFile(file, noteContent(item, formatDate(todayDate())), 'utf8');
    } catch (e) {
      this.logger.warn(`Obsidian syncNote(${item.id}) failed: ${e}`);
    }
  }

  async removeNote(id: number): Promise<void> {
    const dir = this.dir();
    if (!dir) return;
    try {
      await this.removeById(dir, id);
    } catch (e) {
      this.logger.warn(`Obsidian removeNote(${id}) failed: ${e}`);
    }
  }

  async syncAllReference(items: RefItem[]): Promise<void> {
    for (const item of items) {
      await this.syncNote(item);
    }
  }
}
```

Create `backend/src/obsidian/obsidian.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ObsidianService } from './obsidian.service';

@Module({
  providers: [ObsidianService],
  exports: [ObsidianService],
})
export class ObsidianModule {}
```

- [ ] **Step 6: Сборка**

Run (из `backend/`): `bunx jest obsidian.helpers.spec.ts` → PASS; `bun run build` → чисто.

- [ ] **Step 7: Коммит**

```bash
git add backend/src/obsidian
git commit -m "feat(backend): obsidian export module — note helpers + ObsidianService (env-gated, graceful)"
```

---

### Task 2: Интеграция в `GtdService` + bulk-синк на старте

**Files:**
- Modify: `backend/src/gtd/gtd.service.ts` (конструктор + `update`/`remove`)
- Modify: `backend/src/gtd/gtd.module.ts` (импорт `ObsidianModule`)
- Modify: `backend/src/main.ts` (bulk-синк reference после старта)
- Test: `backend/src/gtd/gtd.service.spec.ts`

**Interfaces:**
- Consumes: `ObsidianService.syncNote/removeNote/syncAllReference` (Task 1).

- [ ] **Step 1: Обновить существующие тесты `GtdService` под новый конструктор + написать интеграционные**

`GtdService` получает второй аргумент `obsidian`. Во всех `new GtdService(prisma)` в `backend/src/gtd/gtd.service.spec.ts` передать мок: в каждом `beforeEach` добавить
```ts
const obsidian = { syncNote: jest.fn(), removeNote: jest.fn(), syncAllReference: jest.fn() };
service = new GtdService(prisma, obsidian as any);
```
(заменив `new GtdService(prisma)`; где `prisma` — существующий мок).

Добавить новый describe в конец файла:
```ts
describe('GtdService reference -> obsidian', () => {
  let service: GtdService;
  let prisma: any;
  let obsidian: any;

  beforeEach(() => {
    prisma = { gtdItem: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() } };
    obsidian = { syncNote: jest.fn(), removeNote: jest.fn(), syncAllReference: jest.fn() };
    service = new GtdService(prisma, obsidian as any);
  });

  it('syncs a note when an item becomes reference', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue({ id: 1, status: 'inbox' });
    prisma.gtdItem.update.mockResolvedValue({
      id: 1, title: 'Ссылка', notes: 'x', status: 'reference', parentId: null,
      scheduledDate: null, plannedDate: null, dueDate: null, priority: false,
      waitingFor: null, order: 0, completedAt: null,
    });

    await service.update(1, { status: 'reference' });

    expect(obsidian.syncNote).toHaveBeenCalledWith(expect.objectContaining({ id: 1, status: 'reference' }));
    expect(obsidian.removeNote).not.toHaveBeenCalled();
  });

  it('removes the note when an item leaves reference', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue({ id: 2, status: 'reference' });
    prisma.gtdItem.update.mockResolvedValue({
      id: 2, title: 'T', notes: null, status: 'backlog', parentId: null,
      scheduledDate: null, plannedDate: null, dueDate: null, priority: false,
      waitingFor: null, order: 0, completedAt: null,
    });

    await service.update(2, { status: 'backlog' });

    expect(obsidian.removeNote).toHaveBeenCalledWith(2);
    expect(obsidian.syncNote).not.toHaveBeenCalled();
  });

  it('removes the note when a reference item is deleted', async () => {
    prisma.gtdItem.findUnique.mockResolvedValue({ id: 3, status: 'reference' });
    prisma.gtdItem.delete.mockResolvedValue({ id: 3 });

    await service.remove(3);

    expect(obsidian.removeNote).toHaveBeenCalledWith(3);
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run (из `backend/`): `bunx jest gtd.service.spec.ts`
Expected: FAIL (конструктор/вызовы obsidian).

- [ ] **Step 3: Реализовать интеграцию**

В `backend/src/gtd/gtd.service.ts`:
- Импорт: `import { ObsidianService } from '../obsidian/obsidian.service';`
- Конструктор:
```ts
  constructor(
    private prisma: PrismaService,
    private obsidian: ObsidianService,
  ) {}
```
- В `update`, после `const updated = await this.prisma.gtdItem.update(...)` (перед `return this.toView(updated)`):
```ts
    if (updated.status === 'reference') {
      await this.obsidian.syncNote(updated);
    } else if (existing.status === 'reference') {
      await this.obsidian.removeNote(id);
    }
```
- В `remove`, после проверки `existing` (перед или после `prisma.delete`):
```ts
    if (existing.status === 'reference') {
      await this.obsidian.removeNote(id);
    }
```

В `backend/src/gtd/gtd.module.ts` импортировать `ObsidianModule`:
```ts
import { ObsidianModule } from '../obsidian/obsidian.module';
// ...
@Module({
  imports: [ObsidianModule],
  controllers: [GtdController],
  providers: [GtdService],
  exports: [GtdService],
})
```

- [ ] **Step 4: Bulk-синк на старте в `main.ts`**

В `backend/src/main.ts`, после `await app.listen(...)`, добавить:
```ts
  try {
    const gtd = app.get(GtdService);
    const obsidian = app.get(ObsidianService);
    await obsidian.syncAllReference(await gtd.getItems('reference'));
  } catch (e) {
    // startup export is best-effort; never block boot
    console.warn('Obsidian startup sync skipped:', e);
  }
```
и импорты вверху:
```ts
import { GtdService } from './gtd/gtd.service';
import { ObsidianService } from './obsidian/obsidian.service';
```

- [ ] **Step 5: Тесты + сборка**

Run (из `backend/`): `bunx jest` → всё зелёное; `bun run build` → чисто.

- [ ] **Step 6: Коммит**

```bash
git add backend/src/gtd backend/src/main.ts
git commit -m "feat(backend): export reference items to Obsidian on change + startup bulk sync"
```

---

### Task 3: Инфраструктура — docker volume + env + docs

**Files:**
- Modify: `docker-compose.yml` (backend `volumes` + `environment`)
- Modify: `.env.example`
- Create: `.env` (gitignored — реальный путь пользователя)
- Modify: `README.md` (короткая секция про Obsidian-экспорт)

**Interfaces:**
- Produces: смонтированный `/vault` в backend-контейнере, указывающий на `main-obsidian/GTD` (через `OBSIDIAN_VAULT_DIR`).

- [ ] **Step 1: docker-compose**

В `docker-compose.yml`, сервис `backend`, в блок `environment:` добавить:
```yaml
      OBSIDIAN_EXPORT_DIR: /vault
```
и добавить блок `volumes` в сервис `backend` (на уровне `ports`/`environment`):
```yaml
    volumes:
      - "${OBSIDIAN_VAULT_DIR:-./data/obsidian-export}:/vault"
```

- [ ] **Step 2: `.env.example` + gitignore-проверка**

В `.env.example` добавить строку:
```
OBSIDIAN_VAULT_DIR=./data/obsidian-export
```
Проверить, что корневой `.env` игнорируется гитом:
Run (из корня): `git check-ignore .env && echo "ignored" || echo "NOT IGNORED — add .env to .gitignore"`
Если не игнорируется — добавить `/.env` в `.gitignore` (не корневой backend/.env, а именно compose-`.env`). Ожидаемо: `ignored`.

- [ ] **Step 3: Создать корневой `.env` с реальным путём**

Создать `/Users/1mpuser/Desktop/tracker/.env` со строкой (путь с пробелами — без кавычек, docker-compose читает значение целиком):
```
OBSIDIAN_VAULT_DIR=/Users/1mpuser/Library/Mobile Documents/iCloud~md~obsidian/Documents/main-obsidian/GTD
```
(Этот файл gitignored, в репозиторий не попадает.)

- [ ] **Step 4: README**

В `README.md` добавить короткую секцию (рядом с описанием сервисов), например:
```markdown
### Obsidian-экспорт Заметок (GTD)

GTD-пункты со статусом «Заметка» (`reference`) автоматически экспортируются `.md`-файлами
в Obsidian. Путь к папке хранилища задаётся `OBSIDIAN_VAULT_DIR` в корневом `.env`
(по умолчанию — локальная `./data/obsidian-export`). Backend монтирует её как `/vault`
и пишет туда при изменении Заметок + разово синкает все Заметки на старте.
```

- [ ] **Step 5: Валидация compose**

Run (из корня): `docker compose config >/dev/null && echo "compose OK"`
Expected: `compose OK` (интерполяция `${OBSIDIAN_VAULT_DIR}` разрешилась, volume-спека валидна).

- [ ] **Step 6: Коммит** (без `.env` — он gitignored)

```bash
git add docker-compose.yml .env.example README.md .gitignore
git commit -m "chore: mount Obsidian vault into backend, document OBSIDIAN_VAULT_DIR"
```

- [ ] **Step 7: Живая проверка (контроллер, после `docker compose up -d --build`)**

- Создать GTD-пункт, перевести в `reference` с заметкой → в `main-obsidian/GTD` появляется `.md` с frontmatter и телом.
- Правка `notes` → файл перезаписывается.
- Смена статуса с `reference` / удаление → файл исчезает.
- Рестарт бэкенда → все существующие Заметки синкаются.

---

## Self-Review

**Spec coverage:**
- Чистые хелперы `noteFilename`/`noteContent` (санитайз, кириллица, пусто→zametka, длина; frontmatter+тело) + TDD → Task 1. ✅
- `ObsidianService` env-gated, graceful (try/catch, no-op без dir), sync/remove/sync-all с удалением `*-<id>.md` (переименования) → Task 1. ✅
- Интеграция в `update` (в reference → sync; из reference → remove) и `remove` → Task 2. ✅
- Bulk-синк reference на старте (best-effort) → Task 2 Step 4. ✅
- docker volume в `main-obsidian/GTD` через `OBSIDIAN_VAULT_DIR`, env `OBSIDIAN_EXPORT_DIR=/vault`, дефолт `./data/obsidian-export`, docs → Task 3. ✅
- Вне объёма (импорт/двусторонний синк, UI, другие статусы, шаблон из UI) — не трогается. ✅

**Placeholder scan:** конкретный код/YAML/команды в каждом шаге.

**Type consistency:** `ObsidianService` методы (`syncNote`/`removeNote`/`syncAllReference`) объявлены в Task 1 и вызываются в Task 2 (`GtdService`, `main.ts`) и мокаются в Task 2-тестах с той же сигнатурой. `noteFilename`/`noteContent` — хелперы Task 1, используются в `ObsidianService`. `GtdService` двухаргументный конструктор — обновлён в коде и во всех тест-конструкторах (Task 2 Step 1). `OBSIDIAN_EXPORT_DIR` (контейнер, читает сервис) vs `OBSIDIAN_VAULT_DIR` (хост, compose) — различены согласованно.
