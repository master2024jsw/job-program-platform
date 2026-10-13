import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  apiBaseUrl: 'http://localhost:3000',
  restartServer: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('server:restart'),
  onServerStatus: (cb: (status: 'restarting' | 'ready' | 'error') => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, status: string) => cb(status as 'restarting' | 'ready' | 'error');
    ipcRenderer.on('server:status', handler);
    return () => ipcRenderer.removeListener('server:status', handler);
  },
});
