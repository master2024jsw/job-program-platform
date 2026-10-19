import * as os from 'os';
import * as path from 'path';

/**
 * 업무자료(DB·서류·받은메일)가 저장되는 단일 절대경로.
 *
 * 왜 필요한가 (설계서 01_Architecture_v2 §16.3, 02_Code_Audit F09):
 * 예전에는 DB 는 `DB_PATH`(Electron 이 userData 로 계산), 서류는 `process.cwd()/data` 를 따로 썼다.
 * 그래서 실행 방법마다 DB 가 갈라지고(4곳), 서류는 앱 설치 폴더 안에 저장돼
 * 재배포(`update-local.ps1` 의 포터블 폴더 통째 교체) 때 함께 삭제됐다.
 *
 * 이 함수가 유일한 기준점이다. 새로 자료를 저장하는 코드는 `process.cwd()` 를 쓰지 말고 이것을 쓴다.
 * (읽기 전용 앱 리소스인 `resources/` 는 앱과 함께 배포되므로 cwd 기준이 맞다 — 여기 포함하지 않는다.)
 *
 * 같은 로직이 `apps/desktop/src/data-dir.ts` 에도 있다 — 둘은 반드시 같은 경로를 돌려줘야 한다.
 */
export function resolveDataDir(): string {
  const override = process.env.JOBDORI_DATA_DIR;
  if (override && override.trim()) return path.resolve(override.trim());

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, '잡도리AI', 'data');
  }
  // Windows 전용 제품이지만, 다른 OS 에서도 앱 폴더 밖의 안정된 위치를 쓴다.
  return path.join(os.homedir(), '.잡도리AI', 'data');
}

/** DB 파일 경로. `DB_PATH` 가 있으면 그것이 우선한다. */
export function resolveDbPath(): string {
  const explicit = process.env.DB_PATH?.trim();
  if (explicit) {
    // 상대경로 DB_PATH 는 cwd 기준으로 해석되어 실행 폴더마다 다른 DB 를 여는
    // 버그로 이어진다(실제로 .env 에 ./data/... 가 들어 있어 자료가 갈렸다).
    // 절대경로만 인정하고, 상대경로는 DATA_DIR 기준으로 붙인다.
    return path.isAbsolute(explicit)
      ? explicit
      : path.join(resolveDataDir(), stripLeadingDot(explicit));
  }
  return path.join(resolveDataDir(), 'job-program.sqlite');
}

/** 상대경로 상단의 "./" 또는 ".\\" 를 떼어낸다. */
function stripLeadingDot(p: string): string {
  let out = p;
  while (out.startsWith("./") || out.startsWith(".\\")) out = out.slice(2);
  return out;
}
