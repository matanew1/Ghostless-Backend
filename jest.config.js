/**
 * @file Root Jest configuration for unit tests across apps and libs.
 * @module ghostless/jest
 */

module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['apps/**/*.ts', 'libs/**/*.ts'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@ghostless/contracts(.*)$': '<rootDir>/libs/contracts/src$1',
    '^@ghostless/common(.*)$': '<rootDir>/libs/common/src$1',
    '^@ghostless/kafka(.*)$': '<rootDir>/libs/kafka/src$1',
    '^@ghostless/database(.*)$': '<rootDir>/libs/database/src$1',
  },
};
