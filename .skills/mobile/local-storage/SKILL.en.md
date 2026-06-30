---
name: Mobile Local Storage Selection Guide
description: A guide that matches iOS/Android storage options (settings values, secure tokens, relational data, files) to their purposes and summarizes the pitfalls of choosing wrong. Read it when choosing what to store locally and where, and when deciding where to store tokens, caches, and DBs. Keywords: Keychain, SharedPreferences, UserDefaults, EncryptedSharedPreferences, DataStore, FileManager, SwiftData, Room.
rules:
  - "Choose storage separately by storage purpose (settings values, tokens, relational, files)."
  - "Put authentication tokens in secure storage — iOS Keychain / Android EncryptedSharedPreferences."
  - "Store settings values in iOS UserDefaults (@AppStorage) / Android DataStore."
  - "Use SQLite-based storage (SwiftData/Core Data, Room) for large relational data."
  - "Do not store sensitive data in plaintext SharedPreferences/UserDefaults/files."
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

# 💾 Mobile Local Storage Selection Guide

> Choosing the wrong storage causes a security incident (tokens in plaintext) or a performance incident (a large JSON in UserDefaults). When deciding what to store locally and where, consult the purpose-matching table first before deciding.

## 1. Core Principles
- Choose storage separately by storage purpose (settings values, tokens, relational, files).
- Put authentication tokens in secure storage — iOS Keychain / Android EncryptedSharedPreferences.
- Store settings values in iOS UserDefaults (@AppStorage) / Android DataStore.
- Use SQLite-based storage (SwiftData/Core Data, Room) for large relational data.
- Do not store sensitive data in plaintext SharedPreferences/UserDefaults/files.

### Purpose-Matching Table (check first)
| Purpose | iOS | Android |
|------|-----|---------|
| Simple settings values (dark mode, last tab) | `UserDefaults` | `DataStore (Preferences)` |
| Auth tokens/passwords | `Keychain` | `EncryptedSharedPreferences` or `DataStore + Crypto` |
| Structured models, 1 to N (favorites list) | `SwiftData` or JSON file | `DataStore (Proto)` or Room |
| Large relational data (offline cache, chat) | `SwiftData` / `Core Data` | `Room` |
| Image/document files | `FileManager` (Documents/Caches) | `Context.filesDir` / `cacheDir` |
| Temporary cache (auto-cleanup OK) | `Caches/` directory | `cacheDir` |
| Sharing between apps | App Group + Keychain Sharing | `ContentProvider` |

## 2. Rules

### 2-1. Settings Values (the most common case)
Simple settings values are sufficiently handled by `@AppStorage` (iOS) / DataStore (Android). Since they are not sensitive, secure storage is unnecessary.

```swift
// ✅ iOS — SwiftUI wrapper over UserDefaults, automatic UI updates
@AppStorage("isDarkMode") private var isDarkMode = false
@AppStorage("lastTab") private var lastTab = 0
```

```kotlin
// ✅ Android — Jetpack DataStore (successor to SharedPreferences)
val Context.dataStore by preferencesDataStore("settings")

object Prefs {
    val DARK_MODE = booleanPreferencesKey("dark_mode")
    val LAST_TAB = intPreferencesKey("last_tab")
}

// Read
val darkMode: Flow<Boolean> = context.dataStore.data.map { it[Prefs.DARK_MODE] ?: false }
// Write
context.dataStore.edit { it[Prefs.DARK_MODE] = true }
```
> ⚠️ New Android code should use `DataStore` instead of `SharedPreferences`. Maintain existing SharedPreferences code only.

### 2-2. Auth Tokens — Always Secure Storage
Put only sensitive data (tokens/passwords/payment info) in secure storage like Keychain / EncryptedSharedPreferences.

```swift
// ✅ iOS — Keychain wrapper example
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
> ⚠️ Never store tokens/passwords/payment info in plaintext UserDefaults/SharedPreferences/files. They are exposed immediately on rooted/jailbroken devices.

### 2-3. Relational/Large Data
```swift
// ✅ iOS — SwiftData (iOS 17+). For iOS 16 or below, Core Data or GRDB
@Model
final class CachedItem {
    @Attribute(.unique) var id: String
    var name: String
    var savedAt: Date

    init(id: String, name: String, savedAt: Date) {
        self.id = id; self.name = name; self.savedAt = savedAt
    }
}
// In ContentView
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

### 2-4. File Storage — Location Choice Matters
| Directory | iOS | Android | iCloud/backup | Auto-deletion |
|----------|-----|---------|-------------|----------|
| Documents | `FileManager.urls(for: .documentDirectory)` | `context.filesDir` (app internal) | iOS: backed up | ❌ |
| Caches | `.cachesDirectory` | `context.cacheDir` | ❌ | OS deletes when disk is low |
| Temp | `NSTemporaryDirectory()` | `context.cacheDir` | ❌ | Deleted anytime |

> User-created files → Documents. Re-fetchable cache → Caches.

### 2-5. Migration (schema changes)
- iOS SwiftData/Core Data: add a model version + define a `MigrationStage`.
- Android Room: write a `Migration` object + `databaseBuilder().addMigrations(...)`.
- Once released, never downgrade the version, and delete columns cautiously.
- Make the fallback policy clear when migration fails: if data preservation is the priority, do not use `fallbackToDestructiveMigration()`.

## 3. Common Mistakes
- ❌ Storing tokens in plaintext UserDefaults / SharedPreferences.
- ❌ Storing a large JSON (several MB) wholesale in UserDefaults → slow app startup.
- ❌ Making DB calls on the main thread (iOS: background Actor, Android: use `Dispatchers.IO`).
- ❌ Exposing Room/SwiftData entities directly to the View → convert to a domain model before exposing.
- ❌ Storing cache in Documents and eating up iCloud backup quota.

## 4. Checklist
- [ ] Did you choose the storage that matches the matching table for each storage purpose?
- [ ] Did you put tokens/passwords/payment info in secure storage (Keychain/EncryptedSharedPreferences)?
- [ ] Is there no sensitive data in plaintext storage?
- [ ] Did you put large data in a DB/file rather than settings storage?
- [ ] Did you handle DB calls off the main thread?
- [ ] Did you store files in the directory that fits the purpose (Documents vs Caches)?
- [ ] Did you decide the migration/fallback policy for schema changes?
