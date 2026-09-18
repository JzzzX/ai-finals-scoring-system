import { Store } from "../server/database";
import { mkdirSync, existsSync, chmodSync } from "node:fs";
import { resolve, dirname } from "node:path";
async function main() {
  const output = resolve(
    process.argv[2] ||
      `data/backups/finals-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`,
  );
  if (existsSync(output)) throw new Error("备份文件已存在，不会覆盖");
  mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
  if (!existsSync(process.env.DB_PATH || "./data/finals.sqlite"))
    throw new Error("数据库不存在，请先初始化管理员");
  const store = new Store();
  try {
    await store.db.backup(output);
    chmodSync(output, 0o600);
    console.log(`备份完成：${output}`);
  } finally {
    store.close();
  }
}
void main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
