import { truncateAll } from './utils';
import { PrismaService } from '../src/prisma/prisma.service';

// truncateAll защищает от случайной чистки рабочей базы: имя реально
// подключённой БД она берёт из current_database() тем же соединением, которым
// потом чистит, и бросает ошибку, если в нём нет "test". Реальный путь чистки
// tracker_test проверяется в beforeEach всех остальных e2e-спеков.
describe('truncateAll safety', () => {
  it('отказывается чистить БД, чьё имя не содержит "test" — до TRUNCATE', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ current_database: 'tracker' }]),
      $executeRawUnsafe: jest.fn(),
    } as unknown as PrismaService;

    await expect(truncateAll(prisma)).rejects.toThrow(/test/);
    expect((prisma as any).$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('чистит тестовую БД (в имени есть "test") и не бросает', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ current_database: 'some_test_db' }])
        .mockResolvedValueOnce([{ tablename: 'User' }, { tablename: 'Day' }]),
      $executeRawUnsafe: jest.fn().mockResolvedValue({}),
    } as unknown as PrismaService;

    await expect(truncateAll(prisma)).resolves.toBeUndefined();
    expect((prisma as any).$executeRawUnsafe).toHaveBeenCalledWith(
      'TRUNCATE TABLE "User", "Day" RESTART IDENTITY CASCADE',
    );
  });
});
