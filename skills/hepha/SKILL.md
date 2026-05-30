---
name: hepha
description: 启动 Hepha 自主迭代交付模式。用于用户明确要求 hepha、autopilot、自主循环、小步提交、持续 plan -> research -> execute -> check -> review -> summary -> commit、技术选型研究、本地 Hepha summary 服务或 Claude Code 风格任务看板时。
context: fork
agent: Explore
---

# Hepha

## 核心定位

Hepha 是一个中文优先的工程交付 skill。它把大需求拆成可验证、可提交、可复盘的小任务，并按固定循环推进：

`计划 -> 研究 -> 执行 -> 检查 -> 审查 -> 沉淀 -> 提交`

Superpowers 的关键启发是：skill 不只是提示词，而是强制执行的软件工程纪律。Hepha 保留这种纪律，但把重点放在中文协作、每轮任务沉淀、本地可视化 review 和连续交付。

## 激活条件

仅当用户明确要求以下任一内容时启用：

- hepha / autopilot / 自主循环 / 无人值守迭代
- 小步执行并持续提交，直到 backlog 完成
- 使用 Hepha 的本地 summary 页面或任务看板
- 对 UI/交互变更执行浏览器验证并沉淀证据

未明确要求 Hepha 时，不要强行套用本 skill。

## 语言规则

- 与用户沟通、任务标题、验收条件、进度记录、summary 文件默认使用中文。
- 代码标识符、命令、错误输出、第三方 API 名称保持项目原文。
- 引用英文资料时，用中文总结结论；必要的链接和短引用保留原文。

## 不可违反的规则

1. 一轮只处理一个最小可交付子任务。
2. 没有明确验收条件，不进入执行。
3. 涉及代码行为时，优先测试先行；无法测试时必须记录原因和替代验证。
4. 检查和审查未通过，不提交。
5. 每轮结束必须生成中文 summary Markdown。
6. UI 或流程变更必须做浏览器/Playwright/MCP 验证，并记录证据。
7. 只改当前任务需要的文件，避免顺手重构。

## 运行时目录

在当前项目根目录创建并维护 `.hepha/`：

```text
.hepha/
├── backlog.md
├── progress.md
├── decision-log.md
└── summary/
    └── YYYY-MM-DD/
        └── person-slug/
            └── TASK-XXX.md
```

模板位于本 skill 的 `templates/`：

- `templates/backlog.md`
- `templates/progress.md`
- `templates/decision-log.md`
- `templates/task-summary.md`

如果运行时文件不存在，先按模板创建。

## 人物目录规则

每轮 summary 的目录必须是：

`.hepha/summary/YYYY-MM-DD/<person>/TASK-XXX.md`

`person` 的取值顺序：

1. 用户本轮明确指定的人物、操作者或 reviewer 名称
2. 环境变量 `HEPHA_PERSON`
3. `git config user.name`
4. 当前系统用户名
5. `unknown`

将人物名转为 slug：小写、空格转 `-`、删除不适合作为路径的字符。日期使用本地日期 `YYYY-MM-DD`。

## 每轮 Summary 内容

每轮结束都写一个独立 Markdown，供人和 AI review。必须包含：

- YAML frontmatter：task_id、title、date、person、state、risk、commit
- 任务目标和验收标准
- 本轮执行摘要
- 修改文件
- 检查命令与结果
- 浏览器/人工审查结果
- 技术决策和资料链接
- 风险、阻塞和后续建议
- AI reviewer 快速判断区

完成 summary 后，同步更新 `.hepha/progress.md` 的循环历史。

## 本地 Hepha 服务

安装 skill 后，可在任意项目根目录运行：

```bash
node ~/.claude/skills/hepha/scripts/hepha-server.js --root . --port 3000
```

如果 skill 安装在其他位置，从对应 skill 目录运行：

```bash
node /path/to/hepha/scripts/hepha-server.js --root /path/to/project --port 3000
```

打开 `http://localhost:3000` 查看 `.hepha/summary` 下的日期、人物、任务列表和具体 Markdown 内容。页面使用 Claude Code 风格的深色背景、暖色强调和紧凑信息布局。

## 循环协议

### 0. 准备

1. 确认 `.hepha/` 目录和模板文件存在。
2. 若 backlog 为空，从用户需求生成任务图。
3. 若本轮需要本地页面，提示或启动 `hepha-server.js`。

### 1. 计划

目标：选择一个 ready 任务。

每个任务必须包含：

- `id`：`TASK-XXX`
- `title`：中文动作句
- `state`：`todo | doing | blocked | done`
- `depends_on`：依赖任务数组，可为空
- `acceptance`：可测试验收条件
- `risk`：`low | medium | high`
- `files_hint`：预计影响文件

计划阶段要检查：

- ID 唯一
- 依赖存在且无环
- 至少有一个 ready 任务
- 验收条件可验证

优先级：

1. 高风险前置任务
2. 会解锁其他任务的基础任务
3. 能尽早产生用户可见价值的任务

### 2. 研究

仅在以下情况强制研究：

- 引入项目中没有的新库、框架或工具
- 改变模块边界、数据流或部署方式
- 存在两个以上可行方案且差异明显
- 涉及安全、鉴权、支付、数据迁移等高风险决策

研究要求：

1. 至少比较两个方案。
2. 优先官方文档、源码、项目内既有模式。
3. 在 `.hepha/decision-log.md` 记录：背景、选项、证据、取舍、决定。

普通 CRUD、明确 bug 修复、样式微调不需要额外研究。

### 3. 执行

目标：以最小影响范围完成选定任务。

- 遵循项目现有架构和代码风格。
- 不做无关重构。
- 任务变大时立即拆分，不硬做。
- 写必要测试；若不写测试，必须在 summary 里说明原因。

### 4. 检查

运行与改动相关的检查，例如：

- lint
- unit/integration tests
- build/typecheck

失败时：

1. 将失败命令和关键信息写入 `.hepha/progress.md`。
2. 修根因。
3. 重新运行检查。
4. 同一任务连续失败两次，触发重新规划或停止。

### 5. 审查

目标：确认结果符合用户视角和工程质量。

必须审查：

- 是否满足选定任务的验收条件
- 是否存在无关改动
- 是否破坏既有路径
- UI/交互变更是否通过浏览器验证

UI/流程变更的证据包括：

- 访问的页面或路由
- 执行的关键交互
- 观察到的结果
- 截图、快照或控制台信息（如适用）

### 6. 沉淀

在 `.hepha/summary/YYYY-MM-DD/<person>/TASK-XXX.md` 写入本轮 summary。

同时更新：

- `.hepha/progress.md`
- `.hepha/backlog.md`
- `.hepha/decision-log.md`（如本轮有研究或架构判断）

summary 是下一轮、人类 review、本地页面和 AI review 的共同输入。

### 7. 提交

提交条件：

- 检查通过
- 审查通过
- 验收条件满足
- summary 已生成

提交规则：

- 一个 loop 对应一个最小提交。
- 使用 conventional commit。
- 提交信息说明目的，不只描述改了什么。
- 不提交密钥或敏感凭据。

## 重新规划

出现以下情况时重新规划：

- 发现隐藏依赖
- 当前任务超过一轮合理范围
- 检查/审查连续失败
- 用户需求与当前任务图不一致

处理方式：

1. 将当前任务标记为 `blocked` 或拆成更小任务。
2. 记录阻塞原因。
3. 更新依赖关系。
4. 继续下一个 ready 任务。

## 停止条件

满足任一条件时停止并报告：

1. 没有 ready 任务且存在未解决阻塞。
2. 同一任务连续两次检查或审查失败。
3. 必需工具不可用，且无法替代验证。
4. 继续执行会越过用户给定风险边界。

报告必须包含：

- 当前完成状态
- 阻塞根因
- 已尝试动作
- 建议下一步

## 完成条件

只有同时满足以下条件，才认为大需求完成：

1. backlog 全部任务为 `done` 或明确跳过并说明原因。
2. 需求级 definition of done 满足。
3. 最终相关检查通过。
4. summary 和审查证据完整。
5. 本地 Hepha 页面能展示本次任务沉淀。

## 推荐启动提示

```text
启用 hepha 模式。
请使用中文记录所有任务、验收、进度和 summary。
运行循环：计划 -> 研究 -> 执行 -> 检查 -> 审查 -> 沉淀 -> 提交。
每轮在 .hepha/summary/YYYY-MM-DD/<person>/ 下生成 TASK-XXX.md。
如涉及 UI，请做浏览器验证。
持续直到 backlog 完成或触发停止条件。
需求：<粘贴需求>
```

## 参考资料

- 任务拆解：`references/planning_task-decomposition.md`
- 拆解模式：`references/decomposition-patterns.md`
- 质量门禁：`references/validation_quality-gates.md`
- 进度格式：`references/progress-template.md`
