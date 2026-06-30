---
name: 移动端本地存储选择指南
description: 把 iOS·Android 的存储选项（设置值·安全令牌·关系型数据·文件）按用途匹配，并整理用错时会出现的陷阱的指南。在选择本地存储什么、存到哪里，以及确定令牌·缓存·DB 的存储位置时阅读。关键词: Keychain, SharedPreferences, UserDefaults, EncryptedSharedPreferences, DataStore, FileManager, SwiftData, Room.
rules:
  - "按存储用途（设置值·令牌·关系型·文件）分开选择存储。"
  - "认证令牌放在 iOS Keychain·Android EncryptedSharedPreferences 的安全存储中。"
  - "设置值保存到 iOS UserDefaults（@AppStorage）·Android DataStore。"
  - "大量关系型数据使用基于 SQLite 的存储（SwiftData/Core Data, Room）。"
  - "不要把敏感数据保存到明文的 SharedPreferences/UserDefaults/文件中。"
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

# 💾 移动端本地存储选择指南

> 存储选错会引发安全事故（令牌存成明文）或性能事故（把大 JSON 存进 UserDefaults）。在决定本地存储什么、存到哪里时，先看按用途的匹配表再决定。

## 1. 核心原则
- 按存储用途（设置值·令牌·关系型·文件）分开选择存储。
- 认证令牌放在 iOS Keychain·Android EncryptedSharedPreferences 的安全存储中。
- 设置值保存到 iOS UserDefaults（@AppStorage）·Android DataStore。
- 大量关系型数据使用基于 SQLite 的存储（SwiftData/Core Data, Room）。
- 不要把敏感数据保存到明文的 SharedPreferences/UserDefaults/文件中。

### 按用途的匹配表（先确认）
| 用途 | iOS | Android |
|------|-----|---------|
| 简单设置值（暗色模式、最后一个标签页） | `UserDefaults` | `DataStore (Preferences)` |
| 认证令牌/密码 | `Keychain` | `EncryptedSharedPreferences` 或 `DataStore + Crypto` |
| 结构化模型 1~N 个（收藏列表） | `SwiftData` 或 JSON 文件 | `DataStore (Proto)` 或 Room |
| 关系型大量数据（离线缓存、聊天） | `SwiftData` / `Core Data` | `Room` |
| 图片/文档文件 | `FileManager`（Documents/Caches） | `Context.filesDir` / `cacheDir` |
| 临时缓存（可自动清理） | `Caches/` 目录 | `cacheDir` |
| 应用间共享 | App Group + Keychain Sharing | `ContentProvider` |

## 2. 规则

### 2-1. 设置值（最常见的情况）
简单设置值用 `@AppStorage`（iOS）·DataStore（Android）就足够。由于不是敏感信息，无需安全存储。

```swift
// ✅ iOS — UserDefaults 之上的 SwiftUI 包装，自动 UI 更新
@AppStorage("isDarkMode") private var isDarkMode = false
@AppStorage("lastTab") private var lastTab = 0
```

```kotlin
// ✅ Android — Jetpack DataStore (SharedPreferences 的后继)
val Context.dataStore by preferencesDataStore("settings")

object Prefs {
    val DARK_MODE = booleanPreferencesKey("dark_mode")
    val LAST_TAB = intPreferencesKey("last_tab")
}

// 读取
val darkMode: Flow<Boolean> = context.dataStore.data.map { it[Prefs.DARK_MODE] ?: false }
// 写入
context.dataStore.edit { it[Prefs.DARK_MODE] = true }
```
> ⚠️ Android 新代码用 `DataStore` 代替 `SharedPreferences`。仅维护已有的 SharedPreferences 代码。

### 2-2. 认证令牌 — 必须使用安全存储
只把敏感信息（令牌·密码·支付信息）放在 Keychain·EncryptedSharedPreferences 这样的安全存储中。

```swift
// ✅ iOS — Keychain 包装示例
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
> ⚠️ 绝对禁止把令牌·密码·支付信息保存到明文的 UserDefaults/SharedPreferences/文件中。在已 root·越狱的设备上会立即泄露。

### 2-3. 关系型/大量数据
```swift
// ✅ iOS — SwiftData (iOS 17+)。iOS 16 以下用 Core Data 或 GRDB
@Model
final class CachedItem {
    @Attribute(.unique) var id: String
    var name: String
    var savedAt: Date

    init(id: String, name: String, savedAt: Date) {
        self.id = id; self.name = name; self.savedAt = savedAt
    }
}
// 在 ContentView 中
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

### 2-4. 文件存储 — 位置选择很重要
| 目录 | iOS | Android | iCloud/备份 | 自动删除 |
|----------|-----|---------|-------------|----------|
| Documents | `FileManager.urls(for: .documentDirectory)` | `context.filesDir`（应用内部） | iOS: 会被备份 | ❌ |
| Caches | `.cachesDirectory` | `context.cacheDir` | ❌ | 磁盘不足时 OS 删除 |
| Temp | `NSTemporaryDirectory()` | `context.cacheDir` | ❌ | 随时删除 |

> 用户创建的文件 → Documents。可重新获取的缓存 → Caches。

### 2-5. 迁移（schema 变更）
- iOS SwiftData/Core Data: 添加模型版本 + 定义 `MigrationStage`。
- Android Room: 编写 `Migration` 对象 + `databaseBuilder().addMigrations(...)`。
- 一旦发布后禁止降级版本，删除列要谨慎。
- 迁移失败时明确 fallback 策略: 若以数据保留为优先则禁止 `fallbackToDestructiveMigration()`。

## 3. 常见错误
- ❌ 把令牌明文保存到 UserDefaults / SharedPreferences。
- ❌ 把大 JSON（数 MB）整体存进 UserDefaults → 应用启动变慢。
- ❌ 在主线程上做 DB 调用（iOS: 后台 Actor，Android: 使用 `Dispatchers.IO`）。
- ❌ 把 Room/SwiftData 实体直接暴露给 View → 转换为领域模型后再暴露。
- ❌ 把缓存存到 Documents 而占用 iCloud 备份容量。

## 4. 检查清单
- [ ] 是否按存储用途选择了符合匹配表的存储
- [ ] 是否把令牌·密码·支付信息放在安全存储（Keychain/EncryptedSharedPreferences）中
- [ ] 明文存储中是否没有敏感信息
- [ ] 是否把大数据放在 DB/文件而非设置存储中
- [ ] 是否在主线程之外处理 DB 调用
- [ ] 是否把文件存到符合用途的目录（Documents vs Caches）
- [ ] schema 变更时是否确定了迁移·fallback 策略
