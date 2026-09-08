# 质量门禁

## Gate A：规格与任务图

- Spec 包含目标、非目标、场景和完成条件。
- 任务引用真实 Spec。
- `hepha-cli.js validate` 通过。

## Gate B：TDD 与工程检查

根据改动范围运行相关检查：

- lint
- 单元测试 / 集成测试
- build / typecheck

通过标准：

- 无阻塞错误。
- 行为变更存在有效 RED、GREEN 和 regression 证据。
- 非行为变更记录确定性的替代验证。

## Gate C：双审查

提交前确认：

1. Spec reviewer 逐条确认场景和验收标准。
2. Code reviewer 确认没有 P0/P1 问题。
3. 没有无关文件改动。
4. 边界条件、命名和项目模式一致。

## Gate D：浏览器验证

UI 或交互变更必须使用浏览器工具、MCP 或 Playwright：

1. 打开受影响页面或路由。
2. 执行关键用户路径。
3. 验证预期可见结果。
4. 必要时记录截图、快照或控制台信息。

通过标准：

- 关键交互成功。
- 受影响路径没有明显 UI 回归。
- 验证步骤写入 `.hepha/progress.md` 和本轮 summary。

## Gate E：沉淀与批准

- Summary 已写入 `.hepha/summary/YYYY-MM-DD/<person>/TASK-XXX.md`。
- `knowledge.asset_policy` 已满足。
- 资产不包含敏感数据，且拥有来源谱系。
- 默认存在人工批准证据。

## 提交门禁

只有满足以下条件才允许提交：

- Gate A、B、C 通过。
- Gate D 在适用时通过。
- Gate E 通过。
- `.hepha` 运行产物已更新。

提交信息格式：

```text
type(scope): short purpose
```

提交正文可说明动机、影响和验证方式。
