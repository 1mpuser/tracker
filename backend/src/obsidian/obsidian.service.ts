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
