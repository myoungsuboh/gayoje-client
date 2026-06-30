---
name: 모바일 로컬 저장소 선택 가이드
description: iOS·Android의 저장소 옵션(설정값·보안 토큰·관계형 데이터·파일)을 용도별로 매칭하고 잘못 쓰면 생기는 함정을 정리한 가이드. 로컬에 무엇을 어디에 저장할지 고를 때, 토큰·캐시·DB 저장 위치를 정할 때 읽는다. 키워드: Keychain, SharedPreferences, UserDefaults, EncryptedSharedPreferences, DataStore, FileManager, SwiftData, Room.
rules:
  - "저장 용도(설정값·토큰·관계형·파일)별로 저장소를 분리해 선택한다."
  - "인증 토큰은 iOS Keychain·Android EncryptedSharedPreferences 보안 저장소에 둔다."
  - "설정값은 iOS UserDefaults(@AppStorage)·Android DataStore 에 저장한다."
  - "대량 관계형 데이터는 SQLite 기반 저장소(SwiftData/Core Data, Room)를 쓴다."
  - "민감 데이터를 평문 SharedPreferences/UserDefaults/파일에 저장하지 않는다."
tags:
  - "Keychain"
  - "SharedPreferences"
  - "UserDefaults"
  - "EncryptedSharedPreferences"
  - "DataStore"
  - "FileManager"
  - "SwiftData"
  - "Room"
---

# 💾 모바일 로컬 저장소 선택 가이드

> 저장소를 잘못 고르면 보안 사고(토큰을 평문에) 또는 성능 사고(큰 JSON을 UserDefaults에)가 난다. 로컬에 무엇을 어디에 저장할지 정할 때 용도별 매칭표를 먼저 보고 결정한다.

## 1. 핵심 원칙
- 저장 용도(설정값·토큰·관계형·파일)별로 저장소를 분리해 선택한다.
- 인증 토큰은 iOS Keychain·Android EncryptedSharedPreferences 보안 저장소에 둔다.
- 설정값은 iOS UserDefaults(@AppStorage)·Android DataStore 에 저장한다.
- 대량 관계형 데이터는 SQLite 기반 저장소(SwiftData/Core Data, Room)를 쓴다.
- 민감 데이터를 평문 SharedPreferences/UserDefaults/파일에 저장하지 않는다.

### 용도별 매칭표 (먼저 확인)
| 용도 | iOS | Android |
|------|-----|---------|
| 간단한 설정값 (다크모드, 마지막 탭) | `UserDefaults` | `DataStore (Preferences)` |
| 인증 토큰/비밀번호 | `Keychain` | `EncryptedSharedPreferences` 또는 `DataStore + Crypto` |
| 구조화된 모델 1~N개 (즐겨찾기 목록) | `SwiftData` 또는 JSON 파일 | `DataStore (Proto)` 또는 Room |
| 관계형 대량 데이터 (오프라인 캐시, 채팅) | `SwiftData` / `Core Data` | `Room` |
| 이미지/문서 파일 | `FileManager` (Documents/Caches) | `Context.filesDir` / `cacheDir` |
| 임시 캐시 (자동 정리 OK) | `Caches/` 디렉토리 | `cacheDir` |
| 앱 간 공유 | App Group + Keychain Sharing | `ContentProvider` |

## 2. 규칙

### 2-1. 설정값 (가장 흔한 케이스)
단순 설정값은 `@AppStorage`(iOS)·DataStore(Android)로 충분하다. 민감정보가 아니므로 보안 저장소는 불필요.

```swift
// ✅ iOS — UserDefaults 위 SwiftUI 래퍼, 자동 UI 업데이트
@AppStorage("isDarkMode") private var isDarkMode = false
@AppStorage("lastTab") private var lastTab = 0
```

```kotlin
// ✅ Android — Jetpack DataStore (SharedPreferences 후속)
val Context.dataStore by preferencesDataStore("settings")

object Prefs {
    val DARK_MODE = booleanPreferencesKey("dark_mode")
    val LAST_TAB = intPreferencesKey("last_tab")
}

// 읽기
val darkMode: Flow<Boolean> = context.dataStore.data.map { it[Prefs.DARK_MODE] ?: false }
// 쓰기
context.dataStore.edit { it[Prefs.DARK_MODE] = true }
```
> ⚠️ Android 신규 코드는 `SharedPreferences` 대신 `DataStore`. 기존 SharedPreferences 코드만 유지보수.

### 2-2. 인증 토큰 — 반드시 보안 저장소
민감정보(토큰·비밀번호·결제정보)만 Keychain·EncryptedSharedPreferences 같은 보안 저장소에 둔다.

```swift
// ✅ iOS — Keychain 래퍼 예시
final class KeychainStore {
    static let shared = KeychainStore()

    func save(_ value: String, for key: String) {
        let data = value.data(using: .utf8)!
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
        ]
        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }

    func load(for key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
```

```kotlin
// ✅ Android — EncryptedSharedPreferences
val masterKey = MasterKey.Builder(context)
    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
    .build()

val securePrefs = EncryptedSharedPreferences.create(
    context, "secure_prefs", masterKey,
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
)
securePrefs.edit().putString("access_token", token).apply()
```
> ⚠️ 절대 평문 UserDefaults/SharedPreferences/파일에 토큰·비밀번호·결제정보 저장 금지. 루팅·탈옥 단말에서 즉시 노출된다.

### 2-3. 관계형/대량 데이터
```swift
// ✅ iOS — SwiftData (iOS 17+). iOS 16 이하는 Core Data 또는 GRDB
@Model
final class CachedItem {
    @Attribute(.unique) var id: String
    var name: String
    var savedAt: Date

    init(id: String, name: String, savedAt: Date) {
        self.id = id; self.name = name; self.savedAt = savedAt
    }
}
// ContentView에서
@Query(sort: \.savedAt, order: .reverse) var items: [CachedItem]
```

```kotlin
// ✅ Android — Room
@Entity
data class CachedItem(
    @PrimaryKey val id: String,
    val name: String,
    val savedAt: Long
)

@Dao
interface CachedItemDao {
    @Query("SELECT * FROM CachedItem ORDER BY savedAt DESC")
    fun observeAll(): Flow<List<CachedItem>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(item: CachedItem)
}

@Database(entities = [CachedItem::class], version = 1)
abstract class AppDatabase : RoomDatabase() {
    abstract fun cachedItemDao(): CachedItemDao
}
```

### 2-4. 파일 저장 — 위치 선택이 중요
| 디렉토리 | iOS | Android | iCloud/백업 | 자동 삭제 |
|----------|-----|---------|-------------|----------|
| Documents | `FileManager.urls(for: .documentDirectory)` | `context.filesDir` (앱 내부) | iOS: 백업됨 | ❌ |
| Caches | `.cachesDirectory` | `context.cacheDir` | ❌ | 디스크 부족 시 OS가 삭제 |
| Temp | `NSTemporaryDirectory()` | `context.cacheDir` | ❌ | 언제든 삭제 |

> 사용자가 만든 파일 → Documents. 다시 받을 수 있는 캐시 → Caches.

### 2-5. 마이그레이션 (스키마 변경)
- iOS SwiftData/Core Data: 모델 버전 추가 + `MigrationStage` 정의.
- Android Room: `Migration` 객체 작성 + `databaseBuilder().addMigrations(...)`.
- 한 번 출시한 뒤엔 버전 다운그레이드 금지, 컬럼 삭제는 신중하게.
- 마이그레이션 실패 시 fallback 정책 명확히: 데이터 보존 우선이면 `fallbackToDestructiveMigration()` 금지.

## 3. 흔한 실수
- ❌ 토큰을 UserDefaults / SharedPreferences 평문 저장.
- ❌ 큰 JSON(수 MB)을 UserDefaults에 통째로 저장 → 앱 시작 느려짐.
- ❌ DB 호출을 메인 스레드에서 (iOS: 백그라운드 Actor, Android: `Dispatchers.IO` 사용).
- ❌ Room/SwiftData 엔티티를 그대로 View에 노출 → 도메인 모델로 변환 후 노출.
- ❌ 캐시를 Documents에 저장해 iCloud 백업 용량을 잡아먹음.

## 4. 체크리스트
- [ ] 저장 용도별로 매칭표에 맞는 저장소를 골랐는가
- [ ] 토큰·비밀번호·결제정보를 보안 저장소(Keychain/EncryptedSharedPreferences)에 두었는가
- [ ] 평문 저장소에 민감정보가 없는가
- [ ] 큰 데이터를 설정 저장소가 아닌 DB/파일에 두었는가
- [ ] DB 호출을 메인 스레드 밖에서 처리했는가
- [ ] 파일을 용도에 맞는 디렉토리(Documents vs Caches)에 저장했는가
- [ ] 스키마 변경 시 마이그레이션·fallback 정책을 정했는가
