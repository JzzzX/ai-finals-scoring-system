# Zeabur 单实例部署

基于 `1985568` 的飞书登录版本。部署目标为 Zeabur 托管的阿里云北京服务器。
业务代码、现有公司服务器和数据不会因创建新服务而自动迁移。

## 服务设置

- 使用根目录 Dockerfile，构建 React 页面与 NestJS 后端，Node.js 24。
- 仅运行一个副本。镜像默认端口为 `3001`；当前 Zeabur 自动注入 `PORT=8080`，实际 HTTP 路由为 `8080`，应用和健康检查均读取该变量。
- **首次启动前**创建持久化磁盘并挂载 `/data`；数据库为 `/data/finals.sqlite`。
- Dockerfile 默认 `HOST=0.0.0.0`、`NODE_ENV=production`、`AUTH_MODE=feishu`、`COOKIE_SECURE=true`。
- 容器内 PID 文件单独放 `/tmp/finals.server.pid`，不随业务数据备份；容器启动时清理其旧 PID。
- 不把 `.env`、数据库、日志或备份加入代码仓库或 Docker 镜像。
- 镜像保留已有运维脚本依赖，支持 `npm run db:backup` 等命令。

## 需要在 Zeabur 设置的环境变量

| 变量 | 值或来源 |
| --- | --- |
| `APP_ORIGIN` | 平台实际分配的 HTTPS 入口，不带末尾斜线 |
| `FEISHU_REDIRECT_URI` | 上述入口 + `/api/auth/feishu/callback` |
| `FEISHU_APP_ID` | 沿用现有评分应用 ID，由部署同事确认 |
| `FEISHU_APP_SECRET` | 由应用管理员直接填写到平台环境变量，不写进文档或聊天 |
| `FEISHU_TENANT_KEY` | 沿用公司租户限制，由部署同事提供 |
| `FEISHU_SCOPE` | 如原服务配置了该项，保留原值 |

飞书应用管理员需在后台登记新回调地址。现有浏览器账号对该应用管理页面返回 403，
不能把新服务已启动表述为飞书登录已完成。

## 正式数据迁移

1. 由原部署同事通过 SQLite 在线备份接口生成一致性备份，保留原环境和原备份。
2. 明确切换时点，避免切换期间新分数仍写入原服务；不要同时把两个独立数据库作为正式库。
3. 停止新服务的写入进程，再将备份恢复到新服务的 `/data/finals.sqlite`。
4. 不复制运行中的 SQLite 主文件代替完整备份；不导入旧 `.server.pid` 文件。
5. 核对用户、飞书身份绑定、评委名单、赛事状态和评分数量，再放开入口。
6. 恢复脚本会清除会话，需要重新登录。不要为了测试清空或重置现有赛事。

运行中备份须显式写到持久化路径，例如：

```sh
npm run db:backup -- /data/backups/before-finals.sqlite
```

## 验证范围

- 本地：构建、OAuth/权限/计分测试，以及 50 位评委 × 12 队提交测试。
- 云端已验证：Docker 构建成功、Node.js v24.21.0、健康检查 200、未登录 API 返回 401、本地密码登录返回 404；服务重启后持久化检查文件保留，SQLite integrity_check 为 ok，健康检查再次返回 200。检查文件已删除。
- 公网已验证：域名解析至已购北京服务器，HTTPS 证书验证通过，GET 首页及 /api/health 返回 200，未登录 /api/me 返回 401。北京服务器用域名请求也验证成功。
- 云端待验证：正式数据迁移、飞书登录和角色、手机流量访问。当前空库的持久化验证不代表正式数据已迁移。
- 健康检查仅证明进程及数据库可读取，不代表评分可写或 OAuth 配置完整。
- 正式库不随意提交测试分数；完整评分演练使用另行约定的测试数据。
- 域名使用需按 Zeabur 提供的预备案域名规则完成实名认证，并验证实际分配结果。
- 服务器按月付费并可能自动续费；比赛结束先导出、备份和交付，再处理停用或续费设置。

## 2026-09-23 云端状态

- 服务器：`Aliyun Beijing 2C 4GB`，ID `6ab375d188bd3c746fd58ab9`。
- 项目：`ai-finals-scoring`，ID `6ab379ce76ea2bdcc9db9840`。
- 环境：`6ab379ce36d2a6cac4934dc0`。
- 服务：`scoring`，ID `6ab379f376ea2bdcc9db9857`。
- 首次构建：`6ab37a425d7569a2d1c6d067`，部署代码提交 `e334c90`。
- 持久化卷：`scoring-data`，挂载 `/data`，已确认真实磁盘挂载。
- 控制台：https://zeabur.com/projects/6ab379ce76ea2bdcc9db9840/services/6ab379f376ea2bdcc9db9857?envID=6ab379ce36d2a6cac4934dc0
- 已完成实名认证及域名绑定：https://gambol-ai-finals-0928.preview.aliyun-zeabur.cn 。公网服务可达，但尚不能完成飞书登录和正式评分。
- 已设置 APP_ORIGIN、FEISHU_APP_ID 及 FEISHU_REDIRECT_URI。新回调为 `https://gambol-ai-finals-0928.preview.aliyun-zeabur.cn/api/auth/feishu/callback`。
- FEISHU_APP_SECRET、FEISHU_TENANT_KEY 及原有可选 scope 尚未导入；飞书平台的新回调尚未登记；登录接口当前返回 503，提示“飞书登录尚未完成服务器配置”。
- 当前电脑网络代理曾把域名解析至 198.18.*，普通 curl 出现 TLS 异常；保留域名及证书验证、仅定向已购服务器 IP 的请求成功，北京服务器正常 DNS 请求也成功。未修改电脑的代理或全局 DNS 设置。
- 原公司内网服务、数据及已有回调未修改。

给原部署同事的交接事项（草稿，未发送）：

> 评分系统已在 Zeabur 的阿里云北京服务器上启动，需要协助接入现有飞书应用和迁移数据。请从当前运行实例确认 FEISHU_APP_ID、FEISHU_TENANT_KEY、FEISHU_SCOPE（如有），并将 FEISHU_APP_SECRET 直接配置到新服务的环境变量，避免写进聊天或仓库。请用系统现有 db:backup 工具生成 SQLite 一致性备份，保留评委、飞书身份绑定、赛事和分数；不要直接复制运行中的主数据库文件。公网域名确认后，还需在飞书应用后台新增对应 /api/auth/feishu/callback 回调，保留旧回调供切换期间使用。正式切换前一起核对人数、分数数量与赛事状态。
