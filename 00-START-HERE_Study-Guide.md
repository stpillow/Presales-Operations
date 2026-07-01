# AI in GTM School: Study Companion

A class-by-class study companion for the Pavilion AI in GTM School (April to June 2026 cohort), put together by a fellow attendee to help everyone get the most from the course and feel ready for the final exam. It distils the eight live sessions and the course materials into one place: the big idea, the key frameworks, the must-know terms, and the prompts you can reuse.

This pack contains:

- **00-START-HERE_Study-Guide.md**: this file (per-class summaries plus the core frameworks).
- **01-AI-Maturity-Ladder.md**: one simple model that ties the whole course together.
- **02-Glossary-and-Exam-Prep.md**: plain-English definitions plus a self-check list.
- **Decks/**: the presentation decks from each session.
- **Materials/**: the prompt libraries, the Clay prompts and dataset, and reference guides.
- **Transcripts/**: the session transcripts for review.

> These are the instructors' own materials, shared peer-to-peer within the cohort. Credit for every framework belongs to the people who taught it (named below). If you build on something, credit them too.

---

## The one big idea
The whole course makes a single argument: **stop using AI as a chatbot and start building a system.** Typing one-off prompts into a chat window is the bottom rung. The leverage comes from giving AI rich, reusable context, turning repeated prompts into saved skills, and eventually orchestrating those skills around a real outcome. Every instructor teaches the same climb from a different angle.

The other line to remember: **usage is not transformation.** Most companies say they have "adopted AI" while only a fraction have it actually running in their workflows. The goal of the course is to move you from the first group to the second.

---

## Class-by-class

### Class 1: The State of AI in 2026 (Andy Jolls & Jonathan Moss)
The market context. AI is reshaping GTM; the practical move is to build small, repeatable automations rather than chase tools. You met the course's spine and ran a short AI-maturity self-assessment. Hands-on materials introduced a monthly Google Trends "share of search" automation, an opaque-pricing research workflow, and a build-a-skill-then-chain-then-schedule example (the competitive-comparison workflow). Takeaway: pick one repeatable workflow and systematise it.

### Class 2: Growth Strategy and the AI Leverage Ladder (Ryan Staley, Whale Boss)
The framework that anchors the course. The **AI Leverage Ladder**: Rung 1 Chat (personal, 1x), Rung 2 Cowork/Agents (team, 5-10x), Rung 3 Orchestrated Agent OS (org, 10-100x). None of it works without the foundation move: a **Master Context Doc** ("you don't have an AI problem, you have a context problem"). You built your own Master Context Doc, promoted it into a Project, and ran a Cowork task against it. Three asset classes of Rung 1: Prompts (one-off), then Skills (reusable), then Projects (persistent context).

### Class 3: AI Tools in Action (John Williams, growthcro)
Prompting that works, run live across four GTM use cases. The **3 Pillars of Prompting**: ROLE (who the AI is), CONTEXT (the situation, data and constraints), and REASONING & OUTPUT (how to think, and exactly what to produce). Add few-shot EXAMPLES for harder tasks. Two reusable techniques: chain a research model into a drafting model, and force the model to ask clarifying questions before it answers (this alone cuts bad first outputs sharply). Plus the "right model for the job" idea: research, reasoning, drafting and analysis each have a strongest tool.

### Class 4: Vibe Coding 101 & 201 (Crys Black)
Building reusable tools in Claude, no engineering background needed. "We are moving from syntax errors to semantic intent": plain English is now a valid interface, and the constraint is clarity, not coding. The prompt formula here is **Role / Context / Task / Format** (when output is weak, one of those four is missing). The 4-step loop: find the friction, open a Project, build and iterate one change at a time, then ship or hand off. Debugging: screenshot the error, paste it back, ask for a plain-English explanation, change one thing at a time. Know when NOT to vibe-code (source-of-truth systems, anything customer-facing or regulated).

### Class 5: Agents, From Prompt to Autonomous Action (Scott Wueschinski, GTMify)
From prompts to a skill system. The **Six-Layer Power Prompt Stack**: Context, Role, Task, Constraints, Examples, Output Spec. A prompt becomes a skill when it is saved, fires on a trigger phrase, is versioned, and is customised once and used forever. The 201 moves: chain skills into pipelines (lock the output contract, ideally JSON); promote shared context to one global file; add anti-hallucination constraints; grow an examples library; and know when NOT to use a skill. There is a public, free skill library referenced in the course (see Materials).

### Class 6: Powering GTM Process Automations (Josh Carter, 1mind)
Wiring it into a tool. Built live in Clay: an account-intelligence pipeline that scores accounts against your ICP (0 to 50) and then chains research prompts (website intel, company and market research, news and exec signals, value angles and landmines, discovery questions, an assembled pre-call brief), re-runnable across a whole list. The line to remember: **"none of this works without clean data. AI just automates the mess, faster and at scale."** The Clay prompts and dataset are in Materials.

### Class 7: Building Your AI GTM System (Maddie Bell, Synapsa)
The capstone: disconnected tools become one coherent system. Choose your **surface** by the real axis (are you running a task, or operating a system you built and need to control?), not "technical vs non-technical." The three surfaces: Chat (a colleague you talk to), Cowork (a colleague with hands), Code (you operate a system you built). Maddie's headline challenge: most teams "automated the volume, not the impact." The system (skills plus context plus the right surface) is the asset, not the tool.

### Class 8: The AI-First Revenue Engine and 90-Day Plan (Jonathan "Coach K" Kvarfordt, GTM AI Academy)
Turning it into a plan. The **Adoption Mirage**: 78-88% report AI adoption, but only roughly 7.6-24% have it operationalised in workflows. Two approaches (bottoms-up vs top-down, aim for a hybrid). The **OAR Matrix** of impact: Optimise (time savings), Amplify (revenue/cost), Reinvent (model plus GTM redesign). The **S.C.A.L.E.** 5-step journey: Strategic outcomes, Chart friction, Align capabilities, Launch control, Evolve & expand. And **Context Engineering** in three layers: Company context, Strategic context, Execution context. Start with the end in mind (the outcome), not the tool.

---

## The core frameworks to know (cross-cutting)

**The surfaces.** Chat means think, draft, advise (no hands). Cowork reads and writes your files and runs multi-step work, you supervise. Code gives full control: you build and review the system. Choose by how much control and visibility you need.

**The prompting primers (they stack).**

- 3 Pillars: Role, Context, Reasoning+Output (plus Examples).
- Vibe-coding formula: Role, Context, Task, Format.
- Six-Layer Power Prompt Stack: Context, Role, Task, Constraints, Examples, Output Spec.

All three say the same thing: tell it who to be, what it knows, what to do, the guardrails, examples, and the exact output shape.

**The Master Context Doc.** One file describing your company, what you do, your ICP ("we win when..."), how you beat competitors, proof, your point of view, and your voice. Put it in a Project so every conversation starts with full context. This is the single highest-leverage thing most people are missing.

**Skills vs prompts vs projects.** A prompt is one-off. A skill is a saved, reusable, versioned pattern that fires on a trigger phrase. A Project (or global context file) holds persistent context so you stop re-explaining yourself.

**Chaining, constraints, examples.** Chain skills so one's output feeds the next (lock the contract, use JSON for machine-to-machine steps). Constraints raise quality because they remove capability (for example, "only use facts from the pasted context; if missing, say unknown"). Capture great outputs into an examples library so quality compounds.

**Clean data first.** Automation on a messy CRM just scales the mess. A real AI plan spends most of its effort on data infrastructure before fancy workflows.

**The maturity climb (see 01-AI-Maturity-Ladder.md).** Tourist, Assisted, Augmented, Orchestrated. Most people are far lower than they think.

---

## Reusable prompts you should keep

**Build your Master Context Doc:**
```
You are helping me build a Master Context Doc for my company so that every future AI conversation has rich context to work from.
Your job:
1. Read everything I share
2. Synthesize into a clean Master Context Doc with these sections:
   - Company snapshot
   - What we do (plain language, not marketing speak)
   - Who we serve (the real ICP)
   - How we win (positioning vs. competitors)
   - Proof (case studies / outcomes)
   - Our point of view (contrarian beliefs)
   - Our voice (how we talk)
3. Flag what's missing or thin
Inputs: [paste] company URL / about page / one case study / last deck / top competitor + how you beat them / ICP in plain English / one contrarian thing you tell every prospect
```

**The "ask me questions first" safety valve** (add as the last line of a complex prompt): *"Ask me clarifying questions if anything is ambiguous, missing, or could be interpreted multiple ways, before you produce the final output."*

**The four-part check when output is weak:** is the ROLE, CONTEXT, TASK or FORMAT missing? Fix that one, do not rewrite the whole prompt.

---

## How to use this pack for the exam
1. Read this guide end to end (20 minutes).
2. Read **01-AI-Maturity-Ladder.md**. If you can explain the ladder and place yourself on it, you understand the spine of the course.
3. Skim **02-Glossary-and-Exam-Prep.md** and tick off the terms you can define cold.
4. Open the deck for any class where a concept still feels fuzzy (Decks/).
5. Re-run one prompt from Materials/ against your own company so it sticks.
                                                                                              