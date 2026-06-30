---
name: 모바일 접근성(Accessibility, a11y) 표준
description: iOS VoiceOver·Android TalkBack 사용자가 동등하게 앱을 쓰도록 라벨·역할·포커스·터치 타겟·동적 폰트를 양 플랫폼에서 일관 처리하는 가이드. 화면/컴포넌트를 만들거나 출시 전 접근성을 검수할 때 읽는다. 키워드: VoiceOver, TalkBack, accessibilityLabel, accessibilityHint, contentDescription, semantics, Dynamic Type, 색 대비, 터치 타겟.
rules:
  - "iOS VoiceOver·Android TalkBack 양쪽에서 동등하게 동작하도록 라벨을 단다."
  - "관련 요소는 그룹화하고 장식 요소는 접근성 트리에서 숨긴다."
  - "터치 타겟은 최소 44pt(iOS)·48dp(Android) 이상을 확보한다."
  - "동적 폰트 크기 설정을 따르도록 고정 px 대신 스케일 단위를 쓴다."
  - "재고 변동 같은 동적 변화는 라이브 영역으로 안내한다."
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

# ♿ 모바일 접근성 표준

> 접근성은 "장애인용 추가 기능"이 아니라 모든 사용자의 UX 하한선이다. 화면·컴포넌트를 만들거나 출시 전 접근성을 검수할 때 읽는다. 동적 폰트를 키운 사용자, 어두운 곳에서 색이 안 보이는 사용자, 한 손으로 쓰는 사용자 모두가 수혜자다.

## 1. 핵심 원칙
- iOS VoiceOver·Android TalkBack 양쪽에서 동등하게 동작하도록 라벨을 단다.
- 관련 요소는 그룹화하고 장식 요소는 접근성 트리에서 숨긴다.
- 터치 타겟은 최소 44pt(iOS)·48dp(Android) 이상을 확보한다.
- 동적 폰트 크기 설정을 따르도록 고정 px 대신 스케일 단위를 쓴다.
- 재고 변동 같은 동적 변화는 라이브 영역으로 안내한다.

## 2. 규칙

### 2-1. iOS — 라벨/힌트/그룹화 (SwiftUI)
```swift
// ✅ 라벨/힌트/식별자
Button(action: like) {
    Image(systemName: "heart.fill")
}
.accessibilityLabel("좋아요")                    // VoiceOver 가 읽어줄 이름
.accessibilityHint("이 게시물을 좋아요 목록에 추가합니다")  // 추가 설명 (선택)
.accessibilityIdentifier("post.likeButton")     // UI 테스트용 — 사용자에겐 안 보임

// ✅ 자식 요소 그룹화
HStack {
    Image("avatar")
    VStack { Text("홍길동"); Text("2시간 전") }
}
.accessibilityElement(children: .combine)        // 한 덩어리로 읽기
.accessibilityLabel("홍길동, 2시간 전")

// ✅ 장식 요소 숨기기
Image("decorative-line").accessibilityHidden(true)
```
> `accessibilityIdentifier` 는 UI 테스트의 셀렉터로 쓴다. 테스트 통합은 testing-debugging 스킬 참고.

### 2-2. Android — semantics (Compose)
```kotlin
// ✅ 라벨/역할/식별자
Icon(
    imageVector = Icons.Filled.Favorite,
    contentDescription = "좋아요",                // TalkBack 이 읽어줄 이름
    modifier = Modifier
        .clickable(onClick = ::like)
        .semantics { role = Role.Button }
        .testTag("post.likeButton")              // UI 테스트용
)

// ✅ 그룹화
Row(modifier = Modifier.semantics(mergeDescendants = true) {
    contentDescription = "홍길동, 2시간 전"
}) {
    Image(...); Text("홍길동"); Text("2시간 전")
}

// ✅ 동적 안내 (재고 알림 등)
Text(
    text = stockMessage,
    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }
)

// ✅ 장식 요소 숨기기
Icon(painterResource(R.drawable.deco), contentDescription = null)
```
> `Modifier.testTag` 는 UI 테스트의 셀렉터. 자세한 건 testing-debugging 스킬 참고.

### 2-3. 매트릭스 — 같은 개념, 다른 API
| 개념 | iOS (SwiftUI) | Android (Compose) |
|------|---------------|--------------------|
| 읽어줄 이름 | `.accessibilityLabel` | `contentDescription` / `semantics { contentDescription }` |
| 추가 힌트 | `.accessibilityHint` | `semantics { stateDescription }` |
| 역할 | `.accessibilityAddTraits(.isButton)` | `semantics { role = Role.Button }` |
| 자식 합치기 | `.accessibilityElement(children: .combine)` | `semantics(mergeDescendants = true)` |
| 숨기기 | `.accessibilityHidden(true)` | `contentDescription = null` + 비클릭 |
| 동적 영역 | `.accessibilityAddTraits(.updatesFrequently)` | `LiveRegionMode.Polite` / `Assertive` |
| 테스트 식별자 | `.accessibilityIdentifier` | `Modifier.testTag` |

### 2-4. 동적 폰트 (Dynamic Type / Font Scale)
사용자가 시스템 설정에서 폰트를 키우면 앱이 따라야 한다. 고정 pt/sp 금지.
- iOS: `.font(.body)` 같은 시맨틱 폰트 사용, 커스텀 폰트는 `UIFontMetrics`로 스케일링.
- Android: `sp` 단위 사용(`dp` 아님), Compose는 `MaterialTheme.typography.bodyLarge` 사용.

> 큰 폰트에서 레이아웃이 깨지면 안 된다. ScrollView/LazyColumn으로 감싸고 텍스트가 잘리지 않게 wrap. 폰트 스케일·레이아웃 대응은 responsive-device 스킬 참고.

### 2-5. 색 대비와 색 의존
WCAG 2.1 기준:
- 본문 텍스트 대 배경: 대비 4.5:1 이상
- 큰 텍스트(18pt+/bold 14pt+): 3:1 이상
- 의미 있는 아이콘/컨트롤 경계: 3:1 이상

색만으로 정보를 전달하지 않는다. 빨강/녹색만으로 "성공/실패" 구분 시 색맹 사용자가 구분 불가 → 아이콘/텍스트 라벨 병기.

> 디자인 토큰의 대비 검증은 ui-design-system 스킬 참고. 토큰 단계에서 한 번 검증하면 화면마다 신경 쓸 일이 없다.

### 2-6. 터치 타겟 최소 크기
| 플랫폼 | 최소 크기 | 비고 |
|--------|-----------|------|
| iOS (HIG) | 44 pt × 44 pt | 시각 크기는 작아도 hitTest 영역은 44pt |
| Android (Material) | 48 dp × 48 dp | `Modifier.minimumInteractiveComponentSize()` 권장 |

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
> 16pt짜리 X 아이콘이 시각적으로 작아도 탭 영역은 44/48을 채운다.

### 2-7. 실기기 검수 — VoiceOver / TalkBack
코드 리뷰로는 절대 못 잡는다. 출시 전 반드시 실기기에서 음성으로 한 바퀴.
- iOS VoiceOver: 설정 → 손쉬운 사용 → VoiceOver 켜기(사이드 버튼 3회). 한 손가락 오른쪽 스와이프로 이동, 더블탭으로 활성화. 핵심 시나리오(로그인 → 메인 → 결제)를 끝까지 진행 가능한지 확인.
- Android TalkBack: 설정 → 접근성 → TalkBack 켜기(볼륨 버튼 동시 누름). 오른쪽 스와이프 이동, 더블탭 활성화. 동일 시나리오 검수.

## 3. 흔한 실수
- ❌ 의미 있는 이미지·아이콘에 라벨 없음 → VoiceOver가 "이미지"라고만 읽음.
- ❌ 장식용 구분선/배경 이미지가 포커스를 받음 → 의미 없는 요소를 계속 듣게 됨.
- ❌ 색만으로 "성공(녹색)/실패(빨강)" 표시 → 색맹 사용자 구분 불가.
- ❌ 폰트를 `12pt`(iOS)·`dp`(Android) 고정 단위로 지정 → 동적 폰트 미반영.
- ❌ 16pt 아이콘에 패딩 없이 탭 영역 그대로 → 노년/시각 약자 탭 실패.
- ❌ placeholder 만으로 입력 라벨 대체 (입력 시 라벨 사라짐).
- ❌ 실기기 VoiceOver/TalkBack 테스트 없이 출시.

## 4. 체크리스트
- [ ] 모든 의미 있는 이미지/아이콘에 `accessibilityLabel` / `contentDescription` 이 있는가
- [ ] 장식 이미지를 명시적으로 숨겼는가 (`accessibilityHidden` / `contentDescription = null`)
- [ ] 폼 입력 필드에 라벨을 연결했는가 (placeholder만 두지 않았는가)
- [ ] 동적 폰트 최대 크기에서 레이아웃이 깨지지 않는가
- [ ] 색 대비 4.5:1을 검증했는가 (디자인 토큰 단계)
- [ ] 색만으로 정보를 전달하는 부분이 없는가
- [ ] 터치 타겟 44pt / 48dp를 충족하는가
- [ ] VoiceOver / TalkBack으로 핵심 플로우를 완주할 수 있는가
- [ ] 가로/세로 회전 모두에서 접근 가능한가
