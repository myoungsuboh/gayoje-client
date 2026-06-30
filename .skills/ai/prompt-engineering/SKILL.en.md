---
name: Prompt Engineering
description: A practical guide to raising LLM output quality with system prompts, few-shot examples, and Chain-of-Thought, and to preventing prompt injection. Read this when designing or improving an LLM prompt, pinning down an output format, or safely handling user input. Keywords: system-prompt, few-shot, chain-of-thought, cot, prompt-injection, prompt-template, structured-prompt, role, xml-tags.
rules:
  - "Clearly define the role, output format, and constraints in the system prompt, and separate them from user input."
  - "Provide 3–5 few-shot examples that include boundary conditions and failure cases, and match the example format to the actual input format."
  - "Request Chain-of-Thought (step-by-step reasoning) to improve accuracy on complex reasoning, and make the intermediate reasoning verifiable."
  - "Wrap user input in XML tags or delimiters to prevent prompt injection."
  - "Version-control prompts and verify improvement through A/B evaluation whenever they change."
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

# 🤖 Prompt Engineering

> Raise LLM output quality with system prompts, few-shot, and CoT, and block injection. Read this when designing a new LLM prompt or deciding output format and safety.

## 1. Core Principles
- Clearly define the role, output format, and constraints in the system prompt, and separate them from user input.
- Provide 3–5 few-shot examples that include boundary conditions and failure cases, and match the example format to the actual input format.
- Request Chain-of-Thought (step-by-step reasoning) to improve accuracy on complex reasoning, and make the intermediate reasoning verifiable.
- Wrap user input in XML tags or delimiters to prevent prompt injection.
- Version-control prompts and verify improvement through A/B evaluation whenever they change.

## 2. Rules

### 2-1. System prompt structure
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

### 2-2. Few-Shot Examples
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

### 2-3. Chain-of-Thought (step-by-step reasoning)
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

### 2-4. Prompt injection defense
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

### 2-5. Prompt version management
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

## 3. Common Mistakes
- Not writing the role, output format, and constraints into the system prompt and mixing them into user input → the output drifts and becomes vulnerable to injection.
- The few-shot example format differs from the actual input format, so the model fails to follow the format.
- Concatenating user input without delimiters, allowing prompt injection.
- Editing prompts ad hoc without version control → you can't track or compare quality changes.

## 4. Checklist
- [ ] Did you specify the role, output format, and constraints in the system prompt and separate them from user input?
- [ ] Did you include boundary and failure cases in 3–5 few-shot examples and match them to the input format?
- [ ] Did you apply Chain-of-Thought to complex reasoning and make the intermediate steps verifiable?
- [ ] Did you wrap user input in XML tags/delimiters and block injection patterns?
- [ ] Did you version-control prompts and verify improvement via A/B evaluation when they change?
