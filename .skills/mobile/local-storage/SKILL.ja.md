---
name: モバイルローカルストレージ選択ガイド
description: iOS・Androidのストレージオプション（設定値・セキュアトークン・リレーショナルデータ・ファイル）を用途別にマッチングし、誤って使うと起きる落とし穴を整理したガイド。ローカルに何をどこに保存するか選ぶとき、トークン・キャッシュ・DBの保存場所を決めるときに読む。キーワード: Keychain, SharedPreferences, UserDefaults, EncryptedSharedPreferences, DataStore, FileManager, SwiftData, Room.
rules:
  - "保存用途（設定値・トークン・リレーショナル・ファイル）別にストレージを分けて選ぶ。"
  - "認証トークンはiOS Keychain・Android EncryptedSharedPreferencesのセキュアストレージに置く。"
  - "設定値はiOS UserDefaults（@AppStorage）・Android DataStoreに保存する。"
  - "大量のリレーショナルデータはSQLiteベースのストレージ（SwiftData/Core Data, Room）を使う。"
  - "機密データを平文のSharedPreferences/UserDefaults/ファイルに保存しない。"
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

# 💾 モバイルローカルストレージ選択ガイド

> ストレージを誤って選ぶとセキュリティ事故（トークンを平文に）またはパフォーマンス事故（大きなJSONをUserDefaultsに）が起きる。ローカルに何をどこに保存するか決めるときは用途別マッチング表を先に見て決める。

## 1. 核心原則
- 保存用途（設定値・トークン・リレーショナル・ファイル）別にストレージを分けて選ぶ。
- 認証トークンはiOS Keychain・Android EncryptedSharedPreferencesのセキュアストレージに置く。
- 設定値はiOS UserDefaults（@AppStorage）・Android DataStoreに保存する。
- 大量のリレーショナルデータはSQLiteベースのストレージ（SwiftData/Core Data, Room）を使う。
- 機密データを平文のSharedPreferences/UserDefaults/ファイルに保存しない。

### 用途別マッチング表（先に確認）
| 用途 | iOS | Android |
|------|-----|---------|
| 簡単な設定値（ダークモード、最後のタブ） | `UserDefaults` | `DataStore (Preferences)` |
| 認証トークン/パスワード | `Keychain` | `EncryptedSharedPreferences` または `DataStore + Crypto` |
| 構造化モデル1〜N個（お気に入りリスト） | `SwiftData` またはJSONファイル | `DataStore (Proto)` またはRoom |
| リレーショナルな大量データ（オフラインキャッシュ、チャット） | `SwiftData` / `Core Data` | `Room` |
| 画像/ドキュメントファイル | `FileManager`（Documents/Caches） | `Context.filesDir` / `cacheDir` |
| 一時キャッシュ（自動整理OK） | `Caches/` ディレクトリ | `cacheDir` |
| アプリ間共有 | App Group + Keychain Sharing | `ContentProvider` |

## 2. 規則

### 2-1. 設定値（最も多いケース）
単純な設定値は`@AppStorage`（iOS）・DataStore（Android）で十分。機密情報ではないのでセキュアストレージは不要。

```swift
// ✅ iOS — UserDefaults上のSwiftUIラッパー、自動UI更新
@AppStorage("isDarkMode") private var isDarkMode = false
@AppStorage("lastTab") private var lastTab = 0
```

```kotlin
// ✅ Android — Jetpack DataStore (SharedPreferencesの後継)
val Context.dataStore by preferencesDataStore("settings")

object Prefs {
    val DARK_MODE = booleanPreferencesKey("dark_mode")
    val LAST_TAB = intPreferencesKey("last_tab")
}

// 読み込み
val darkMode: Flow<Boolean> = context.dataStore.data.map { it[Prefs.DARK_MODE] ?: false }
// 書き込み
context.dataStore.edit { it[Prefs.DARK_MODE] = true }
```
> ⚠️ Androidの新規コードは`SharedPreferences`の代わりに`DataStore`。既存のSharedPreferencesコードのみ保守。

### 2-2. 認証トークン — 必ずセキュアストレージ
機密情報（トークン・パスワード・決済情報）のみKeychain・EncryptedSharedPreferencesのようなセキュアストレージに置く。

```swift
// ✅ iOS — Keychainラッパー例
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
> ⚠️ 平文のUserDefaults/SharedPreferences/ファイルにトークン・パスワード・決済情報を保存することは絶対禁止。root化・脱獄した端末で即座に露出する。

### 2-3. リレーショナル/大量データ
```swift
// ✅ iOS — SwiftData (iOS 17+)。iOS 16以下はCore DataまたはGRDB
@Model
final class CachedItem {
    @Attribute(.unique) var id: String
    var name: String
    var savedAt: Date

    init(id: String, name: String, savedAt: Date) {
        self.id = id; self.name = name; self.savedAt = savedAt
    }
}
// ContentViewで
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

### 2-4. ファイル保存 — 場所の選択が重要
| ディレクトリ | iOS | Android | iCloud/バックアップ | 自動削除 |
|----------|-----|---------|-------------|----------|
| Documents | `FileManager.urls(for: .documentDirectory)` | `context.filesDir`（アプリ内部） | iOS: バックアップされる | ❌ |
| Caches | `.cachesDirectory` | `context.cacheDir` | ❌ | ディスク不足時にOSが削除 |
| Temp | `NSTemporaryDirectory()` | `context.cacheDir` | ❌ | いつでも削除 |

> ユーザーが作成したファイル → Documents。再取得できるキャッシュ → Caches。

### 2-5. マイグレーション（スキーマ変更）
- iOS SwiftData/Core Data: モデルバージョンの追加 + `MigrationStage`の定義。
- Android Room: `Migration`オブジェクトの作成 + `databaseBuilder().addMigrations(...)`。
- 一度リリースした後はバージョンのダウングレード禁止、カラム削除は慎重に。
- マイグレーション失敗時のfallbackポリシーを明確に: データ保存優先なら`fallbackToDestructiveMigration()`禁止。

## 3. よくあるミス
- ❌ トークンをUserDefaults / SharedPreferencesに平文保存。
- ❌ 大きなJSON（数MB）を丸ごとUserDefaultsに保存 → アプリ起動が遅くなる。
- ❌ DB呼び出しをメインスレッドで（iOS: バックグラウンドActor、Android: `Dispatchers.IO`使用）。
- ❌ Room/SwiftDataのエンティティをそのままViewに公開 → ドメインモデルに変換してから公開。
- ❌ キャッシュをDocumentsに保存してiCloudバックアップ容量を食う。

## 4. チェックリスト
- [ ] 保存用途別にマッチング表に合うストレージを選んだか
- [ ] トークン・パスワード・決済情報をセキュアストレージ（Keychain/EncryptedSharedPreferences）に置いたか
- [ ] 平文ストレージに機密情報がないか
- [ ] 大きなデータを設定ストレージではなくDB/ファイルに置いたか
- [ ] DB呼び出しをメインスレッドの外で処理したか
- [ ] ファイルを用途に合うディレクトリ（Documents vs Caches）に保存したか
- [ ] スキーマ変更時のマイグレーション・fallbackポリシーを決めたか
