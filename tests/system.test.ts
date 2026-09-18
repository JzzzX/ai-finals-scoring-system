import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import request from "supertest";
import { Store } from "../server/database";
import { FinalsService } from "../server/service";
import { createApp } from "../server/app";
import type { SubmitScore } from "../shared/types";
const password = "Test-only-password-48!";
const submission = (score: number, version = 0): SubmitScore => ({
  score,
  comment: "",
  expectedVersion: version,
  requestId: randomUUID(),
});
async function setup(path = ":memory:") {
  const store = new Store(path),
    service = new FinalsService(store);
  const admin = await service.createUser({
    username: "admin",
    name: "管理员",
    password,
    roles: ["admin"],
  });
  const judge = await service.createUser(
    { username: "judge1", name: "评委一", password, roles: ["judge"] },
    admin.id,
  );
  const judge2 = await service.createUser(
    { username: "judge2", name: "评委二", password, roles: ["judge"] },
    admin.id,
  );
  return { store, service, admin, judge, judge2 };
}
test("来源队伍、半分边界、0 分、幂等、改分冲突、平均与并列、封盘与留痕", async () => {
  const { store, service: s, admin, judge, judge2 } = await setup();
  try {
    assert.equal(s.teams().length, 12);
    assert.equal(s.teams()[11].name, "管理者AI实战陪练平台");
    assert.equal(
      s.teams().reduce((n, t) => n + t.members.length, 0),
      44,
    );
    assert.throws(() => s.submit(judge.id, "team-01", submission(5)), /未开放/);
    s.setStatus(admin.id, { status: "open", expectedRevision: 0 });
    const zero = submission(0);
    const scored = s.submit(judge.id, "team-01", zero);
    assert.equal(scored.score, 0);
    assert.equal(s.results(admin.id).rows[0].count, 1);
    assert.equal(s.results(admin.id).rows[0].average, 0);
    assert.deepEqual(s.submit(judge.id, "team-01", zero), scored);
    assert.throws(
      () => s.submit(judge.id, "team-01", { ...zero, score: 1 }),
      /标识/,
    );
    assert.throws(
      () => s.submit(judge.id, "team-01", submission(9)),
      /其他设备/,
    );
    for (const value of [-0.5, 10.5, 0.1, NaN])
      assert.throws(
        () => s.submit(judge.id, "team-02", submission(value)),
        /格式/,
      );
    s.submit(judge2.id, "team-01", submission(10));
    assert.equal(s.results(admin.id).rows[0].average, 5);
    s.submit(judge.id, "team-02", submission(5));
    assert.equal(s.results(admin.id).rows[1].rank, 1);
    assert.equal(s.results(admin.id).rows[0].rank, 1);
    s.submit(judge.id, "team-03", submission(0.5));
    assert.equal(s.results(admin.id).rows[2].rank, 3);
    s.submit(judge.id, "team-01", submission(0.5, 1));
    assert.equal(s.results(admin.id).rows[0].average, 5.25);
    s.setStatus(admin.id, { status: "closed", expectedRevision: 1 });
    assert.throws(
      () => s.submit(judge.id, "team-03", submission(6, 1)),
      /未开放/,
    );
    // A network retry of an already-committed request remains readable after closing.
    assert.deepEqual(s.submit(judge.id, "team-01", zero), scored);
    assert.throws(
      () => s.setStatus(admin.id, { status: "open", expectedRevision: 2 }),
      /原因/,
    );
    s.setStatus(admin.id, {
      status: "open",
      expectedRevision: 2,
      reason: "补齐缺评",
    });
    assert.equal(
      s.audits(admin.id).filter((a) => a.action === "score.updated").length,
      1,
    );
    const own = s.workspace(judge.id);
    assert.equal(own.contest.roster.length, 0);
    assert.equal(own.scores.length, 3);
    assert.equal("judges" in own, false);
    assert.throws(() => s.results(judge.id), /权限/);
    assert.throws(() => s.submit(admin.id, "team-01", submission(5)), /权限/);
    assert.match(s.exportCsv(admin.id, "summary"), /5.25/);
    assert.match(s.exportCsv(admin.id, "detail"), /评委二/);
  } finally {
    store.close();
  }
});
test("账号权限、固定名单、最后一位管理员及会话撤销", async () => {
  const { store, service: s, admin, judge, judge2 } = await setup();
  try {
    const session = await s.login({ username: "judge1", password }, "local");
    assert.equal(s.session(session.token).user.id, judge.id);
    assert.throws(
      () =>
        s.updateUser(admin.id, admin.id, {
          name: admin.name,
          roles: ["judge"],
          active: true,
        }),
      /保留/,
    );
    assert.throws(
      () =>
        s.updateUser(judge.id, judge.id, {
          name: judge.name,
          roles: ["admin"],
          active: true,
        }),
      /权限/,
    );
    s.setStatus(admin.id, { status: "open", expectedRevision: 0 });
    s.submit(judge.id, "team-01", submission(8));
    const late = await s.createUser(
      { username: "late", name: "新增评委", password, roles: ["judge"] },
      admin.id,
    );
    assert.throws(() => s.submit(late.id, "team-01", submission(8)), /名单/);
    s.updateUser(admin.id, judge.id, {
      name: judge.name,
      roles: ["judge"],
      active: false,
    });
    assert.throws(() => s.session(session.token), /过期/);
    assert.equal(s.results(admin.id).rows[0].average, 8);
    assert.equal(s.results(admin.id).judges.length, 2);
    s.updateUser(admin.id, judge2.id, {
      name: judge2.name,
      roles: ["admin"],
      active: true,
    });
    assert.throws(() => s.submit(judge2.id, "team-01", submission(5)), /权限/);
  } finally {
    store.close();
  }
});
test("持久化、重启、备份恢复和 CSV 公式转义", async () => {
  const dir = mkdtempSync(join(tmpdir(), "finals-test-")),
    path = join(dir, "db.sqlite");
  const { store, service: s, admin, judge } = await setup(path);
  try {
    s.setStatus(admin.id, { status: "open", expectedRevision: 0 });
    s.submit(judge.id, "team-01", {
      ...submission(8.5),
      comment: '=HYPERLINK("x")',
    });
    assert.match(s.exportCsv(admin.id, "detail"), /'=HYPERLINK/);
    await store.db.backup(join(dir, "backup.sqlite"));
    store.close();
    const reopened = new Store(path);
    try {
      assert.equal(
        new FinalsService(reopened).workspace(judge.id).scores[0].score,
        8.5,
      );
    } finally {
      reopened.close();
    }
    const backup = new Store(join(dir, "backup.sqlite"));
    try {
      assert.equal(
        new FinalsService(backup).results(admin.id).rows[0].average,
        8.5,
      );
      assert.equal(backup.db.pragma("integrity_check", { simple: true }), "ok");
    } finally {
      backup.close();
    }
  } finally {
    if (store.db.open) store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("HTTP 权限、CSRF、50 位评委 × 12 队集中提交与双设备版本冲突", async () => {
  const capacityDir = mkdtempSync(join(tmpdir(), "finals-capacity-"));
  const {
    app,
    store,
    service: s,
  } = await createApp(join(capacityDir, "capacity.sqlite"));
  await app.listen(0, "127.0.0.1");
  const http = app.getHttpServer();
  try {
    const admin = await s.createUser({
      username: "admin",
      name: "管理员",
      password,
      roles: ["admin"],
    });
    const judges = [];
    for (let i = 0; i < 50; i++)
      judges.push(
        await s.createUser(
          {
            username: `judge${i}`,
            name: `评委${i}`,
            password,
            roles: ["judge"],
          },
          admin.id,
        ),
      );
    const login = await request(http)
      .post("/api/login")
      .send({ username: "judge0", password })
      .expect(201);
    const cookie = login.headers["set-cookie"][0].split(";")[0],
      csrf = login.body.csrfToken;
    await request(http).get("/api/admin/results").expect(401);
    await request(http)
      .get("/api/admin/results")
      .set("Cookie", cookie)
      .expect(403);
    await request(http)
      .post("/api/my-scores/team-01")
      .set("Cookie", cookie)
      .send(submission(5))
      .expect(403);
    await request(http)
      .post("/api/login")
      .set("Origin", "https://bad.example")
      .send({ username: "judge0", password })
      .expect(403);
    s.setStatus(admin.id, { status: "open", expectedRevision: 0 });
    const sessions = await Promise.all(
      judges.map((j) => s.login({ username: j.username, password }, j.id)),
    );
    const start = performance.now();
    const batches = await Promise.all(
      judges.map(async (_, i) => {
        const rows = [];
        for (const t of s.teams())
          rows.push(
            await request(http)
              .post(`/api/my-scores/${t.id}`)
              .set("Cookie", `finals_session=${sessions[i].token}`)
              .set("x-csrf-token", sessions[i].csrfToken)
              .send(submission((i % 21) / 2)),
          );
        return rows;
      }),
    );
    const response = batches.flat();
    assert.ok(
      response.every((r) => r.status === 201),
      response
        .filter((r) => r.status !== 201)
        .map((r) => r.text)
        .join("\n"),
    );
    const result = s.results(admin.id);
    assert.equal(result.total, 600);
    assert.equal(result.expected, 600);
    assert.ok(result.rows.every((r) => r.count === 50 && r.average === 4.48));
    const races = await Promise.all(
      [6, 7].map((v) =>
        request(http)
          .post("/api/my-scores/team-01")
          .set("Cookie", cookie)
          .set("x-csrf-token", csrf)
          .send(submission(v, 1)),
      ),
    );
    assert.deepEqual(races.map((r) => r.status).sort(), [201, 409]);
    console.log(
      `CAPACITY: 50 judges / 600 HTTP writes / ${(performance.now() - start).toFixed(0)}ms / 0 lost scores`,
    );
    assert.equal(store.db.pragma("integrity_check", { simple: true }), "ok");
    assert.equal(store.db.pragma("journal_mode", { simple: true }), "wal");
    const closing = await s.login({ username: "admin", password }, "admin");
    const finish = await Promise.all([
      request(http)
        .post("/api/admin/status")
        .set("Cookie", `finals_session=${closing.token}`)
        .set("x-csrf-token", closing.csrfToken)
        .send({ status: "closed", expectedRevision: 1 }),
      request(http)
        .post("/api/my-scores/team-02")
        .set("Cookie", cookie)
        .set("x-csrf-token", csrf)
        .send(submission(10, 1)),
    ]);
    assert.equal(finish[0].status, 201);
    assert.ok([201, 409].includes(finish[1].status));
    const score = s
      .workspace(judges[0].id)
      .scores.find((x) => x.teamId === "team-02")!;
    assert.equal(score.version, finish[1].status === 201 ? 2 : 1);
    if (finish[1].status === 201) {
      const audit = s.audits(admin.id);
      const end = audit.find((x) => x.action === "contest.status")!;
      const write = audit.find(
        (x) => x.action === "score.updated" && x.details.teamId === "team-02",
      )!;
      assert.ok(write.id < end.id);
    }
  } finally {
    await app.close();
    store.close();
    rmSync(capacityDir, { recursive: true, force: true });
  }
});

test("备份与恢复 CLI：在线备份、运行中拒绝恢复、旧库恢复点与会话清除", async () => {
  const dir = mkdtempSync(join(tmpdir(), "finals-cli-")),
    path = join(dir, "main.sqlite"),
    backup = join(dir, "snapshot.sqlite");
  const { store, service: s, admin, judge } = await setup(path);
  const cli = (script: string, args: string[] = []) =>
    execFileSync(
      process.execPath,
      ["--import", "tsx", `scripts/${script}.ts`, ...args],
      {
        env: { ...process.env, DB_PATH: path },
        encoding: "utf8",
        stdio: "pipe",
      },
    );
  try {
    s.setStatus(admin.id, { status: "open", expectedRevision: 0 });
    s.submit(judge.id, "team-01", submission(8.5));
    await s.login({ username: "judge1", password }, "cli");
    cli("backup", [backup]);
    assert.ok(existsSync(backup));
    assert.throws(() => cli("backup", [backup]), /不会覆盖/);
    s.submit(judge.id, "team-01", submission(9, 1));
    store.close();
    writeFileSync(path + ".server.pid", String(process.pid));
    assert.throws(() => cli("restore", [backup]), /先停止/);
    unlinkSync(path + ".server.pid");
    cli("restore", [backup]);
    const restored = new Store(path);
    try {
      assert.equal(
        new FinalsService(restored).workspace(judge.id).scores[0].score,
        8.5,
      );
      assert.equal(
        (
          restored.db.prepare("select count(*) n from sessions").get() as {
            n: number;
          }
        ).n,
        0,
      );
      assert.ok(readdirSync(dir).some((f) => f.includes(".before-restore-")));
    } finally {
      restored.close();
    }
  } finally {
    if (store.db.open) store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
