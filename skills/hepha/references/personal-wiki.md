# 个人 Wiki 与资产生命周期

## 目录

1. 资产和日志的区别
2. 资产类型
3. 生命周期
4. 元数据
5. 提炼与发布
6. 检索与度量

## 资产和日志的区别

Summary 回答“这次发生了什么”，个人资产回答“以后可以复用什么”。不要把每份 Summary 自动发布成 Wiki。

资产正文必须包含：结论、适用范围、不适用场景、使用方式和来源证据。

## 资产类型

- `decision`：技术或架构决定。
- `pattern`：经过验证的实现模式。
- `recipe`：可重复执行的步骤。
- `checklist`：质量和发布清单。
- `troubleshooting`：问题、根因和修复。
- `glossary`：领域概念。
- `retrospective`：可复用的复盘结论。
- `project-map`：项目模块和关键入口。

## 生命周期

```text
candidate -> reviewed -> published -> stale -> superseded
```

- `candidate`：由任务提炼，尚未复核。
- `reviewed`：内容、来源和敏感性已检查。
- `published`：可以被后续任务检索和引用。
- `stale`：来源或适用条件可能已经变化。
- `superseded`：已被新资产替代。

## 元数据

```yaml
---
asset_id: PAT-001
type: pattern
title: "外部 API 错误分层模式"
status: reviewed
tags: [api, error-handling]
source_tasks: [TASK-004]
source_specs: [SPEC-002]
source_tests: [tests/external-api.test.js]
source_commits: [self]
confidence: verified
sensitivity: personal
supersedes: []
---
```

发布资产必须包含 Spec、Task、Test、Commit 四类来源。本轮提交尚未产生时使用 `self`，表示“包含当前资产文件的提交”；禁止使用无法解析的 `pending`。同步到跨项目个人 Wiki 时，CLI 根据 Git 历史把 `self` 解析为真实 hash。

## 提炼与发布

1. 从已通过 TDD 和审查的 Summary 中提取稳定结论。
2. 删除运行噪声、临时路径、账号、密钥和项目敏感数据。
3. 合并已有同类资产，避免同义重复。
4. 写明适用和不适用条件。
5. 将文件放入 `wiki/candidates/`，状态设为 `reviewed`。
6. 使用 CLI 发布并重建索引。
7. 提交后运行 `sync-personal`，把非机密资产聚合到个人 Wiki。

### 从一次任务形成一条资产数据

不要直接把执行日志复制成 Wiki。按以下映射提炼：

| 过程输入 | 写入资产的字段 | 提炼规则 |
|---|---|---|
| Spec 场景和约束 | `source_specs`、正文“适用范围” | 保留可观察行为，不保留项目临时命名 |
| Task 和验收条件 | `source_tasks`、正文“结论” | 只提炼可迁移的决策或模式 |
| RED/GREEN/regression | `source_tests`、`confidence` | 没有有效测试证据时只能保留为 Summary |
| Spec/code/human review | `status`、`reviewed_by` | 审查未通过不能发布 |
| Git 提交 | `source_commits` | 提交前使用 `self`，同步后解析为真实 hash |
| 风险、日志和上下文 | 正文“不适用场景”和 `sensitivity` | 删除密钥、账号、路径、客户数据和项目机密 |

发布后的 `index.json` 是机器可检索的资产数据层：

```json
{
  "schema_version": "1.0",
  "metrics": {
    "total": 12,
    "by_status": {"published": 10, "stale": 2},
    "by_type": {"pattern": 7, "troubleshooting": 3},
    "by_project": {"checkout-app-a1b2c3d4": 8},
    "provenance_complete": 10,
    "provenance_completeness": 0.8333
  },
  "assets": [{"asset_id": "PAT-001", "source_tasks": ["TASK-004"]}]
}
```

这样可以回答“哪些知识已验证”“哪些项目贡献最多”“哪些资产来源不完整”等问题；`metrics` 由 CLI 生成，禁止手工编辑。

`sensitivity`建议使用 `public | personal | project-confidential`。全局个人 Wiki 默认拒绝发布 `project-confidential`。

## 检索与度量

本地 HTML 至少支持标题、正文、标签、类型、Task ID 的检索，并显示 Spec → Task → Test → Commit 谱系。

可持续度量：资产发布数、待审核数、完整来源占比、后续任务引用次数、stale 比例和从任务完成到资产发布的时间。不要以 Markdown 文件数量作为唯一资产指标。
