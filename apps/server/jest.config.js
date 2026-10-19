/**
 * 설계서 F14: "테스트가 설치되어 있다는 사실과 테스트가 실제로 통과했다는 사실을 구분한다."
 * jest 는 설치돼 있었으나 설정이 없어 한 번도 실행된 적이 없었다 (2026-10-15 확인).
 *
 * --passWithNoTests 를 쓰지 않는다. 테스트가 없으면 실패해야 한다.
 */
module.exports = {
  rootDir: 'src',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json', isolatedModules: true }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: ['**/*.ts'],
  coverageDirectory: '../coverage',
};
