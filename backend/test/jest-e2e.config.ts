import type { Config } from 'jest';

const config: Config = {
  rootDir: '..',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  testEnvironment: 'node',
  globalSetup: '<rootDir>/test/setup-e2e.ts',
  // Одна БД на все файлы — последовательно, чтобы тесты не топтали данные друг друга.
  maxWorkers: 1,
};
export default config;
