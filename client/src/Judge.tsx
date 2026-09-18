import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  List,
  WifiOff,
} from "lucide-react";
import type {
  Criterion,
  Score,
  SessionInfo,
  Team,
  Workspace,
} from "../../shared/types";
import { api, ApiError, errorMessage } from "./api";
import { Modal, Notice, Status } from "./ui";

export function Judge({ session }: { session: SessionInfo }) {
  const [data, setData] = useState<Workspace | null>(null),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(""),
    [filter, setFilter] = useState("全部"),
    [drawer, setDrawer] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const refreshing = useRef(false);
  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const d = await api<Workspace>("/workspace");
      setData(d);
      setError("");
      setSelected(
        (previous) =>
          previous ||
          d.teams.find((t) => !d.scores.some((s) => s.teamId === t.id))?.id ||
          d.teams[0]?.id ||
          "",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      refreshing.current = false;
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    const resume = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [refresh]);
  const completed = data?.scores.length || 0;
  if (!data)
    return (
      <main className="recovery">
        {error ? (
          <>
            <Notice>{error}</Notice>
            <button className="outline" onClick={() => void refresh()}>
              重新加载
            </button>
          </>
        ) : (
          <p role="status">正在加载参赛队伍…</p>
        )}
      </main>
    );
  const team = data.teams.find((t) => t.id === selected);
  const queue = (
    <>
      <div className="queue-heading">
        <h2>参赛队伍</h2>
        <p className="muted">
          已提交 <b>{completed}</b> / {data.teams.length}
        </p>
        <progress value={completed} max={data.teams.length} />
      </div>
      <div className="tabs queue-tabs">
        {["全部", "待评分", "已评分"].map((f) => (
          <button
            key={f}
            className={filter === f ? "active" : ""}
            onClick={() => setFilter(f)}
          >
            {f}
            <span>
              {" "}
              (
              {f === "全部"
                ? data.teams.length
                : f === "已评分"
                  ? completed
                  : data.teams.length - completed}
              )
            </span>
          </button>
        ))}
      </div>
      <div className="queue-items">
        {data.teams
          .filter(
            (t) =>
              filter === "全部" ||
              (filter === "已评分"
                ? data.scores.some((s) => s.teamId === t.id)
                : !data.scores.some((s) => s.teamId === t.id)),
          )
          .map((t) => {
            const score = data.scores.find((s) => s.teamId === t.id);
            return (
              <button
                disabled={busy}
                key={t.id}
                className={`queue-item ${t.id === selected ? "selected" : ""}`}
                aria-current={t.id === selected ? "true" : undefined}
                onClick={() => {
                  setSelected(t.id);
                  setDrawer(false);
                  setMessage("");
                  window.scrollTo({ top: 0 });
                }}
              >
                <span className="queue-no">
                  {String(t.order).padStart(2, "0")}
                </span>
                <span className="queue-name">{t.name}</span>
                <span className="queue-score">
                  {score ? (
                    <>
                      <Check size={12} />
                      <b>{score.score.toFixed(1)}</b>
                    </>
                  ) : (
                    <small>待评分</small>
                  )}
                </span>
              </button>
            );
          })}
      </div>
    </>
  );
  async function submitted(score: Score) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            scores: [
              ...prev.scores.filter((s) => s.teamId !== score.teamId),
              score,
            ],
          }
        : prev,
    );
    const next =
      data!.teams.find(
        (t) =>
          t.order > (team?.order || 0) &&
          !data!.scores.some((s) => s.teamId === t.id),
      ) ||
      data!.teams.find(
        (t) =>
          t.id !== score.teamId && !data!.scores.some((s) => s.teamId === t.id),
      );
    setMessage(
      `${team?.name} · ${score.score.toFixed(1)} 分已提交${next ? "" : "，所有队伍已完成评分。"}`,
    );
    if (next) {
      setSelected(next.id);
      window.scrollTo({ top: 0 });
    }
    await refresh();
  }
  return (
    <div className="judge-shell">
      <aside className="judge-sidebar">{queue}</aside>
      <div className="judge-main">
        <div className="mobile-progress">
          <progress value={completed} max={data.teams.length} />
          <div>
            <span>
              已提交 <b>{completed}</b> / {data.teams.length}
            </span>
            <button
              className="outline"
              disabled={busy}
              onClick={() => setDrawer(true)}
            >
              <List size={18} />
              切换队伍
            </button>
          </div>
        </div>
        {error && <Notice>{error} 已保留上次加载内容。</Notice>}
        {message && <Notice success>{message}</Notice>}
        {team && (
          <ScoreSheet
            key={`${session.user.id}:${team.id}`}
            data={data}
            team={team}
            userId={session.user.id}
            onSubmit={submitted}
            onBusy={setBusy}
          />
        )}
      </div>
      {drawer && (
        <Modal title="参赛队伍" onClose={() => setDrawer(false)}>
          <div className="drawer-queue">{queue}</div>
        </Modal>
      )}
    </div>
  );
}
type Draft = {
  value: string;
  comment: string;
  version: number;
  requestId?: string;
};
function ScoreSheet({
  data,
  team,
  userId,
  onSubmit,
  onBusy,
}: {
  data: Workspace;
  team: Team;
  userId: string;
  onSubmit: (score: Score) => Promise<void>;
  onBusy: (v: boolean) => void;
}) {
  const saved = data.scores.find((s) => s.teamId === team.id);
  const key = `finals:v1:${data.contest.id}:${userId}:${team.id}`;
  const original = (): Draft => ({
    value: saved ? String(saved.score) : "",
    comment: saved?.comment || "",
    version: saved?.version || 0,
  });
  const [storageError, setStorageError] = useState("");
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const d = JSON.parse(raw);
        if (
          typeof d.value === "string" &&
          typeof d.comment === "string" &&
          Number.isInteger(d.version)
        )
          return d;
      }
    } catch {}
    return original();
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [offline, setOffline] = useState(!navigator.onLine),
    [members, setMembers] = useState(false),
    [criteriaOpen, setCriteriaOpen] = useState(
      () => window.matchMedia("(min-width: 900px)").matches,
    ),
    [criterion, setCriterion] = useState<Criterion | null>(null),
    [confirm, setConfirm] = useState(false);
  const submitLock = useRef(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const conflict = draft.version !== (saved?.version || 0);
  const valid =
    draft.value.trim() !== "" &&
    Number.isFinite(Number(draft.value)) &&
    Number(draft.value) >= 0 &&
    Number(draft.value) <= 10 &&
    Number.isInteger(Number(draft.value) * 2);
  const changed =
    draft.value !== String(saved?.score ?? "") ||
    draft.comment !== (saved?.comment || "");
  const enabled = data.contest.status === "open" && data.eligible && !busy;
  function persist(next: Draft) {
    setDraft(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setStorageError("");
    } catch {
      setStorageError("本机存储不可用，请保持页面打开并提交。");
    }
  }
  function update(values: Partial<Draft>) {
    if (!enabled || submitLock.current) return;
    persist({ ...draft, ...values, requestId: undefined });
    setError("");
  }
  async function submit() {
    if (!enabled || !valid || offline || conflict || submitLock.current) return;
    submitLock.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    setConfirm(false);
    const requestId = draft.requestId || crypto.randomUUID();
    persist({ ...draft, requestId });
    try {
      const score = await api<Score>(`/my-scores/${team.id}`, {
        score: Number(draft.value),
        comment: draft.comment,
        expectedVersion: draft.version,
        requestId,
      });
      try {
        localStorage.removeItem(key);
      } catch {}
      setDraft({
        value: String(score.score),
        comment: score.comment,
        version: score.version,
      });
      await onSubmit(score);
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && e.status === 409) {
        /* refreshed workspace supplies the conflict; draft remains intact */
      }
    } finally {
      submitLock.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  const hint = busy
    ? "正在提交，请稍候…"
    : storageError
      ? "草稿尚未保存到本机，请保持页面打开"
      : saved && !changed && !conflict
        ? "已提交，可在截止前修改"
        : draft.value === ""
          ? "尚未选择分数"
          : "草稿已保存在本机，尚未提交";
  return (
    <article className="score-sheet">
      <section className="team-heading">
        <div className="team-meta">
          <span>
            第 {String(team.order).padStart(2, "0")} 组{" "}
            <span className="desktop-only">/ 共 {data.teams.length} 组</span>
          </span>
          <Status status={data.contest.status} />
        </div>
        <h1>{team.name}</h1>
        <div className="team-byline">
          <span>{team.members.map((m) => m.name).join("、")}</span>
          <button className="text-button" onClick={() => setMembers(true)}>
            查看成员与部门
            <ChevronRight size={16} />
          </button>
        </div>
      </section>
      <section className={`criteria-section ${criteriaOpen ? "expanded" : ""}`}>
        <button
          className="criteria-toggle"
          onClick={() => setCriteriaOpen(!criteriaOpen)}
          aria-expanded={criteriaOpen}
        >
          <h2>
            评分参考<span className="mobile-only"> · 六项综合判断</span>
          </h2>
          <ChevronDown size={20} />
        </button>
        {criteriaOpen && (
          <div className="criteria-table">
            {data.criteria.map((c, i) => (
              <button
                className="criterion-row"
                key={c.name}
                onClick={() => setCriterion(c)}
              >
                <span className="criterion-label">
                  <i>{i + 1}</i>
                  <strong>{c.name}</strong>
                  <span>{c.weight}%</span>
                </span>
                <span className="criterion-question">{c.question}</span>
                <span className="criterion-link">
                  查看详细标准
                  <ChevronRight size={14} />
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
      <section className="score-section">
        <div className="score-label">
          <div>
            <h2>综合评分</h2>
            <p className="muted">0—10 分，每档 0.5 分</p>
          </div>
          <label className="score-input-wrap">
            <span className="sr-only">综合评分输入</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              max="10"
              step="0.5"
              value={draft.value}
              disabled={!enabled}
              placeholder="—"
              onChange={(e) => update({ value: e.target.value })}
              aria-describedby="score-help"
            />
            <span>/ 10</span>
          </label>
        </div>
        <div className={`slider-wrap ${draft.value === "" ? "unset" : ""}`}>
          <label className="sr-only" htmlFor={`slider-${team.id}`}>
            综合评分滑块
          </label>
          <input
            id={`slider-${team.id}`}
            aria-valuetext={
              draft.value === "" ? "尚未评分" : `${draft.value} 分`
            }
            type="range"
            min="0"
            max="10"
            step="0.5"
            value={valid ? Number(draft.value) : 0}
            disabled={!enabled}
            onChange={(e) => update({ value: e.target.value })}
            onPointerUp={(e) => update({ value: e.currentTarget.value })}
            onKeyUp={(e) => {
              if (
                [
                  "ArrowLeft",
                  "ArrowRight",
                  "ArrowUp",
                  "ArrowDown",
                  "Home",
                  "End",
                ].includes(e.key)
              )
                update({ value: e.currentTarget.value });
            }}
            style={
              {
                "--fill": `${valid ? Number(draft.value) * 10 : 0}%`,
              } as CSSProperties
            }
          />
          <div className="slider-ticks">
            <span>0</span>
            <span>5</span>
            <span>10</span>
          </div>
        </div>
        <p
          id="score-help"
          className={`score-help ${draft.value !== "" && !valid ? "invalid" : ""}`}
        >
          {draft.value === ""
            ? "拖动滑块或直接输入分数，0 分也是有效评分。"
            : !valid
              ? "请输入 0—10 之间的分数，以 0.5 分为间隔。"
              : "综合六项表现，依据已实现的成果判断。"}
        </p>
        <label className="comment-label">
          评语与依据 <span className="muted">（选填）</span>
          <textarea
            value={draft.comment}
            disabled={!enabled}
            maxLength={500}
            onChange={(e) => update({ comment: e.target.value })}
            placeholder="写下你的评价与评分依据…"
          />
          <span className="char-count">{draft.comment.length} / 500</span>
        </label>
        <p className="draft-hint" role="status">
          {hint}
        </p>
        {data.contest.status !== "open" && (
          <Notice>
            {data.contest.status === "draft"
              ? "管理员尚未开始评分，可以先查看队伍与评分标准。"
              : "本场评分已结束，已提交的记录可以继续查看。"}
          </Notice>
        )}
        {data.contest.status === "open" && !data.eligible && (
          <Notice>你不在本场固定评委名单中，请联系管理员。</Notice>
        )}
        {offline && (
          <Notice>
            <WifiOff size={16} /> 网络已断开，可以继续填写草稿，联网后再提交。
          </Notice>
        )}
        {storageError && <Notice>{storageError}</Notice>}
        {error && <Notice>{error}</Notice>}
        {conflict && (
          <Notice>
            <span>
              服务端有更新的评分（{saved?.score ?? "未评分"}{" "}
              分）。本机草稿已保留，请核对后选择。
            </span>
            <div className="conflict-actions">
              <button
                className="outline"
                onClick={() => {
                  persist(original());
                  setError("");
                }}
              >
                使用最新记录
              </button>
              <button
                className="outline"
                onClick={() => {
                  persist({
                    ...draft,
                    version: saved?.version || 0,
                    requestId: undefined,
                  });
                  setError("");
                }}
              >
                保留草稿，继续核对
              </button>
            </div>
          </Notice>
        )}
      </section>
      <div className="submit-bar">
        <div className="submit-score">
          <span className="mobile-only small">本组评分</span>
          <b>{valid ? Number(draft.value).toFixed(1) : "—"}</b>
          <span>/ 10</span>
        </div>
        <p className="desktop-only">{hint}</p>
        <button
          className="primary"
          disabled={!enabled || !valid || offline || conflict}
          onClick={() => (saved && changed ? setConfirm(true) : void submit())}
        >
          {busy ? (
            "正在提交…"
          ) : saved ? (
            "更新评分"
          ) : (
            <>
              <span className="desktop-only">提交并进入下一队</span>
              <span className="mobile-only">提交评分</span>
            </>
          )}
          <ArrowRight size={20} />
        </button>
      </div>
      {members && (
        <Modal title="团队成员" onClose={() => setMembers(false)}>
          <h3>{team.name}</h3>
          <img
            className="team-photo"
            src={team.photo}
            alt={`${team.name}团队合照`}
          />
          <ul className="member-list">
            {team.members.map((m, i) => (
              <li key={i}>
                <strong>{m.name}</strong>
                <span>{m.department}</span>
              </li>
            ))}
          </ul>
        </Modal>
      )}
      {criterion && (
        <Modal
          title={`${criterion.name} · ${criterion.weight}%`}
          onClose={() => setCriterion(null)}
        >
          <p className="criterion-intro">{criterion.question}</p>
          <div className="bands">
            {criterion.bands.map((b) => (
              <div key={b.range}>
                <strong>{b.range}</strong>
                <p>{b.text}</p>
              </div>
            ))}
          </div>
          {criterion.guidance.map((g, i) => (
            <p className="guidance" key={i}>
              {g}
            </p>
          ))}
        </Modal>
      )}
      {confirm && (
        <Modal title="确认更新评分" onClose={() => setConfirm(false)}>
          <p>{team.name}</p>
          <p className="confirm-score">
            {saved?.score.toFixed(1)} <ArrowRight />{" "}
            {Number(draft.value).toFixed(1)} 分
          </p>
          <p className="muted">更新后保留改分记录。</p>
          <div className="modal-actions">
            <button className="outline" onClick={() => setConfirm(false)}>
              继续核对
            </button>
            <button className="primary" onClick={() => void submit()}>
              确认更新
            </button>
          </div>
        </Modal>
      )}
    </article>
  );
}
