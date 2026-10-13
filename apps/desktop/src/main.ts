import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as net from 'net';
import { spawn, ChildProcess, exec } from 'child_process';

const isDev = !app.isPackaged;
let serverProcess: ChildProcess | null = null;
let mainWin: BrowserWindow | null = null;

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
    serverProcess.kill('SIGTERM');
    serverProcess = null;
    await new Promise<void>((r) => setTimeout(r, 500));
  }
  await killPort3000();
  await new Promise<void>((r) => setTimeout(r, 300));

  serverProcess = spawn('node', ['dist/main.js'], {
    cwd: serverDir(),
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout?.on('data', (d: Buffer) => process.stdout.write(d.toString()));
  serverProcess.stderr?.on('data', (d: Buffer) => process.stderr.write(d.toString()));
  serverProcess.on('exit', (code) => {
    serverProcess = null;
    if (code !== 0 && code !== null) console.error(`[SERVER] 비정상 종료: ${code}`);
  });

  // 포트가 열릴 때까지 폴링 (최대 120초)
  await waitForPort(3000, 120_000);
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
    mainWin.loadFile(path.join(process.resourcesPath, 'renderer/dist/index.html'));
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

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill('SIGTERM');
  if (process.platform !== 'darwin') app.quit();
});
