import "dotenv/config";
import Database from "better-sqlite3";
import {
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  chmodSync,
  mkdirSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
async function main() {
  const source = process.argv[2];
  if (!source) throw new Error("用法：npm run db:restore -- 备份文件");
  const target = resolve(process.env.DB_PATH || "./data/finals.sqlite");
  const lock = target + ".server.pid";
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, "utf8"));
    try {
      process.kill(pid, 0);
      throw new Error("请先停止评分服务，再恢复数据库");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e;
    }
    unlinkSync(lock);
  }
  if (resolve(source) === target) throw new Error("备份来源不能与目标相同");
  const db = new Database(resolve(source), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    if (db.pragma("integrity_check", { simple: true }) !== "ok")
      throw new Error("备份完整性校验失败");
    if (
      (
        db.prepare("SELECT max(version) version FROM schema_version").get() as {
          version: number;
        }
      ).version !== 1
    )
      throw new Error("备份结构版本不兼容");
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    const suffix = Date.now();
    if (existsSync(target)) {
      const old = new Database(target);
      try {
        await old.backup(target + `.before-restore-${suffix}`);
      } finally {
        old.close();
      }
    }
    const tmp = target + `.restore-${suffix}`;
    await db.backup(tmp);
    chmodSync(tmp, 0o600);
    for (const ext of ["-wal", "-shm"])
      if (existsSync(target + ext)) unlinkSync(target + ext);
    renameSync(tmp, target);
    const restored = new Database(target);
    try {
      restored.prepare("DELETE FROM sessions").run();
    } finally {
      restored.close();
    }
    console.log("恢复完成，旧库已备份；请重新登录。");
  } finally {
    db.close();
  }
}
void main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
