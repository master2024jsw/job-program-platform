import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// base: './' 는 Electron이 file:// 프로토콜로 빌드 결과물을 로드할 수 있게 합니다.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      // shared 패키지가 CJS로 컴파일되어 Rollup이 named export를 못 찾는 문제 해결.
      // dev/prod 모두 TypeScript 소스를 직접 참조한다.
      '@job-program/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
  },
});
