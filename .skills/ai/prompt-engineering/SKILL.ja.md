---
name: プロンプトエンジニアリング
description: システムプロンプト・few-shot例・Chain-of-ThoughtでLLM出力品質を高め、プロンプトインジェクションを防止する実践ガイド。LLMプロンプトを設計・改善したり、出力形式を固定したり、ユーザー入力を安全に扱う際に読む。キーワード: system-prompt, few-shot, chain-of-thought, cot, prompt-injection, prompt-template, structured-prompt, role, xml-tags.
rules:
  - "システムプロンプトに役割・出力形式・制約事項を明確に定義し、ユーザー入力と分離する。"
  - "Few-shot例は境界条件と失敗ケースを含めて3〜5個提供し、例の形式と実際の入力形式を一致させる。"
  - "Chain-of-Thought(段階的推論)を要求して複雑な推論の精度を高め、途中の推論過程を検証可能にする。"
  - "ユーザー入力はXMLタグや区切り文字で囲んでプロンプトインジェクションを防止する。"
  - "プロンプトはバージョン管理し、変更時にA/B評価で改善有無を確認する。"
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

# 🤖 プロンプトエンジニアリング

> システムプロンプト・few-shot・CoTでLLM出力品質を高め、インジェクションを防ぐ。LLMプロンプトを新規設計したり、出力形式・安全性を定める際に読む。

## 1. 核心原則
- システムプロンプトに役割・出力形式・制約事項を明確に定義し、ユーザー入力と分離する。
- Few-shot例は境界条件と失敗ケースを含めて3〜5個提供し、例の形式と実際の入力形式を一致させる。
- Chain-of-Thought(段階的推論)を要求して複雑な推論の精度を高め、途中の推論過程を検証可能にする。
- ユーザー入力はXMLタグや区切り文字で囲んでプロンプトインジェクションを防止する。
- プロンプトはバージョン管理し、変更時にA/B評価で改善有無を確認する。

## 2. ルール

### 2-1. システムプロンプト構造
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

### 2-2. Few-Shot例
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

### 2-3. Chain-of-Thought(段階的推論)
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

### 2-4. プロンプトインジェクション防御
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

### 2-5. プロンプトバージョン管理
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

## 3. よくあるミス
- 役割・出力形式・制約をシステムプロンプトに書かずユーザー入力に混ぜる → 出力がぶれ、インジェクションに脆弱になる。
- Few-shot例の形式と実際の入力形式が異なり、モデルが形式に従えない。
- ユーザー入力を区切り文字なしにそのまま結合してプロンプトインジェクションを許す。
- プロンプトをバージョン管理なしに即席で修正 → 品質変化を追跡・比較できない。

## 4. チェックリスト
- [ ] システムプロンプトに役割・出力形式・制約事項を明記し、ユーザー入力と分離したか
- [ ] Few-shot例3〜5個に境界・失敗ケースを含め、入力形式と一致させたか
- [ ] 複雑な推論にChain-of-Thoughtを適用し、途中過程を検証可能にしたか
- [ ] ユーザー入力をXMLタグ/区切り文字で囲み、インジェクションパターンを遮断したか
- [ ] プロンプトをバージョン管理し、変更時にA/B評価で改善を確認したか
