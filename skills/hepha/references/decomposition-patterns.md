# 拆解模式

## 用途

本文件定义 Hepha 将大需求拆成可执行任务时使用的常见模式。

## 拆解策略

### 1. 垂直切片（优先）

按用户价值路径拆分，从 UI 到 API 再到数据：

```text
用户需求："新增用户资料功能"
-> TASK-001：创建资料数据模型
-> TASK-002：实现资料 API
-> TASK-003：构建资料页面组件
-> TASK-004：连接 UI、API 和状态管理
```

适用场景：

- 功能有明确用户路径。
- 需要尽早做用户视角验证。
- UI 和 API 可以逐步接通。

### 2. 风险优先

优先处理高风险、高不确定性的任务：

```text
用户需求："实现 OAuth 登录"
-> TASK-001：研究并选择 OAuth 方案（高风险）
-> TASK-002：搭建 OAuth callback 流程（高风险）
-> TASK-003：实现 token 存储和刷新
-> TASK-004：实现登录/退出 UI
```

适用场景：

- 引入新技术或外部依赖。
- 技术可行性未知。
- 后续任务依赖某个关键判断。

### 3. 独立能力拆解

拆成可独立测试、独立提交的功能单元：

```text
用户需求："新增评论系统"
-> TASK-001：创建评论数据模型
-> TASK-002：实现评论 CRUD API
-> TASK-003：实现评论列表组件
-> TASK-004：实现评论表单组件
-> TASK-005：实现评论通知
```

适用场景：

- 一个需求包含多个子能力。
- 可以接受增量交付。
- 每个子能力都能单独验证。

### 4. 依赖链拆解

按真实技术依赖排序：

```text
用户需求："新增文件上传功能"
-> TASK-001：设置文件存储后端（无依赖）
-> TASK-002：实现上传 API（依赖 TASK-001）
-> TASK-003：创建上传 UI（依赖 TASK-002）
-> TASK-004：增加上传进度（依赖 TASK-002）
-> TASK-005：实现文件列表和删除（依赖 TASK-002）
```

适用场景：

- 技术依赖非常清晰。
- 基础设施必须先于业务能力。
- 数据流是单向的。

## 常见模板

### CRUD 功能

```yaml
tasks:
  - id: TASK-001
    title: "创建 [资源] 数据模型和迁移"
    state: todo
    depends_on: []
    acceptance:
      - "[资源] 数据表已创建"
      - "迁移脚本可成功运行"
    risk: low
    files_hint: ["db/migrations/*", "src/models/[Resource].ts"]

  - id: TASK-002
    title: "实现 [资源] CRUD API"
    state: todo
    depends_on: [TASK-001]
    acceptance:
      - "GET /api/[resource] 返回列表"
      - "GET /api/[resource]/:id 返回单条记录"
      - "POST /api/[resource] 可创建记录"
      - "PUT /api/[resource]/:id 可更新记录"
      - "DELETE /api/[resource]/:id 可删除记录"
    risk: medium
    files_hint: ["src/api/[Resource].ts"]

  - id: TASK-003
    title: "构建 [资源] 列表 UI"
    state: todo
    depends_on: [TASK-002]
    acceptance:
      - "列表可渲染并支持分页"
      - "每条记录展示关键字段"
      - "加载态可正确显示"
    risk: low
    files_hint: ["src/components/[Resource]List.tsx"]

  - id: TASK-004
    title: "构建 [资源] 表单 UI"
    state: todo
    depends_on: [TASK-002]
    acceptance:
      - "表单校验必填字段"
      - "提交时调用创建或更新 API"
      - "失败时展示错误信息"
    risk: low
    files_hint: ["src/components/[Resource]Form.tsx"]
```

### 鉴权功能

```yaml
tasks:
  - id: TASK-001
    title: "研究鉴权方案"
    state: todo
    depends_on: []
    acceptance:
      - "比较至少两个鉴权方案"
      - "在 .hepha/decision-log.md 记录选择理由"
    risk: high
    files_hint: [".hepha/decision-log.md"]

  - id: TASK-002
    title: "实现鉴权后端"
    state: todo
    depends_on: [TASK-001]
    acceptance:
      - "用户注册接口可用"
      - "登录接口返回有效 token"
      - "存在 token 校验中间件"
    risk: high
    files_hint: ["src/api/auth.ts", "src/middleware/auth.ts"]

  - id: TASK-003
    title: "构建鉴权 UI"
    state: todo
    depends_on: [TASK-002]
    acceptance:
      - "登录和注册表单存在"
      - "认证成功后保存 token"
      - "受保护页面会跳转到登录"
    risk: medium
    files_hint: ["src/components/LoginForm.tsx", "src/components/RegisterForm.tsx"]

  - id: TASK-004
    title: "增加会话管理"
    state: todo
    depends_on: [TASK-003]
    acceptance:
      - "实现 token 刷新"
      - "退出登录会清理会话"
      - "token 过期时有友好处理"
    risk: medium
    files_hint: ["src/utils/auth.ts"]
```

### UI 组件

```yaml
tasks:
  - id: TASK-001
    title: "定义 [组件] API 和 props"
    state: todo
    depends_on: []
    acceptance:
      - "props 接口已定义"
      - "组件契约清晰"
    risk: low
    files_hint: ["src/components/[Component].tsx"]

  - id: TASK-002
    title: "实现 [组件] 基础功能"
    state: todo
    depends_on: [TASK-001]
    acceptance:
      - "组件可使用必需 props 渲染"
      - "基础交互可用"
      - "包含必要可访问性属性"
    risk: low
    files_hint: ["src/components/[Component].tsx"]

  - id: TASK-003
    title: "增加 [组件] 样式和变体"
    state: todo
    depends_on: [TASK-002]
    acceptance:
      - "所有视觉变体正确渲染"
      - "响应式表现已验证"
      - "如项目支持深色模式，组件也支持"
    risk: low
    files_hint: ["src/components/[Component].tsx", "src/components/[Component].css"]

  - id: TASK-004
    title: "为 [组件] 编写测试"
    state: todo
    depends_on: [TASK-003]
    acceptance:
      - "关键 props 组合已覆盖"
      - "交互事件已验证"
      - "边界情况已覆盖"
    risk: low
    files_hint: ["src/components/[Component].test.tsx"]
```

### 外部 API 集成

```yaml
tasks:
  - id: TASK-001
    title: "研究外部 API 和认证方式"
    state: todo
    depends_on: []
    acceptance:
      - "已阅读 API 文档"
      - "认证方式已确定"
      - "速率限制和约束已记录"
    risk: high
    files_hint: [".hepha/decision-log.md"]

  - id: TASK-002
    title: "设置 API client 和认证"
    state: todo
    depends_on: [TASK-001]
    acceptance:
      - "API client 已配置"
      - "认证流程可用"
      - "错误处理已实现"
    risk: medium
    files_hint: ["src/api/externalClient.ts"]

  - id: TASK-003
    title: "实现核心 API 集成逻辑"
    state: todo
    depends_on: [TASK-002]
    acceptance:
      - "必需端点可成功调用"
      - "存在数据转换层"
      - "如需要，缓存策略已实现"
    risk: medium
    files_hint: ["src/api/externalService.ts"]

  - id: TASK-004
    title: "构建外部数据展示 UI"
    state: todo
    depends_on: [TASK-003]
    acceptance:
      - "外部数据可在 UI 中展示"
      - "加载态已处理"
      - "错误态已展示"
    risk: low
    files_hint: ["src/components/ExternalData.tsx"]
```

## 继续拆分的信号

出现任一情况都应继续拆分：

1. **过大**：预计超过一轮或约 2 小时。
2. **验收模糊**：无法写出可测试条件。
3. **关注点混杂**：触碰超过 3 个主要模块。
4. **隐藏依赖**：内部子步骤有独立依赖关系。
5. **高风险单点**：一个任务阻塞大量后续任务。

## 拆分启发

```text
原始需求："构建完整电商 checkout"
-> TASK-001：创建 checkout 数据模型
-> TASK-002：实现 checkout API
-> TASK-003：构建收货地址表单
-> TASK-004：构建支付表单
-> TASK-005：实现订单确认流程
```

## 反模式

### 不要按文件拆

```text
错误：
   - TASK-001：写 auth.ts
   - TASK-002：写 user.ts
   - TASK-003：写 database.ts

正确：
   - TASK-001：实现用户注册
   - TASK-002：实现用户登录
   - TASK-003：实现密码重置
```

### 不要按技术层拆

```text
错误：
   - TASK-001：写所有数据库查询
   - TASK-002：写所有 API
   - TASK-003：写所有 UI

正确：
   - TASK-001：实现用户资料能力（DB + API + UI）
   - TASK-002：实现设置能力（DB + API + UI）
```

### 不要制造虚假依赖

```text
错误：
   - TASK-001：创建项目结构
   - TASK-002：创建 utils 目录（依赖 TASK-001）
   - TASK-003：创建 components 目录（依赖 TASK-002）

正确：
   - TASK-001：实现功能 A
   - TASK-002：实现功能 B（真正独立）
```
