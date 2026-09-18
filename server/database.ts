import "dotenv/config";
import Database from "better-sqlite3";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname, resolve } from "node:path";
import teams from "../shared/teams.json";

export class Store {
  readonly db: Database.Database;
  constructor(readonly path = process.env.DB_PATH || "./data/finals.sqlite") {
    if (path !== ":memory:")
      mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
    this.db = new Database(path);
    if (path !== ":memory:") chmodSync(path, 0o600);
    const version = (
      this.db.prepare("select sqlite_version() as v").get() as { v: string }
    ).v;
    const [a, b, c] = version.split(".").map(Number);
    if (a < 3 || (a === 3 && (b < 51 || (b === 51 && c < 3))))
      throw new Error(`SQLite ${version} 未包含 WAL 修复，需要 >= 3.51.3`);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = FULL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY);
      INSERT OR IGNORE INTO schema_version VALUES(1);
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE,
        name TEXT NOT NULL, password_hash TEXT NOT NULL, roles TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS contest(id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','open','closed')), revision INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS teams(id TEXT PRIMARY KEY, performance_order INTEGER UNIQUE NOT NULL, name TEXT NOT NULL, photo TEXT NOT NULL, members TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS roster(contest_id TEXT NOT NULL REFERENCES contest(id), user_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(contest_id,user_id));
      CREATE TABLE IF NOT EXISTS scores(contest_id TEXT NOT NULL REFERENCES contest(id), judge_id TEXT NOT NULL REFERENCES users(id), team_id TEXT NOT NULL REFERENCES teams(id),
        units INTEGER NOT NULL CHECK(typeof(units)='integer' AND units BETWEEN 0 AND 20), comment TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(contest_id,judge_id,team_id));
      CREATE TABLE IF NOT EXISTS requests(user_id TEXT NOT NULL REFERENCES users(id), request_id TEXT NOT NULL, payload TEXT NOT NULL, response TEXT NOT NULL, PRIMARY KEY(user_id,request_id));
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, details TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS login_attempts(key TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start INTEGER NOT NULL);
    `);
    this.db.transaction(() => {
      this.db
        .prepare(
          "INSERT OR IGNORE INTO contest(id,title,status) VALUES('finals-2026','2026乖宝AI先锋赛 · 决赛评分','draft')",
        )
        .run();
      const insert = this.db.prepare(
        "INSERT OR IGNORE INTO teams VALUES(?,?,?,?,?)",
      );
      for (const t of teams)
        insert.run(t.id, t.order, t.name, t.photo, JSON.stringify(t.members));
    })();
  }
  close() {
    this.db.close();
  }
}
