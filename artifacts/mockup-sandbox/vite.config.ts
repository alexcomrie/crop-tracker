import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Default values
const DEFAULT_PORT = 3000;
const DEFAULT_BASE_PATH = '/';

// Retrieve environment variables with fallback defaults
const port = process.env.PORT || DEFAULT_PORT;
const basePath = process.env.BASE_PATH || DEFAULT_BASE_PATH;

export default defineConfig({
  plugins: [vue()],
  server: {
    port,
  },
  base: basePath,
});