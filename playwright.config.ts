import { defineConfig, devices } from '@playwright/test';

// 使用不常见端口，避免与机器上其他 vite preview 冲突
const PORT = 47_821;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    timeout: 60_000,
    // 必须由本配置启动服务，绝不复用端口上可能存在的外部进程
    reuseExistingServer: false,
  },
  projects: [
    {
      name: 'chromium-webgl2',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--use-angle=default', '--enable-unsafe-swiftshader'],
        },
      },
    },
  ],
});
