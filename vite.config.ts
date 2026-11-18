import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages sirve el proyecto en /<nombre-del-repositorio>/ ; el workflow fija VITE_BASE.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/apistock/',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
