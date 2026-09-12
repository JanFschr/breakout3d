import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/breakout3d/' : '/',
}));
