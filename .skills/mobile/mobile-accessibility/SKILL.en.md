---
name: Mobile Accessibility (a11y) Standard
description: A guide for handling labels, roles, focus, touch targets, and dynamic fonts consistently across both platforms so that iOS VoiceOver and Android TalkBack users can use the app equally. Read it when building screens/components or reviewing accessibility before release. Keywords: VoiceOver, TalkBack, accessibilityLabel, accessibilityHint, contentDescription, semantics, Dynamic Type, color contrast, touch target.
rules:
  - "Add labels so things work equally on both iOS VoiceOver and Android TalkBack."
  - "Group related elements and hide decorative elements from the accessibility tree."
  - "Ensure touch targets are at least 44pt (iOS) / 48dp (Android)."
  - "Use scalable units instead of fixed px so dynamic font size settings are respected."
  - "Announce dynamic changes like stock fluctuations via live regions."
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

# ♿ Mobile Accessibility Standard

> Accessibility is not "an extra feature for people with disabilities" but the UX baseline for all users. Read it when building screens/components or reviewing accessibility before release. Users who enlarged the dynamic font, users who can't see colors in dark places, and users operating one-handed all benefit.

## 1. Core Principles
- Add labels so things work equally on both iOS VoiceOver and Android TalkBack.
- Group related elements and hide decorative elements from the accessibility tree.
- Ensure touch targets are at least 44pt (iOS) / 48dp (Android).
- Use scalable units instead of fixed px so dynamic font size settings are respected.
- Announce dynamic changes like stock fluctuations via live regions.

## 2. Rules

### 2-1. iOS — Labels/Hints/Grouping (SwiftUI)
```swift
// ✅ Label/hint/identifier
Button(action: like) {
    Image(systemName: "heart.fill")
}
.accessibilityLabel("좋아요")                    // The name VoiceOver reads
.accessibilityHint("이 게시물을 좋아요 목록에 추가합니다")  // Additional description (optional)
.accessibilityIdentifier("post.likeButton")     // For UI tests — not visible to users

// ✅ Grouping child elements
HStack {
    Image("avatar")
    VStack { Text("홍길동"); Text("2시간 전") }
}
.accessibilityElement(children: .combine)        // Read as one chunk
.accessibilityLabel("홍길동, 2시간 전")

// ✅ Hiding decorative elements
Image("decorative-line").accessibilityHidden(true)
```
> `accessibilityIdentifier` is used as a selector in UI tests. For test integration, see the testing-debugging skill.

### 2-2. Android — semantics (Compose)
```kotlin
// ✅ Label/role/identifier
Icon(
    imageVector = Icons.Filled.Favorite,
    contentDescription = "좋아요",                // The name TalkBack reads
    modifier = Modifier
        .clickable(onClick = ::like)
        .semantics { role = Role.Button }
        .testTag("post.likeButton")              // For UI tests
)

// ✅ Grouping
Row(modifier = Modifier.semantics(mergeDescendants = true) {
    contentDescription = "홍길동, 2시간 전"
}) {
    Image(...); Text("홍길동"); Text("2시간 전")
}

// ✅ Dynamic announcement (stock alert, etc.)
Text(
    text = stockMessage,
    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }
)

// ✅ Hiding decorative elements
Icon(painterResource(R.drawable.deco), contentDescription = null)
```
> `Modifier.testTag` is a selector for UI tests. For details, see the testing-debugging skill.

### 2-3. Matrix — Same Concept, Different API
| Concept | iOS (SwiftUI) | Android (Compose) |
|------|---------------|--------------------|
| Name to read | `.accessibilityLabel` | `contentDescription` / `semantics { contentDescription }` |
| Additional hint | `.accessibilityHint` | `semantics { stateDescription }` |
| Role | `.accessibilityAddTraits(.isButton)` | `semantics { role = Role.Button }` |
| Merge children | `.accessibilityElement(children: .combine)` | `semantics(mergeDescendants = true)` |
| Hide | `.accessibilityHidden(true)` | `contentDescription = null` + non-clickable |
| Dynamic region | `.accessibilityAddTraits(.updatesFrequently)` | `LiveRegionMode.Polite` / `Assertive` |
| Test identifier | `.accessibilityIdentifier` | `Modifier.testTag` |

### 2-4. Dynamic Fonts (Dynamic Type / Font Scale)
When the user enlarges the font in system settings, the app must follow. No fixed pt/sp.
- iOS: use semantic fonts like `.font(.body)`; scale custom fonts with `UIFontMetrics`.
- Android: use the `sp` unit (not `dp`); in Compose use `MaterialTheme.typography.bodyLarge`.

> The layout must not break with large fonts. Wrap in ScrollView/LazyColumn and wrap text so it isn't truncated. For font scaling and layout handling, see the responsive-device skill.

### 2-5. Color Contrast and Color Dependence
WCAG 2.1 standard:
- Body text vs. background: contrast 4.5:1 or higher
- Large text (18pt+/bold 14pt+): 3:1 or higher
- Meaningful icon/control boundaries: 3:1 or higher

Do not convey information by color alone. Distinguishing "success/failure" by red/green alone makes it indistinguishable for color-blind users → also include an icon/text label.

> For contrast verification of design tokens, see the ui-design-system skill. Verifying once at the token level removes the need to worry per screen.

### 2-6. Minimum Touch Target Size
| Platform | Minimum size | Note |
|--------|-----------|------|
| iOS (HIG) | 44 pt × 44 pt | Even if the visual size is small, the hitTest area is 44pt |
| Android (Material) | 48 dp × 48 dp | `Modifier.minimumInteractiveComponentSize()` recommended |

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
> Even if a 16pt X icon is visually small, fill the tap area to 44/48.

### 2-7. Physical-Device Review — VoiceOver / TalkBack
Code review can never catch this. Before release, always run through once with the voice on a physical device.
- iOS VoiceOver: Settings → Accessibility → turn on VoiceOver (triple-click the side button). Move with a one-finger right swipe, activate with a double tap. Confirm you can complete the core scenario (login → main → payment) all the way through.
- Android TalkBack: Settings → Accessibility → turn on TalkBack (press both volume buttons). Right swipe to move, double tap to activate. Review the same scenario.

## 3. Common Mistakes
- ❌ No label on a meaningful image/icon → VoiceOver only reads "image".
- ❌ A decorative divider/background image receives focus → the user keeps hearing meaningless elements.
- ❌ Indicating "success (green)/failure (red)" by color alone → indistinguishable for color-blind users.
- ❌ Specifying fonts in fixed units like `12pt` (iOS) / `dp` (Android) → dynamic font not reflected.
- ❌ A 16pt icon with no padding, tap area as-is → elderly/visually impaired users fail to tap.
- ❌ Replacing the input label with a placeholder alone (the label disappears on input).
- ❌ Releasing without physical-device VoiceOver/TalkBack testing.

## 4. Checklist
- [ ] Do all meaningful images/icons have an `accessibilityLabel` / `contentDescription`?
- [ ] Did you explicitly hide decorative images (`accessibilityHidden` / `contentDescription = null`)?
- [ ] Did you connect a label to form input fields (not leaving only a placeholder)?
- [ ] Does the layout not break at the maximum dynamic font size?
- [ ] Did you verify color contrast of 4.5:1 (at the design token stage)?
- [ ] Is there no part that conveys information by color alone?
- [ ] Do touch targets meet 44pt / 48dp?
- [ ] Can you complete the core flow with VoiceOver / TalkBack?
- [ ] Is it accessible in both landscape and portrait rotation?
