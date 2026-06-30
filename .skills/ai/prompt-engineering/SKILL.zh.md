---
name: 提示词工程
description: 通过系统提示词、few-shot 示例、Chain-of-Thought 提升 LLM 输出质量并防止提示词注入的实战指南。当设计或改进 LLM 提示词、固定输出格式、或安全处理用户输入时阅读。关键词: system-prompt, few-shot, chain-of-thought, cot, prompt-injection, prompt-template, structured-prompt, role, xml-tags.
rules:
  - "在系统提示词中明确定义角色、输出格式、约束事项,并与用户输入分离。"
  - "Few-shot 示例应包含边界条件和失败用例,提供 3~5 个,并使示例格式与实际输入格式一致。"
  - "请求 Chain-of-Thought(逐步推理)以提升复杂推理的准确度,并使中间推理过程可验证。"
  - "用 XML 标签或分隔符包裹用户输入以防止提示词注入。"
  - "对提示词进行版本管理,变更时通过 A/B 评估确认是否有改进。"
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

# 🤖 提示词工程

> 通过系统提示词、few-shot、CoT 提升 LLM 输出质量并阻止注入。当新设计 LLM 提示词或确定输出格式与安全性时阅读。

## 1. 核心原则
- 在系统提示词中明确定义角色、输出格式、约束事项,并与用户输入分离。
- Few-shot 示例应包含边界条件和失败用例,提供 3~5 个,并使示例格式与实际输入格式一致。
- 请求 Chain-of-Thought(逐步推理)以提升复杂推理的准确度,并使中间推理过程可验证。
- 用 XML 标签或分隔符包裹用户输入以防止提示词注入。
- 对提示词进行版本管理,变更时通过 A/B 评估确认是否有改进。

## 2. 规则

### 2-1. 系统提示词结构
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

### 2-2. Few-Shot 示例
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

### 2-3. Chain-of-Thought(逐步推理)
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

### 2-4. 提示词注入防御
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

### 2-5. 提示词版本管理
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

## 3. 常见错误
- 不把角色、输出格式、约束写进系统提示词,而混入用户输入 → 输出不稳定且易受注入攻击。
- Few-shot 示例格式与实际输入格式不同,导致模型无法遵循格式。
- 不加分隔符就直接拼接用户输入,从而允许提示词注入。
- 不做版本管理就即兴修改提示词 → 无法追踪、比较质量变化。

## 4. 检查清单
- [ ] 是否在系统提示词中写明角色、输出格式、约束事项,并与用户输入分离?
- [ ] 是否在 3~5 个 few-shot 示例中包含边界与失败用例,并与输入格式一致?
- [ ] 是否对复杂推理应用了 Chain-of-Thought,并使中间过程可验证?
- [ ] 是否用 XML 标签/分隔符包裹用户输入,并阻断注入模式?
- [ ] 是否对提示词进行版本管理,并在变更时通过 A/B 评估确认改进?
