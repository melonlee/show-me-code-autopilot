# Hepha 运行时 Schema

## 目录

1. 事实源
2. Backlog Schema
3. Evidence Schema
4. 状态机
5. 兼容与迁移

## 事实源

- JSON 是任务状态、门禁和索引的机器事实源。
- Markdown 是 Spec、进度、Summary 和 Wiki 的人类阅读层。
- 不从页面状态反向修改 JSON。
- 所有 JSON 写入使用临时文件加原子重命名。

## Backlog Schema

`.hepha/backlog.json`：

```json
{
  "schema_version": "2.0",
  "requirement": "实现加法函数",
  "tasks": [
    {
      "id": "TASK-001",
      "title": "实现并验证加法函数",
      "state": "todo",
      "depends_on": [],
      "acceptance": [
        {
          "id": "AC-001",
          "given": "两个整数",
          "when": "调用 add",
          "then": "返回两数之和"
        }
      ],
      "risk": "low",
      "files_hint": ["src/add.js", "test/add.test.js"],
      "spec_refs": ["SPEC-001"],
      "behavior_change": true,
      "test_plan": {
        "commands": ["node --test test/add.test.js"]
      },
      "knowledge": {
        "asset_policy": "candidate",
        "candidate_types": ["pattern"]
      }
    }
  ]
}
```

约束：

- ID 唯一且依赖无环。
- Spec 文件必须存在。
- 行为变更必须有测试命令。
- acceptance 必须使用稳定 ID 和 Given/When/Then。
- `asset_policy` 只能是 `none`、`candidate`、`required`。

## Evidence Schema

`.hepha/evidence/TASK-XXX.json`保存不可省略的证据：

```json
{
  "schema_version": "1.0",
  "task_id": "TASK-001",
  "checks": [
    {"phase": "red", "command": "...", "exit_code": 1},
    {"phase": "green", "command": "...", "exit_code": 0},
    {"phase": "regression", "command": "...", "exit_code": 0}
  ],
  "reviews": {
    "spec": {"status": "passed", "reviewer": "..."},
    "code": {"status": "passed", "reviewer": "..."},
    "human": {"status": "passed", "reviewer": "..."}
  }
}
```

RED 的退出码必须非零；GREEN 和 regression 的最后一次记录必须为零。

## Wiki Index Schema

项目 `.hepha/wiki/index.json` 和个人 `~/.hepha/wiki/index.json` 都由 CLI 生成，不应手工修改。两者均包含 `assets` 数组；个人索引中的资产会增加 `source_project` 和 `source_project_key`，并解析 `source_commits: [self]` 为真实 Git hash。

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-09-09T00:00:00.000Z",
  "metrics": {
    "total": 1,
    "by_status": {"published": 1},
    "by_type": {"pattern": 1},
    "by_project": {"my-project-ab12cd34": 1},
    "top_tags": [{"tag": "tdd", "count": 1}],
    "provenance_complete": 1,
    "provenance_completeness": 1
  },
  "assets": [{
    "asset_id": "PAT-001",
    "source_tasks": ["TASK-001"],
    "source_specs": ["SPEC-001"],
    "source_tests": ["tests/example.test.js"],
    "source_commits": ["<git hash>"]
  }]
}
```

`metrics.provenance_completeness` 是四类来源均存在的资产比例；它用于识别需要补证据的知识，不代表内容本身一定正确。

## 状态机

```text
todo -> doing | blocked | skipped
doing -> review | blocked
review -> doing | done | blocked
blocked -> todo | doing | skipped
```

进入 `review` 前验证 TDD 证据。进入 `done` 前验证双审查、人工批准、Summary 和资产策略。

任务进入 `doing` 时记录契约指纹。后续修改验收条件、测试计划、Spec 引用或资产策略会使门禁失败，必须显式重新规划。

## 兼容与迁移

旧版 `.hepha/backlog.md` 不再作为机器事实源。迁移时保留原文件，创建 `backlog.json`，验证后再由 CLI 生成阅读版 `backlog.md`。不要静默猜测缺失的 Spec、测试或资产策略。
