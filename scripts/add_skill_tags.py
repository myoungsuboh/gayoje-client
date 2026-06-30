#!/usr/bin/env python3
"""각 SKILL.md frontmatter 의 닫는 `---` 직전에 `tags:` 블록 삽입.

tags 는 백엔드 collect_rule_evidence(코드 substring match) 효과를 위해
**실제 코드/import 에 등장하는 키워드** 위주로 큐레이션.
이미 `tags:` 가 있으면 skip.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / ".skills"

# (relative path) -> list[tag]
# tags 는 lower-case substring match 라 case-insensitive. 가능한 한 코드
# import/identifier/annotation/HTML attribute 그대로 사용.
TAGS = {
    # ─── backEnd ───────────────────────────────────────────────────
    "backEnd/api-versioning-swagger": [
        "springdoc", "openapi", "swagger", "swagger-ui",
        "@Operation", "@ApiResponse", "/v1/", "/v2/",
    ],
    "backEnd/docs-glossary": [
        "glossary", "domain", "terminology",
    ],
    "backEnd/java-dev-environment": [
        "gradle", "maven", "pom.xml", "build.gradle", "jdk", "jvm",
    ],
    "backEnd/jwt-refresh-rotation": [
        "jwt", "JsonWebToken", "Bearer", "refreshToken",
        "Jwts.builder", "Authorization",
    ],
    "backEnd/kafka-pattern": [
        "kafka", "KafkaTemplate", "@KafkaListener",
        "ConsumerRecord", "ProducerRecord", "spring-kafka",
    ],
    "backEnd/logging-observability": [
        "slf4j", "logback", "Logger", "LoggerFactory",
        "MDC", "@Slf4j", "log.info", "log.warn",
    ],
    "backEnd/privacy-data-deletion": [
        "GDPR", "anonymize", "personalData",
        "softDelete", "hardDelete",
    ],
    "backEnd/rate-limiting-bucket4j": [
        "bucket4j", "RateLimit", "Bucket",
        "Refill", "Bandwidth", "tooManyRequests",
    ],
    "backEnd/redis-cache": [
        "redis", "RedisTemplate", "@Cacheable",
        "@CacheEvict", "Lettuce", "spring-data-redis",
    ],
    "backEnd/scheduler-async": [
        "@Scheduled", "@Async", "TaskExecutor",
        "ThreadPoolTaskExecutor", "cron", "fixedRate",
    ],
    "backEnd/security-backend": [
        "spring-security", "SecurityFilterChain", "@PreAuthorize",
        "@PostAuthorize", "BCrypt", "PasswordEncoder",
        "AuthenticationManager", "CORS",
    ],
    "backEnd/spring-boot-rest": [
        "@RestController", "@GetMapping", "@PostMapping",
        "@PutMapping", "@DeleteMapping", "ResponseEntity",
        "ApiResponse", "Controller", "Service", "Repository",
        "Mapper", "MyBatis",
    ],
    "backEnd/spring-boot-startup-errors": [
        "ApplicationContext", "BeanCreationException",
        "NoSuchBeanDefinitionException", "@Configuration",
        "@SpringBootApplication",
    ],
    "backEnd/testing-junit-mockito": [
        "junit", "mockito", "@Test", "@Mock", "@InjectMocks",
        "when(", "verify(", "assertEquals", "Mockito",
        "@SpringBootTest", "MockMvc",
    ],
    "backEnd/validation-bean": [
        "@Valid", "@Validated", "@NotNull", "@NotBlank",
        "@Size", "@Pattern", "@Email", "@Min", "@Max",
        "ConstraintValidator", "BindingResult",
    ],
    "backEnd/websocket-realtime": [
        "websocket", "STOMP", "SimpMessagingTemplate",
        "@MessageMapping", "@SendTo", "spring-websocket",
    ],

    # ─── db ────────────────────────────────────────────────────────
    "db/connection-pool-tuning": [
        "HikariCP", "HikariDataSource", "maximumPoolSize",
        "idle-timeout", "connection-timeout", "dataSource",
    ],
    "db/database-design": [
        "primary key", "foreign key", "normalize",
        "snake_case", "schema", "constraint",
    ],
    "db/db-common-conventions": [
        "snake_case", "primary key", "varchar",
        "created_at", "updated_at",
    ],
    "db/db-migration-flyway": [
        "flyway", "migration", "V1__", "V2__",
        "baseline", "db.migration", "FlywayMigration",
    ],
    "db/h2-embedded-db": [
        "h2-console", "jdbc:h2", "h2database",
        "in-memory", "spring.h2",
    ],
    "db/mariadb-mybatis": [
        "mariadb", "mybatis", "Mapper", "SqlSession",
        "<select", "<insert", "<update", "<delete",
        "resultMap", "parameterType",
    ],
    "db/mongodb": [
        "mongodb", "mongo", "MongoTemplate", "@Document",
        "ObjectId", "MongoRepository", "BSON",
    ],
    "db/mssql-mybatis": [
        "sqlserver", "mssql", "jdbc:sqlserver",
        "mybatis", "Mapper", "SqlSession",
    ],
    "db/oracle-mybatis": [
        "oracle", "ojdbc", "jdbc:oracle",
        "mybatis", "Mapper", "SqlSession",
    ],
    "db/postgis-spatial-data": [
        "postgis", "ST_Distance", "ST_Contains",
        "ST_Within", "geometry", "geography", "srid",
        "ST_GeomFromText",
    ],
    "db/transaction-locking": [
        "@Transactional", "ACID", "deadlock",
        "PESSIMISTIC", "OPTIMISTIC", "isolation",
        "SELECT FOR UPDATE", "rollbackFor",
    ],

    # ─── frontEnd ──────────────────────────────────────────────────
    "frontEnd/accessibility-a11y": [
        "aria-label", "aria-hidden", "aria-live",
        "role=", "alt=", "tabindex", "wcag",
    ],
    "frontEnd/agent-localization": [
        "vue-i18n", "useI18n", "$t(", "t('", "locale",
        "messages", "i18n",
    ],
    "frontEnd/ai-integration": [
        "openai", "anthropic", "claude", "gpt-4",
        "completion", "stream", "embedding",
    ],
    "frontEnd/analytics-event-tracking": [
        "gtag", "ga4", "analytics", "mixpanel",
        "track(", "trackEvent", "datalayer",
    ],
    "frontEnd/api-standard": [
        "axios", "fetch(", "ApiResponse", "interceptor",
        "axios.create", "baseURL", "Authorization",
    ],
    "frontEnd/artifact-workflow": [
        "artifact", "vite build", "dist/",
    ],
    "frontEnd/cinematic-landing-page-builder": [
        "framer-motion", "gsap", "scroll-trigger",
        "intersection-observer", "lottie",
    ],
    "frontEnd/coding-styles": [
        "eslint", "prettier", "camelCase", "PascalCase",
        "kebab-case", ".eslintrc",
    ],
    "frontEnd/component-architecture": [
        "defineComponent", "defineProps", "defineEmits",
        "slot", "provide", "inject", "<script setup>",
    ],
    "frontEnd/design-system": [
        "design-tokens", "var(--", "tailwind",
        "tokens.json", "theme",
    ],
    "frontEnd/env-config": [
        "import.meta.env", "VITE_", "process.env",
        ".env", "envConfig",
    ],
    "frontEnd/error-monitoring": [
        "Sentry", "captureException", "captureMessage",
        "@sentry/vue", "errorHandler", "errorBoundary",
    ],
    "frontEnd/file-upload": [
        "FileReader", "FormData", "multipart",
        "input type=\"file\"", "accept=",
        "createObjectURL", "drag-and-drop",
    ],
    "frontEnd/forms-validation": [
        "v-model", "vuelidate", "zod", "yup",
        "schema", "validator", "required",
    ],
    "frontEnd/i18n-internationalization": [
        "vue-i18n", "useI18n", "$t(", "createI18n",
        "messages", "locale",
    ],
    "frontEnd/implementation-plan": [
        "checklist", "milestone",
    ],
    "frontEnd/performance-optimization": [
        "defineAsyncComponent", "lazy", "dynamic import",
        "Suspense", "virtual-scroller", "memo",
    ],
    "frontEnd/project-architecture": [
        "src/components", "src/pages", "src/composables",
        "src/store", "src/utils",
    ],
    "frontEnd/pwa-service-worker": [
        "service-worker", "workbox", "manifest.json",
        "navigator.serviceWorker", "vite-plugin-pwa",
        "registerSW",
    ],
    "frontEnd/responsive-styling": [
        "@media", "breakpoint", "min-width", "max-width",
        "grid-template", "flex-wrap",
    ],
    "frontEnd/routing-auth": [
        "vue-router", "router.push", "router-link",
        "beforeEach", "useRouter", "createRouter",
        "meta.requiresAuth",
    ],
    "frontEnd/security-frontend": [
        "DOMPurify", "sanitize", "v-html",
        "httpOnly", "Secure", "SameSite",
        "Content-Security-Policy", "noopener",
        "noreferrer", "XSS", "CSRF",
    ],
    "frontEnd/state-management": [
        "pinia", "defineStore", "useStore",
        "storeToRefs", "ref(", "reactive(",
    ],
    "frontEnd/testing-validation": [
        "vitest", "@vue/test-utils", "describe(",
        "expect(", "mount(", "shallowMount",
        "vi.mock", "vi.fn",
    ],
    "frontEnd/ui-vuetify": [
        "vuetify", "VBtn", "VCard", "VDialog",
        "VDataTable", "v-btn", "v-card", "v-dialog",
        "$vuetify", "createVuetify",
    ],
    "frontEnd/vite-browser-compatibility": [
        "vite", "vite.config", "@vitejs",
        "esbuild", "polyfill", "browserslist",
    ],
    "frontEnd/vue-sfc-structure": [
        "<script setup>", "<template>", "<style scoped>",
        "defineProps", "defineEmits", "defineExpose",
    ],

    # ─── mobile ────────────────────────────────────────────────────
    "mobile/accessibility-a11y": [
        "VoiceOver", "TalkBack", "accessibilityLabel",
        "accessibilityHint", "contentDescription",
    ],
    "mobile/android-kotlin": [
        "kotlin", "Activity", "Fragment", "ViewModel",
        "Compose", "@Composable", "lifecycle",
    ],
    "mobile/android-playstore": [
        "gradle", "signing", "R8", "AAB", "bundle",
        "Play Console", "minifyEnabled", "proguard",
    ],
    "mobile/async-error-handling": [
        "coroutine", "suspend", "Result.failure",
        "try-catch", "Throwable", "Dispatchers",
        "CoroutineExceptionHandler",
    ],
    "mobile/auth-social-login": [
        "GoogleSignIn", "AppleIDProvider", "oauth",
        "FirebaseAuth", "AuthCredential", "IdToken",
    ],
    "mobile/foreground-service-android": [
        "ForegroundService", "startForeground",
        "NotificationChannel", "START_STICKY",
        "FOREGROUND_SERVICE",
    ],
    "mobile/ios-appstore": [
        "xcode", "TestFlight", "App Store Connect",
        "archive", "codesign", "ExportOptions",
    ],
    "mobile/ios-swiftui": [
        "SwiftUI", "@State", "@Binding",
        "@ObservedObject", "@StateObject",
        "View", "Combine", "publisher",
    ],
    "mobile/local-storage": [
        "Keychain", "SharedPreferences", "UserDefaults",
        "EncryptedSharedPreferences", "DataStore",
        "FileManager",
    ],
    "mobile/navigation-routing": [
        "NavController", "NavHostController", "navigate",
        "NavGraph", "NavHostFragment", "deepLink",
    ],
    "mobile/networking-api": [
        "ktor", "retrofit", "okhttp", "URLSession",
        "@GET", "@POST", "HttpClient", "async/await",
    ],
    "mobile/permissions-privacy": [
        "ActivityCompat", "requestPermissions",
        "AVCaptureDevice", "PHPhotoLibrary",
        "ACCESS_FINE_LOCATION", "Info.plist",
    ],
    "mobile/project-structure": [
        "build.gradle", "Podfile", "Package.swift",
        "settings.gradle", "AndroidManifest.xml",
    ],
    "mobile/push-notifications": [
        "FCM", "FirebaseMessaging", "APNs",
        "UNNotification", "registerForRemoteNotifications",
        "FirebaseMessagingService",
    ],
    "mobile/responsive-device": [
        "WindowMetrics", "sizeClass", "GeometryReader",
        "BoxWithConstraints", "Configuration",
    ],
    "mobile/state-management": [
        "ViewModel", "StateFlow", "LiveData",
        "MutableStateFlow", "@State", "ObservableObject",
        "remember", "Combine",
    ],
    "mobile/testing-debugging": [
        "junit", "XCTest", "espresso",
        "@Test", "assertEquals", "XCAssert",
        "mockk", "Mockito",
    ],
    "mobile/ui-design-system": [
        "Material3", "MaterialTheme", "Compose",
        "SwiftUI", "ViewModifier", "DesignTokens",
    ],
}


_TAGS_RE = re.compile(r"^tags:\s*\r?\n", re.MULTILINE)
_FM_CLOSE_RE = re.compile(r"^---\s*$", re.MULTILINE)


def add_tags(md_path: Path, tags: list[str]) -> bool:
    """frontmatter 닫는 `---` 직전에 tags 블록 삽입. 이미 있으면 skip.

    Returns True if modified.
    """
    content = md_path.read_text(encoding="utf-8")
    if not content.startswith("---"):
        return False  # frontmatter 없음

    # frontmatter 닫는 ---  두 번째 매치 찾기
    closes = list(_FM_CLOSE_RE.finditer(content))
    if len(closes) < 2:
        return False
    fm_close = closes[1]
    fm_body = content[: fm_close.start()]
    if _TAGS_RE.search(fm_body):
        return False  # 이미 tags: 있음

    tag_block_lines = ["tags:"]
    for t in tags:
        # YAML 충돌 안 일으키게 항상 쌍따옴표.
        # 자체 따옴표는 escape.
        safe = t.replace("\\", "\\\\").replace('"', '\\"')
        tag_block_lines.append(f'  - "{safe}"')
    tag_block = "\n".join(tag_block_lines) + "\n"

    new_content = content[: fm_close.start()] + tag_block + content[fm_close.start():]
    md_path.write_text(new_content, encoding="utf-8")
    return True


def main():
    modified = 0
    skipped = 0
    missing = []
    for rel, tags in TAGS.items():
        path = ROOT / rel / "SKILL.md"
        if not path.exists():
            missing.append(rel)
            continue
        if add_tags(path, tags):
            modified += 1
            print(f"  + {rel}: {len(tags)} tags")
        else:
            skipped += 1
            print(f"  - {rel}: skip (already has tags)")
    print(f"\nmodified={modified} skipped={skipped} missing={len(missing)}")
    if missing:
        print("missing:")
        for m in missing:
            print(f"  - {m}")


if __name__ == "__main__":
    main()
