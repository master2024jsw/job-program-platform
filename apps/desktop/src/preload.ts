import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('api', {
  apiBaseUrl: 'http://localhost:3000',
});
