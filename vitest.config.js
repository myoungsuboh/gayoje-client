import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import Components from 'unplugin-vue-components/vite'
import { Vuetify3Resolver } from 'unplugin-vue-components/resolvers'
import { fileURLToPath, URL } from 'node:url'

// vitest 환경에서도 vite-plugin-vuetify + Components resolver 를 적용해
// VDialog/VIcon/VBtn 등 자동 import 가 동작 → "Failed to resolve component" warning 침묵.
// 운영 build 와 동일 resolution 으로 컴포넌트 mount 테스트 정확도 ↑.
export default defineConfig({
  plugins: [
    vue(),
    vuetify({ autoImport: true }),
    Components({
      resolvers: [Vuetify3Resolver()],
      // dts 는 vite.config.js 가 관리하므로 vitest 에선 생성 비활성화.
      dts: false,
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],
    // jsdom 에서 CSS.supports 등 일부 API 가 부족 → vuetify warning 회피용 server config.
    server: {
      deps: {
        inline: ['vuetify'],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // [2026-05-26] 컴포넌트 테스트 도입 후 coverage 도 components/ 포함.
      include: ['src/utils/**', 'src/store/**', 'src/composables/**', 'src/components/**'],
      exclude: ['**/*.test.js', '**/*.spec.js'],
    },
  },
})
