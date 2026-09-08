---
task_id: TASK-XXX
title: "[任务标题]"
date: YYYY-MM-DD
person: "[person]"
state: review
risk: low
spec_refs: [SPEC-001]
commit: none
---

# TASK-XXX：[任务标题]

## 任务目标

[本轮目标和非目标]

## 验收追踪

| 验收 ID | 场景 | 测试/证据 | 结果 |
|---|---|---|---|
| AC-001 | SC-001 | `[command or path]` | pass/fail |

## TDD 证据

| 阶段 | 命令 | 退出码 | 结论 |
|---|---|---:|---|
| RED | `[command]` | 1 | 因目标行为缺失而失败 |
| GREEN | `[command]` | 0 | 最小实现通过 |
| regression | `[command]` | 0 | 相关回归通过 |

## 执行摘要

- [实际完成内容]
- [与计划偏差]

## 修改文件

- `[path]`：[用途]

## 审查结果

- Spec review：[reviewer、结论]
- Code review：[reviewer、结论]
- Human approval：[reviewer、结论]
- 浏览器验证：[步骤和证据；不适用则注明]

## 资产候选

- 策略：none/candidate/required
- 资产：[路径或“不生成”]
- 可复用结论：[摘要]
- 适用/不适用范围：[说明]

## 技术决策

- [决策及资料链接；没有则写“无”]

## 风险与后续

- [风险、阻塞和建议]

## AI Reviewer 快速判断

- 是否满足 Spec：[是/否]
- 是否存在无关改动：[是/否]
- 是否具备完整来源谱系：[是/否]
