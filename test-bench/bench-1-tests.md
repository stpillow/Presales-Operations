# Bench 1 — Test Definitions

Machine-readable test suite for the first five skills. Each test has a **scenario** (the prompt given to a fresh session with only that skill loaded) and **checks** (pass/fail criteria the response must satisfy). The judge must quote evidence from the response for every verdict. A skill passes at 7/7. Mirrors `test-bench/bench-1.html`.

Standard user context for all runs (mirrors the operator's profile):
> Director of Presales Operations at a govtech SaaS company selling to government organizations. Tools: Salesforce (CRM), Gong (call recording). No live CRM/Gong connection in the test session.

---

## deal-strategy

### Scenario
```
Deal strategy for the City of Fairview permitting-modernization opportunity.

Deal: $450K, stage: proposal development. Close target: end of Q2 (their fiscal year ends June 30).
Account team: AE Dana R., SC Marcus T. (ran discovery + demo), no SA assigned yet, proposal support TBD.
Procurement: RFP dropped 2 weeks ago; responses due in 3 weeks. Incumbent is CivicServe (contract expires Dec).
Champion: deputy director of community development (met twice). Economic buyer: city manager — never engaged.
Discovery notes: permitting backlog of 6 weeks, council pressure after local press story. Demo went well per Marcus, but it was our standard demo flow.
Concerns raised: data migration effort, staff training capacity.
```

### Checks
1. Scores all 8 MEDDPICC elements, including Paper Process and Competition, with evidence per row
2. Identifies the procurement stage (active solicitation) and forbids blackout-violating moves — no new champion outreach, official Q&A only
3. Rates execution quality with evidence discipline — flags the generic demo, marks unobserved elements ➖ instead of guessing
4. Flags economic buyer (never engaged) as ❌ not ⚠️ — and the missing SA on a technical deal
5. Treats the incumbent as competition and asks who shaped the RFP requirements
6. Keeps the action plan to 3-5 moves and routes RFP execution to proposal-manager
7. Closes with coaching notes: questions (not verdicts) addressed per person, escalation call, pattern flag

---

## territory-analyzer

### Scenario
```
Analyze my territory. State & local segment, quarter ends June 30.

Reps: Dana (quota $1.2M, attainment 61%, 14 opps, $2.1M pipe), Priya (quota $1.2M, attainment 88%, 9 opps, $1.4M pipe — two deals are 70% of it), Cole (quota $900K, attainment 24%, 5 opps, $600K pipe — started in February).

Presales load: 2 SCs covering all three reps — 11 demos scheduled over the next 6 weeks, 2 open POCs. 1 SA shared with another team. Proposal manager has 3 active RFP responses and we expect 4-6 more before fiscal year-end.

High-risk deals I'm coaching: Priya's two big ones.
```

### Checks
1. Produces a rep scoreboard with coverage ratios and 🟢🟡🔴 status per rep
2. Asks for context on Cole (ramping since February) before labeling him behind
3. Flags Priya's concentration risk (two deals = 70% of pipe) explicitly
4. Builds the capacity-vs-demand table for all three functions and names the bottleneck (proposal management heading into fiscal year-end)
5. Calls out the demand collision: RFP surge + fiscal year-end + open POCs, and what gets protected
6. Ties every recommendation to win rate, cycle time, or solution quality
7. Skips analyses it lacks data for (win rate, cycle length) instead of inventing them

---

## proposal-manager

### Scenario
```
New RFP just dropped: Jefferson County RFP #2026-114, "Agenda & Meeting Management System."

Due in 4 weeks (May 29, 2:00 PM MT, county procurement portal). Q&A closes in 9 days. Evaluation: 40% technical approach, 25% price, 20% past performance, 15% implementation plan. Page limit 25. Mandatory: signed addenda, insurance cert, three government references.

We had zero contact with this county before release. Requirements mention "must integrate with existing Tyler ERP" and "shall provide closed-captioning compliant with WCAG 2.1 AA."

We have a strong meeting-management product, 40+ county references, but I'm not sure about the Tyler integration. What do we do?
```

### Checks
1. Shreds correctly: dates, portal mechanics, page limit, mandatory forms, evaluation weights
2. Bid/no-bid scorecard honestly weighs zero pre-RFP contact (and cites the preferred-vendor reality)
3. Frames bid/no-bid as a recommendation for the deal team, not a decision
4. Compliance matrix rows cite exact solicitation sections; Tyler integration marked "Needs SME confirmation," never claimed
5. Drafts 3-5 win themes aligned to the 40% technical weight, with proof points (the county references)
6. Backward-schedules Pink/Red/Gold gates inside 4 weeks with a submission buffer
7. Produces Q&A questions for procurement (Tyler version/scope) before the 9-day window closes — and suggests no other buyer contact

---

## enablement-planner

### Scenario
```
Our demo-to-close rate dropped from 34% to 22% over two quarters and I want to fix it with training.

What I know: Gong shows discovery calls averaging 11 minutes before the demo gets scheduled. Two of our five SCs joined in the last 6 months. The product shipped a major new module in January that changed the demo flow. Next quarter is our heaviest RFP season.

Build me an enablement program.
```

### Checks
1. Challenges the framing: 11-minute discovery suggests a process/skill question upstream of demo training
2. Names the gap type (skill vs. content vs. process) and notes the confound: new module + new hires + the drop happened together
3. Anchors the design to the evidence given (Gong pattern, tenure mix), not generic "demo best practices"
4. Schedules around RFP season, and states the program's selling-capacity cost — flagging if it exceeds 10-15%
5. Includes a certification rubric with behavioral anchors, not adjectives
6. Measures leading + lagging (deal-linked) metrics — and never completion rates as success
7. Defines what managers reinforce after rollout

---

## career-development

### Scenario
```
Build an IDP for one of my senior SCs targeting Principal.

Evidence: led technical strategy on 3 of our 5 biggest wins this year; demo certification scores top of team; owned the technical volume on 2 winning RFP responses. Gaps I see: has never presented to a city council or exec sponsor without the AE leading, and hasn't mentored anyone yet.

She's also asked me whether she should consider the management track instead. We have no written career ladder — nothing documented at all.
```

### Checks
1. Notices there's no ladder and drafts the dual-track framework first (or alongside), since "Principal" needs a definition
2. Frames everything as a draft for the manager — never written to hand directly to the SC
3. Rates only on the evidence given; marks unobserved competencies "insufficient evidence" with what to observe next
4. Weights the IDP toward experiences (lead an orals presentation, mentor a new hire) over courses — roughly 70/20/10
5. Handles the IC-vs-management question with a structured comparison and trial opportunities, treating both tracks as equal
6. Offers no compensation recommendations and no comparisons to named teammates
7. Notes that promotion runs through HR/calibration — this prepares the case, it doesn't decide it
