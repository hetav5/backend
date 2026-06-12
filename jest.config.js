/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/libs', '<rootDir>/apps'],
  moduleNameMapper: {
    '^@shared$': '<rootDir>/libs/shared/src',
    '^@shared/(.*)$': '<rootDir>/libs/shared/src/$1',
  },
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
};
