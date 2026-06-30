---
name: 移动端无障碍（Accessibility, a11y）标准
description: 为让 iOS VoiceOver·Android TalkBack 用户能同等使用应用，在两个平台上一致处理标签·角色·焦点·触摸目标·动态字体的指南。在制作屏幕/组件或发布前检查无障碍时阅读。关键词: VoiceOver, TalkBack, accessibilityLabel, accessibilityHint, contentDescription, semantics, Dynamic Type, 颜色对比度, 触摸目标.
rules:
  - "添加标签，使其在 iOS VoiceOver·Android TalkBack 两侧都同等工作。"
  - "把相关元素分组，把装饰性元素从无障碍树中隐藏。"
  - "触摸目标至少确保 44pt（iOS）·48dp（Android）以上。"
  - "为遵循动态字体大小设置，使用可缩放单位而非固定 px。"
  - "库存变动这类动态变化通过实时区域进行播报。"
tags:
  - "VoiceOver"
  - "TalkBack"
  - "accessibilityLabel"
  - "accessibilityHint"
  - "contentDescription"
  - "semantics"
  - "Dynamic Type"
  - "색 대비"
  - "터치 타겟"
---

# ♿ 移动端无障碍标准

> 无障碍不是"为残障人士提供的附加功能"，而是所有用户的 UX 底线。在制作屏幕·组件或发布前检查无障碍时阅读。放大了动态字体的用户、在暗处看不清颜色的用户、单手使用的用户都会受益。

## 1. 核心原则
- 添加标签，使其在 iOS VoiceOver·Android TalkBack 两侧都同等工作。
- 把相关元素分组，把装饰性元素从无障碍树中隐藏。
- 触摸目标至少确保 44pt（iOS）·48dp（Android）以上。
- 为遵循动态字体大小设置，使用可缩放单位而非固定 px。
- 库存变动这类动态变化通过实时区域进行播报。

## 2. 规则

### 2-1. iOS — 标签/提示/分组（SwiftUI）
```swift
// ✅ 标签/提示/标识符
Button(action: like) {
    Image(systemName: "heart.fill")
}
.accessibilityLabel("좋아요")                    // VoiceOver 朗读的名称
.accessibilityHint("이 게시물을 좋아요 목록에 추가합니다")  // 附加说明（可选）
.accessibilityIdentifier("post.likeButton")     // 用于 UI 测试 — 用户看不见

// ✅ 子元素分组
HStack {
    Image("avatar")
    VStack { Text("홍길동"); Text("2시간 전") }
}
.accessibilityElement(children: .combine)        // 作为一整块朗读
.accessibilityLabel("홍길동, 2시간 전")

// ✅ 隐藏装饰性元素
Image("decorative-line").accessibilityHidden(true)
```
> `accessibilityIdentifier` 用作 UI 测试的选择器。测试集成参考 testing-debugging 技能。

### 2-2. Android — semantics（Compose）
```kotlin
// ✅ 标签/角色/标识符
Icon(
    imageVector = Icons.Filled.Favorite,
    contentDescription = "좋아요",                // TalkBack 朗读的名称
    modifier = Modifier
        .clickable(onClick = ::like)
        .semantics { role = Role.Button }
        .testTag("post.likeButton")              // 用于 UI 测试
)

// ✅ 分组
Row(modifier = Modifier.semantics(mergeDescendants = true) {
    contentDescription = "홍길동, 2시간 전"
}) {
    Image(...); Text("홍길동"); Text("2시간 전")
}

// ✅ 动态播报（库存提醒等）
Text(
    text = stockMessage,
    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }
)

// ✅ 隐藏装饰性元素
Icon(painterResource(R.drawable.deco), contentDescription = null)
```
> `Modifier.testTag` 是 UI 测试的选择器。详情参考 testing-debugging 技能。

### 2-3. 矩阵 — 相同概念，不同 API
| 概念 | iOS (SwiftUI) | Android (Compose) |
|------|---------------|--------------------|
| 朗读的名称 | `.accessibilityLabel` | `contentDescription` / `semantics { contentDescription }` |
| 附加提示 | `.accessibilityHint` | `semantics { stateDescription }` |
| 角色 | `.accessibilityAddTraits(.isButton)` | `semantics { role = Role.Button }` |
| 合并子项 | `.accessibilityElement(children: .combine)` | `semantics(mergeDescendants = true)` |
| 隐藏 | `.accessibilityHidden(true)` | `contentDescription = null` + 不可点击 |
| 动态区域 | `.accessibilityAddTraits(.updatesFrequently)` | `LiveRegionMode.Polite` / `Assertive` |
| 测试标识符 | `.accessibilityIdentifier` | `Modifier.testTag` |

### 2-4. 动态字体（Dynamic Type / Font Scale）
当用户在系统设置中放大字体时应用必须跟随。禁止固定 pt/sp。
- iOS: 使用 `.font(.body)` 这类语义字体，自定义字体用 `UIFontMetrics` 缩放。
- Android: 使用 `sp` 单位（不是 `dp`），Compose 使用 `MaterialTheme.typography.bodyLarge`。

> 大字体下布局不能崩坏。用 ScrollView/LazyColumn 包裹，并让文本 wrap 以免被截断。字体缩放·布局适配参考 responsive-device 技能。

### 2-5. 颜色对比度与对颜色的依赖
WCAG 2.1 基准:
- 正文文本对背景: 对比度 4.5:1 以上
- 大文本（18pt+/bold 14pt+）: 3:1 以上
- 有意义的图标/控件边界: 3:1 以上

不要仅用颜色传达信息。仅用红/绿区分"成功/失败"会让色盲用户无法区分 → 并列图标/文本标签。

> 设计令牌的对比度验证参考 ui-design-system 技能。在令牌阶段验证一次，就不必每个屏幕都操心。

### 2-6. 触摸目标最小尺寸
| 平台 | 最小尺寸 | 备注 |
|--------|-----------|------|
| iOS (HIG) | 44 pt × 44 pt | 视觉尺寸即使小，hitTest 区域也是 44pt |
| Android (Material) | 48 dp × 48 dp | 推荐 `Modifier.minimumInteractiveComponentSize()` |

```swift
// ✅ iOS
Button(action: x) { Image(systemName: "xmark") }
    .frame(minWidth: 44, minHeight: 44)
```
```kotlin
// ✅ Android
IconButton(onClick = ::close, modifier = Modifier.minimumInteractiveComponentSize()) {
    Icon(Icons.Default.Close, contentDescription = "닫기")
}
```
> 16pt 的 X 图标即使视觉上小，点击区域也要填满 44/48。

### 2-7. 真机检查 — VoiceOver / TalkBack
代码评审绝对抓不到。发布前务必在真机上用语音完整走一遍。
- iOS VoiceOver: 设置 → 辅助功能 → 打开 VoiceOver（三击侧边按钮）。单指右滑移动，双击激活。确认能将核心场景（登录 → 主页 → 支付）完整走到底。
- Android TalkBack: 设置 → 无障碍 → 打开 TalkBack（同时按音量键）。右滑移动，双击激活。检查相同场景。

## 3. 常见错误
- ❌ 有意义的图片·图标没有标签 → VoiceOver 只读出"图片"。
- ❌ 装饰性分隔线/背景图获得焦点 → 用户不断听到无意义的元素。
- ❌ 仅用颜色表示"成功（绿）/失败（红）" → 色盲用户无法区分。
- ❌ 把字体指定为 `12pt`（iOS）·`dp`（Android）固定单位 → 不反映动态字体。
- ❌ 16pt 图标无内边距、点击区域照旧 → 老年/视障用户点击失败。
- ❌ 仅用 placeholder 代替输入标签（输入时标签消失）。
- ❌ 未做真机 VoiceOver/TalkBack 测试就发布。

## 4. 检查清单
- [ ] 所有有意义的图片/图标是否有 `accessibilityLabel` / `contentDescription`
- [ ] 是否显式隐藏了装饰图片（`accessibilityHidden` / `contentDescription = null`）
- [ ] 是否给表单输入字段连接了标签（没有只放 placeholder）
- [ ] 动态字体最大尺寸下布局是否不崩坏
- [ ] 是否验证了颜色对比度 4.5:1（在设计令牌阶段）
- [ ] 是否没有仅用颜色传达信息的部分
- [ ] 是否满足触摸目标 44pt / 48dp
- [ ] 是否能用 VoiceOver / TalkBack 走完核心流程
- [ ] 在横屏/竖屏旋转下是否都可访问
