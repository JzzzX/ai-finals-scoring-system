import type { Results } from "../../shared/types";
import { leaderboardModel } from "./leaderboard-model";

export async function exportLeaderboardPng(
  data: Results,
  disconnected: boolean,
) {
  // Freeze at click time: polling must not mix scores from different revisions.
  const snapshot: Results = structuredClone(data);
  const model = leaderboardModel(snapshot);
  await document.fonts.ready;
  const sections = [
    ...model.groups.map((g) => ({
      label: `${g.label} · ${g.quota} 席 · ${g.range}`,
      color: g.color as string,
      rows: g.rows,
    })),
    ...(model.pending.length
      ? [
          {
            label: "奖项待确认 · 同分跨界或超出名额，不自动拆分",
            color: "#f1e5d0",
            rows: model.pending,
          },
        ]
      : []),
    ...(model.unranked.length
      ? [
          {
            label: "等待评分 · 不预分配奖项",
            color: "#ffffff",
            rows: model.unranked,
          },
        ]
      : []),
  ];
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height =
    510 +
    sections.reduce(
      (n, section) => n + 70 + Math.max(1, section.rows.length) * 112,
      0,
    ) +
    180;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("当前浏览器无法生成图片，请使用 CSV 导出。");
  const family = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-ui")
    .trim();
  const text = (
    value: string,
    x: number,
    y: number,
    size = 28,
    color = "#304c43",
    align: CanvasTextAlign = "left",
  ) => {
    ctx.font = `400 ${size}px ${family}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  };
  ctx.fillStyle = "#f7f6f2";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  try {
    const logo = new Image();
    logo.src = "/branding/brand-lockup.png";
    await logo.decode();
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(logo, 80, 50, 401, 64);
    ctx.globalCompositeOperation = "source-over";
  } catch {
    text("GAMBOL · AI INNOVATION", 80, 90, 28);
  }
  text("2026 乖宝 AI 先锋赛", 1520, 92, 26, "#64715f", "right");
  text(model.final ? "决赛最终成绩" : "决赛实时榜单", 80, 215, 66);
  text(model.awardStatus, 1520, 212, 36, "#8b6933", "right");
  text(
    `${snapshot.total} / ${snapshot.expected} 份评分已提交   ·   ${model.received} / ${model.rows.length} 队评分已收齐`,
    80,
    284,
    28,
  );
  text(
    `数据时间：${new Date(snapshot.updatedAt).toLocaleString("zh-CN", { hour12: false })}`,
    80,
    329,
    25,
    "#64715f",
  );
  text(
    disconnected
      ? "同步中断：本图为上次成功同步的数据，非最新实时结果。"
      : model.final
        ? "全部评分已收齐，评分已结束。"
        : "暂定排名：按已提交评分计算，缺评或后续改分可能改变名次。",
    80,
    378,
    25,
    disconnected ? "#a24f30" : "#78664a",
  );
  text(
    "奖项设置：一等奖 1 席 · 二等奖 3 席 · 三等奖 8 席",
    80,
    444,
    28,
    "#78664a",
  );
  let cursor = 500;
  sections.forEach((section) => {
    text(section.label, 80, cursor + 34, 30);
    cursor += 70;
    if (!section.rows.length) {
      text(
        model.pending.length
          ? "暂无明确归属，请核对待确认队伍。"
          : "等待评分产生候选队伍",
        100,
        cursor + 58,
        26,
        "#64715f",
      );
      cursor += 112;
    }
    section.rows.forEach((row) => {
      const y = cursor;
      ctx.fillStyle = section.color;
      ctx.beginPath();
      ctx.roundRect(80, y, 1440, 100, 12);
      ctx.fill();
      text(
        row.rank === null ? "—" : String(row.rank).padStart(2, "0"),
        142,
        y + 58,
        42,
        "#7a5a29",
        "center",
      );
      if (model.tied(row.rank))
        text("并列", 142, y + 84, 18, "#78664a", "center");
      const prefix = `第 ${String(row.team.order).padStart(2, "0")} 组 · ${model.tied(row.rank) ? "并列" : ""}${row.rank === null ? "未排名" : `第 ${row.rank} 名`}`;
      text(prefix, 250, y + 28, 20, "#64715f");
      // Scale unusually long team names to fit instead of clipping the exported result.
      let size = 30;
      ctx.font = `400 ${size}px ${family}`;
      while (ctx.measureText(row.team.name).width > 820 && size > 18) {
        size--;
        ctx.font = `400 ${size}px ${family}`;
      }
      text(row.team.name, 250, y + 69, size);
      text(
        `${row.count} / ${snapshot.judges.length} 位已评`,
        1200,
        y + 59,
        23,
        "#64715f",
        "center",
      );
      text(
        row.average === null ? "—" : row.average.toFixed(2),
        1490,
        y + 62,
        44,
        "#304c43",
        "right",
      );
      cursor += 112;
    });
  });
  const bottom = cursor;
  text(
    "所有评委等权 · 不去最高最低分 · 0 分计入 · 未评分不计入",
    80,
    bottom + 40,
    24,
    "#64715f",
  );
  text(
    model.pending.length
      ? "同分跨奖项边界或超出名额的队伍，奖项待确认。"
      : "按未舍入均分排名 · 完全同分并列 · 未评分队伍不排名",
    80,
    bottom + 82,
    24,
    "#64715f",
  );
  text("GAMBOL · AI INNOVATION 2026", 80, bottom + 128, 20, "#64715f");
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("图片生成失败，请重试。"))),
      "image/png",
    ),
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `乖宝AI先锋赛-${model.awardStatus}-${snapshot.updatedAt.replace(/[:.]/g, "-")}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
