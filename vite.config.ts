import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  worker: { format: 'es' },
  test: {
    environment: 'node',
    // Chỉ quét test trong src, bỏ qua các worktree ở .claude/worktrees
    include: ['src/**/*.test.{ts,tsx}'],
    // Test mô phỏng vật lý (30 s mô phỏng) chạy lâu trên máy yếu/đang bận
    testTimeout: 60_000,
  },
});
