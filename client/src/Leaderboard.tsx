import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  Maximize,
  Minimize,
  Trophy,
  ImageDown,
} from "lucide-react";
import type { Results } from "../../shared/types";
import { leaderboardModel } from "./leaderboard-model";
import { exportLeaderboardPng } from "./leaderboard-export";

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
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const { rows, podium, complete, final, received, tied } =
    leaderboardModel(data);
  async function exportImage() {
    setExporting(true);
    setExportMessage("");
    try {
      await exportLeaderboardPng(data, Boolean(error));
      setExportMessage("榜单图片已生成，包含当前评分进度与数据时间。");
    } catch (e) {
      setExportMessage(
        e instanceof Error ? e.message : "图片生成失败，请重试。",
      );
    } finally {
      setExporting(false);
    }
  }
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
          <button
            className="text-button"
            disabled={exporting}
            onClick={() => void exportImage()}
          >
            <ImageDown size={17} />
            {exporting ? "正在生成…" : "导出榜单图片"}
          </button>
          <a
            className="text-button"
            href="/api/admin/export?mode=summary"
            download
          >
            <Download size={17} />
            导出 CSV
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
      {exportMessage && (
        <p className="board-export-message" role="status">
          {exportMessage}
        </p>
      )}
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
      {podium.length > 0 ? (
        <section className="podium-section" aria-label="当前前三名">
          <div className="ranking-section-title">
            <h2>{final ? "荣誉榜" : "当前领先"}</h2>
            <span>{final ? "决赛成绩" : "暂定名次 · 以最终结果为准"}</span>
          </div>
          <div className="podium-grid">
            {podium.map((r) => (
              <article
                key={r.team.id}
                className={`podium-card place-${r.rank}`}
              >
                <div className="podium-rank">
                  <Trophy size={22} />
                  <span>
                    第 {r.rank} 名{tied(r.rank) ? " · 并列" : ""}
                  </span>
                </div>
                <h2 className="team-name">{r.team.name}</h2>
                <p>
                  第 {String(r.team.order).padStart(2, "0")} 组 · {r.count}/
                  {data.judges.length} 位已评
                </p>
                <strong className="podium-score">
                  {r.average?.toFixed(2)}
                  <small> / 10</small>
                </strong>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <div className="ranking-empty">
          <Trophy size={26} />
          <div>
            <h2>等待首份评分</h2>
            <p>评分提交后，名次与领先队伍将在这里自动更新。</p>
          </div>
        </div>
      )}
      <div className="ranking-section-title">
        <h2>完整排名</h2>
        <span>
          {rows.length} 支队伍 · {final ? "最终成绩" : "实时更新"}
        </span>
      </div>
      <div className="leader-grid">
        {rows.map((r) => (
          <article
            key={r.team.id}
            className={`leader-card ${r.rank && r.rank <= 3 ? `leading place-${r.rank}` : ""}`}
          >
            <div
              className="leader-rank"
              aria-label={r.rank ? `第 ${r.rank} 名` : "未排名"}
            >
              <strong>
                {r.rank === null ? "—" : String(r.rank).padStart(2, "0")}
              </strong>
              <small>
                {r.rank === null ? "未排名" : tied(r.rank) ? "并列" : "名次"}
              </small>
            </div>
            <div className="leader-info">
              <span>
                第 {String(r.team.order).padStart(2, "0")} 组
                {r.rank &&
                rows.filter((other) => other.rank === r.rank).length > 1
                  ? " · 并列"
                  : ""}
              </span>
              <h2 className="team-name">{r.team.name}</h2>
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
