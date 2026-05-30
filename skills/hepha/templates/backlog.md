# Hepha 任务 Backlog

**需求**：[一句话描述整体需求]
**创建时间**：[ISO 时间]
**最后更新**：[ISO 时间]
**负责人**：[person]

## 任务图

```yaml
# Task Schema:
# - id: TASK-XXX，唯一标识
# - title: 中文动作句
# - state: todo | doing | blocked | done
# - depends_on: 依赖任务 ID 数组，可为空
# - acceptance: 可测试验收条件
# - risk: low | medium | high
# - files_hint: 预计影响文件或模块

tasks:
  - id: TASK-001
    title: "[第一个可执行任务]"
    state: todo
    depends_on: []
    acceptance:
      - "[可验证条件 1]"
      - "[可验证条件 2]"
    risk: low
    files_hint:
      - "[expected/file/path]"

  - id: TASK-002
    title: "[第二个任务，依赖 TASK-001]"
    state: todo
    depends_on: [TASK-001]
    acceptance:
      - "[可验证条件]"
    risk: medium
    files_hint:
      - "[expected/file/path]"
```

## 状态速览

| 状态 | 数量 | 任务 |
|------|------|------|
| 已完成 | 0 | - |
| 进行中 | 0 | - |
| 待执行 | 0 | - |
| 阻塞 | 0 | - |

## Ready Queue

依赖已满足、可以执行的任务：

- TASK-XXX：[任务标题]

## 阻塞任务

- 暂无

## 依赖摘要

- 任务总数：[N]
- 已完成：[N]
- 进行中：[N]
- 阻塞：[N]
- 可启动：[N]
