# Bench 2 — Test Definitions (in progress: 2 of 5 skills)

Written BEFORE the tailoring (TDD). Same harness rules as bench 1: isolated runner with only the SKILL.md, blind judge, evidence-quoted verdicts, pass = 7/7.

Standard user context for all runs:
> Director of Presales Operations at a govtech SaaS company selling to government organizations. Tools: Salesforce (CRM), Gong (calls). No live CRM/Gong connection in the test session.

---

## pipeline-health

### Scenario
```
Audit this pipeline. Team quota this quarter: $2.5M. Most government deals here run 6-9 month cycles.

1. Ridgeway County ERP-adjacent records deal — $520K, evaluation stage (their RFP scoring window), 45 days in stage, last contact was our proposal submission, close date July 15. SC and SA both engaged through the proposal.
2. City of Brookfield communications platform — $380K, demo/evaluation, 20 days in stage, close date June 30 (their FY end). Technical setup is complex — no SC or SA has touched this deal; the AE has been demoing alone. Two contacts engaged.
3. Lakeshore Utility District — $290K, proposal stage, close date was May 20 (passed), still open — their board vote on the contract got moved to the June meeting. Multi-threaded, SC engaged.
4. Township of Dell Creek — $150K, qualification, 50 days in stage, one contact (an analyst), no activity in 3 weeks, no documented next step.
5. State agency pilot expansion — $700K, discovery, 10 days in stage, close date September, champion is a program director, SC assigned last week.

I don't have last-activity dates for deals 1 and 5 handy.
```

### Checks
1. Computes coverage correctly: total pipe ($2.04M) vs. $2.5M quota is under 1x — flagged as a serious gap, with weighted pipeline and gap-to-quota math shown
2. Does NOT flag Ridgeway (deal 1) as stale/dead — 45 days in an RFP scoring window is normal procurement behavior; distinguishes procurement-driven waiting from true staleness
3. Flags Brookfield (deal 2) for missing technical coverage — complex deal, AE demoing alone, no SC/SA — as a solution-quality risk, not just a generic note
4. Treats Lakeshore's (deal 3) passed close date as paper-process reality (board vote moved), not seller failure — recalibrates the close date to the June meeting rather than labeling it push risk alone
5. Flags Dell Creek (deal 4) on multiple risks (single-threaded below-power contact, stale, no next step) and is honest that it may not be qualified
6. Names where the presales ops director should personally engage (at minimum Brookfield's coverage gap), distinct from generic rep to-dos
7. Does not invent last-activity data for deals 1 and 5 — explicitly notes what can't be assessed

---

## objection-handler

### Scenario
```
One of my reps needs help — his deal went quiet and he wants to send a re-engagement email.

The deal: Harmon County resident-services portal, $410K. His main contact (assistant county administrator, who'd been responsive for months) stopped replying about 3 weeks ago. Around that same time the county released an RFP for "constituent digital services" — we're planning to bid; responses due in 2 weeks. Before the RFP came out, she had mentioned budget was tight this year.

He's drafted an email to her asking for "a quick call to reconnect" and wants my take before sending. What should I tell him?
```

### Checks
1. Diagnoses the real cause of silence: an active solicitation triggered blackout/quiet-period behavior — she went quiet because she has to, not because the deal is dead
2. Tells the rep NOT to send the re-engagement email — contact with the buyer outside official channels during an active solicitation risks compliance and disqualification
3. Coaches the rep on why (framed as coaching for the rep, not just a verdict) — the silence is expected procurement behavior, and pressure now can hurt the bid
4. Redirects energy to the channels that remain: the official Q&A window, proposal quality, orals/demo prep — and notes the budget concern should inform pricing strategy in the bid
5. Ties the play's timeline to procurement milestones (Q&A deadline, submission, award, post-award debrief) rather than an arbitrary follow-up cadence
6. Prevention note covers pre-RFP positioning (multi-threading and requirement-shaping before release) and flags this as a possible cross-deal coaching pattern
7. Any drafted message is for a permitted channel/time (e.g., post-award, or official Q&A content) — never to the quiet contact mid-solicitation — and stays under 100 words, human, non-manipulative
```
