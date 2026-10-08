import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import {passwordResetPlugin} from './server/passwordResetPlugin';
import {aiPlugin} from './server/aiPlugin';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const serverEnv = {...process.env, ...env};
  return {
    base: './',
    plugins: [react(), tailwindcss(), passwordResetPlugin(serverEnv), aiPlugin(serverEnv)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
