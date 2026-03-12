import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Default values
const DEFAULT_PORT = 3000;
const DEFAULT_BASE_PATH = '/';

// Retrieve environment variables with fallback defaults
const port = process.env.PORT ? Number(process.env.PORT) : DEFAULT_PORT;
const basePath = process.env.BASE_PATH || DEFAULT_BASE_PATH;

export default defineConfig({
  plugins: [react()],
  server: {
    port,
  },
  base: basePath,
});