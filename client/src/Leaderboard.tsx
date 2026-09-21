import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, Maximize, Minimize, Trophy } from "lucide-react";
import type { Results } from "../../shared/types";

export function Leaderboard({
  data,
  error,
  onBack,
}: {
  data: Results;
  error: string;
  onBack: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const [full, setFull] = useState(false);
  const [fullError, setFullError] = useState("");
  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const complete = data.expected > 0 && data.total === data.expected;
  const final = complete && data.contest.status === "closed";
  const rows = [...data.rows].sort(
    (a, b) =>
      (a.rank ?? Infinity) - (b.rank ?? Infinity) ||
      a.team.order - b.team.order,
  );
  const received = data.rows.filter(
    (r) => r.count === data.judges.length && r.count > 0,
  ).length;
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await ref.current?.requestFullscreen();
      setFullError("");
    } catch {
      setFullError("当前浏览器不支持全屏，可直接使用此展示页。");
    }
  }
  return (
    <section className="leaderboard" ref={ref} aria-label="成绩展示大屏">
      <div className="board-toolbar">
        <button className="text-button" onClick={onBack}>
          <ArrowLeft size={17} />
          成绩与进度
        </button>
        <span className="board-breadcrumb">/ 实时榜单</span>
        <div className="board-actions">
          <a
            className="text-button"
            href="/api/admin/export?mode=summary"
            download
          >
            <Download size={17} />
            导出排名
          </a>
          <button
            className="text-button"
            onClick={() => void toggleFullscreen()}
          >
            {full ? <Minimize size={17} /> : <Maximize size={17} />}
            {full ? "退出全屏" : "全屏展示"}
          </button>
        </div>
      </div>
      <header className="board-heading">
        <div>
          <div className="board-eyebrow">GAMBOL · AI INNOVATION 2026</div>
          <h1>
            {final ? "决赛最终成绩" : "决赛实时榜单"}
            <span>{final ? "评分已结束" : "暂定排名"}</span>
          </h1>
          <p>{data.contest.title}</p>
        </div>
        <div className="board-stat">
          <strong key={data.total}>
            {received}
            <small> / {data.rows.length}</small>
          </strong>
          <span>队伍评分已收齐 · {data.judges.length} 位评委</span>
        </div>
      </header>
      <div
        className={`board-sync ${error ? "disconnected" : ""}`}
        role="status"
      >
        <span>
          <i />
          {error
            ? "同步中断 · 当前保留上次数据"
            : final
              ? "全部评分已收齐"
              : "每 2 秒自动同步"}
        </span>
        <span>
          {new Date(data.updatedAt).toLocaleTimeString("zh-CN", {
            hour12: false,
          })}{" "}
          更新 · {data.total}/{data.expected} 份评分
        </span>
      </div>
      {error && (
        <p className="board-warning" role="alert">
          {error}
        </p>
      )}
      {fullError && (
        <p className="board-warning" role="alert">
          {fullError}
        </p>
      )}
      {!final && (
        <p className="board-context">
          {data.contest.status === "draft"
            ? "等待开赛，暂未产生排名。"
            : complete
              ? "全部评分已收齐，管理员结束评分后确认为最终成绩。"
              : data.contest.status === "closed"
                ? "评分已结束，但仍有缺评；当前榜单为暂定排名。"
                : "评分进行中，按已提交分数计算平均分；收齐前排名可能变化。"}
        </p>
      )}
      <div className="leader-grid">
        {rows.map((r) => (
          <article
            key={r.team.id}
            className={`leader-card ${r.rank && r.rank <= 3 ? "leading" : ""}`}
          >
            <div
              className="leader-rank"
              aria-label={r.rank ? `第 ${r.rank} 名` : "未排名"}
            >
              {r.rank === 1 ? (
                <Trophy size={23} />
              ) : r.rank ? (
                String(r.rank).padStart(2, "0")
              ) : (
                "—"
              )}
              {r.rank === 1 && <small>01</small>}
            </div>
            <div className="leader-info">
              <span>
                第 {String(r.team.order).padStart(2, "0")} 组
                {r.rank &&
                rows.filter((other) => other.rank === r.rank).length > 1
                  ? " · 并列"
                  : ""}
              </span>
              <h2>{r.team.name}</h2>
              <div className="leader-meter" aria-hidden="true">
                <i style={{ width: `${(r.average ?? 0) * 10}%` }} />
              </div>
              <small>
                {r.count} / {data.judges.length} 位已评 ·{" "}
                {r.count > 0 && !r.missing.length ? "已收齐" : "待收齐"}
              </small>
            </div>
            <div className="leader-score">
              <strong key={r.average}>{r.average?.toFixed(2) ?? "—"}</strong>
              <span>平均分 / 10</span>
            </div>
          </article>
        ))}
      </div>
      <footer className="board-footer">
        <span>所有评委等权 · 不去最高最低分 · 0 分有效</span>
        <span>按未舍入均分排名 · 完全同分并列</span>
      </footer>
    </section>
  );
}
