import test from "node:test";
import assert from "node:assert/strict";
import type { Results, ResultRow } from "../shared/types";
import { leaderboardModel } from "../client/src/leaderboard-model";
const row = (
  order: number,
  rank: number | null,
  average: number | null,
): ResultRow => ({
  team: {
    id: String(order),
    order,
    name: `队伍${order}`,
    photo: "",
    members: [],
  },
  rank,
  average,
  count: average === null ? 0 : 1,
  sumUnits: 0,
  scores: {},
  missing: [],
});
const result = (
  rows: ResultRow[],
  status: "open" | "closed" = "open",
): Results => ({
  contest: {
    id: "test",
    title: "测试",
    status,
    roster: ["judge"],
    revision: 0,
  },
  judges: [{ id: "judge", name: "评委", active: true }],
  rows,
  total: rows.filter((r) => r.count).length,
  expected: rows.length,
  updatedAt: "2026-09-23T11:00:00Z",
});
test("未评分不出现在前三名，0 分仍参与排名", () => {
  const data = result([row(1, null, null), row(2, 1, 0)]);
  const model = leaderboardModel(data);
  assert.deepEqual(
    model.rows.map((r) => r.team.order),
    [2, 1],
  );
  assert.equal(model.podium.length, 1);
  assert.equal(model.podium[0].average, 0);
  assert.equal(model.final, false);
  assert.equal(data.rows[0].team.order, 1);
});
test("并列名次完整展示，不把前三个数组元素误作前三名", () => {
  const model = leaderboardModel(
    result([
      row(4, 3, 8),
      row(3, 3, 8),
      row(2, 1, 9),
      row(1, 1, 9),
      row(5, 5, 7),
    ]),
  );
  assert.deepEqual(
    model.podium.map((r) => r.team.order),
    [1, 2, 3, 4],
  );
  assert.equal(model.tied(1), true);
  assert.equal(model.tied(null), false);
});
test("只有收齐且结束评分才标最终成绩，空赛事不能标最终", () => {
  assert.equal(leaderboardModel(result([row(1, 1, 8)], "closed")).final, true);
  assert.equal(
    leaderboardModel(result([row(1, null, null)], "closed")).final,
    false,
  );
  assert.equal(leaderboardModel(result([], "closed")).final, false);
});

test("12 支队伍按 1+3+8 分组，页面与导出共享规则", () => {
  const model = leaderboardModel(
    result(
      Array.from({ length: 12 }, (_, i) => row(i + 1, i + 1, 10 - i / 2)),
      "closed",
    ),
  );
  assert.deepEqual(
    model.groups.map((g) => g.rows.length),
    [1, 3, 8],
  );
  assert.deepEqual(
    model.groups[1].rows.map((r) => r.rank),
    [2, 3, 4],
  );
  assert.equal(model.pending.length, 0);
  assert.equal(model.awardStatus, "获奖结果");
});
test("同分跨一二等奖或二三等奖边界时整组待确认，不按队伍序号拆分", () => {
  for (const ranks of [
    [1, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    [1, 2, 3, 4, 4, 6, 7, 8, 9, 10, 11, 12],
  ]) {
    const model = leaderboardModel(
      result(
        ranks.map((rank, i) => row(i + 1, rank, 10 - rank / 2)),
        "closed",
      ),
    );
    assert.equal(model.pending.length, 2);
    assert.equal(model.awardStatus, "奖项待确认");
    assert.equal(model.groups.flatMap((g) => g.rows).length, 10);
    assert.equal(new Set(model.pending.map((r) => r.rank)).size, 1);
  }
});
test("同奖项内并列仍留在同奖项，空榜与未收齐不确认获奖", () => {
  const model = leaderboardModel(
    result([
      row(1, 1, 10),
      row(2, 2, 9),
      row(3, 2, 9),
      row(4, 4, 8),
      row(5, null, null),
    ]),
  );
  assert.deepEqual(
    model.groups.map((g) => g.rows.length),
    [1, 3, 0],
  );
  assert.equal(model.pending.length, 0);
  assert.equal(model.unranked.length, 1);
  assert.equal(model.awardStatus, "暂定奖项");
  const empty = leaderboardModel(result([row(1, null, null)]));
  assert.deepEqual(
    empty.groups.map((g) => g.rows.length),
    [0, 0, 0],
  );
});
