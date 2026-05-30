# 任务拆解指南

## 目标

把一个大需求转换成带依赖关系的最小可执行任务队列。每个任务都应该能独立验证、独立沉淀 summary，并尽量独立提交。

## 任务 Schema

每个任务必须包含：

- `id`：稳定唯一标识，格式 `TASK-XXX`
- `title`：中文动作句
- `state`：`todo | doing | blocked | done`
- `depends_on`：依赖任务 ID 数组
- `acceptance`：可测试验收条件
- `risk`：`low | medium | high`
- `files_hint`：预计影响文件或模块

### YAML 示例

```yaml
# .hepha/backlog.md 示例
tasks:
  - id: TASK-001
    title: "实现用户登录 API"
    state: todo
    depends_on: []
    acceptance:
      - "POST /api/auth/login 在凭据正确时返回 JWT"
      - "凭据错误时返回 401"
    risk: medium
    files_hint:
      - "src/api/auth.ts"
      - "src/middleware/auth.ts"

  - id: TASK-002
    title: "实现登录表单"
    state: todo
    depends_on: [TASK-001]
    acceptance:
      - "页面展示邮箱和密码输入框"
      - "提交时调用 /api/auth/login"
      - "登录成功后保存 token"
    risk: low
    files_hint:
      - "src/components/LoginForm.tsx"
```

## 校验清单

执行任务前必须确认：

- [ ] 所有任务 ID 唯一。
- [ ] 所有 `state` 值合法。
- [ ] 所有 `depends_on` 引用真实任务。
- [ ] 不存在循环依赖。
- [ ] 所有 `acceptance` 都可验证。
- [ ] 所有 `risk` 值合法。
- [ ] 至少存在一个 ready 任务。

## 拆解规则

1. 优先按用户可感知价值做垂直切片。
2. 高风险和不确定性优先前置。
3. 避免一个任务触碰多个无关模块。
4. 验收条件模糊时继续拆分。
5. 预计超过一轮时继续拆分。

## Ready Queue 规则

任务进入 ready queue 的条件：

- `state` 是 `todo`
- 所有 `depends_on` 任务都是 `done`

优先级：

1. 高风险前置任务
2. 能解锁后续任务的基础任务
3. 能尽早形成用户可见价值的任务

## 重新规划触发器

出现以下情况立即重新规划：

- 新发现的技术约束推翻当前路径。
- 连续失败说明抽象或方案错误。
- 出现隐藏依赖。
- 当前任务不能在一轮内合理完成。

## 重新规划动作

1. 暂停当前任务并标记 `blocked`，写明原因。
2. 增加新的前置任务或拆分子任务。
3. 重新计算 ready queue。
4. 继续执行下一个 ready 任务。
