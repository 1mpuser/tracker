import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../src/auth/password.util';
import { promptPassword } from './prompt-password';

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
  let password: string;
  if (args.passwordStdin) {
    const data = readFileSync(0, 'utf8');
    password = data.trim();
  } else {
    password = await promptPassword('Новый пароль: ');
  }
  if (password.length < 8 || password.length > 128) {
    console.error('Пароль должен быть от 8 до 128 символов');
    process.exit(1);
  }
  return password;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.email) {
    console.error('Использование: bun run set-owner --email you@example.com --timezone Europe/Moscow [--password-stdin]');
    process.exit(1);
  }

  const email = args.email.trim().toLowerCase();
  const owner = await prisma.user.findUnique({ where: { email: 'owner@localhost.invalid' } });
  if (!owner) {
    console.error('Владелец уже назначен или база не из однопользовательской версии. Проверьте, что миграция multi_user применена.');
    process.exit(1);
  }

  const taken = await prisma.user.findUnique({ where: { email } });
  if (taken) {
    console.error(`Адрес ${email} уже занят`);
    process.exit(1);
  }

  const password = await readPassword(args);
  const timezone = args.timezone ?? 'Europe/Moscow';

  await prisma.user.update({
    where: { id: owner.id },
    data: { email, timezone, passwordHash: await hashPassword(password) },
  });
  console.log(`Владелец назначен: ${email} (${timezone}). Удалите заглушку owner@localhost.invalid.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
