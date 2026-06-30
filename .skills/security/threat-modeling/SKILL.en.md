---
name: Threat Modeling (Threat Modeling)
description: A stack-neutral security analysis guide that systematically finds and addresses "what could go wrong" at the design stage, before writing code. Derive threats with 4 questions, data flows, trust boundaries, and STRIDE. Read it when designing a new feature/system, handling sensitive flows such as authentication, payments, or external integrations, or proactively reviewing security risks. Keywords: threat-modeling, STRIDE, trust-boundary, data-flow, attack-surface, risk, security-by-design.
rules:
  - "Do it at the design stage — when designing, not after code or deployment. Defects found late are expensive to fix."
  - "The 4 questions are the backbone — ① What are we building ② What can go wrong ③ How do we address it ④ Did we do enough (verification). (Shostack's 4-question frame)"
  - "Focus on trust boundaries — the points where data crosses areas of different trust levels (external→server, user→DB) are the attack surface."
  - "Derive exhaustively with STRIDE — sweep systematically by category (spoofing, tampering, repudiation, information disclosure, denial of service, elevation of privilege), not by gut feeling."
  - "Prioritize risk — sort by likelihood × impact. You can't block every threat, so start with the big ones."
  - "Track the response — leave the derived threats → mitigations → requirements/tickets so they carry through to implementation and verification."
tags:
  - "threat-modeling"
  - "STRIDE"
  - "trust-boundary"
  - "data-flow"
  - "attack-surface"
  - "risk"
  - "security-by-design"
---

# 🛡️ Threat Modeling (Threat Modeling)

> Before writing code, at the design stage, structurally find "what could go wrong" and decide on countermeasures. Read it when designing a new feature/system, or when handling sensitive flows such as authentication, payments, personal data, or external integrations.

Most security incidents arise not from new hacking techniques but from **no one asking "how could this be abused" at design time**. Threat modeling is not some grand tool but a **structured question** the team asks together over a design. The later it is found, the more expensive, so do it before building. This skill covers **threat derivation at design time**; for individual vulnerability catalogs and responses, also see `owasp-top10`.

## 1. Core Principles

- **Do it at the design stage** — when designing, not after code or deployment. Defects found late are expensive to fix.
- **The 4 questions are the backbone** — ① What are we building ② What can go wrong ③ How do we address it ④ Did we do enough (verification). (Shostack's 4-question frame)
- **Focus on trust boundaries** — the points where data crosses areas of different trust levels (external→server, user→DB) are the attack surface.
- **Derive exhaustively with STRIDE** — sweep systematically by category (spoofing, tampering, repudiation, information disclosure, denial of service, elevation of privilege), not by gut feeling.
- **Prioritize risk** — sort by likelihood × impact. You can't block every threat, so start with the big ones.
- **Track the response** — leave the derived threats → mitigations → requirements/tickets so they carry through to implementation and verification.

## 2. Rules

### 2-1. Start With the 4 Questions

```text
① What are we building → Draw the system, data, and actors (data flow diagram)
② What can go wrong    → Derive threats with STRIDE (2-3)
③ How do we address it → Decide on mitigate/accept/transfer/avoid (2-4)
④ Did we do enough     → Review the derivation/responses, and redo if the design changes
```

### 2-2. Draw the Data Flow and Trust Boundaries

Mark the boundaries where the trust level changes — every input that crosses that boundary is subject to validation.

```text
❌ Prohibited — Assuming "it's all internal services so it's safe" and trusting without boundaries
✅ Recommended — Make the trust boundaries explicit: [Browser] →(Boundary1)→ [API] →(Boundary2)→ [DB]
         Data crossing a boundary goes through authentication, validation, and authorization (`input-validation`)
```

### 2-3. Derive Threats With STRIDE Categories

Ask the 6 categories for each element and boundary.

| STRIDE | Threat | Property Broken | Representative Mitigation |
|---|---|---|---|
| **S**poofing | Impersonating someone | Authentication | Strong authentication / session management (`authn-authz`) |
| **T**ampering | Unauthorized change of data/code | Integrity | Signing / verification / access control |
| **R**epudiation | "I didn't do it" | Non-repudiation | Audit logs (`audit-logging`) |
| **I**nformation disclosure | Leaking sensitive information | Confidentiality | Encryption / minimal exposure (`transport-security`·`privacy-pii`) |
| **D**enial of service | Availability paralysis | Availability | Rate limiting / timeouts / quotas |
| **E**levation of privilege | Exceeding permissions | Authorization | Least privilege / server-side authorization checks |

### 2-4. Grade the Risk and Decide on a Response

```text
Risk level = likelihood × impact   (high/medium/low is enough — don't obsess over precise scores)

4 response choices: mitigate (default)        / transfer (e.g., external payment provider)
                    accept (record rationale) / avoid (don't do the feature at all)
```

- Handle high risks first. Consciously **accept** the "low" ones and record the rationale (ignoring ≠ accepting).

### 2-5. Leave Mitigations as Requirements/Tickets

```text
❌ Prohibited — Only talking about threats in a meeting and then dispersing → not reflected in implementation
✅ Recommended — Track threats → mitigations → acceptance criteria/tickets, and verify after implementation
         (Acceptance criteria notation is `spec-writing`)
```

## 3. Common Mistakes

- ❌ Doing the security review only after code and deployment are all done → redesign cost explodes
- ❌ Assuming "internal network/internal service, so it's safe" → trusting without boundaries (real breaches spread via internal movement)
- ❌ Recalling only one or two by gut feeling → omissions because STRIDE isn't swept systematically
- ❌ Treating all threats equally → giving up exhausted without prioritization
- ❌ Only listing threats and not connecting mitigations to tickets/requirements
- ❌ Doing it once and leaving it → the design changed but the model isn't updated

> **Application tip**: Don't start grandly; it's enough to draw the data flow on a whiteboard during a design review and ask at each boundary, "how would the 6 STRIDE items occur here?". For concrete vulnerabilities/defenses see `owasp-top10`, and for design consensus see `spec-writing`.

## 4. Checklist

- [ ] Were threats derived at the design (pre-coding) stage?
- [ ] Was a data flow diagram drawn and the trust boundaries marked?
- [ ] Were the 6 STRIDE categories applied to each boundary/element?
- [ ] Were threats graded by likelihood × impact and responses decided starting with the big ones?
- [ ] Was the rationale recorded for accepted risks (conscious acceptance, not ignoring)?
- [ ] Are mitigations tracked as requirements/tickets and verified after implementation?
