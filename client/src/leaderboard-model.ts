import type { Results } from "../../shared/types";

/** One immutable snapshot drives both the live board and its exported image. */
export function leaderboardModel(data: Results) {
  const rows = [...data.rows].sort(
    (a, b) =>
      (a.rank ?? Infinity) - (b.rank ?? Infinity) ||
      a.team.order - b.team.order,
  );
  const complete = data.expected > 0 && data.total === data.expected;
  const final = complete && data.contest.status === "closed";
  return {
    rows,
    podium: rows.filter((r) => r.rank !== null && r.rank <= 3),
    final,
    complete,
    status: final ? "最终成绩" : "暂定排名",
    received: rows.filter((r) => r.count > 0 && r.count === data.judges.length)
      .length,
    tied: (rank: number | null) =>
      rank !== null && rows.filter((r) => r.rank === rank).length > 1,
  };
}
