---
name: 입력 검증 & 데이터 새니타이징 (Security)
description: 신뢰할 수 없는 입력을 서버 측에서 검증·새니타이즈해 Injection·XSS·Path Traversal을 막는 범용(foundational) 보안 표준으로, 화이트리스트·컨텍스트별 이스케이프/파라미터화·HTML 새니타이즈·파일 업로드 다중 검증을 다룬다(스택 무관). 입력을 받는 API·폼·파일 업로드를 만들거나 새니타이즈·이스케이프 로직을 고칠 때 읽는다. 키워드: sanitize, whitelist, escape, parameterize, injection, XSS, path traversal, file upload.
rules:
  - "공통 토대(요약): 입력은 신뢰하지 않고, 강제는 서버 측에서, 제약은 선언적 스키마로, 실패는 거부(fail-closed). — 상세는 validation-bean."
  - "화이트리스트 우선: '허용할 값'을 명시적으로 정의하고 나머지는 거부한다. '위험한 값'만 골라 막는 블랙리스트는 새 우회 패턴을 못 막는다."
  - "컨텍스트에 맞게 처리(이스케이프/파라미터화): 입력을 어디에 쓰느냐에 따라 방어가 다르다. 쿼리는 파라미터화(문자열 연결 금지), HTML 출력은 인코딩/이스케이프, 셸·파일 경로는 해당 컨텍스트 규칙으로 무력화한다. '검증했으니 그대로 써도 된다'는 위험하다."
  - "위험 출력은 새니타이즈: HTML 등 마크업을 허용해야 하면, 검증된 새니타이즈 도구로 허용 태그·속성만 통과시킨다. 자체 정규식으로 태그를 거르려 하지 않는다."
  - "파일 업로드는 다중 검증: 확장자·MIME 타입·실제 내용(매직 바이트)·크기를 모두 검증하고, 업로드 파일을 웹에서 직접 실행·제공되는 위치(웹 루트)에 저장하지 않는다."
  - "Path Traversal 차단: 파일 경로/명에 입력을 결합할 때는 정규화 후 허용 디렉터리 안에 있는지 확인한다."
tags:
  - "sanitize"
  - "whitelist"
  - "escape"
  - "parameterize"
  - "injection"
  - "XSS"
  - "path traversal"
  - "file upload"
  - "validate"
  - "schema"
  - "pydantic"
  - "zod"
  - "DOMPurify"
  - "bleach"
foundational: true
---

# 🛡️ 입력 검증 & 데이터 새니타이징 (Security)

> 신뢰할 수 없는 모든 입력을 서버 측에서 검증·새니타이즈해 Injection·XSS·Path Traversal 같은 공격을 막는다. 입력을 받는 API·폼·파일 업로드를 만들거나 검증·새니타이즈 로직을 고칠 때 읽는다. 특정 언어/라이브러리에 종속되지 않는 범용 보안 표준이다.
>
> 이 스킬은 **보안 관점**(공격 방어)이다. 입력 모델 검증의 일반 설계·오류 응답 표준은 `validation-bean`(입력값 검증 표준)을 함께 본다. 출력 인코딩·SQL Injection 등 공격 카탈로그 전반은 `owasp-top10`을 참고한다.

## 1. 핵심 원칙

검증의 공통 토대(입력 불신·서버측 강제·선언적 스키마·fail-closed)는 한 줄로만 짚고, 아래는 **보안 고유 방어**에 집중한다. 검증·오류 응답의 일반 설계는 `validation-bean`(입력값 검증 표준)을 본다.

- **공통 토대(요약)**: 입력은 신뢰하지 않고, 강제는 서버 측에서, 제약은 선언적 스키마로, 실패는 거부(fail-closed). — 상세는 `validation-bean`.
- **화이트리스트 우선**: "허용할 값"을 명시적으로 정의하고 나머지는 거부한다. "위험한 값"만 골라 막는 블랙리스트는 새 우회 패턴을 못 막는다.
- **컨텍스트에 맞게 처리(이스케이프/파라미터화)**: 입력을 어디에 쓰느냐에 따라 방어가 다르다. 쿼리는 **파라미터화**(문자열 연결 금지), HTML 출력은 **인코딩/이스케이프**, 셸·파일 경로는 해당 컨텍스트 규칙으로 무력화한다. "검증했으니 그대로 써도 된다"는 위험하다.
- **위험 출력은 새니타이즈**: HTML 등 마크업을 허용해야 하면, 검증된 새니타이즈 도구로 **허용 태그·속성만** 통과시킨다. 자체 정규식으로 태그를 거르려 하지 않는다.
- **파일 업로드는 다중 검증**: 확장자·MIME 타입·실제 내용(매직 바이트)·크기를 모두 검증하고, 업로드 파일을 웹에서 직접 실행·제공되는 위치(웹 루트)에 저장하지 않는다.
- **Path Traversal 차단**: 파일 경로/명에 입력을 결합할 때는 정규화 후 허용 디렉터리 안에 있는지 확인한다.

```
서버에서 검증 (필수)      > 클라이언트에서 검증 (선택적 UX)
화이트리스트 (허용 목록)  > 블랙리스트 (차단 목록)
선언적 스키마             > 손으로 짠 정규식
파라미터화 / 이스케이프   > 입력 문자열 직접 연결
매직 바이트(실제 내용)    > 확장자/MIME만 신뢰
```

## 2. 규칙

> 진입점 일괄 검증·서버측 강제·선언적 스키마의 일반 규칙은 `validation-bean`을 따른다. 보안상 형식·열거·길이 검증은 핸들러마다 손으로 짠 정규식·`if`로 흩뿌리지 말고 선언적 스키마에 모은다(누락·우회 방지). 아래는 보안 고유 규칙만 둔다.

### 2-1. 화이트리스트로 허용 값을 명시한다
- 허용할 형식·열거값·범위를 정의하고 나머지는 거부한다. 위험 문자열을 골라 막는 블랙리스트에 의존하지 않는다.
- 열거형 값(역할·상태·정렬 키 등)은 허용 목록으로 강제해, 임의 값이 로직·쿼리로 흘러들지 않게 한다.

```text
// ❌ 금지 — 블랙리스트로 "위험해 보이는 것"만 차단 (우회 가능)
if input contains "<script>" or "DROP TABLE": reject

// ✅ 권장 — 허용 목록만 통과
role ∈ { "user", "admin" }          // 그 외 전부 거부
sortKey ∈ { "createdAt", "name" }   // 임의 컬럼명 차단
```

### 2-2. 출력 컨텍스트에 맞게 파라미터화/이스케이프한다
- DB 쿼리는 **파라미터화/바인딩**으로 처리하고 입력을 문자열로 잇지 않는다(SQL Injection 방어).
- HTML로 출력하는 값은 출력 컨텍스트에 맞게 **인코딩/이스케이프**한다(XSS 방어).
- 셸 명령·파일 경로에 입력을 넣을 때는 해당 컨텍스트 규칙으로 무력화하고, 경로는 정규화 후 허용 디렉터리 안에 있는지 확인한다(Path Traversal 방어).

```text
// ❌ 금지 — 입력을 그대로 연결 (Injection)
query("SELECT * FROM users WHERE id = " + input.id)
render("<div>" + input.comment + "</div>")
open(baseDir + "/" + input.filename)        // "../" 로 탈출 가능

// ✅ 권장 — 파라미터화 · 이스케이프 · 경로 정규화 후 검사
query("SELECT * FROM users WHERE id = ?", [input.id])
render(escapeHtml(input.comment))
path = normalize(baseDir + "/" + input.filename)
assert path startsWith baseDir              // 허용 디렉터리 밖이면 거부
```

### 2-3. 위험 출력(HTML 등)은 검증된 도구로 새니타이즈한다
- HTML 입력을 허용해야 하면, 검증된 새니타이즈 도구로 **허용 태그·속성만** 통과시키고 나머지는 제거한다.
- 자체 정규식으로 `<script>` 등을 거르려 하지 않는다 — 인코딩·중첩·이벤트 핸들러 등으로 우회된다.

```text
// ❌ 금지 — 자체 정규식으로 태그 제거 (우회 가능)
stripTags(userHtml)

// ✅ 권장 — 검증된 새니타이저로 허용 태그·속성만 통과
allowTags  = { b, i, em, strong, a, p, br }
allowAttrs = { a: [href, title] }
clean = sanitize(userHtml, allowTags, allowAttrs)
```

### 2-4. 파일 업로드는 다중 검증 + 안전한 저장
- 확장자·MIME 타입·크기를 화이트리스트로 검증하고, **실제 내용(매직 바이트)** 까지 확인해 위장 파일을 막는다.
- 업로드 파일을 웹 루트(직접 URL로 실행/제공되는 위치)에 저장하지 않고, 파일명을 그대로 쓰지 않는다(서버가 생성한 이름 사용, 경로 탈출 차단).

```text
// ❌ 금지 — 확장자만 보고 신뢰, 웹 루트에 원본 파일명으로 저장
save(file, webroot + "/" + file.name)

// ✅ 권장 — 확장자 + MIME + 매직 바이트 + 크기, 안전한 위치에 저장
assert ext  ∈ allowedExts
assert mime ∈ allowedMimes
assert magicBytes(file) matches declaredType    // 위장 파일 차단
assert size <= maxSize
save(file, nonWebrootDir + "/" + generatedName) // 원본 파일명 미사용
```

## 3. 흔한 실수

> 클라이언트 검증만 믿음·진입점 검증 누락 등 일반 함정은 `validation-bean` 참고. 아래는 보안 고유 함정.

- **블랙리스트로 위험 값만 차단** → 새 우회 패턴을 못 막는다. 화이트리스트로.
- **검증했으니 안전하다고 가정하고 그대로 사용** → 검증과 출력 처리는 별개다. 쿼리는 파라미터화, HTML은 이스케이프.
- **자체 정규식으로 HTML/스크립트 제거** → 인코딩·중첩으로 XSS 우회. 검증된 새니타이저로.
- **파일을 확장자/ MIME만 보고 신뢰** → 위장 파일이 실행될 수 있다. 매직 바이트까지 확인.
- **업로드 파일을 웹 루트에 원본 이름으로 저장** → 업로드한 스크립트가 실행되거나 경로 탈출이 발생한다.
- **경로/파일명에 입력을 그대로 결합** → `../`로 디렉터리를 탈출한다. 정규화 후 허용 범위 검사.
- **오류 응답에 내부 정보 노출** → 스택트레이스·구현 세부를 그대로 내보내지 않는다(`validation-bean` 참고).

## 4. 체크리스트

> 서버측 검증·선언적 스키마 등 일반 항목은 `validation-bean` 체크리스트로. 아래는 보안 고유 항목.

- [ ] **화이트리스트(허용 목록)** 방식으로 형식·열거·범위를 강제하는가 (손으로 짠 정규식 의존 금지)
- [ ] DB 쿼리를 **파라미터화/바인딩**하고 입력을 문자열로 잇지 않는가 (SQL Injection)
- [ ] HTML 출력 값을 출력 컨텍스트에 맞게 **이스케이프/인코딩**하는가 (XSS)
- [ ] 파일 경로/명에 들어가는 입력을 정규화 후 **허용 범위 안인지** 검사하는가 (Path Traversal)
- [ ] HTML 입력은 **검증된 새니타이저**로 허용 태그·속성만 통과시키는가
- [ ] 파일 업로드의 확장자·MIME·**매직 바이트**·크기를 모두 검증하는가
- [ ] 업로드 파일을 **웹 루트 밖**에 서버 생성 이름으로 저장하는가
- [ ] 검증 실패가 **거부(fail-closed)** 이고, 응답에 내부 정보를 노출하지 않는가

## 부록: 스택별 예시

> 아래는 참고용 구현 예시다. 팀이 쓰는 스택에 맞게 같은 패턴으로 추가한다. 위 1~4의 원칙·규칙이 표준이고, 부록은 그 적용 사례일 뿐이다.

### Python (Pydantic) — 선언적 스키마 검증

```python
# ✅ 권장 — 선언적 스키마로 구조·타입·범위를 강제
from pydantic import BaseModel, EmailStr, constr, validator

class CreateUserRequest(BaseModel):
    name: constr(min_length=1, max_length=100)
    email: EmailStr
    age: int = Field(ge=0, le=150)
    role: Literal["user", "admin"]  # 화이트리스트 강제

    @validator("name")
    def name_no_html(cls, v):
        if "<" in v or ">" in v:
            raise ValueError("이름에 HTML 태그를 사용할 수 없습니다.")
        return v
```

### TypeScript/JavaScript (Zod) — 선언적 스키마 검증

```typescript
// ✅ 권장 — safeParse 로 검증하고 실패 시 400 응답
import { z } from "zod";

const createUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(["user", "admin"]),
});

const result = createUserSchema.safeParse(req.body);
if (!result.success) {
  return res.status(400).json({ errors: result.error.flatten() });
}
```

### Python — 파일 업로드 보안

확장자·MIME 타입·크기를 검증하고, 매직 바이트로 실제 형식까지 확인한다.

```python
# ✅ 권장 — 화이트리스트로 확장자·MIME·크기를 모두 검증
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".pdf"}
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/gif", "application/pdf"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

def validate_upload(file):
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError("허용되지 않는 파일 형식입니다.")
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise ValueError("MIME 타입이 올바르지 않습니다.")
    if file.size > MAX_FILE_SIZE:
        raise ValueError("파일 크기는 10MB 이하여야 합니다.")
    # 매직 바이트로 실제 형식 추가 검증 권장 (python-magic 라이브러리)
```

### Python (bleach) — HTML 새니타이즈

```python
# ❌ 금지 — 자체 정규식으로 태그를 거르려는 시도 (우회 가능)
# ✅ 권장 — 검증된 라이브러리(bleach)로 허용 태그·속성만 통과
import bleach

ALLOWED_TAGS = ["b", "i", "em", "strong", "a", "p", "br"]
ALLOWED_ATTRS = {"a": ["href", "title"]}

clean_html = bleach.clean(user_html, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS)
```

> 프론트엔드(브라우저)에서 HTML을 렌더링하기 전 새니타이즈가 필요하면 DOMPurify 같은 검증된 라이브러리를 쓴다.
