---
name: Incident Response & Postmortems (Incident Response)
description: A stack-neutral guide to detecting, mitigating, and recovering from production incidents and preventing recurrence through blameless retrospectives. Covers severity (SEV) levels, role separation (command, comms, ops), mitigation-first, real-time timelines, blameless postmortems, and tracking of action items and runbooks. Read it when a production incident occurs, when building an on-call structure, or when writing a post-incident retrospective. Keywords: incident-response, postmortem, severity, on-call, runbook, blameless, RCA, mitigation, MTTR.
rules:
  - "Set the response scale by severity (SEV) — do not treat every incident with the same intensity. The level decides the scope of escalation, alerting, and who is summoned."
  - "Separate roles — split Incident Commander, Comms, Ops, and Scribe. If one person fixes while also reporting and recording, both fall behind — in particular, do not let the IC double as timekeeper; assign the timeline to the Scribe (so command stays focused)."
  - "Mitigation before root cause — restore the service first (rollback, failover, turning features off). Do root cause analysis (RCA) after the fire is out."
  - "Record the timeline in real time — log the times of occurrence, detection, mitigation, and resolution and each action taken. Memory cannot be trusted."
  - "Make postmortems blameless — fix the system and process that allowed the mistake, not the person who made it. Punishment makes people hide it next time."
  - "Turn lessons into trackable actions — turn the improvements from the retrospective into tickets with an owner and a deadline. Document recurring responses as runbooks."
tags:
  - "incident-response"
  - "postmortem"
  - "severity"
  - "on-call"
  - "runbook"
  - "blameless"
  - "RCA"
  - "mitigation"
  - "MTTR"
---

# 🚨 Incident Response & Postmortems (Incident Response)

> Mitigate and recover from production incidents quickly, and after it is over, use a blameless retrospective so the same thing does not happen again. Read it when an incident occurs, when building an on-call structure, or when writing a post-incident retrospective.

Incident response usually descends into chaos for the same reasons — **it is unclear who is in command, recovery is delayed by digging into the cause first, and after it is over people blame someone and fail to capture the real lessons.** Good response comes not from a single hero but from **defined roles, priorities, and records**. Two essentials: during an incident, **mitigation comes before root cause**; after an incident, **fix the system but do not blame the person**. For detection and observability foundations, read this alongside `observability`; for recovery design, alongside `error-handling-resilience`.

## 1. Core principles

- **Set the response scale by severity (SEV)** — do not treat every incident with the same intensity. The level decides the scope of escalation, alerting, and who is summoned.
- **Separate roles** — split Incident Commander, Comms, Ops, and Scribe. If one person fixes while also reporting and recording, both fall behind — in particular, do not let the IC double as timekeeper; assign the timeline to the Scribe (so command stays focused).
- **Mitigation before root cause** — restore the service first (rollback, failover, turning features off). Do root cause analysis (RCA) after the fire is out.
- **Record the timeline in real time** — log the times of occurrence, detection, mitigation, and resolution and each action taken. Memory cannot be trusted.
- **Make postmortems blameless** — fix the system and process that allowed the mistake, not the person who made it. Punishment makes people hide it next time.
- **Turn lessons into trackable actions** — turn the improvements from the retrospective into tickets with an owner and a deadline. Document recurring responses as runbooks.

## 2. Rules

### 2-1. Define severity (SEV) levels first

It varies by organization, but agree in advance on levels and responses based on impact.

| Level | Impact (example) | Response |
|---|---|---|
| **SEV1** | Full outage, data loss, security breach | Summon immediately, report to executives, all hands focused |
| **SEV2** | Degradation of core features, some users affected | On-call + owning team, rapid mitigation |
| **SEV3** | Minor, workaround available, non-core | Handle within regular hours |

- Assign the level by **impact (users, revenue, data)**. Not "is the cause big" but "is the damage big".
- Some organizations break it down further into SEV4/5 (minor, informational). A **security breach** involves evidence preservation, legal, and regulatory reporting, so its procedure differs from a general incident — handle it on a **separate track** (together with `owasp-top10` and the security owner).

### 2-2. Separate roles (no one-person-many-roles)

```text
❌ Forbidden — one person debugging + reporting status + making decisions at once → both delayed/missed
✅ Recommended — Incident Commander (command/decisions) / Comms (internal/customer notices) / Ops (actual actions) / Scribe (timeline recording)
         Small incidents may combine roles, but the commander must always be clearly one person
```

### 2-3. Mitigate before root cause

```text
❌ Forbidden — 30 minutes debugging "why did this happen?" → users keep facing the outage meanwhile
✅ Recommended — restore first: roll back the last deploy / fail over traffic / turn off the problem feature (feature flag)
         after the service recovers, proceed with root cause analysis (RCA) (rollback is `git-workflow`; data loss, failover, and recovery objectives (RTO/RPO) are `backup-dr`)
```

### 2-4. Real-time timeline + status sharing

```text
✅ Record only facts with timestamps in one channel:
   13:58 deployed new payment module          (occurrence)
   14:02 alert: payment error rate spiking     (detection)
   14:08 judged it the last deploy, started rollback (mitigation begun)
   14:15 confirmed error rate normalized        (resolution)
- Internal/customer notices go out from Comms on a fixed cadence. "Under investigation" beats silence.
```

### 2-5. Blameless postmortem — PIR (mandatory for SEV1/2)

Even if the cause was a person's action, the target to fix is **the system that made that action possible**.

```text
Postmortem template (recommended):
- Impact: what, how much, to whom (duration, number of users)
- Timeline: occurrence → detection → mitigation → resolution
- Root cause / contributing factors: the real cause, not the surface symptom (usually contributing factors are multiple — do not hunt for a single culprit, `systematic-debugging`)
- What went well / what was lucky / what was lacking
- Action items: improvements with an owner and a deadline (recurrence prevention)

❌ Forbidden — ending with "A made a mistake" → next time the mistake gets hidden
✅ Recommended — ask "why did one person's mistake spread into a full outage?" and add guardrails
```

### 2-6. Action item tracking + turning into runbooks

```text
❌ Forbidden — writing only the postmortem document while action items fizzle out
✅ Recommended — register actions as tickets (owner, deadline) and track them to completion
         turn recurring response procedures into runbooks: symptom → check command → action steps
```

## 3. Common mistakes

- ❌ Several people touching things at once without a commander, conflicting with each other (duplicate rollbacks, contradictory actions)
- ❌ Investigating root cause before mitigation, increasing incident duration (MTTR = mean time to recovery)
- ❌ No severity criteria, so all hands are summoned for trivia / response drags on big ones
- ❌ No timeline recorded → impossible to reconstruct "when did what" during the retrospective
- ❌ A retrospective that blames the person → trust and psychological safety collapse, the next incident gets concealed
- ❌ Not tracking action items, so the same incident recurs
- ❌ Silence during the incident → customer and internal anxiety and speculation amplify

> **Application tip**: Before an incident happens, agree in advance on SEV levels, roles, contact structure, and basic runbooks. You cannot create definitions in the middle of the night. For detection and alerting foundations, `observability`; for resilience design (retries, circuit breakers), `error-handling-resilience`; for data recovery and failover, `backup-dr`.

## 4. Checklist

- [ ] Are severity (SEV) levels and per-level responses defined in advance?
- [ ] Are the command (IC), comms, and ops roles separated during an incident (commander clearly one person)?
- [ ] Was service mitigation/recovery done before root cause investigation?
- [ ] Was the occurrence/detection/mitigation/resolution timeline recorded in real time?
- [ ] Was a blameless postmortem written for SEV1/2 (impact, timeline, root cause, actions)?
- [ ] Are action items tracked as tickets with an owner and deadline, and are recurring responses turned into runbooks?
