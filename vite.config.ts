import { defineConfig } from 'vite';

export default defineConfig({
  // 相対パス配信にしておくと、静的ホスティングやサブディレクトリでもそのまま動く
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
});
