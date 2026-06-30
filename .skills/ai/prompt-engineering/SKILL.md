---
name: 프롬프트 엔지니어링
description: 시스템 프롬프트·few-shot 예제·Chain-of-Thought로 LLM 출력 품질을 높이고 프롬프트 인젝션을 방지하는 실전 가이드. LLM 프롬프트를 설계·개선하거나 출력 형식을 고정하거나 사용자 입력을 안전하게 다룰 때 읽는다. 키워드: system-prompt, few-shot, chain-of-thought, cot, prompt-injection, prompt-template, structured-prompt, role, xml-tags.
rules:
  - "시스템 프롬프트에 역할·출력 형식·제약사항을 명확히 정의하고, 사용자 입력과 분리한다."
  - "Few-shot 예제는 경계 조건과 실패 케이스를 포함해 3~5개를 제공하고, 예제 형식과 실제 입력 형식을 일치시킨다."
  - "Chain-of-Thought(단계별 추론)를 요청해 복잡한 추론 정확도를 높이고, 중간 추론 과정을 검증 가능하게 한다."
  - "사용자 입력은 XML 태그나 구분자로 감싸 프롬프트 인젝션을 방지한다."
  - "프롬프트는 버전 관리하고 변경 시 A/B 평가를 통해 개선 여부를 확인한다."
tags:
  - "system-prompt"
  - "few-shot"
  - "chain-of-thought"
  - "cot"
  - "prompt-injection"
  - "prompt-template"
  - "structured-prompt"
  - "role"
  - "xml-tags"
---

# 🤖 프롬프트 엔지니어링

> 시스템 프롬프트·few-shot·CoT로 LLM 출력 품질을 높이고 인젝션을 막는다. LLM 프롬프트를 새로 설계하거나 출력 형식·안전성을 정할 때 읽는다.

## 1. 핵심 원칙
- 시스템 프롬프트에 역할·출력 형식·제약사항을 명확히 정의하고, 사용자 입력과 분리한다.
- Few-shot 예제는 경계 조건과 실패 케이스를 포함해 3~5개를 제공하고, 예제 형식과 실제 입력 형식을 일치시킨다.
- Chain-of-Thought(단계별 추론)를 요청해 복잡한 추론 정확도를 높이고, 중간 추론 과정을 검증 가능하게 한다.
- 사용자 입력은 XML 태그나 구분자로 감싸 프롬프트 인젝션을 방지한다.
- 프롬프트는 버전 관리하고 변경 시 A/B 평가를 통해 개선 여부를 확인한다.

## 2. 규칙

### 2-1. 시스템 프롬프트 구조
```python
SYSTEM_PROMPT = """당신은 소프트웨어 아키텍처 전문가입니다.

## 역할
사용자의 요구사항을 분석하고 적합한 시스템 설계를 제안합니다.

## 출력 형식
반드시 다음 JSON 형식으로만 응답하세요:
{
  "architecture": "선택한 아키텍처 패턴",
  "rationale": "선택 이유 (2-3문장)",
  "components": ["컴포넌트1", "컴포넌트2"],
  "risks": ["위험요소1", "위험요소2"]
}

## 제약사항
- JSON 외 다른 텍스트를 포함하지 마세요
- 확실하지 않은 내용은 risks에 명시하세요
- 기술 용어는 한국어로 설명하세요"""
```

### 2-2. Few-Shot 예제
```python
FEW_SHOT_EXAMPLES = [
    {
        "role": "user",
        "content": """<requirement>
월 사용자 1000명의 블로그 플랫폼. 글 작성·댓글·좋아요 기능.
</requirement>"""
    },
    {
        "role": "assistant",
        "content": """{
  "architecture": "모놀리식 MVC",
  "rationale": "소규모 트래픽에서 단순성이 우선. 스케일 필요 시 이후 마이크로서비스 분리 가능.",
  "components": ["Web Server", "Application Server", "RDBMS", "CDN"],
  "risks": ["트래픽 급증 시 수직 확장 한계"]
}"""
    },
]

def build_messages(user_requirement: str) -> list[dict]:
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(FEW_SHOT_EXAMPLES)
    # 사용자 입력을 XML 태그로 격리 — 인젝션 방지
    messages.append({
        "role": "user",
        "content": f"<requirement>\n{user_requirement}\n</requirement>"
    })
    return messages
```

### 2-3. Chain-of-Thought (단계별 추론)
```python
COT_PROMPT = """다음 단계로 분석하세요:

1. **요구사항 파악**: 핵심 기능과 제약사항을 나열하세요
2. **트래픽 추정**: 예상 규모를 수치로 추정하세요
3. **아키텍처 선택**: 2~3개 후보를 비교하고 최적안을 선택하세요
4. **최종 답변**: JSON 형식으로 출력하세요

<step-by-step>
분석:
"""
```

### 2-4. 프롬프트 인젝션 방어
```python
import re

def sanitize_user_input(raw: str) -> str:
    """시스템 프롬프트 재정의 시도 탐지 및 차단"""
    injection_patterns = [
        r"ignore (previous|above|all) instructions",
        r"new (system|instructions?)",
        r"you are now",
        r"disregard",
    ]
    for pattern in injection_patterns:
        if re.search(pattern, raw, re.IGNORECASE):
            raise ValueError("잠재적 프롬프트 인젝션 감지")

    # XML 특수문자 이스케이프 (태그 탈출 방지)
    sanitized = raw.replace("<", "&lt;").replace(">", "&gt;")
    return sanitized

def build_safe_message(user_input: str) -> str:
    safe = sanitize_user_input(user_input)
    return f"<user_input>\n{safe}\n</user_input>"
```

### 2-5. 프롬프트 버전 관리
```python
# prompts/v2_architecture.py
PROMPT_VERSION = "2.1.0"
PROMPT_CHANGELOG = "few-shot 예제에 마이크로서비스 케이스 추가, CoT 단계 세분화"

# A/B 평가: 프롬프트 버전별 품질 지표 추적
def track_prompt_quality(version: str, response: str, human_score: int):
    metrics_db.insert({
        "prompt_version": version,
        "response_length": len(response),
        "human_score": human_score,  # 1-5점
        "timestamp": datetime.utcnow(),
    })
```

## 3. 흔한 실수
- 역할·출력 형식·제약을 시스템 프롬프트에 안 적고 사용자 입력에 섞음 → 출력이 흔들리고 인젝션에 취약해진다.
- Few-shot 예제 형식과 실제 입력 형식이 달라 모델이 형식을 못 따른다.
- 사용자 입력을 구분자 없이 그대로 합쳐 프롬프트 인젝션을 허용한다.
- 프롬프트를 버전 관리 없이 즉석 수정 → 품질 변화를 추적·비교할 수 없다.

## 4. 체크리스트
- [ ] 시스템 프롬프트에 역할·출력 형식·제약사항을 명시하고 사용자 입력과 분리했는가
- [ ] Few-shot 예제 3~5개에 경계·실패 케이스를 포함하고 입력 형식과 일치시켰는가
- [ ] 복잡한 추론에 Chain-of-Thought를 적용하고 중간 과정을 검증 가능하게 했는가
- [ ] 사용자 입력을 XML 태그/구분자로 감싸고 인젝션 패턴을 차단했는가
- [ ] 프롬프트를 버전 관리하고 변경 시 A/B 평가로 개선을 확인했는가
