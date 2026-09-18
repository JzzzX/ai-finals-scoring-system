import { createApp } from "./app";
import { writeFileSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
async function main() {
  const dbPath = process.env.DB_PATH || "./data/finals.sqlite",
    lock = resolve(dbPath + ".server.pid");
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, "utf8"));
    try {
      process.kill(pid, 0);
      throw new Error(`数据库已有服务进程 ${pid}`);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e;
    }
    unlinkSync(lock);
  }
  const { app, store } = await createApp(dbPath);
  writeFileSync(lock, String(process.pid), { flag: "wx", mode: 0o600 });
  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    await app.close();
    store.close();
    if (existsSync(lock)) unlinkSync(lock);
    process.exit(0);
  }
  process.on("SIGINT", () => void close());
  process.on("SIGTERM", () => void close());
  try {
    await app.listen(
      Number(process.env.PORT || 3001),
      process.env.HOST || "127.0.0.1",
    );
    console.log(
      "评分服务已就绪：http://127.0.0.1:" + (process.env.PORT || 3001),
    );
  } catch (e) {
    store.close();
    unlinkSync(lock);
    throw e;
  }
}
void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
