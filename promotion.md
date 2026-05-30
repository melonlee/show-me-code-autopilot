# Hepha - 自主交付循环技能 推广文案

## 短文案（适合 Twitter/微博）

**版本1（英文）：**
> Tired of AI agents going rogue? I built Hepha — a skill that forces Claude Code through PLAN→RESEARCH→EXECUTE→CHECK→REVIEW→SUMMARY→COMMIT loops.
> One prompt. Small validated commits. Dated summaries. No more 2AM surprises.
> github.com/melonlee/hepha-skill ⭐

**版本2（中文）：**
> 做出了一个让 Claude Code 自主交付代码的 Agent Skill：Hepha
> 把大需求拆成小任务，每个任务走 PLAN→RESEARCH→EXECUTE→CHECK→REVIEW→SUMMARY→COMMIT 循环
> 小步快跑，每次提交都经过验证，每轮都有中文 summary，不再有一觉醒来代码全乱了
> github.com/melonlee/hepha-skill ⭐

---

## 中等长度文案（适合 Reddit / 开发者社区）

**英文版本（r/programming）：**

Title: I built Hepha — a skill that makes AI coding agents actually safe to use on real projects

Body:
If you've used Claude Code or similar AI coding agents on anything more than a toy project, you've probably hit this wall: the bigger the task, the more unpredictable the output.

Give it a 10-line bug fix? Great. Give it "refactor our entire auth system"? You come back three hours later to a diff that's half your codebase and no idea what happened.

So I built Hepha — an Agent skill that wraps AI coding agents in a structured execution loop.

**The core idea:** Instead of one big prompt, Hepha decomposes requirements into atomic tasks, executes them one at a time, and enforces checkpoints before anything gets committed.

**The loop:**
```
PLAN → RESEARCH → EXECUTE → CHECK → REVIEW → SUMMARY → COMMIT → (repeat)
```

**Key features:**
- Auto-decomposition: large requirement → validated task graph with dependencies
- Schema validation: each task has machine-verifiable success criteria
- Research matrix: only researches when truly needed (new lib, arch change)
- Progress visualization: real-time task graph + Markdown progress bars
- Summary archive: each loop writes `.hepha/summary/YYYY-MM-DD/<person>/TASK-XXX.md`
- Local review: browse all task summaries at `localhost:3000`

**Installation:**
```bash
cp -r skills/hepha ~/.claude/skills/
```

**Usage:**
```
Enable hepha mode.
Run loop: plan -> research -> execute -> check -> review -> summary -> commit.
Write each loop summary to .hepha/summary/YYYY-MM-DD/<person>/TASK-XXX.md.
Continue until backlog is complete.
Requirement: <your requirement>
```

GitHub: https://github.com/melonlee/hepha-skill
OpenClaw Skill compatible (works with Claude Code too)

Would love feedback from anyone who's struggled with the "AI agent goes off the rails" problem. Does the loop structure match how you actually think about task delivery?

---

**中文版本（掘金/知乎）：**

标题：我做出了一个让 AI 编程 Agent「安全交付」的技能——Hepha

正文：
用 Claude Code 这类 AI 编程 Agent 做大项目时，最大的问题是：需求越大，输出越不可预测。

给个小需求？完美。做"把整个认证系统迁移到 JWT"？三小时后回来，看到半个代码库的改动，完全不知道发生了什么。

所以我做了 Hepha——一个把 AI 编程 Agent 包裹在结构化执行循环里的技能。

**核心思路：** 把大需求分解成原子任务，每次只执行一个，通过检查点验证后才提交。

**循环流程：**
PLAN → RESEARCH → EXECUTE → CHECK → REVIEW → SUMMARY → COMMIT → （重复）

**主要功能：**
- 自动拆解：大需求 → 带依赖关系的验证任务图
- Schema 验证：每个任务有机器可验证的完成标准
- 研究矩阵：只在真正需要时研究（新库、架构变更）
- 进度可视化：实时任务图 + Markdown 进度条
- Summary 归档：每轮写入 `.hepha/summary/YYYY-MM-DD/<person>/TASK-XXX.md`
- 本地 review：在 `localhost:3000` 查看全部任务记录

**安装：**
```bash
cp -r skills/hepha ~/.claude/skills/
```

**使用：**
```
启用 hepha 模式。
运行循环：plan -> research -> execute -> check -> review -> summary -> commit。
每轮写入 .hepha/summary/YYYY-MM-DD/<person>/TASK-XXX.md。
持续直到 backlog 完成。
需求：<你的需求>
```

GitHub: https://github.com/melonlee/hepha-skill

---

## 长文案（适合技术博客 / 详细分享）

（见 dev.to-article.md 的完整版本）

---

## Hepha 项目亮点（用于提交到各种目录/平台）

**一句话描述：**
把大需求拆解为小而安全的任务，通过自主迭代交付循环，让 AI 编程 Agent 的输出变得可预测。

**标签/关键词：**
ai-agent, autonomous-coding, claude-code, openclaw, productivity, developer-tools, workflow-automation, continuous-delivery, task-decomposition, agentic-ai

**核心差异点：**
1. 唯一专注「交付」而非「对话」的 Agent Skill
2. PLAN→RESEARCH→EXECUTE→CHECK→REVIEW→SUMMARY→COMMIT 七步循环结构
3. 研究决策矩阵：避免不必要的 AI 过度思考
4. 进度完全透明：实时任务图 + Markdown 进度条 + 本地 review 页面

**适合人群：**
- 已经用 Claude Code / OpenClaw 做生产的开发者
- 被 AI Agent 输出不可预测困扰的团队
- 想让 AI 真正成为「工程师搭档」而不是「需要看守的实习生」
