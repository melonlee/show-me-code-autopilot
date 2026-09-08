# 进度与证据格式

`.hepha/progress.md`是人类可读时间线，机器证据保存在 `.hepha/evidence/`。

每轮记录：

- Task、Spec 和验收 ID。
- 当前状态和负责人。
- RED、GREEN、regression 命令及结果。
- Spec、code、human review 结论。
- 浏览器或替代验证证据。
- Summary 和个人资产路径。
- Commit hash、风险和重试次数。

总体进度只根据 `.hepha/backlog.json` 计算：

```text
总体进度：[████████░░] 80% (4/5 个任务完成)
```

`done`计入完成，`skipped`单独展示并要求理由。不要把 `blocked` 或 `review`计入完成。
