import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../server/app";

test("姓名入口仅授予评委权限，账号升权不改变会话权限，停用立即失效", async () => {
  const {app,store,service} = await createApp(":memory:");
  const http = app.getHttpServer();
  const password = "Test-only-password-2026!";
  try {
    const admin = await service.createUser({username:"admin",name:"管理员",password,roles:["admin"]});
    const judge = await service.createJudge({name:"测试评委"},admin.id);
    const dual = await service.createUser({username:"dual",name:"双角色",password,roles:["admin","judge"]},admin.id);
    const list = await request(http).get("/api/judges").expect(200);
    assert.deepEqual(list.body.map((u: {id:string}) => u.id).sort(), [judge.id,dual.id].sort());
    assert.deepEqual(Object.keys(list.body[0]).sort(), ["id","name"]);
    await request(http).post("/api/judges/login").send({id:admin.id}).expect(403);
    await request(http).post("/api/judges/login").send({id:judge.id,roles:["admin"]}).expect(400);
    for (const user of [judge,dual]) {
      const login = await request(http).post("/api/judges/login").send({id:user.id}).expect(201);
      assert.deepEqual(login.body.user.roles,["judge"]);
      const cookie = login.headers["set-cookie"][0].split(";")[0];
      await service.updateUser(admin.id,user.id,{roles:["admin","judge"],active:true});
      const me = await request(http).get("/api/me").set("Cookie",cookie).expect(200);
      assert.deepEqual(me.body.user.roles,["judge"]);
      assert.equal(me.body.user.id,user.id);
      for (const path of ["results","users","audit","export"])
        await request(http).get(`/api/admin/${path}`).set("Cookie",cookie).expect(403);
      await request(http).post("/api/admin/status").set("Cookie",cookie).set("x-csrf-token",login.body.csrfToken).send({status:"open"}).expect(403);
      await request(http).get("/api/workspace").set("Cookie",cookie).expect(200);
      await request(http).post("/api/logout").set("Cookie",cookie).send({}).expect(403);
      await service.updateUser(admin.id,user.id,{roles:["admin","judge"],active:false});
      await request(http).get("/api/me").set("Cookie",cookie).expect(401);
      await request(http).post("/api/judges/login").send({id:user.id}).expect(403);
    }
    const login = await request(http).post("/api/login").send({username:"admin",password}).expect(201);
    await request(http).get("/api/admin/results").set("Cookie",login.headers["set-cookie"][0].split(";")[0]).expect(200);
  } finally { await app.close(); store.close(); }
});

import {Store} from "../server/database";
import {FinalsService} from "../server/service";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
test("旧数据库迁移及重启保留评委会话范围", async () => {
  const dir=mkdtempSync(join(tmpdir(),"finals-scope-"));
  const path=join(dir,"db.sqlite");
  let store=new Store(path);
  try {
    let service=new FinalsService(store);
    const admin=await service.createUser({username:"owner",name:"管理员",password:"Test-only-long-password!",roles:["admin","judge"]});
    const original=service.issueSession(admin.id);
    store.db.exec("ALTER TABLE sessions DROP COLUMN auth_scope");
    store.close(); store=new Store(path); service=new FinalsService(store);
    assert.deepEqual(service.session(original.token).user.roles,["admin","judge"]);
    const judge=service.judgeLogin({id:admin.id});
    store.close(); store=new Store(path); service=new FinalsService(store);
    assert.deepEqual(service.session(judge.token).user.roles,["judge"]);
    assert.equal(service.session(judge.token).user.id,admin.id);
  } finally {store.close(); rmSync(dir,{recursive:true,force:true});}
});
