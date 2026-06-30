# STRIP_PLAN — gayoje-client (harness 카피본 정리)

> 이 레포는 `harness`(FE)를 통째 복사한 상태다. 도메인 코드를 도려내고(이 문서) → 인프라 adapt(REUSE_FROM_HARNESS.md) → Phase 0 빌드.
> 경로는 레포 루트(`gayoje-client/`) 기준. 삭제 전 **계획 승인 → 단계 커밋**, import 깨진 곳은 일괄 정리.

---

## 0. 🚨 보안·잔재 먼저

- [ ] `.env` / `.env.local` (실 시크릿) → `.gitignore` + `.env.example`로 대체. **push했으면 키 로테이션**
- [ ] `git remote -v` → **gayoje-client** 확인
- [ ] `vercel.json` CSP·`index.html`의 harness 도메인/마케팅 카피·`src/utils/auth.js` 주석의 BE IP `158.247.196.111` 제거
- [ ] 루트 잔재 삭제: `git rm -r "샘플 미팅 로그" dist && git rm README.md RULE_GENERATOR_RELOCATE.md design-integrity-plan.txt obsidian-export-plan.txt scratchpad-empathy-concept.html`
- [ ] 자동생성 d.ts 삭제(빌드 시 재생성): `git rm src/auto-imports.d.ts src/components.d.ts src/typed-router.d.ts`

## 1. 통째로 삭제할 디렉토리 (100% 도메인)

```bash
git rm -r src/components/code src/components/deliverables src/components/design \
          src/components/lint src/components/plan src/components/quality src/components/rule
git rm -r src/pages/admin
```

## 2. src/components/common/ — 공통 UI만 유지

✅ 유지(adapt): `CardCollapseToggle.vue` `ConfirmDialog.vue` `StaleBanner.vue` `AiDraftNotice.vue` `GuideTooltip.vue` `SubTabRow.vue`
🗑️ 삭제:
```bash
git rm src/components/common/{BaseGuideModal,GithubImportPanel,GlossaryModal,MyProjectsModal,ProjectNotReadyCard}.vue
git rm src/components/common/{McpConnectCard,McpTokenIssueDialog,McpTokenList,McpToolsModal}.vue
git rm src/components/common/{UpgradePromptDialog,UsageCard,UsageHeaderChip,WebVitalsDialog}.vue
```

## 3. components 그 외 mixed 폴더

- `home/`: ✅ `NoticePopup.vue` `OnboardingWelcome.vue` 유지 / 🗑️ `git rm src/components/home/WorkflowDiagram.vue`
- `layout/`: ✅ `AppHeader.vue` `AppFooter.vue` 유지 / 🗑️ `git rm src/components/layout/TeamContextBadge.vue`
- `legal/`: ✅ `LegalDoc.vue` 유지(약관/개인정보 재사용)
- `profile/`: ✅ `ActiveSessionsCard.vue` `ProfileAccountCard.vue` `ProfileDangerZone.vue` 유지 / 🗑️ `git rm src/components/profile/{NotionTokenDialog,ProfileLibraryCard,TeamManagementCard,TeamProfileSummary}.vue`

## 4. src/composables/ — 4개만 유지

✅ 유지: `useConfirm.js` `useSnackbar.js` `useVirtualWindow.js` `useLocale.js`
🗑️ 삭제:
```bash
git rm src/composables/{useDesignCrossLink,useDesignLineage,useDocMdExport,useDocStaleDismiss,useEvalScore,useFixAgent}.js
git rm src/composables/{useGithubRepo,useGraphNodeEdit,useInterviewEntry,useLineageAnalysis,useLineageQuality}.js
git rm src/composables/{useLocalizedPricing,useMeetingBatch,useNotionExport,usePrdFidelity,usePrdLint}.js
git rm src/composables/{useProjectReadiness,useProjectRepos,useProjectStack,useRepoEnrichment,useRepoLintScores}.js
git rm src/composables/{useSkillImprove,useSkillQuality,useSkillRegistry,useTierPerks,useUpgradePrompt}.js
```

## 5. src/store/ — 인프라 store만 유지

✅ 유지(adapt): `index.js` `api.js` `project.js`(→가요제 store 패턴) `jobs.js`(async 잡) `usage.js`(pattern) `uploads.js`(pattern)
🗑️ 삭제: `git rm src/store/{autofix,harness,lineage,lint,notion,pricing,quotaConfig,repos,skillLibrary,library}.js`

## 6. src/utils/ — 인프라 유틸만 유지

✅ 유지(REUSE 참조): `apiErrors.js` `asyncJob.js` `auth.js` `axios.js` `cacheKeys.js` `crossTabSync.js` `download.js` `format.js` `geoLocale.js` `guideSeen.js` `guides.js` `inAppBrowser.js` `markdown.js` `nodeUtils.js` `notice.js` `safeRedirect.js` `timeouts.js` `userIsolation.js` `webVitals.js` `langColor.js` `exportDoc.js` `xlsxStyled.js`
🗑️ 삭제:
```bash
git rm src/utils/{admin,adminBilling,agentBundle,audioChunk,coverageBadge,cpsSections,designExport,designFetch,designMarkdown}.js
git rm src/utils/{erdExcel,erdGraph,evalJump,github,githubCode,glossary,harnessHelpers,inquiry,lineDiff,lineageDiff}.js
git rm src/utils/{lineageExcel,lineageGraph,lineageQuality,lineageSummary,lineageTruthIO,lintProgress,mdProgress}.js
git rm src/utils/{meetingDraft,meetingSplit,notion,obsidianExport,paddle,paddleApi,prdScreens,pricing,quotaConfig}.js
git rm src/utils/{revenue,sampleMeetingLog,skillLibrary,subscription,version}.js
```

## 7. src/pages/ — 인증/법무/프로필 셸만 유지

✅ 유지(adapt): `auth/callback.vue` `login.vue` `profile.vue` `contact.vue` `legal/`(auto-billing·privacy-policy·refund-policy·terms)
🗑️ 삭제(랜딩/도메인은 가요제로 새로): `git rm src/pages/{code,deliverables,design,home,index,lint,plan,pricing,team}.vue && git rm -r "src/pages/invite"`

## 8. src/locales/{ko,en,ja,zh}/ — 도메인 번역 삭제

✅ 유지(adapt): `auth.json` `common.json`(대폭 트림) `enums.json` `errors.json` `notices.json` `contact.json` `legal.json` `home.json`(가요제로 재작성) `index.js`(import 수정)
🗑️ 삭제(4개 로케일 전부 — `design.json`은 67~87KB):
```bash
for L in ko en ja zh; do
  git rm src/locales/$L/{admin,billing,code,cps,deliverables,design,glossary,guides,interview,lint,plan,prd,pricing,profile,quality,rule,team}.json
done
```

## 9. 유지(거의 그대로/adapt) — 삭제 금지

- `src/plugins/`: `i18n.js` `index.js` `router.js`(가드 유지·라우트 교체) `vuetify.js`
- `src/api/`: `notices.js` `teams.js`(컨벤션) / 🗑️ `git rm src/api/mcpTokens.js`
- `src/App.vue` `src/main.js`(mount 패턴) `src/config/features.js` `src/assets/global.css`(테마 교체)
- 루트: `package.json`(의존성 트림) `vite.config.js` `vitest.config.js` `vercel.json`(스크럽) `index.html`(스크럽) `middleware.js`(Vercel geo → Caddy로 대체/제거)

## 10. 삭제 후 검증

- [ ] `src/plugins/router.js`·`App.vue`·삭제된 페이지/스토어/컴포넌트 import 전부 정리
- [ ] `src/locales/*/index.js` 에서 삭제한 json import 제거
- [ ] `pnpm dev` 가 **빈 셸로라도 부팅**(로그인/법무 페이지만 떠도 OK)
- [ ] LS 프리픽스 `harness_`→`gayoje_` 일괄(REUSE §5)
- [ ] 그 후 `singaclienttasklist/TASKLIST_PHASE0.md` 로 빌드 시작

---
*유지/adapt 상세는 `REUSE_FROM_HARNESS.md` 섹션 1~3, 치환 규칙은 섹션 5 참조.*
