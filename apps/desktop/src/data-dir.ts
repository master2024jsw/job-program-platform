import * as os from 'os';
import * as path from 'path';

/**
 * 업무자료(DB·서류·받은메일)가 저장되는 단일 절대경로.
 *
 * `apps/server/src/common/data-dir.ts` 와 같은 로직이다 — 둘은 반드시 같은 경로를 돌려줘야 한다.
 * 별도 패키지로 빼지 않은 이유: `packages/shared` 에 새 값(const) export 를 추가하면
 * Vite 사전번들 캐시 문제와 렌더러 프로덕션 빌드(CJS named export) 문제를 건드리게 된다(CLAUDE.md 참고).
 *
 * `app.getPath('userData')` 를 쓰지 않는다. 그 경로는 개발 중에는 package.json 의 `name`,
 * 패키징 후에는 electron-builder 의 `productName` 을 따라가므로 개발과 배포가 서로 다른 DB 를 열게 된다.
 */
export function resolveDataDir(): string {
  const override = process.env.JOBDORI_DATA_DIR;
  if (override && override.trim()) return path.resolve(override.trim());

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, '잡도리AI', 'data');
  }
  return path.join(os.homedir(), '.잡도리AI', 'data');
}
