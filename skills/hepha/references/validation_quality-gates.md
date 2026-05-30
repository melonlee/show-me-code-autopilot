# 质量门禁

## Gate A：工程检查

根据改动范围运行相关检查：

- lint
- 单元测试 / 集成测试
- build / typecheck

通过标准：

- 无阻塞错误。
- 新增或变更行为在可行时有测试覆盖。
- 无法测试时，在 summary 中说明原因和替代验证。

## Gate B：代码审查

提交前确认：

1. 改动匹配当前任务验收标准。
2. 没有无关文件改动。
3. 边界条件已考虑。
4. 命名、结构和项目现有模式一致。
5. 每轮 summary 已写入 `.hepha/summary/YYYY-MM-DD/<person>/TASK-XXX.md`。

## Gate C：浏览器验证

UI 或交互变更必须使用浏览器工具、MCP 或 Playwright：

1. 打开受影响页面或路由。
2. 执行关键用户路径。
3. 验证预期可见结果。
4. 必要时记录截图、快照或控制台信息。

通过标准：

- 关键交互成功。
- 受影响路径没有明显 UI 回归。
- 验证步骤写入 `.hepha/progress.md` 和本轮 summary。

## 提交门禁

只有满足以下条件才允许提交：

- Gate A 通过。
- Gate B 通过。
- Gate C 在适用时通过。
- `.hepha` 运行产物已更新。

提交信息格式：

```text
type(scope): short purpose
```

提交正文可说明动机、影响和验证方式。
