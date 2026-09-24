import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  Maximize,
  Minimize,
  Trophy,
  ImageDown,
} from "lucide-react";
import type { Results, ResultRow } from "../../shared/types";
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
  const {
    rows,
    groups,
    pending,
    unranked,
    awardStatus,
    complete,
    final,
    received,
    tied,
  } = leaderboardModel(data);
  function teamCard(r: ResultRow) {
    return (
      <article className="award-team" key={r.team.id}>
        <div className="award-team-meta">
          <span>
            {r.rank === null
              ? "未排名"
              : `${tied(r.rank) ? "并列 " : ""}第 ${r.rank} 名`}
          </span>
          <span>第 {String(r.team.order).padStart(2, "0")} 组</span>
        </div>
        <h3 className="team-name">{r.team.name}</h3>
        <div className="award-team-bottom">
          <span>
            {r.count}/{data.judges.length} 位已评 ·{" "}
            {r.count > 0 && !r.missing.length ? "已收齐" : "待收齐"}
          </span>
          <strong>
            {r.average?.toFixed(2) ?? "—"}
            <small> / 10</small>
          </strong>
        </div>
      </article>
    );
  }
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
      <div className="award-summary" aria-label="奖项设置">
        <div>
          <span>决赛奖项</span>
          <strong>1 + 3 + 8</strong>
        </div>
        <p>一等奖 1 席 · 二等奖 3 席 · 三等奖 8 席</p>
        <span className="award-status">{awardStatus}</span>
      </div>
      {pending.length > 0 && (
        <p className="board-warning" role="status">
          有队伍同分跨越奖项边界或超出奖项名额，已单列为“奖项待确认”。同分不按出场顺序拆分。
        </p>
      )}
      <div className="award-sections">
        {groups.map((group) => (
          <section
            className={`award-section award-${group.key}`}
            key={group.key}
            aria-label={group.label}
          >
            <header className="award-heading">
              <div className="award-heading-name">
                <Trophy size={24} />
                <h2>{group.label}</h2>
                <span>{group.quota} 席</span>
              </div>
              <span>
                {group.range} · {final ? "最终成绩分组" : "暂定候选"}
              </span>
            </header>
            {group.rows.length ? (
              <div className="award-team-grid">{group.rows.map(teamCard)}</div>
            ) : (
              <p className="award-vacant">
                {pending.length
                  ? "该奖项暂无明确归属，请核对待确认队伍。"
                  : "等待评分产生候选队伍"}
              </p>
            )}
          </section>
        ))}
      </div>
      {pending.length > 0 && (
        <section
          className="award-section award-pending"
          aria-label="奖项待确认"
        >
          <header className="award-heading">
            <div className="award-heading-name">
              <h2>奖项待确认</h2>
              <span>{pending.length} 队</span>
            </div>
            <span>保留并列名次，待确定评奖处理方式</span>
          </header>
          <div className="award-team-grid">{pending.map(teamCard)}</div>
        </section>
      )}
      {unranked.length > 0 && (
        <section className="award-section award-unranked" aria-label="等待评分">
          <header className="award-heading">
            <div className="award-heading-name">
              <h2>等待评分</h2>
              <span>{unranked.length} 队</span>
            </div>
            <span>尚无成绩，不预分配奖项</span>
          </header>
          <div className="award-team-grid">{unranked.map(teamCard)}</div>
        </section>
      )}
      <footer className="board-footer">
        <span>所有评委等权 · 不去最高最低分 · 0 分有效</span>
        <span>按未舍入均分排名 · 完全同分并列</span>
      </footer>
    </section>
  );
}
