import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../server/app";

test("生产账密版：关闭飞书入口、创建评委、权限隔离、重置密码撤销旧会话", async () => {
  const previous = { ...process.env };
  process.env.NODE_ENV = "production";
  process.env.AUTH_MODE = "local";
  process.env.COOKIE_SECURE = "true";
  const { app, store, service } = await createApp(":memory:");
  const http = app.getHttpServer();
  const password = "Password-test-only-2026!";
  try {
    await service.createUser({
      username: "organizer",
      name: "管理员",
      password,
      roles: ["admin"],
    });
    for (const path of [
      "/api/auth/feishu/login",
      "/api/auth/feishu/callback?code=x&state=x",
      "/api/auth/feishu/bind",
      "/api/admin/feishu-pending",
      "/api/admin/feishu-users/search?q=x",
    ])
      await request(http).get(path).expect(404);
    await request(http)
      .post("/api/admin/feishu-users/authorize")
      .send({})
      .expect(404);
    await request(http)
      .post("/api/login")
      .send({ username: "organizer", password: "incorrect" })
      .expect(401);
    const admin = await request(http)
      .post("/api/login")
      .send({ username: "organizer", password })
      .expect(201);
    const cookie = admin.headers["set-cookie"][0].split(";")[0];
    assert.match(admin.headers["set-cookie"][0], /Secure/);
    assert.match(admin.headers["set-cookie"][0], /HttpOnly/);
    const judge = await request(http)
      .post("/api/admin/users")
      .set("Cookie", cookie)
      .set("x-csrf-token", admin.body.csrfToken)
      .send({
        username: "external01",
        name: "外部评委",
        password,
        roles: ["judge"],
      })
      .expect(201);
    const login = await request(http)
      .post("/api/login")
      .send({ username: "external01", password })
      .expect(201);
    const judgeCookie = login.headers["set-cookie"][0].split(";")[0];
    await request(http)
      .get("/api/workspace")
      .set("Cookie", judgeCookie)
      .expect(200);
    await request(http)
      .get("/api/admin/results")
      .set("Cookie", judgeCookie)
      .expect(403);
    await request(http)
      .post("/api/admin/users")
      .set("Cookie", judgeCookie)
      .set("x-csrf-token", login.body.csrfToken)
      .send({
        username: "intruder",
        name: "不可创建",
        password,
        roles: ["admin"],
      })
      .expect(403);
    await request(http)
      .post(`/api/admin/users/${judge.body.id}/password`)
      .set("Cookie", cookie)
      .send({ password: password + "new" })
      .expect(403);
    await request(http)
      .post(`/api/admin/users/${judge.body.id}/password`)
      .set("Cookie", cookie)
      .set("x-csrf-token", admin.body.csrfToken)
      .send({ password: password + "new" })
      .expect(201);
    await request(http).get("/api/me").set("Cookie", judgeCookie).expect(401);
    await request(http)
      .post("/api/login")
      .send({ username: "external01", password })
      .expect(401);
    const resetLogin = await request(http)
      .post("/api/login")
      .send({ username: "external01", password: password + "new" })
      .expect(201);
    assert.equal(resetLogin.body.user.id, judge.body.id);
    assert.equal(
      (
        store.db.prepare("SELECT count(*) AS n FROM scores").get() as {
          n: number;
        }
      ).n,
      0,
    );
  } finally {
    await app.close();
    store.close();
    for (const key of ["NODE_ENV", "AUTH_MODE", "COOKIE_SECURE"])
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
  }
});
