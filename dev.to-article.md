# I Built a Skill That Makes Claude Code Deliver Code Autonomously — Here's How It Works

AI coding agents are powerful. They're also terrifying when they start rewriting your entire codebase at 2 AM without you watching.

I've been running Claude Code on real projects — not toy examples, real production code with real stakes — and I've hit the same wall every time: **the bigger the task, the more unpredictable the output**. Give Claude Code a small, well-scoped request and it nails it. Give it a sprawling feature request and it starts making assumptions you didn't authorize, skipping tests you rely on, and committing changes that need reverting.

That's the problem I set out to solve. The result is **Hepha** — an Agent skill that turns large, ambiguous requirements into a stream of small, safe, continuously shippable tasks.

## What Is Hepha?

Hepha is an OpenClaw Agent skill (a `.skill` package you drop into your agent's workspace) that wraps Claude Code's autonomy in a structured execution loop. Instead of handing it a big requirement and hoping for the best, you activate **Hepha mode**, which decomposes your goal into validated tasks, executes them one at a time with checkpoints, and keeps you in the loop the whole way through.

The name comes from Hephaestus — the Greek god of blacksmiths. He didn't wave a hand and make a shield appear; he hammered it out, piece by piece. That's the philosophy.

## The Problem With Autonomous Coding Agents

Here's what usually happens when you give an AI agent a big task:

1. It reads a bunch of files and forms a mental model
2. It starts writing code — sometimes a lot of code
3. You come back hours later to a diff that's half your codebase
4. You spend the next three hours figuring out what it actually did
5. Something is broken, and you don't know why

The core issues are:

- **No visibility** — you don't know what's happening until it's done
- **No checkpoints** — one bad step poisons everything downstream
- **No decomposition** — the agent attacks the problem whole, making hidden assumptions
- **No rollback** — once it's committed, it's committed

## The PLAN → RESEARCH → EXECUTE → CHECK → REVIEW → SUMMARY → COMMIT Loop

Hepha replaces the "throw one big prompt at it" workflow with a seven-stage loop:

```
PLAN → RESEARCH → EXECUTE → CHECK → REVIEW → SUMMARY → COMMIT → (back to PLAN for next task)
```

### PLAN
Hepha breaks your requirement into atomic tasks. Each task has:
- A clear description of what to do
- A validation schema (what "done" looks like)
- An estimated risk level

### RESEARCH
When a task introduces a new library, architecture change, or high-risk decision, Hepha compares options and records the rationale in `.hepha/decision-log.md`.

### EXECUTE
Claude Code works on one task at a time. No side quests, no "while I'm here let me also fix..."

### CHECK
Before anything is considered done, a schema validator confirms the output matches expectations. Not "looks about right" — machine-verifiable criteria.

### REVIEW
You (the human) get a checkpoint. Hepha pauses and shows you what changed, what passed, what failed. You can approve, reject, or redirect before a single line hits your git history.

### SUMMARY
Each loop writes a dated Markdown summary to `.hepha/summary/YYYY-MM-DD/<person>/TASK-XXX.md`, so humans and AI reviewers can inspect the task goal, acceptance criteria, changed files, checks, review evidence, decisions, risks, and follow-ups.

### COMMIT
Only after your explicit sign-off does the change get committed. Not automated on success — **you** decide when to commit.

Then Hepha loops back to PLAN for the next task in the decomposition.

## Key Features

### Auto-Decomposition
Pass in a vague requirement like "migrate our auth system to JWT" and Hepha breaks it into: audit current auth, design JWT schema, implement token generation, implement token validation, update all protected routes, write migration tests. Each becomes a discrete, reviewable task.

### Schema Validation
Tasks define their success criteria as JSON schemas. When a task completes, Hepha validates the output against the schema. If the code doesn't match the contract, it flags it — no silent failures.

### Research Matrix
Before writing code, Hepha generates a research matrix — a structured lookup of relevant files, patterns, and dependencies. It maps the codebase terrain so the agent doesn't wander into the wrong module.

### Progress Visualization
In any OpenClaw session with a UI (web or terminal), Hepha renders a live progress view: current task, completed tasks, failed checks, pending reviews. You always know exactly where you are.

### Local Review Page
Run `node ~/.claude/skills/hepha/scripts/hepha-server.js --root . --port 3000` and open `http://localhost:3000` to browse every dated task summary, plus backlog, progress, and decision logs in a Claude Code-inspired interface.

## How to Install and Use It

### Installation

Hepha is an OpenClaw AgentSkill. Drop it into your agent's skills directory:

```bash
cd ~/your-openclaw-workspace
openclaw skills install https://github.com/melonlee/hepha-skill
```

Or if you're installing manually:

```bash
git clone https://github.com/melonlee/hepha-skill.git skills/hepha
```

### Activating Hepha Mode

Once installed, you activate Hepha mode with a simple command in your OpenClaw session:

```
/hepha "implement user notification preferences with email and SMS toggle"
```

Or inside a conversation:

```
User: I need to refactor the payment module to support Stripe Connect

Agent: Activating Hepha mode...
[Hepha] Analyzing requirement...
[Hepha] Decomposed into 6 tasks:
  1. [LOW RISK] Audit current payment module structure
  2. [LOW RISK] Define Stripe Connect config schema
  3. [MEDIUM RISK] Implement Stripe Connect client wrapper
  4. [HIGH RISK] Refactor payment creation flow
  5. [MEDIUM RISK] Add webhook handlers for Connect events
  6. [LOW RISK] Write integration tests
[Hepha] Starting with Task 1...
```

### During Execution

Hepha will pause at each REVIEW checkpoint:

```
[Hepha] Task 3 complete. Validation passed.
[Hepha] REVIEW REQUIRED:
  File changed: src/payments/stripe-connect.ts
  + Added: StripeConnectClient class with connectAccount(), 
           createPaymentIntent(), handleWebhook()
  - No breaking changes detected
  ? Unverified: webhook signature validation (needs manual audit)
  
  [APPROVE] [REJECT] [MODIFY]
```

### Checking Status

```
/hepha status
```

Shows you the full task board — what's done, what's running, what's queued, what's blocked.

## With vs. Without Hepha

| Aspect | Without Hepha | With Hepha |
|---|---|---|
| **Task visibility** | Only see output after hours | Real-time task board |
| **Error detection** | Breaks at runtime, often in prod | Schema checks catch issues early |
| **Code changes** | Giant diff, everything at once | One small, reviewable diff per task |
| **Rollback** | Hard to undo, fear of breakage | Commit per task, easy to revert |
| **Confidence** | Hope it works | Verified it works |
| **Speed** | Fast initial burst, slow debugging | Steady, predictable progress |

## What Makes This Different From Just... Being Careful?

You might think: "I already tell Claude Code to be careful and break things down." That's great, and it helps. But Hepha isn't a prompt — it's a **structural constraint**. Prompts can be ignored. A skill that controls the execution loop can't accidentally skip the review step because the review step is built into the flow.

It's the difference between "please drive safely" and having a seatbelt that physically prevents you from driving without it fastened.

## The GitHub Link

Everything is open source and on GitHub:

**[https://github.com/melonlee/hepha-skill](https://github.com/melonlee/hepha-skill)**

Issues, PRs, and feedback welcome. If you hit edge cases I haven't thought of, I want to know.

## Is This Production Ready?

Hepha is actively developed. The core loop (PLAN → RESEARCH → EXECUTE → CHECK → REVIEW → SUMMARY → COMMIT) is stable. The research matrix, schema validation, dated summaries, and local review page are working well.

If you're running Claude Code on anything where a bad commit has real consequences — production services, shared codebases, anything with users — Hepha is designed for exactly that situation.

## Give It a Try

The install is one command. The workflow change is immediate:

```bash
openclaw skills install https://github.com/melonlee/hepha-skill
/hepha "your next big task"
```

Small tasks. Verified changes. You stay in control.

---

*If you found this useful, the GitHub repo is the best place to show it some love — stars, issues, and contributions all welcome.*

Tags: #ai #claude #autonomous #coding #open-source #productivity #agents
