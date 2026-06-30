---
name: 파일 업로드 및 유효성 검사 (File Upload & Validation)
description: 안전하고 사용자 친화적인 파일 업로드 환경을 구축하기 위한 표준입니다. 파일 선택·검증·다중 업로드 UI를 구현할 때 읽습니다. 키워드: file.size, 확장자 제한, allowedTypes, 업로드 Queue, Progress.
rules:
  - "업로드 전 클라이언트에서 용량과 확장자를 먼저 검증한다."
  - "파일 선택 직후 즉시 유효성 결과를 피드백한다."
  - "다중 업로드는 Queue·Progress·Status를 UI로 명확히 노출한다."
tags:
  - "file.size"
  - "확장자 제한"
  - "allowedTypes"
  - "업로드 Queue"
  - "Progress"
  - "FileReader"
  - "FormData"
  - "multipart"
  - "input type=\'file\'"
  - "accept="
  - "createObjectURL"
  - "drag-and-drop"
---

# 📎 파일 업로드 및 유효성 검사

> 클라이언트 단 파일 검증과 다중 업로드 UX를 표준화하기 위한 문서. 파일 업로드 기능을 만들거나 용량·확장자 검증, 진행 상황 표시를 다룰 때 읽습니다.

## 1. 핵심 원칙
- 업로드 전 클라이언트에서 용량과 확장자를 먼저 검증한다.
- 파일 선택 직후 즉시 유효성 결과를 피드백한다.
- 다중 업로드는 Queue·Progress·Status를 UI로 명확히 노출한다.

## 2. 규칙

### 2-1. 클라이언트 단 유효성 검사
- **용량 제한**: `file.size`를 체크하여 서버 부하를 방지합니다.
- **확장자 제한**: `file.name`에서 확장자를 추출하여 허용된 형식인지 확인합니다.
- **즉시 피드백**: 파일 선택 직후 유효성 결과를 사용자에게 안내합니다.

### 2-2. 구현 패턴
```javascript
const validateFile = (file) => {
  const maxSize = 5 * 1024 * 1024; // 5MB
  const allowedTypes = ['image/png', 'image/jpeg', 'application/pdf'];

  if (file.size > maxSize) return '파일 용량이 너무 큽니다.';
  if (!allowedTypes.includes(file.type)) return '지원하지 않는 파일 형식입니다.';
  
  return null;
};
```

### 2-3. 다중 파일 업로드 관리
- **Queue**: 업로드 대기 목록을 UI로 노출합니다.
- **Progress**: 개별 파일 또는 전체 진행 상황을 퍼센트(%)로 표시합니다.
- **Status**: 성공/실패 여부를 명확히 구분하여 표시합니다.

## 3. 흔한 실수
- ❌ **클라이언트 검증만 신뢰** → 서버에서 반드시 재검증(MIME·크기·매직넘버). 클라 검증은 UX 보조일 뿐, 쉽게 우회된다.
- ❌ 확장자(`file.name`)만으로 타입 판단 → 위조 가능. 실제 콘텐츠(매직넘버/`Content-Type`)로 확인.
- ❌ 원본 파일명을 그대로 저장 → 경로 traversal·덮어쓰기·인코딩 문제. 서버가 생성한 식별자(UUID 등)로 저장.
- ❌ 동기 업로드로 대용량 전송 → 타임아웃·UI 멈춤. 멀티파트/청크 + 비동기 큐.
- ❌ 진행률·실패 상태 미표시 → 사용자가 멈춤/실패를 알 수 없음. Queue·Progress·Status를 노출.
- ❌ 이미지 재인코딩·EXIF 제거 없이 신뢰 → 악성 페이로드·위치정보(EXIF) 유출.
- ❌ 크기 한도를 클라이언트에만 둠 → 서버·게이트웨이에도 한도를 설정해 우회를 막는다.

## 4. 체크리스트
- [ ] 업로드 전 `file.size`로 용량 제한을 검증한다
- [ ] `allowedTypes`로 허용된 파일 형식만 통과시킨다
- [ ] 파일 선택 직후 즉시 유효성 결과를 사용자에게 안내한다
- [ ] 다중 업로드 시 대기 Queue를 UI로 노출한다
- [ ] 개별/전체 진행 상황을 퍼센트(%)로 표시한다
- [ ] 각 파일의 성공/실패 Status를 명확히 구분해 표시한다
