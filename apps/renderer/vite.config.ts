import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' 는 Electron이 file:// 프로토콜로 빌드 결과물을 로드할 수 있게 합니다.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
  },
});
