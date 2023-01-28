import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import * as path from 'path'
import AutoImport from 'unplugin-auto-import/vite'
import { defineConfig } from 'vite'
import eslintPlugin from 'vite-plugin-eslint'
import { createSvgIconsPlugin } from 'vite-plugin-svg-icons'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    AutoImport({
      include: [
        /\.[tj]sx?$/, // .ts, .tsx, .js, .jsx
      ],
      imports: ['react', 'react-router-dom'],
      dirs: [
        './src/core/**', // all nested modules
      ],
      dts: true,
      eslintrc: {
        enabled: true,
      },
    }),
    react(),
    eslintPlugin({
      failOnError: false,
      cache: false,
    }),
    createSvgIconsPlugin({
      iconDirs: [path.resolve(process.cwd(), 'src/assets/icons')],
      symbolId: 'icon-[dir]-[name]',
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@c': fileURLToPath(new URL('./src/components', import.meta.url)),

      '@ui': fileURLToPath(new URL('./src/components/Ui', import.meta.url)),
      '@interface': fileURLToPath(new URL('./src/core/interface', import.meta.url)),
      '@utils': fileURLToPath(new URL('./src/core/utils', import.meta.url)),
      '@store': fileURLToPath(new URL('./src/core/store', import.meta.url)),
    },
  },
  /* If proxy is needed
  server: {
    proxy: {
      "/api": "localhost:8080"
    }
  },
  */
  build: {
    sourcemap: true,
  },
  // css: {
  //   preprocessorOptions: {
  //     scss: {
  //       additionalData: '@import "@/assets/styles/utils/index.scss";',
  //     },
  //   },
  // },
})
