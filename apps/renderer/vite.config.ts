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
  optimizeDeps: {
    // @job-program/shared는 워크스페이스 심볼릭 링크 패키지라 기본적으로는
    // esbuild 사전 번들링에서 제외되는데, dist 산출물이 CommonJS라
    // 브라우저가 named export(enum 등)를 인식하지 못한다. 강제로 포함시켜
    // ESM으로 변환되도록 한다.
    include: ['@job-program/shared'],
  },
});
