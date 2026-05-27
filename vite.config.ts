import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import monacoEditorPlugin from 'vite-plugin-monaco-editor';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname, 'src/renderer'),
  plugins: [
    react(),
    monacoEditorPlugin({
      // outDir is already absolute; plugin default re-joins it with root → workers
      // get written to a bogus nested path inside src/. Return outDir directly.
      customDistPath: (_root, outDir) => path.join(outDir, 'monacoeditorwork'),
    })
  ],
  base: './',
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer')
    }
  }
});
