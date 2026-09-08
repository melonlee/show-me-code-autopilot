---
name: hepha
description: 以中文优先的 Spec、TDD、角色隔离审查和个人 Wiki 沉淀来持续交付代码。仅在用户明确要求 Hepha、autopilot、自主循环、小步持续提交、个人工程 Wiki、任务可视化或无人值守迭代时使用；普通单次编码请求不要隐式启用。
---

# Hepha

把大需求转换为可验证、可审查、可追溯、可复用的连续交付循环：

`澄清 -> Spec -> 计划 -> 研究 -> TDD 执行 -> 双审查 -> 沉淀 -> 批准 -> 提交`

把 Markdown 作为人类阅读层，把 JSON 作为机器事实源。不要通过修改 Markdown 绕过机器门禁。

## 开始前

1. 定位项目根目录和项目级指令。
2. 检查工作树，保护用户已有改动。
3. 确认用户授权的提交模式；默认使用人工批准。
4. 初始化运行目录：

```bash
node <skill-root>/scripts/hepha-cli.js init --root . --requirement "<需求>"
```

5. 读取以下参考文件：

- 规划或修改任务时，读取 `references/runtime-schema.md`。
- 执行代码任务时，读取 `references/spec-tdd-sdd.md`。
- 生成或发布个人资产时，读取 `references/personal-wiki.md`。
- 选择检查门禁时，读取 `references/validation_quality-gates.md`。

## 运行时事实源

维护以下结构：

```text
.hepha/
├── manifest.json
├── backlog.json
├── backlog.md
├── progress.md
├── decision-log.md
├── specs/
├── evidence/
├── summary/YYYY-MM-DD/<person>/
└── wiki/
    ├── candidates/
    ├── assets/
    └── index.json
```

- `manifest.json`：需求、负责人、提交策略和 Schema 版本。
- `backlog.json`：任务、依赖、验收条件和状态的机器事实源。
- `evidence/TASK-XXX.json`：TDD、检查、浏览器和审查证据。
- `summary/`：一次任务的事实记录。
- `wiki/`：跨任务复用的长期个人资产。

## 规格与任务图

先写 Spec，再拆任务。Spec 至少包含：目标、非目标、约束、行为场景、边界条件和需求级完成条件。

每个行为场景使用稳定 ID。每个任务必须引用 Spec，并包含：

- `id`、`title`、`state`
- `depends_on`、`risk`、`files_hint`
- Given/When/Then 形式的 `acceptance`
- `spec_refs`
- `behavior_change`
- 行为变更对应的 `test_plan.commands`
- `knowledge.asset_policy`

编辑 `.hepha/backlog.json` 后执行：

```bash
node <skill-root>/scripts/hepha-cli.js validate --root .
```

校验失败时不要进入执行。

任务进入 `doing` 时 CLI 会固化契约指纹。执行期间不得静默修改验收条件、测试计划或资产策略来绕过门禁；必须阻塞并显式重新规划。

## 每轮协议

一次只选择一个 ready 任务。优先处理高风险、能解锁后续任务或能尽早产生用户价值的任务。

### 1. 计划

明确本轮 Spec、验收条件、允许修改的文件、测试命令、风险和预期资产。将任务转换为 `doing`：

```bash
node <skill-root>/scripts/hepha-cli.js transition --root . --task TASK-XXX --to doing
```

### 2. 研究

仅在引入新工具、改变架构、存在明显多方案或涉及安全/迁移等高风险判断时研究。至少比较两个方案，把证据和取舍写入 `decision-log.md`。

### 3. TDD 执行

对行为变更强制执行 RED、GREEN、REFACTOR：

1. 写最小失败测试。
2. 执行并记录 RED；测试必须因缺少目标行为而失败。
3. 写使测试通过的最小实现。
4. 执行并记录 GREEN。
5. 重构后运行相关回归测试并记录 regression。

使用 CLI 执行并记录证据：

```bash
node <skill-root>/scripts/hepha-cli.js record-check --root . --task TASK-XXX --phase red --command "<测试命令>"
node <skill-root>/scripts/hepha-cli.js record-check --root . --task TASK-XXX --phase green --command "<测试命令>"
node <skill-root>/scripts/hepha-cli.js record-check --root . --task TASK-XXX --phase regression --command "<回归命令>"
```

非行为任务将 `behavior_change` 设为 `false`，并在 summary 记录替代验证。不要虚构 RED 证据。

### 4. 角色隔离审查

宿主允许且用户授权子代理时，给实现者、Spec reviewer 和 code reviewer 使用独立上下文。只传递当前 Spec、任务、变更、测试和相关文件，不传递预设结论。

宿主不允许子代理时，执行两次独立审查遍历：

1. Spec review：逐条验证场景和验收条件，不讨论代码美观。
2. Code review：检查正确性、安全性、可维护性、测试质量和无关改动。

记录结果：

```bash
node <skill-root>/scripts/hepha-cli.js record-review --root . --task TASK-XXX --type spec --status passed --reviewer "<name>"
node <skill-root>/scripts/hepha-cli.js record-review --root . --task TASK-XXX --type code --status passed --reviewer "<name>"
```

UI 或交互变更必须执行浏览器验证并把命令或步骤记录到 evidence 和 summary。

### 5. 沉淀

先写任务 summary，再判断是否形成长期资产：

- Summary 回答“这次做了什么、如何证明”。
- Wiki 资产回答“以后可以复用什么、适用和不适用在哪里”。

根据 `knowledge.asset_policy`：

- `none`：不生成资产。
- `candidate`：写入 `.hepha/wiki/candidates/`。
- `required`：必须审核并发布到 `.hepha/wiki/assets/`。

发布资产：

```bash
node <skill-root>/scripts/hepha-cli.js publish-asset --root . --file .hepha/wiki/candidates/PAT-001.md --reviewer "<name>"
```

资产必须关联来源 Spec、Task、Test 和 Commit；发布前删除密钥、个人信息和项目敏感内容。本轮提交尚未产生时使用 `source_commits: [self]`，表示包含该资产的提交；禁止使用 `pending`。

把已发布、非机密资产同步到跨项目个人 Wiki：

```bash
node <skill-root>/scripts/hepha-cli.js sync-personal --root .
```

同步后的 `~/.hepha/wiki/index.json` 是个人资产数据层，包含资产记录、项目来源、四类来源谱系以及按状态/类型/项目/标签聚合的指标。它用于跨项目检索和复盘，不替代资产正文。

### 6. 完成与提交

完成 TDD 后进入 `review`。写完 summary、资产候选并通过审查后，记录人工批准：

```bash
node <skill-root>/scripts/hepha-cli.js transition --root . --task TASK-XXX --to review
node <skill-root>/scripts/hepha-cli.js record-review --root . --task TASK-XXX --type human --status passed --reviewer "<owner>"
node <skill-root>/scripts/hepha-cli.js transition --root . --task TASK-XXX --to done
```

只有 `manifest.json` 明确设置 `approval_required: false` 时，才允许无人值守完成。提交前确认：

- Spec、测试、回归和审查全部通过。
- 没有无关改动或敏感信息。
- summary 和 Wiki 策略满足。
- `.hepha` 索引已刷新。

一个任务对应一个最小 conventional commit。资产使用 `self` 避免提交哈希自引用；同步到个人 Wiki 时 CLI 会把它解析成真实 hash。提交后重新构建索引并同步个人 Wiki：

```bash
node <skill-root>/scripts/hepha-cli.js build-index --root .
node <skill-root>/scripts/hepha-cli.js sync-personal --root .
```

## 状态机

只允许：

```text
todo -> doing | blocked | skipped
doing -> review | blocked
review -> doing | done | blocked
blocked -> todo | doing | skipped
```

`done` 和 `skipped` 是终态。跳过任务必须记录原因，并重新验证需求级完成条件。

## 失败与重新规划

第一次失败：诊断根因并重试。第二次相同失败：暂停当前实现、检查 Spec 和任务边界并重新规划。只有不存在可信替代路径时才阻塞并报告。

发现隐藏依赖、任务范围扩大、需求冲突或验证不充分时，更新 Spec 和任务图，不要硬做。

## 本地可视化

启动只读 Review/Wiki 服务：

```bash
node <skill-root>/scripts/hepha-server.js --root . --port 3000
```

检查任务时间线、任务详情中的 TDD/审查证据、个人资产、候选队列、全文搜索和 Spec → Task → Test → Commit 谱系。页面不是机器事实源；页面展示缺失时回查对应 JSON 和 Markdown 产物。

## 完成条件

仅在以下条件全部满足时报告需求完成：

1. backlog 所有任务为 `done` 或有理由的 `skipped`。
2. 需求级 Spec 完成条件满足。
3. 最终相关测试、lint、构建和浏览器验证通过。
4. Spec/code/human review 证据完整。
5. Summary、个人资产和索引完整可读。
6. 本地页面能检索并展示本次交付谱系。
