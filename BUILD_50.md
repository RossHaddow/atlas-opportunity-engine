# Atlas Build 50 — Execution Friction Diagnosis

Status: COMPLETE

Build 50 teaches Atlas why recommended work gets deferred instead of treating every deferral as the same execution failure.

## What changed
- Version 1.19.0.
- Adds optional structured defer reasons to Top Focus:
  - Bad timing / not today
  - Not enough time / energy
  - Blocked / waiting on something
  - Action is too big
  - Next step is unclear
  - Does not feel worth prioritizing
  - Other
- Persists the selected defer reason on both current focus state and focus-history events.
- Adds `focusFrictionDiagnosis()` for opportunity-level 14-day diagnosis.
- Adds `focusFrictionSummary()` for portfolio-level friction reporting.
- Adds an Executive Briefing panel showing the dominant friction mix and the opportunities generating diagnosed friction.
- Recommendation feedback now uses friction type instead of applying the same deferral penalty to every situation.
- Blocked and timing/capacity deferrals receive lighter near-term penalties because they do not necessarily indicate a weak opportunity.
- Repeated priority-mismatch deferrals receive a stronger near-term penalty because they are direct evidence that the work may not belong near the top of the queue.
- Action-size friction keeps the adaptive micro-action path active.
- Clarity friction generates a short clarification step before asking for more execution time.
- Blocked, timing/capacity, and priority-mismatch friction preserve the strategic action instead of incorrectly shrinking it.
- Keeps defer reasons optional so the execution flow remains low-friction and legacy focus history remains valid.

## Product intent
Builds 43–49 learned from completion and deferral behavior, but a deferral was still semantically flat. Build 50 adds the missing causal signal. Atlas can now tell the difference between “this task is too big,” “I cannot do this yet,” “today is the wrong day,” and “I do not think this is worth doing.” That allows the recommendation loop to respond to the actual source of friction instead of using one generic solution.

## Verification
- `npm run check` passes.
- 96/96 automated tests pass.
- Legacy deferrals without reasons retain the Build 49 behavior.
- Structured reasons normalize and persist safely.
- Blockers do not trigger micro-action shrinking.
- Priority mismatch receives a stronger near-term ranking penalty than timing friction.
- Command Center exposes portfolio friction diagnosis and the UI renders it.
