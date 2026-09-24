import type { Results } from "../../shared/types";

export const awardTiers = [
  {
    key: "gold",
    label: "一等奖",
    quota: 1,
    start: 1,
    end: 1,
    range: "第 1 名",
    color: "#eee4cb",
  },
  {
    key: "silver",
    label: "二等奖",
    quota: 3,
    start: 2,
    end: 4,
    range: "第 2—4 名",
    color: "#e6ebe5",
  },
  {
    key: "bronze",
    label: "三等奖",
    quota: 8,
    start: 5,
    end: 12,
    range: "第 5—12 名",
    color: "#efe3d9",
  },
] as const;

/** The live board and image use the same snapshot and award-boundary rules. */
export function leaderboardModel(data: Results) {
  const rows = [...data.rows].sort(
    (a, b) =>
      (a.rank ?? Infinity) - (b.rank ?? Infinity) ||
      a.team.order - b.team.order,
  );
  const complete = data.expected > 0 && data.total === data.expected;
  const final = complete && data.contest.status === "closed";
  const tied = (rank: number | null) =>
    rank !== null && rows.filter((r) => r.rank === rank).length > 1;
  const awardFor = (rank: number | null) => {
    if (rank === null) return undefined;
    // All members of a tie stay together. Never break a tie using team order.
    const last = rank + rows.filter((r) => r.rank === rank).length - 1;
    return awardTiers.find((tier) => rank >= tier.start && last <= tier.end);
  };
  const groups = awardTiers.map((tier) => ({
    ...tier,
    rows: rows.filter((r) => awardFor(r.rank)?.key === tier.key),
  }));
  const pending = rows.filter((r) => r.rank !== null && !awardFor(r.rank));
  const unranked = rows.filter((r) => r.rank === null);
  const awardStatus = !final
    ? "暂定奖项"
    : pending.length
      ? "奖项待确认"
      : "获奖结果";
  return {
    rows,
    groups,
    pending,
    unranked,
    awardFor,
    awardStatus,
    podium: rows.filter((r) => r.rank !== null && r.rank <= 3),
    final,
    complete,
    status: final ? "最终成绩" : "暂定排名",
    received: rows.filter((r) => r.count > 0 && r.count === data.judges.length)
      .length,
    tied,
  };
}
