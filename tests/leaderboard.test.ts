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
