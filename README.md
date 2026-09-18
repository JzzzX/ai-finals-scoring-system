# AI先锋赛决赛评分系统

本地可运行的完整评分网站。React + Vite + TypeScript、NestJS、SQLite。正式库首次启动没有账号和历史分数；12 支队伍、44 条成员记录及 12 张团队照片已初始化。

## 当前状态

网站使用正式数据流程：12 支真实参赛队伍、初始无评分、赛事等待开始。不会自动创建评委，也不预填任何成绩。

后续将接入飞书 OAuth；当前保留账号登录和独立身份接口，方便开发同事本地验证。完整交接见 [开发交接文档](docs/developer-handoff.md)，认证技术说明见 [飞书与部署接入](docs/feishu-handoff.md)。

公开源码仓库地址：

- GitHub：[JzzzX/ai-finals-scoring-system](https://github.com/JzzzX/ai-finals-scoring-system)
- Gitea：[ai-itbp/ai-finals-scoring-system](http://192.168.180.119:3000/ai-itbp/ai-finals-scoring-system)

## 初版查看账号

当前维护者本机已配置以下账号，可用于初版页面查看与开发联调：

| 身份 | 账号 | 密码 | 权限 |
| --- | --- | --- | --- |
| 管理员 | `admin` | `admin12345678` | 成绩、成员与权限、赛事设置 |
| 评委 | `judge` | `judge12345678` | 队伍、评分标准、本人评分 |

当前赛事未开始，0 份评分。评委提交前需由管理员开始评分；这会固定本场评委名单。`judge` 是初版查看账号，不代表正式评委。

**账号已在此公开 README 明文列出，仅用于初版联调。** 仓库不包含本机数据库，拉取代码不会自动获得这些账号。开发同事按下方步骤创建管理员，再到“成员与权限”创建 `judge`，姓名填“评委（初版查看）”、密码填 `judge12345678`，只勾选评委角色。正式上线前停用初版查看账号并更换管理员密码，或完成飞书身份绑定后关闭公开账密登录。

## 本地启动

环境：Node.js 24 或更新版本（本机验证 Node 26.6.0）、npm。在项目根目录执行：

```sh
npm ci
cp .env.example .env
ADMIN_USERNAME=admin ADMIN_NAME=赛事管理员 ADMIN_PASSWORD=admin12345678 npm run admin:create
npm run build
npm start
```

以上命令显式创建初版管理员。也可单独运行 `npm run admin:create`，按提示输入自选账号、姓名和至少 12 位密码，密码不回显；程序不会自动创建默认账号。首个管理员不自带评委角色。管理员已存在时初始化命令会拒绝再次创建，其他账号通过“成员与权限”添加。

浏览器访问 <http://127.0.0.1:3001>。如 3001 已有本项目旧服务，请先在原终端按 Ctrl+C。默认只监听本机；本期不开放公网。

开发：`npm run dev`，网页 <http://127.0.0.1:5173>，后端 3001，Vite 代理 `/api`。修改源码后，生产式预览需重新 `npm run build`；后端变更还需重启 `npm start`。

## 比赛当天操作

1. 管理员在“成员与权限”创建评委账号。管理员如也需评分，必须另行勾选评委角色。
2. 核对队伍和评委人数，在“赛事设置”开始评分。此时固定本场评委名单；开赛后新增账号不会自动进入本场。
3. 评委登录即进入评分页，通过滑块或数字输入给出 0—10 分、间隔 0.5 分的综合分。六维度只供判断参考，不再次加权。评语选填。
4. 只有服务器确认后才显示已提交，并进入下一支未评分队伍。0 分有效。草稿按账号和队伍保存在当前浏览器；断网后继续填写，联网后主动提交。跨浏览器的草稿不互通。
5. 截止前可更新本人评分；冲突时先核对最新记录。管理员只查看分数和改分记录，不能代评或改分。
6. 管理员结束评分。未收齐时仍明确标记“尚未收齐”；如需重新开放，必须填写原因，名单保持不变。可导出队伍汇总与逐评委 CSV。

均分按所有已提交的有效分数算术平均，显示两位小数；排名按未舍入结果计算，完全同分并列，名次采用 1、1、3。停用或移除角色不会删除已有成绩，缺评仍按固定名单统计。

## 备份与恢复

服务运行时可执行一致性在线备份，不能直接只复制 `.sqlite` 文件而漏掉 WAL：

```sh
npm run db:backup
# 或指定一个尚不存在的备份路径
npm run db:backup -- ./data/backups/before-finals.sqlite
```

恢复前必须停止服务，并避免运行其他会写入同一数据库的命令：

```sh
npm run db:restore -- ./data/backups/before-finals.sqlite
npm start
```

恢复命令验证完整性与结构版本，先保存旧库为 `.before-restore-时间戳`，再替换；恢复后清除登录会话，需要重新登录。检测到运行中的服务 PID 会拒绝恢复。默认不覆盖备份。自定义数据库路径通过 `DB_PATH` 指定。

SQLite 使用 WAL、FULL 同步、事务、唯一键；锁定 `better-sqlite3@13.0.3`，本机实际 SQLite 3.53.4。启动检查最低 3.51.3，包含官方说明的 WAL 修复。数据应放在本机磁盘；交接后若需多实例或网络盘，请先调整数据层，勿把本地文件直接放共享盘。

## 代码入口与交接

| 路径 | 用途 |
| --- | --- |
| `client/src/Judge.tsx` | 评委端、滑块输入、草稿和冲突处理 |
| `client/src/Admin.tsx` | 成绩、成员、赛事设置 |
| `client/src/styles.css` | 深蓝、姜黄和双端布局 |
| `server/app.ts` | API、会话守卫、CSRF、静态网站 |
| `server/service.ts` | 权限、计分、固定名单、审计、导出 |
| `server/identity.ts` | 身份认证接口与本地密码实现 |
| `server/database.ts` | SQLite 数据访问与结构初始化 |
| `shared/teams.json` / `criteria.json` | 来源一致的队伍和评分参考 |
| `docs/sources/` | 飞书源文档读取快照 |
| `docs/design/` | 三张效果图和设计规范 |
| `docs/verification.md` | 验证记录与实际截图 |
| `docs/developer-handoff.md` | 当前交付、初版账号、开发接手步骤与后续工作 |
| `docs/feishu-handoff.md` | 飞书登录和部署技术接入说明 |

运行检查：`npm test`、`npm run build`。不需要连接飞书即可本地评分。飞书认证和生产部署未在本期实施。

## 数据来源

- 队伍：[决赛 12 强团队照片墙](https://bixdj76ux7l.feishu.cn/docx/V1avdeZwzoiN96xzhWDcm2mknje)，读取版本 111。
- 参考：[评委评分手册](https://bixdj76ux7l.feishu.cn/docx/UXEydXWl8oKNaox3tREcg5Mwn8d)，读取版本 232。六项权重 20%、20%、20%、20%、10%、10%；提示为简写，详细分档保留原文。
- 计分口径以本次确认计划为准：单项综合分，不沿用初赛算法。未导入任何初赛成绩。
- 品牌素材为用户提供的 PNG 与 SVG 原件，位于 `client/public/branding/`。照片来自授权读取的队伍文档。

本程序不会自动同步后续文档修改。数据库用稳定队伍 ID；开赛后不要通过替换 JSON 改变队伍顺序。数据调整需先备份并通过明确的数据迁移处理。
