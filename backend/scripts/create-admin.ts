import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../src/auth/password.util';
import { UserBootstrapService } from '../src/auth/user-bootstrap.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { promptPassword } from './prompt-password';

// Первый админ на чистой инсталляции: заглушки owner@localhost.invalid там нет
// (её создаёт только миграция поверх существующих данных), так что set-owner
// не подходит, а make-admin работает лишь с уже существующим пользователем.
// Учётка создаётся тем же путём, что и из админки: пользователь + настройки +
// дефолтные сферы одной транзакцией.
const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL as string) });

interface ParsedArgs {
  email?: string;
  timezone?: string;
  passwordStdin: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { passwordStdin: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--email') out.email = argv[++i];
    else if (arg === '--timezone') out.timezone = argv[++i];
    else if (arg === '--password-stdin') out.passwordStdin = true;
    else {
      console.error(`Неизвестный аргумент: ${arg}`);
      process.exit(1);
    }
  }
  return out;
}

async function readPassword(args: ParsedArgs): Promise<string> {
  const password = args.passwordStdin ? readFileSync(0, 'utf8').trim() : await promptPassword('Пароль: ');
  if (password.length < 8 || password.length > 128) {
    console.error('Пароль должен быть от 8 до 128 символов');
    process.exit(1);
  }
  return password;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.email) {
    console.error('Использование: bun run create-admin --email you@example.com [--timezone Europe/Moscow] [--password-stdin]');
    process.exit(1);
  }

  const email = args.email.trim().toLowerCase();
  const timezone = args.timezone ?? 'Europe/Moscow';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    console.error(`Неизвестный часовой пояс: ${timezone}`);
    process.exit(1);
  }

  if (await prisma.user.findUnique({ where: { email } })) {
    console.error(`Адрес ${email} уже занят. Сделать его админом — bun run make-admin --email ${email}`);
    process.exit(1);
  }

  const password = await readPassword(args);
  const bootstrap = new UserBootstrapService(prisma as unknown as PrismaService);
  const user = await bootstrap.createUser({ email, passwordHash: await hashPassword(password), timezone });
  await prisma.user.update({ where: { id: user.id }, data: { isAdmin: true } });
  console.log(`Админ создан: ${email} (${timezone}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
