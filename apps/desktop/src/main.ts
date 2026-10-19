import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as net from 'net';
import { spawn, ChildProcess, exec } from 'child_process';
import { resolveDataDir } from './data-dir';

const isDev = !app.isPackaged;
let serverProcess: ChildProcess | null = null;
let mainWin: BrowserWindow | null = null;
let isQuitting = false;
let autoRestartCount = 0;

function serverDir(): string {
  return isDev
    ? path.join(__dirname, '../../server')
    : path.join(process.resourcesPath, 'server');
}

function waitForPort(port: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      const sock = net.createConnection(port, '127.0.0.1');
      sock.on('connect', () => { sock.destroy(); resolve(); });
      sock.on('error', () => {
        sock.destroy();
        if (Date.now() >= deadline) return reject(new Error(`포트 ${port} 응답 없음 (${timeoutMs / 1000}초 초과)`));
        setTimeout(check, 600);
      });
    };
    check();
  });
}

function killPort3000(): Promise<void> {
  return new Promise((resolve) => {
    exec('netstat -ano | findstr :3000', (_err, stdout) => {
      if (!stdout) return resolve();
      const pids = new Set<string>();
      for (const line of stdout.split('\n')) {
        if (line.includes('LISTENING')) {
          const pid = line.trim().split(/\s+/).pop();
          if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
        }
      }
      if (pids.size === 0) return resolve();
      let n = pids.size;
      for (const pid of pids) {
        exec(`taskkill /F /PID ${pid}`, () => { if (--n === 0) resolve(); });
      }
    });
  });
}

async function startServer(): Promise<void> {
  if (serverProcess) {
    // 의도적 교체이므로 이 프로세스의 종료 핸들러가 자동 재시작하지 않도록 표시
    (serverProcess as ChildProcess & { __intentionalKill?: boolean }).__intentionalKill = true;
    serverProcess.kill('SIGTERM');
    serverProcess = null;
    await new Promise<void>((r) => setTimeout(r, 500));
  }
  await killPort3000();
  await new Promise<void>((r) => setTimeout(r, 300));

  // app.getPath('userData') 는 앱 이름(name/productName)에 따라 달라짐다.
  // 개발과 배포가 같은 DB 를 여도록 고정 경로 한 곳만 쓴다 (설계서 16.3).
  const dataDir = resolveDataDir();
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const serverEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DB_PATH: path.join(dataDir, 'job-program.sqlite'),
    // 렌더러를 서버와 같은 origin에서 서빙하게 해 세션 쿠키가 전송되도록 한다.
    ...(isDev ? {} : { RENDERER_DIST: path.join(process.resourcesPath, 'renderer/dist') }),
  };

  // 사용자가 userData에 .env 파일을 두었으면 병합 (SMTP, GEMINI 등 민감 설정)
  const userEnvFile = path.join(app.getPath('userData'), '.env');
  if (fs.existsSync(userEnvFile)) {
    for (const line of fs.readFileSync(userEnvFile, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m) serverEnv[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }

  const proc = spawn('node', ['dist/main.js'], {
    cwd: serverDir(),
    env: serverEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess = proc;

  let recentOutput = '';
  const capture = (d: Buffer) => {
    const s = d.toString();
    process.stdout.write(s);
    recentOutput = (recentOutput + s).slice(-4000);
  };
  proc.stdout?.on('data', capture);
  proc.stderr?.on('data', capture);

  let started = false;
  proc.on('exit', (code) => {
    if (serverProcess === proc) serverProcess = null;
    // 서버가 정상 기동 후 죽으면(크래시·강제종료 등) 앱이 자동으로 재시작한다.
    // 그래야 서버 한 번 죽었다고 전체가 "Failed to fetch"로 멈추지 않는다.
    if (!started || isQuitting) return;
    if ((proc as ChildProcess & { __intentionalKill?: boolean }).__intentionalKill) return;
    if (autoRestartCount >= 10) {
      console.error('[SERVER] 자동 재시작 10회 초과 — 중단');
      mainWin?.webContents.send('server:status', 'error');
      return;
    }
    autoRestartCount++;
    console.error(`[SERVER] 종료(code=${code}) — 자동 재시작 ${autoRestartCount}/10`);
    mainWin?.webContents.send('server:status', 'restarting');
    setTimeout(() => {
      startServer()
        .then(() => mainWin?.webContents.send('server:status', 'ready'))
        .catch((e) => {
          console.error('[SERVER] 자동 재시작 실패:', e);
          mainWin?.webContents.send('server:status', 'error');
        });
    }, 1500);
  });

  // 서버가 포트를 열기 전에 죽으면 120초를 기다리지 않고 즉시 실패시킨다.
  const earlyExit = new Promise<never>((_, reject) => {
    proc.on('exit', (code) => {
      if (!started) reject(new Error(`서버 프로세스가 기동 중 종료되었습니다 (code=${code}).\n${recentOutput}`));
    });
  });

  await Promise.race([waitForPort(3000, 120_000), earlyExit]);
  started = true;
  // 30초 이상 안정적으로 떠 있으면 자동 재시작 카운터를 리셋 (일시적 크래시와 크래시 루프 구분)
  setTimeout(() => { autoRestartCount = 0; }, 30_000);
}

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWin.loadURL('http://localhost:5173');
    mainWin.webContents.openDevTools();
  } else {
    // 서버와 같은 origin(http://localhost:3000)에서 로드해야 세션 쿠키가 유지된다.
    mainWin.loadURL('http://localhost:3000');
  }
}

ipcMain.handle('server:restart', async () => {
  mainWin?.webContents.send('server:status', 'restarting');
  try {
    await startServer();
    mainWin?.webContents.send('server:status', 'ready');
    return { success: true };
  } catch (e) {
    mainWin?.webContents.send('server:status', 'error');
    return { success: false, error: String(e) };
  }
});

app.whenReady().then(async () => {
  try {
    await startServer();
  } catch (e) {
    console.error('[DESKTOP] 서버 시작 실패:', e);
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  isQuitting = true;
  if (serverProcess) serverProcess.kill('SIGTERM');
  if (process.platform !== 'darwin') app.quit();
});
