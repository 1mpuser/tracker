import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Аварийный путь назначения админа: ставит флаг существующему пользователю.
// Обычно владелец становится админом при переезде (set-owner), а здесь —
// на всякий случай, например чтобы починить ситуацию, где админов не осталось.
const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL as string) });

async function main() {
  const argv = process.argv.slice(2);
  let email: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--email') email = argv[++i];
    else {
      console.error(`Неизвестный аргумент: ${argv[i]}`);
      process.exit(1);
    }
  }
  if (!email) {
    console.error('Использование: bun run make-admin --email you@example.com');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) {
    console.error('Пользователь с таким адресом не найден');
    process.exit(1);
  }

  await prisma.user.update({ where: { id: user.id }, data: { isAdmin: true } });
  console.log(`${user.email} теперь админ.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
