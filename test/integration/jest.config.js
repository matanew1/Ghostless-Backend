/**
 * @file Jest config for integration tests against live Redis/Postgres.
 * Run with: `npm run test:integration`.
 * Requires: `docker-compose up -d postgres redis` and `npx prisma migrate deploy`.
 */
module.exports = {
  rootDir: '../../',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: 'test/integration/.*\\.int-spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  setupFiles: ['dotenv/config'],
  testTimeout: 60_000,
  moduleNameMapper: {
    '^@ghostless/contracts(.*)$': '<rootDir>/libs/contracts/src$1',
    '^@ghostless/common(.*)$':   '<rootDir>/libs/common/src$1',
    '^@ghostless/kafka(.*)$':    '<rootDir>/libs/kafka/src$1',
    '^@ghostless/database(.*)$': '<rootDir>/libs/database/src$1',
    '^@ghostless/network(.*)$':  '<rootDir>/libs/network/src$1',
  },
};
