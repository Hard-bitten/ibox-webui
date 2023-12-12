import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    }
  },
  server:{
    host:'0.0.0.0',
    proxy:{
      '/whisper':{
        target: 'http://192.168.131.31:9000/',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/whisper/, ''),
      }
    }
  }
})
