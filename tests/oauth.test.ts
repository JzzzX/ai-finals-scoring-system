import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/database";
import { FinalsService } from "../server/service";
import { createApp } from "../server/app";

const password = "oauth-test-123456";

test("OAuth state 只能消费一次，飞书身份保持一对一绑定", async () => {
  const store = new Store(":memory:");
  const service = new FinalsService(store);

  try {
    const admin = await service.createUser({
      username: "oauthadmin",
      name: "OAuth 管理员",
      password,
      roles: ["admin"],
    });

    const state = service.createOAuthState("bind", admin.id);
    const pending = service.consumeOAuthState(state);

    assert.equal(pending.mode, "bind");
    assert.equal(pending.userId, admin.id);

    assert.throws(
      () => service.consumeOAuthState(state),
      /失效/,
      "OAuth state 不允许重复使用",
    );

    const identity = {
      provider: "feishu",
      tenantId: "tenant-test",
      subjectId: "open-id-test",
    };

    service.bindExternalIdentity(admin.id, identity);

    assert.equal(
      service.externalUserId(
        identity.provider,
        identity.tenantId,
        identity.subjectId,
      ),
      admin.id,
    );

    const session = service.issueSession(admin.id);
    assert.equal(service.session(session.token).user.id, admin.id);

    const judge = await service.createUser(
      {
        username: "oauthjudge",
        name: "OAuth 评委",
        password,
        roles: ["judge"],
      },
      admin.id,
    );

    assert.throws(
      () => service.bindExternalIdentity(judge.id, identity),
      /已经绑定其他评分系统账号/,
      "同一飞书身份不能绑定多个业务用户",
    );
  } finally {
    store.close();
  }
});

test("飞书登录路由生成 state，bind 必须已有本地 Session", async () => {
  const dir = mkdtempSync(join(tmpdir(), "finals-oauth-"));
  const dbPath = join(dir, "oauth.sqlite");

  const previous = {
    appId: process.env.FEISHU_APP_ID,
    appSecret: process.env.FEISHU_APP_SECRET,
    redirect: process.env.FEISHU_REDIRECT_URI,
    cookieSecure: process.env.COOKIE_SECURE,
  };

  process.env.FEISHU_APP_ID = "cli_test";
  process.env.FEISHU_APP_SECRET = "secret_test";
  process.env.FEISHU_REDIRECT_URI =
    "http://127.0.0.1:35781/api/auth/feishu/callback";
  process.env.COOKIE_SECURE = "false";

  const { app, store, service } = await createApp(dbPath);
  const http = app.getHttpServer();

  try {
    const loginStart = await request(http)
      .get("/api/auth/feishu/login")
      .expect(302);

    assert.match(
      loginStart.headers.location,
      /^https:\/\/accounts\.feishu\.cn\/open-apis\/authen\/v1\/authorize\?/,
    );

    assert.match(loginStart.headers.location, /client_id=cli_test/);
    assert.match(loginStart.headers.location, /response_type=code/);
    assert.match(loginStart.headers.location, /state=/);

    const stateCookies = loginStart.headers["set-cookie"];
    assert.ok(stateCookies?.length);
    assert.match(stateCookies[0], /^finals_feishu_state=/);
    assert.match(stateCookies[0], /HttpOnly/i);
    assert.match(stateCookies[0], /SameSite=Lax/i);

    await request(http)
      .get("/api/auth/feishu/bind")
      .expect(401);

    const admin = await service.createUser({
      username: "routeadmin",
      name: "路由管理员",
      password,
      roles: ["admin"],
    });

    const localLogin = await request(http)
      .post("/api/login")
      .send({
        username: "routeadmin",
        password,
      })
      .expect(201);

    assert.equal(localLogin.body.user.id, admin.id);

    const sessionCookie = localLogin.headers["set-cookie"][0].split(";")[0];

    const bindStart = await request(http)
      .get("/api/auth/feishu/bind")
      .set("Cookie", sessionCookie)
      .expect(302);

    assert.match(bindStart.headers.location, /state=/);

    const row = store.db
      .prepare(
        "SELECT mode,user_id FROM oauth_states WHERE provider='feishu' ORDER BY created_at DESC LIMIT 1",
      )
      .get() as { mode: string; user_id: string };

    assert.equal(row.mode, "bind");
    assert.equal(row.user_id, admin.id);
  } finally {
    await app.close();
    store.close();

    if (previous.appId === undefined) delete process.env.FEISHU_APP_ID;
    else process.env.FEISHU_APP_ID = previous.appId;

    if (previous.appSecret === undefined) delete process.env.FEISHU_APP_SECRET;
    else process.env.FEISHU_APP_SECRET = previous.appSecret;

    if (previous.redirect === undefined) delete process.env.FEISHU_REDIRECT_URI;
    else process.env.FEISHU_REDIRECT_URI = previous.redirect;

    if (previous.cookieSecure === undefined) delete process.env.COOKIE_SECURE;
    else process.env.COOKIE_SECURE = previous.cookieSecure;

    rmSync(dir, { recursive: true, force: true });
  }
});
