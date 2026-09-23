# Zeabur 外部评委账密版

GitHub 维护外部评委账密版，Gitea 独立维护公司内部飞书版。本次只发布到 GitHub 和已有 Zeabur 服务，不向 Gitea 推送。保留最新评分提交修复、SQLite 持久化和备份恢复保护。

## 登录与数据

- 统一使用管理员分配的账号、密码，不要求飞书身份；不开启自行注册。
- `AUTH_MODE=local`，页面不显示飞书登录或通讯录授权，飞书相关 API 返回 404。
- 每位评委独立账号、独立随机密码；管理员和评委分别授予角色。管理员不会自动获得评分资格。
- 密码至少 12 位，数据库存储加盐 scrypt 哈希；正式密码不进入代码、日志或公开文档。
- 管理员可创建、停用账号、修改角色和重置密码；重置密码会撤销该用户全部旧会话，已有评分保留。
- 用户明确选择不迁入内网版旧评分。外部版从新库开始，保留 12 支队伍；评委名单待用户提供。赛事保持 draft，名单确认后才开始评分。
- 原公司内网服务、数据和飞书回调均不修改。旧飞书文档仅供内部版参考。

## 服务设置

- 根目录 Dockerfile 构建 React 和 NestJS，Node.js 24，单副本。
- `scoring-data` 持久化卷挂载 `/data`，数据库 `/data/finals.sqlite`。
- 镜像默认端口 3001；当前平台注入 `PORT=8080`，HTTP 路由为 8080。应用和健康检查均读取 PORT。
- `HOST=0.0.0.0`、`NODE_ENV=production`、`COOKIE_SECURE=true`、`AUTH_MODE=local`。
- `APP_ORIGIN=https://gambol-ai-finals-0928.preview.aliyun-zeabur.cn`。
- PID 文件 `/tmp/finals.server.pid`，启动时清理旧 PID，不随数据库持久化。
- 不需要 FEISHU_APP_ID、FEISHU_APP_SECRET、FEISHU_REDIRECT_URI、FEISHU_TENANT_KEY 或 scope。
- 不把 .env、数据库、日志、密码分发清单或备份放入 Git / 镜像。

## 已有云资源

- 服务器：Aliyun Beijing 2C 4GB，ID `6ab375d188bd3c746fd58ab9`。
- 项目：ai-finals-scoring，ID `6ab379ce76ea2bdcc9db9840`。
- 环境：`6ab379ce36d2a6cac4934dc0`。
- 服务：scoring，ID `6ab379f376ea2bdcc9db9857`。
- 入口：https://gambol-ai-finals-0928.preview.aliyun-zeabur.cn
- 控制台：https://zeabur.com/projects/6ab379ce76ea2bdcc9db9840/services/6ab379f376ea2bdcc9db9857?envID=6ab379ce36d2a6cac4934dc0
- 用户已完成服务器付款、预备案域名实名认证及绑定。服务器按月付费并可能自动续费；赛后先导出备份，再处理停用。

## 发布与验证

部署到上述已有服务，不重复创建服务器或新数据库。平台变量修改后须重启并验证运行时实际值。

已完成：生产账密 API 测试（关闭 OAuth、管理员创建评委、角色隔离、CSRF、密码重置及旧会话撤销），全部系统测试及构建。50 位评委 × 12 队的本地并发写入测试无丢分；不能把本地耗时当作生产性能承诺。

基础云环境已验证：域名、HTTPS 证书、GET 首页和健康检查 200、未登录数据接口 401、重启后持久化检查文件保留、SQLite integrity_check 为 ok。验证用检查文件已移除。手机流量和正式评委设备仍需演练。

当前电脑代理曾将域名解析至 198.18.* 导致 TLS 异常。保持域名与证书校验、仅定向已购服务器 IP 的请求成功，北京服务器正常 DNS 请求也成功；未修改全局代理或 DNS。

## 备份与比赛操作

```sh
npm run db:backup -- /data/backups/before-finals.sqlite
```

在线备份使用 SQLite backup API，不只复制运行中的主数据库文件。恢复前先停止服务，使用现有恢复脚本；恢复会清除会话。正式库不写测试分数。

1. 用赛事管理员账号登录，进入“成员与权限”创建评委。
2. 为每个人单独分发账号密码；主办方本地保管完整清单。
3. 核对 12 支队伍、评委人数和角色；在“赛事设置”开始评分，固定名单。
4. 评委用手机流量登录，提交后以服务端确认成功为准。
5. 结束评分后导出队伍汇总、逐评委明细，另做数据库备份。
