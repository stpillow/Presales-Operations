# Skill Test Runner

Runs the TDD regression suite for this skills library: bench scenarios execute in isolated runner subagents, blind judges score each response against the pre-written checks, and results land in `test-bench/results/` with pass/fail evidence and deltas since the last run.

## Time saved

Turns "did my tailoring change break anything?" from a manual 30-minute spot-check into a one-phrase regression run. The human bench (`test-bench/bench-*.html`) stays for calibration; this automates the repetition.

## Customization ideas

- Add new bench files (`test-bench/bench-2-tests.md`, ...) as more skills get tailored — the runner picks them up automatically
- Tighten or add checks as real-world failures surface; the checklist is the contract
- Add a "3-vote judge" mode for checks that flip between runs (majority verdict)
- Wire into CI (GitHub Action + API key) once the library stabilizes
