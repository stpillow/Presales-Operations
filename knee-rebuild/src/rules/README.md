# src/rules

Every decision the app makes lives here as pure TypeScript functions with Vitest cases: readings, prescriptions, the unilateral budget, deloads, mileage, gates, red flags, week and day. Nothing in this folder imports React, Dexie, or the DOM. Components render and collect input; they ask this module what to do.

A rule change without a test change is a bug. The six worked examples in PROMPT.md section 4 are named tests.

Filled in M2. See PLAN.md.
