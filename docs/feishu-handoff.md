# 飞书与部署交接

接手顺序、初版账号及后续产品工作见 [开发交接文档](developer-handoff.md)。

本期已完成本地账号登录及业务权限。以下是后续接入位置与约束，不表示已经完成飞书认证或生产环境验证。

## 身份与角色分离

`server/identity.ts` 的 `IdentityProvider` 返回稳定的业务 `userId`。当前 `LocalIdentityProvider` 核验 scrypt 密码；`FinalsService.login()` 创建服务器会话。会话只保存哈希后的随机 token，12 小时有效，每次请求重新读取角色与停用状态。浏览器不能声明管理员身份。

飞书 OAuth 不应伪装成用户名密码请求。建议保留本地登录供迁移期间使用，增加独立登录与回调路由，创建飞书专用身份适配器，再复用服务器会话签发逻辑。上线前至少完成：

1. 服务端生成并校验 OAuth state；使用官方授权流程、服务端交换 code，不向浏览器暴露 app secret 或 access token。
2. 增加 `external_identities(provider, tenant_id, subject_id, user_id)` 唯一映射表，绑定可信的飞书租户及稳定 ID。不要按姓名匹配、不要用前端提交的用户 ID 或角色建立映射。
3. 由管理员明确把飞书身份绑定到已有业务 `users.id`，以保留评分、固定名单、审计和版本号；不自动赋予管理员或评委资格。
4. 抽取现有会话签发部分供回调复用。接口 `authenticate()` 目前仅表达本地凭据，新增飞书适配器应定义 code/state 对应输入类型，勿把 code 填入 password。
5. 根据实际跳转方式选择会话 cookie SameSite 策略，保留 HttpOnly、HTTPS Secure、CSRF、Origin 校验。不能通过删除校验解决回调问题。

## 后端接口

| 接口 | 权限 / 用途 |
| --- | --- |
| `GET /api/health` | 健康检查，不返回业务信息 |
| `POST /api/login` | 本地登录 |
| `GET /api/me` / `POST /api/logout` | 当前身份 / 退出 |
| `GET /api/workspace` | 评委：队伍、标准、本人评分；不返回其他评委数据 |
| `POST /api/my-scores/:teamId` | 评委且属于固定名单；不接受指定 judgeId |
| `GET /api/admin/results` | 管理员：矩阵、汇总、缺评名单 |
| `GET/POST /api/admin/users` | 管理员：读取 / 创建账号 |
| `PATCH /api/admin/users/:id` | 管理员：姓名、角色、停用 |
| `POST /api/admin/users/:id/password` | 管理员：重置密码并撤销原会话 |
| `POST /api/admin/status` | 管理员：开始 / 结束 / 重新开放 |
| `GET /api/admin/audit` | 管理员：分页审计，支持 teamId 与 before |
| `GET /api/admin/export?mode=summary或detail` | 管理员：CSV 下载 |

评分请求：`{score, comment, expectedVersion, requestId}`。score 范围 0—10、步进 0.5；初次版本 0；requestId 为 UUID。同一请求重试沿用原 UUID，修改内容才生成新 UUID。409 时不得静默覆盖，需取得最新评分并让评委核对。401 重新登录、403 权限不足、429 登录尝试过多。

## 部署时需要调整与验证

- 环境变量见 `.env.example`；`DB_PATH` 指向持久化本地磁盘。`npm run build` 后 `npm start` 同时提供 API 和前端。
- 当前默认监听 127.0.0.1。部署时由同事根据拓扑配置反向代理、TLS、域名、`APP_ORIGIN`、`COOKIE_SECURE=true`、进程守护与备份权限。业务端口不直接公开。
- 单写入服务实例。WAL 不适用于跨机器共享的网络文件系统；如需多实例或水平扩容，替换 `Store` 数据层并重新进行事务与冲突验证。
- 代理信任范围需明确配置；目前没有无条件启用 trust proxy。否则 IP 限流可能把所有用户视为同一来源。不要无条件信任客户端 X-Forwarded-For。
- 后续需要真实环境验证：飞书 OAuth 回调与租户限制、移动端内嵌浏览器、HTTPS cookie、代理超时、恢复演练、持久卷容量和权限、比赛网络下 50 位评委同时在线。
- 当前性能记录来自单台 Mac 本地 HTTP 测试，不代表生产网络或云端容量承诺。

初版联调账号密码按项目负责人要求公开在 [README](../README.md#初版查看账号)，但仓库不包含运行数据库、会话、备份或飞书应用密钥。每个环境仍需初始化账号。当前维护者本机有一名管理员和一名初版查看评委，0 份评分、赛事未开始。后续 OAuth 绑定需保留业务用户 ID；初版查看评委不作为正式名单迁移。
