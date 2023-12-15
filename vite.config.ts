import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Ssl from '@vitejs/plugin-basic-ssl'
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), Ssl()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    }
  },
  optimizeDeps: {
      exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  server:{
    host:'0.0.0.0',
    https: true,
    proxy:{
      '/whisper':{
        target: 'http://192.168.131.31:9000/',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/whisper/, ''),
      }
    }
  }
})
