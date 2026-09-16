# Atlas Build 69 — Plan-Depth Recovery & Probe Controller

Version: 1.38.0

Build 69 extends Build 68's Daily Plan Depth & Fatigue Learning with a recovery layer so evidence-backed fatigue caps can relax when recent execution improves instead of remaining stuck indefinitely.

## What changed

- Added a 14-day plan-depth recovery learner for the current execution window.
- Recovery compares recent early blocks (1–2) against recent deep blocks (3+).
- A recovery signal requires at least four recent resolved deep blocks, at least 70% deep-block follow-through, and no more than a 15-point early-vs-deep gap while the historical fatigue signal is still active.
- Strong 2-block fatigue protection relaxes in stages: recovery lifts the cap to 3 blocks first rather than jumping immediately to 5.
- An established 3-block cap can return to the normal 5-block ceiling after recent deep-block recovery is established.
- Added a controlled recovery probe for the strongest 2-block cap. If early execution remains strong, no recent deep evidence exists, and the last deep outcome is at least seven days old, Atlas temporarily permits a third block so recovery can be measured.
- The recovery layer never expands beyond the existing five-block ceiling and never changes Atlas Score, strategic priority, learned density, or the user's available-time limit.
- Daily Work Plan guidance and Command Center now expose recovery state: learning, protected, probe, or recovered.

## Regression coverage

Five Build 69 tests cover recent recovery detection, controlled third-block probes, protection holds, staged relaxation, and Command Center/UI exposure.
