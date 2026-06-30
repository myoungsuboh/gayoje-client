import { defineConfig } from 'vite'
import VueRouter from 'unplugin-vue-router/vite'
import vue from '@vitejs/plugin-vue'
import Layouts from 'vite-plugin-vue-layouts'
import vuetify from 'vite-plugin-vuetify'
import AutoImport from 'unplugin-auto-import/vite'
import { VueRouterAutoImports } from 'unplugin-vue-router'
import Components from 'unplugin-vue-components/vite'
import { Vuetify3Resolver } from 'unplugin-vue-components/resolvers'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import { fileURLToPath, URL } from 'node:url' // path 대신 사용

export default defineConfig({
  plugins: [
    VueRouter({
      routesFolder: 'src/pages',
      dts: 'src/typed-router.d.ts',
    }),
    vue(),
    Layouts(),
    vuetify({ autoImport: true }),
    AutoImport({
      imports: ['vue', 'pinia', VueRouterAutoImports],
      dts: 'src/auto-imports.d.ts',
    }),
    Components({
      resolvers: [Vuetify3Resolver()],
      dts: 'src/components.d.ts',
    }),
    // [i18n CSP] 메시지를 빌드타임에 precompile + runtime-only 빌드 사용 →
    // 런타임 new Function 제거(strict CSP: unsafe-eval 없이 동작). src/locales/* 대상.
    // [2026-06-03] strictMessage:false — 일부 메시지(stale.modal_body, vibe_intro,
    // faq_body 등)는 <strong>/<code>/<br> HTML 을 담아 v-html 로 렌더한다(개발자 통제
    // 정적 문자열). 기본값(strict)은 메시지 내 HTML 을 발견하면 precompile 을 '에러'로
    // 중단시켜 design 네임스페이스 전체가 번들에서 누락 → 운영에서 키 원문이 노출됐다.
    // strictMessage:false 로 HTML 허용(escapeHtml 은 기본 false 라 v-html 용 원문 유지).
    // include 는 .json 리소스만 — '**' 로 두면 ko/index.js·en/index.js(JS 집계 파일)까지
    // i18n 리소스로 처리해 빈 객체({})로 덮어써, 네임스페이스 전체가 누락됐다(키 원문 노출).
    VueI18nPlugin({
      include: [fileURLToPath(new URL('./src/locales/**/*.json', import.meta.url))],
      runtimeOnly: true,
      compositionOnly: true,
      strictMessage: false,
    }),
  ],
  resolve: {
    alias: {
      // __dirname 대신 import.meta.url 기반으로 경로 탐색
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@core': fileURLToPath(new URL('./src/@core', import.meta.url)),
    },
  },
  server: {
    port: 3000,
  },
  build: {
    // 청크 크기 경고 임계값 — vuetify 단일 청크가 700kB 근처라 800으로 상향
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // [2026-06 스킬 다국어] 비-ko 스킬 본문(.skills/**/SKILL.{en,ja,zh}.md, lazy)을
          // 언어별 단일 청크로 묶어 해당 언어 사용자만 1회 받게 한다(ko 번들 무변).
          const sk = id.match(/[\\/]\.skills[\\/].*[\\/]SKILL\.(en|ja|zh)\.md/)
          if (sk) return `skills-${sk[1]}`
          if (!id.includes('node_modules')) return
          if (id.includes('vuetify')) return 'vuetify'
          if (id.includes('@vue') || /node_modules[\\/]vue[\\/]/.test(id)) return 'vue'
          if (id.includes('pinia') || id.includes('vue-router')) return 'vue'
          if (id.includes('lucide-vue-next')) return 'icons'
          if (id.includes('markdown-it')) return 'markdown'
          if (id.includes('axios')) return 'http'
          if (id.includes('vis-network')) return 'visgraph'
          if (id.includes('jszip')) return 'jszip'
        },
      },
    },
  },
})