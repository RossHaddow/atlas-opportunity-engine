# Atlas Build 66 — Daily Plan Composition Learning

Version: **1.35.0**

Build 66 teaches Atlas whether the user executes better with a **mixed work-type plan** or a **focused work-type plan** in the current time-of-day window.

## What changed

- Adds `dailyPlanCompositionLearning()` over a rolling 56-day window.
- Groups resolved Daily Work Plan blocks by plan day and current execution window.
- Classifies qualifying plan days as:
  - **Mixed** — two or more work types resolved that day.
  - **Focused** — one work type resolved that day.
- Ignores plan days with fewer than two resolved blocks.
- Measures plan days, resolved blocks, completions, deferrals, follow-through, average day follow-through, and performance score for each composition mode.
- Uses explicit composition evidence tiers:
  - Insufficient: <2 plan days
  - Provisional: 2 plan days
  - Established: 3–5 plan days
  - Strong: 6+ plan days
- Composition guidance activates only when:
  - the winning pattern has Established or Strong evidence;
  - the comparison pattern has at least Provisional evidence; and
  - the performance gap is at least 10 points.
- Applies only a **±2 planning-score adjustment** after the first Daily Work Plan block:
  - Mixed preference gently favors a different work type next.
  - Focused preference gently favors continuity with the first work type.
- Does not change Atlas Score, strategic recommendations, learned daily-plan density, or the user-provided time cap.
- Stores `plan_composition_mode` on Daily Work Plan focus sessions for future controller-effectiveness learning.
- Exposes composition learning through the Command Center and Daily Work Plan UI.

## Verification

- `npm run check`: **173/173 tests passing**.
- Runtime smoke test: Atlas reports **v1.35.0** with writable SQLite.
- Clean-seed Daily Work Plan remains composition-neutral (`learning`) until real comparative evidence exists.
