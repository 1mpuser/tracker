import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../src/auth/password.util';
import { promptPassword } from './prompt-password';

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL as string) });

async function main() {
  const argv = process.argv.slice(2);
  let email: string | undefined;
  let passwordStdin = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--email') email = argv[++i];
    else if (argv[i] === '--password-stdin') passwordStdin = true;
    else {
      console.error(`Неизвестный аргумент: ${argv[i]}`);
      process.exit(1);
    }
  }
  if (!email) {
    console.error('Использование: bun run reset-password --email you@example.com [--password-stdin]');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) {
    console.error('Пользователь с таким адресом не найден');
    process.exit(1);
  }

  let password: string;
  if (passwordStdin) {
    password = readFileSync(0, 'utf8').trim();
  } else {
    password = await promptPassword('Новый пароль: ');
  }
  if (password.length < 8 || password.length > 128) {
    console.error('Пароль должен быть от 8 до 128 символов');
    process.exit(1);
  }

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });
  await prisma.session.deleteMany({ where: { userId: user.id } });
  console.log('Пароль сброшен, все сессии пользователя закрыты.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
