import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  BarChart3,
  UsersRound,
  Settings2,
  Download,
  ChevronRight,
  Plus,
  ShieldCheck,
  Clock3,
  Search,
  RotateCcw,
  Presentation,
} from "lucide-react";
import type {
  AuditEvent,
  ContestStatus,
  ResultRow,
  Results,
  Role,
  SessionInfo,
  User,
} from "../../shared/types";
import { api, errorMessage } from "./api";
import { Modal, Notice, Status } from "./ui";
import { Leaderboard } from "./Leaderboard";

const sections = [
  { path: "/admin/results", label: "成绩与进度", Icon: BarChart3 },
  { path: "/admin/display", label: "实时榜单", Icon: Presentation },
  { path: "/admin/users", label: "成员与权限", Icon: UsersRound },
  { path: "/admin/settings", label: "赛事设置", Icon: Settings2 },
];
export function Admin({
  session,
  route,
  navigate,
}: {
  session: SessionInfo;
  route: string;
  navigate: (s: string) => void;
}) {
  const [data, setData] = useState<Results | null>(null),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      setData(await api<Results>("/admin/results"));
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    let stopped = false,
      running = false;
    const poll = async () => {
      if (stopped || running) return;
      running = true;
      await refresh();
      running = false;
    };
    void poll();
    const t = setInterval(() => void poll(), 2000);
    const resume = () => {
      if (!document.hidden) void poll();
    };
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
      stopped = true;
      clearInterval(t);
    };
  }, [refresh]);
  return (
    <div className="admin-shell">
      <nav className="admin-nav" aria-label="管理导航">
        {sections.map(({ path, label, Icon }) => (
          <button
            key={path}
            className={`${route === path ? "active" : ""} ${path === "/admin/display" ? "admin-subnav" : ""}`}
            onClick={() => navigate(path)}
          >
            <Icon size={21} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <main className="admin-main">
        {error && (
          <Notice>
            {error} 数据停留在上次成功更新时间。
            <button className="text-button" onClick={() => void refresh()}>
              重新加载
            </button>
          </Notice>
        )}
        {!data ? (
          <p role="status">正在加载赛事数据…</p>
        ) : route === "/admin/display" ? (
          <Leaderboard
            data={data}
            error={error}
            onBack={() => navigate("/admin/results")}
          />
        ) : route === "/admin/users" ? (
          <Members currentId={session.user.id} data={data} refresh={refresh} />
        ) : route === "/admin/settings" ? (
          <Settings data={data} refresh={refresh} />
        ) : (
          <ResultsPage
            data={data}
            error={error}
            onDisplay={() => navigate("/admin/display")}
          />
        )}
      </main>
    </div>
  );
}
function ResultsPage({
  data,
  error,
  onDisplay,
}: {
  data: Results;
  error: string;
  onDisplay: () => void;
}) {
  const [ranked, setRanked] = useState(true),
    [detail, setDetail] = useState<string | null>(null),
    [exportOpen, setExportOpen] = useState(false);
  const rows = ranked
    ? [...data.rows].sort(
        (a, b) =>
          (a.rank ?? 999) - (b.rank ?? 999) || a.team.order - b.team.order,
      )
    : data.rows;
  const row = detail ? data.rows.find((r) => r.team.id === detail) : undefined;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>成绩与进度</h1>
          <p>
            {data.contest.title} · {data.rows.length} 支队伍 ·{" "}
            {data.judges.length} 位评委
          </p>
        </div>
        <div className="results-actions">
          <button className="outline" onClick={onDisplay}>
            <Presentation size={18} />
            成绩展示
          </button>
          <button className="primary" onClick={() => setExportOpen(true)}>
            <Download size={18} />
            导出 CSV
          </button>
        </div>
      </div>
      <div className="results-overview">
        <div>
          <span>成绩口径</span>
          <strong>等权平均</strong>
          <small>不去最高最低分，0 分计入</small>
        </div>
        <div>
          <span>评分收齐</span>
          <strong>
            {
              data.rows.filter(
                (r) => r.count > 0 && r.count === data.judges.length,
              ).length
            }
            <small> / {data.rows.length} 队</small>
          </strong>
          <small>{data.expected - data.total} 份待提交</small>
        </div>
        <div>
          <span>榜单状态</span>
          <strong>
            {data.contest.status === "closed" &&
            data.expected > 0 &&
            data.total === data.expected
              ? "最终成绩"
              : "暂定排名"}
          </strong>
          <small className={error ? "invalid" : ""}>
            {error ? "同步中断，显示上次数据" : "每 2 秒自动同步"}
          </small>
        </div>
      </div>
      <div className="summary-strip">
        <span>
          已提交{" "}
          <strong>
            {data.total}
            {data.expected ? ` / ${data.expected}` : " 份"}
          </strong>
        </span>
        <Status status={data.contest.status} />
        <span className="muted">
          更新于{" "}
          {new Date(data.updatedAt).toLocaleTimeString("zh-CN", {
            hour12: false,
          })}
        </span>
      </div>
      <div className="tabs result-tabs">
        <button
          className={!ranked ? "active" : ""}
          onClick={() => setRanked(false)}
        >
          按出场顺序
        </button>
        <button
          className={ranked ? "active" : ""}
          onClick={() => setRanked(true)}
        >
          按当前均分
        </button>
      </div>
      {data.total < data.expected && (
        <Notice>部分队伍评分尚未收齐，当前均分仅供查看。</Notice>
      )}
      {!data.judges.length && (
        <Notice>暂无评委。请先在“成员与权限”中添加评委，再开始评分。</Notice>
      )}
      <div
        className="matrix-wrap desktop-results"
        tabIndex={0}
        role="region"
        aria-label="队伍与评委评分明细表，可横向滚动"
      >
        <table className="score-matrix">
          <thead>
            <tr>
              <th>{ranked ? "名次" : "顺序"}</th>
              <th className="team-col">参赛队伍</th>
              {data.judges.map((j) => (
                <th key={j.id}>
                  {j.name}
                  {!j.active && <small>已停用评分权限</small>}
                </th>
              ))}
              <th>当前均分</th>
              <th>进度</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.team.id}>
                <td>
                  {ranked
                    ? (r.rank ?? "—")
                    : String(r.team.order).padStart(2, "0")}
                </td>
                <th className="team-col" scope="row">
                  {r.team.name}
                </th>
                {data.judges.map((j) => (
                  <td key={j.id}>
                    {r.scores[j.id]?.score.toFixed(1) ?? (
                      <span className="muted">—</span>
                    )}
                  </td>
                ))}
                <td className="mean">{r.average?.toFixed(2) ?? "—"}</td>
                <td className="completion">
                  {data.judges.length
                    ? `${r.count}/${data.judges.length}`
                    : "待配置评委"}
                  {r.count < data.judges.length && <small>尚未收齐</small>}
                </td>
                <td>
                  <button
                    className="text-button"
                    onClick={() => setDetail(r.team.id)}
                  >
                    详情
                    <ChevronRight size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mobile-results">
        {rows.map((r) => (
          <button
            key={r.team.id}
            className="mobile-result-row"
            onClick={() => setDetail(r.team.id)}
          >
            <span className="muted">
              {ranked ? (r.rank ?? "—") : String(r.team.order).padStart(2, "0")}
            </span>
            <span className="mobile-result-name">
              <strong>{r.team.name}</strong>
              <small>
                {data.judges.length
                  ? `${r.count}/${data.judges.length} 位已评 · ${r.count < data.judges.length ? "尚未收齐" : "已收齐"}`
                  : "待配置评委"}
              </small>
            </span>
            <span className="mean">{r.average?.toFixed(2) ?? "—"}</span>
            <ChevronRight size={16} />
          </button>
        ))}
      </div>
      <p className="form-note">
        均分按已提交评分计算，0
        分计入，未评分不计入。完全同分并列，显示两位小数。
      </p>
      {row && (
        <ScoreDetail row={row} data={data} onClose={() => setDetail(null)} />
      )}{" "}
      {exportOpen && (
        <Modal title="导出评分记录" onClose={() => setExportOpen(false)}>
          <p className="muted">
            队伍汇总按排名排列，附成绩状态与导出时间；逐评委明细保留每笔评分、评语和时间。CSV
            可用 Excel 打开，未评分留空。
          </p>
          <div className="export-options">
            <a
              className="outline"
              href="/api/admin/export?mode=summary"
              download
            >
              <Download size={18} />
              队伍汇总
            </a>
            <a
              className="primary"
              href="/api/admin/export?mode=detail"
              download
            >
              <Download size={18} />
              逐位评委明细
            </a>
          </div>
        </Modal>
      )}
    </>
  );
}
function ScoreDetail({
  row,
  data,
  onClose,
}: {
  row: ResultRow;
  data: Results;
  onClose: () => void;
}) {
  const [audit, setAudit] = useState<AuditEvent[]>([]),
    [error, setError] = useState(""),
    [more, setMore] = useState(true);
  const fetchAudit = useCallback(
    async (before?: number) => {
      try {
        const rows = await api<AuditEvent[]>(
          `/admin/audit?teamId=${row.team.id}${before ? `&before=${before}` : ""}`,
        );
        setAudit((prev) => (before ? [...prev, ...rows] : rows));
        setMore(rows.length === 100);
      } catch (e) {
        setError(errorMessage(e));
      }
    },
    [row.team.id],
  );
  useEffect(() => {
    void fetchAudit();
  }, [fetchAudit]);
  return (
    <Modal title="队伍评分详情" onClose={onClose} wide>
      <h3>{row.team.name}</h3>
      <p className="muted">
        当前均分 {row.average?.toFixed(2) ?? "—"} ·{" "}
        {data.judges.length
          ? `${row.count}/${data.judges.length} 位已评`
          : "待配置评委"}
      </p>
      {row.missing.length > 0 && (
        <Notice>
          未评分：
          {data.judges
            .filter((j) => row.missing.includes(j.id))
            .map((j) => j.name)
            .join("、")}
        </Notice>
      )}
      <ul className="detail-scores">
        {data.judges.map((j) => {
          const s = row.scores[j.id];
          return (
            <li key={j.id}>
              <div>
                <strong>{j.name}</strong>
                <b className="mean">{s?.score.toFixed(1) ?? "未评分"}</b>
              </div>
              {s?.comment && <p>{s.comment}</p>}
              {s && (
                <small className="muted">
                  {new Date(s.updatedAt).toLocaleString("zh-CN")} · 版本{" "}
                  {s.version}
                </small>
              )}
            </li>
          );
        })}
      </ul>
      <h3 className="section-heading">
        <Clock3 size={18} />
        提交与改分记录
      </h3>
      {error && <Notice>{error}</Notice>}
      <AuditList rows={audit} />
      {more && audit.length > 0 && (
        <button
          className="outline"
          onClick={() => void fetchAudit(audit[audit.length - 1].id)}
        >
          加载更早记录
        </button>
      )}
    </Modal>
  );
}
function AuditList({ rows }: { rows: AuditEvent[] }) {
  return (
    <ul className="audit-list">
      {rows.map((a) => (
        <li key={a.id}>
          <div>
            <strong>{a.actorName}</strong>
            <span>
              {a.action === "score.updated"
                ? "修改评分"
                : a.action === "score.submitted"
                  ? "提交评分"
                  : a.action === "contest.status"
                    ? "调整赛事状态"
                    : a.action === "user.created"
                      ? "创建成员"
                      : a.action === "user.password_reset"
                        ? "重置密码"
                        : "调整成员权限"}
            </span>
          </div>
          {a.action.startsWith("score.") && (
            <p>
              {a.details.before
                ? `${(a.details.before as ScoreBefore).score.toFixed(1)} → `
                : ""}
              {(a.details.after as ScoreBefore)?.score.toFixed(1)} 分
            </p>
          )}
          {a.action === "contest.status" && (
            <p>
              {String(a.details.from)} → {String(a.details.to)}
              {a.details.reason ? ` · ${a.details.reason}` : ""}
            </p>
          )}
          <small>{new Date(a.createdAt).toLocaleString("zh-CN")}</small>
        </li>
      ))}
      {!rows.length && <li className="muted">暂无操作记录</li>}
    </ul>
  );
}
type ScoreBefore = { score: number };
function Members({
  currentId,
  data,
  refresh,
}: {
  currentId: string;
  data: Results;
  refresh: () => Promise<void>;
}) {
  const [users, setUsers] = useState<User[]>([]),
    [error, setError] = useState(""),
    [editing, setEditing] = useState<User | "new" | null>(null),
    [reset, setReset] = useState<User | null>(null),
    [query, setQuery] = useState("");
  const load = useCallback(async () => {
    try {
      setUsers(await api<User[]>("/admin/users"));
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>成员与权限</h1>
          <p>分配角色，让每个人只看到需要的内容。</p>
        </div>
        <button className="primary" onClick={() => setEditing("new")}>
          <Plus size={18} />
          添加成员
        </button>
      </div>
      {data.contest.status !== "draft" && (
        <Notice>
          本场评委名单已固定。新建评委不会自动加入本场；停用账号或移除角色不会删除已有成绩。
        </Notice>
      )}
      {error && (
        <Notice>
          {error}
          <button className="text-button" onClick={() => void load()}>
            重试
          </button>
        </Notice>
      )}
      <label className="search-field">
        <Search size={18} />
        <input
          aria-label="搜索成员"
          placeholder="搜索姓名或账号"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="users-list">
        {users
          .filter((u) =>
            (u.name + u.username).toLowerCase().includes(query.toLowerCase()),
          )
          .map((u) => (
            <div className="user-row" key={u.id}>
              <span className="user-avatar">{u.name.slice(0, 1)}</span>
              <div className="user-details">
                <strong>
                  {u.name}
                  {u.id === currentId && <small>（你）</small>}
                </strong>
                <span>{u.username}</span>
              </div>
              <div className="user-roles">
                {u.roles.map((r) => (
                  <span key={r} className={`role role-${r}`}>
                    {r === "admin" ? "管理员" : "评委"}
                  </span>
                ))}
                <small>
                  {u.active ? "账号正常" : "已停用"}
                  {data.contest.roster.includes(u.id) ? " · 本场评委" : ""}
                </small>
              </div>
              <div className="user-actions">
                <button className="text-button" onClick={() => setEditing(u)}>
                  编辑权限
                </button>
                <button
                  className="text-button muted"
                  onClick={() => setReset(u)}
                >
                  重置密码
                </button>
              </div>
            </div>
          ))}
      </div>
      <p className="form-note">
        <ShieldCheck size={15} />
        管理员不会自动获得评分资格；评分需要评委角色及本场名单资格。
      </p>
      {editing && (
        <MemberForm
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
            await refresh();
          }}
        />
      )}
      {reset && <PasswordForm user={reset} onClose={() => setReset(null)} />}
    </>
  );
}
function MemberForm({
  user,
  onClose,
  onSaved,
}: {
  user: User | "new";
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const existing = user === "new" ? null : user;
  const [name, setName] = useState(existing?.name || ""),
    [username, setUsername] = useState(existing?.username || ""),
    [password, setPassword] = useState(""),
    [roles, setRoles] = useState<Role[]>(existing?.roles || ["judge"]),
    [active, setActive] = useState(existing?.active ?? true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (existing)
        await api(
          `/admin/users/${existing.id}`,
          { name, roles, active },
          "PATCH",
        );
      else if (roles.length === 1 && roles[0] === "judge") await api("/admin/judges", {name});
      else await api("/admin/users", { name, username, password, roles });
      await onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={existing ? "编辑成员权限" : "添加成员"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="stack-form" onSubmit={(e) => void submit(e)}>
        {error && <Notice>{error}</Notice>}
        <label>
          显示姓名
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={60}
          />
        </label>
        {(!!existing || roles.includes("admin")) && <label>
          登录账号
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
            maxLength={40}
            pattern="[a-zA-Z0-9_.\-]+"
            disabled={!!existing}
            placeholder="英文、数字、下划线或短横线"
          />
        </label>}
        {!existing && roles.includes("admin") && (
          <label>
            初始密码
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={12}
              maxLength={128}
              placeholder="至少 12 位"
            />
          </label>
        )}
        <fieldset>
          <legend>角色权限</legend>
          {(["judge", "admin"] as Role[]).map((r) => (
            <label className="check-row" key={r}>
              <input
                type="checkbox"
                checked={roles.includes(r)}
                onChange={(e) =>
                  setRoles(
                    e.target.checked
                      ? [...roles, r]
                      : roles.filter((v) => v !== r),
                  )
                }
              />
              <span>
                <strong>{r === "judge" ? "评委" : "管理员"}</strong>
                <small>
                  {r === "judge"
                    ? "评分、查看自己的记录"
                    : "查看全部成绩、配置成员与赛事"}
                </small>
              </span>
            </label>
          ))}
        </fieldset>
        {existing && (
          <label className="check-row">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            账号启用
          </label>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="outline"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </button>
          <button className="primary" disabled={busy || !roles.length}>
            {busy ? "正在保存…" : "保存成员"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function PasswordForm({ user, onClose }: { user: User; onClose: () => void }) {
  const [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/admin/users/${user.id}/password`, { password });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`重置密码 · ${user.name}`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="stack-form" onSubmit={(e) => void submit(e)}>
        <p className="muted">重置后该成员需重新登录，已提交评分保留。</p>
        {error && <Notice>{error}</Notice>}
        <label>
          新密码
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className="primary" disabled={busy}>
          确认重置
        </button>
      </form>
    </Modal>
  );
}
function Settings({
  data,
  refresh,
}: {
  data: Results;
  refresh: () => Promise<void>;
}) {
  const [next, setNext] = useState<ContestStatus | null>(null),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [audits, setAudits] = useState<AuditEvent[]>([]),
    [more, setMore] = useState(false);
  const loadAudit = useCallback(async (before?: number) => {
    try {
      const a = await api<AuditEvent[]>(
        `/admin/audit${before ? `?before=${before}` : ""}`,
      );
      setAudits((prev) => (before ? [...prev, ...a] : a));
      setMore(a.length === 100);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);
  async function change(e: FormEvent) {
    e.preventDefault();
    if (!next) return;
    setBusy(true);
    try {
      await api("/admin/status", {
        status: next,
        reason,
        expectedRevision: data.contest.revision,
      });
      setNext(null);
      setReason("");
      setError("");
      await refresh();
      await loadAudit();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>赛事设置</h1>
          <p>统一控制评分时间，所有操作留下记录。</p>
        </div>
      </div>
      {error && !next && <Notice>{error}</Notice>}
      <section className="settings-panel">
        <div className="settings-title">
          <h2>2026 乖宝 AI 先锋赛</h2>
          <Status status={data.contest.status} />
        </div>
        <dl className="settings-facts">
          <div>
            <dt>参赛队伍</dt>
            <dd>12 支 · 按既定顺序</dd>
          </div>
          <div>
            <dt>综合评分</dt>
            <dd>0—10 分 · 每档 0.5 分</dd>
          </div>
          <div>
            <dt>汇总方式</dt>
            <dd>已提交评分等权平均</dd>
          </div>
          <div>
            <dt>本场评委</dt>
            <dd>
              {data.judges.length} 位
              {data.contest.status === "draft"
                ? " · 开始时固定名单"
                : " · 名单已固定"}
            </dd>
          </div>
        </dl>
        <p className="muted">
          {data.contest.status === "draft"
            ? "开始前请检查评委账号与角色。开始后固定本场评委名单。"
            : data.contest.status === "open"
              ? "评委可提交和修改自己的评分。结束后所有评分锁定。"
              : "评分已锁定。如需补齐或修正，请填写原因后重新开放。"}
        </p>
        <button
          className="primary"
          disabled={data.contest.status === "draft" && !data.judges.length}
          onClick={() => {
            setError("");
            setNext(data.contest.status === "open" ? "closed" : "open");
          }}
        >
          {data.contest.status === "draft" ? (
            "开始评分"
          ) : data.contest.status === "open" ? (
            "结束评分"
          ) : (
            <>
              <RotateCcw size={18} />
              重新开放评分
            </>
          )}
        </button>
      </section>
      <section className="settings-panel">
        <h2 className="section-heading">
          <Clock3 size={20} />
          操作记录
        </h2>
        <AuditList rows={audits} />
        {more && (
          <button
            className="outline"
            onClick={() => void loadAudit(audits[audits.length - 1].id)}
          >
            加载更早记录
          </button>
        )}
      </section>
      {next && (
        <Modal
          title={
            next === "closed"
              ? "结束本场评分"
              : data.contest.status === "closed"
                ? "重新开放评分"
                : "开始本场评分"
          }
          onClose={() => {
            if (!busy) setNext(null);
          }}
        >
          <form className="stack-form" onSubmit={(e) => void change(e)}>
            {error && <Notice>{error}</Notice>}
            <p>
              {next === "closed"
                ? `已提交 ${data.total} / ${data.expected} 份评分。结束后评委无法继续提交或修改。`
                : data.contest.status === "draft"
                  ? `将以当前 ${data.judges.length} 位启用中的评委固定本场名单。`
                  : "重新开放后，本场评委可以继续提交或修改评分。"}
            </p>
            {data.contest.status === "closed" && (
              <label>
                重新开放原因
                <textarea
                  required
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="例如：补齐缺评记录"
                />
              </label>
            )}
            <div className="modal-actions">
              <button
                className="outline"
                type="button"
                disabled={busy}
                onClick={() => setNext(null)}
              >
                取消
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "正在处理…" : "确认"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
