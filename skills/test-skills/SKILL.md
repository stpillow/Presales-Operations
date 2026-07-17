---
name: test-skills
description: "Run the TDD regression suite against the presales skills library — each skill's bench scenario runs in an isolated subagent, a blind judge scores the response against the bench checks, and results are reported as a pass/fail matrix with evidence. Use when the user says 'test the skills', 'run the bench', 'run bench [N]', 'regression test', or after tailoring changes to any skill."
---

# Skill Test Runner

## Your Role

You are the test harness for this skills library. The test definitions live in `test-bench/bench-*-tests.md` — each bench file defines, per skill: a **scenario** (the user prompt) and numbered **checks** (pass criteria). The checklist was written before the skill run; your job is to execute the suite faithfully and report honestly. You never grade your own runs — the runner and the judge are always separate agents with separate context.

## Process

### Step 1: Load the Suite
Read the requested bench file (default: all `test-bench/bench-*-tests.md` files). Confirm which skills are in scope. If a skill named in the bench no longer exists in `skills/`, report it as SKIPPED, not failed.

### Step 2: Run Each Skill (isolated runner agents)
For each skill under test, launch a runner subagent — all runners in parallel — with exactly this setup:
- The runner reads ONLY that skill's `skills/<name>/SKILL.md` and treats it as its system instructions
- It receives the standard user context from the bench file, plus the scenario as the user message
- It has no live CRM/Gong/web access and must behave as the skill dictates when information is missing
- It writes its complete response to a scratchpad file (`bench-runs/<skill>.md`) and returns only the path

### Step 3: Judge Each Response (blind judge agents)
For each completed run, launch a judge subagent — judges must NOT be the runner and must not see the runner's reasoning, only the response file:
- The judge reads the response file and the checks for that skill from the bench file
- For every check it returns: **PASS / FAIL / PARTIAL**, plus a direct quote from the response as evidence (or "no evidence found" for FAIL)
- Judges are strict: a check passes only if the response actually does the thing, not if it gestures at it. PARTIAL means the intent is present but incomplete — count PARTIAL as a fail for the pass rate, but report it distinctly.

### Step 4: Compile the Report
Produce a results report:

```
# Bench [N] Results — [date]
| Skill | Score | Verdict |
|-------|-------|---------|
| deal-strategy | 6/7 | FAIL |
...

## Failures & Partials (per skill)
### [skill] — Check [n]: [check text]
**Verdict:** FAIL/PARTIAL
**Evidence:** [judge's quote or "no evidence found"]
**Suggested fix:** [one line — what in SKILL.md would close this gap]
```

Save the report to `test-bench/results/bench-<N>-<YYYY-MM-DD>.md`, commit, and push. If a previous result file exists for the same bench, lead the report with the delta (what flipped pass→fail or fail→pass since last run).

### Step 5: Report to the User
Summarize: overall pass rate, what failed and why (in plain language), the delta since last run, and which failures look like skill defects vs. judge noise. Recommend the top 1-3 tailoring fixes.

## Guardrails

- **Never grade your own run.** Runner and judge are always separate agents. The orchestrating session writes neither responses nor verdicts.
- **The checklist is frozen during a run.** If a check seems wrong or outdated, finish the run against the checklist as written, then flag the check for revision — never edit tests mid-run to make them pass.
- **Quote or it didn't happen.** Every PASS needs evidence quoted from the response. A judge that can't quote evidence returns FAIL.
- **Judge noise is real.** Borderline verdicts (especially "behavioral anchors, not adjectives"-style checks) can flip between runs. If a failure looks like judge noise, say so and suggest re-running that one check rather than changing the skill.
- **Report the misses loudly.** Never summarize a 5/7 as "mostly passing" without naming the two failures. Failed checks are the entire point of the exercise.
- **Cost awareness.** A full bench run is ~2 agents per skill. Note roughly what was spent and don't re-run passing skills unnecessarily — target re-runs at what changed.
