import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  HttpException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Store } from "./database";
import { digest, hashPassword, randomToken } from "./security";
import { LocalIdentityProvider, type IdentityProvider } from "./identity";
import criteria from "../shared/criteria.json";
import type {
  AuditEvent,
  Contest,
  Results,
  Role,
  Score,
  SubmitScore,
  Team,
  User,
  Workspace,
} from "../shared/types";

const CID = "finals-2026";
type UserRow = {
  id: string;
  username: string;
  name: string;
  password_hash: string;
  roles: string;
  active: number;
};
type ScoreRow = {
  judge_id: string;
  team_id: string;
  units: number;
  comment: string;
  version: number;
  updated_at: string;
};
const userSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3)
      .max(40)
      .regex(/^[a-zA-Z0-9_.-]+$/),
    name: z.string().trim().min(1).max(60),
    password: z.string().min(12).max(128),
    roles: z
      .array(z.enum(["admin", "judge"]))
      .min(1)
      .max(2),
  })
  .strict();
const scoreSchema = z
  .object({
    score: z
      .number()
      .min(0)
      .max(10)
      .refine((v) => Number.isInteger(v * 2)),
    comment: z.string().max(500),
    expectedVersion: z.number().int().nonnegative(),
    requestId: z.string().uuid(),
  })
  .strict();
export function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success)
    throw new BadRequestException("输入格式不正确，请核对必填项、长度和取值");
  return result.data;
}
const toScore = (r: ScoreRow): Score => ({
  teamId: r.team_id,
  score: r.units / 2,
  comment: r.comment,
  version: r.version,
  updatedAt: r.updated_at,
});
const toUser = (r: UserRow): User => ({
  id: r.id,
  username: r.username,
  name: r.name,
  roles: JSON.parse(r.roles),
  active: !!r.active,
});

export class FinalsService {
  readonly identity: IdentityProvider;
  constructor(
    readonly store: Store,
    identity?: IdentityProvider,
  ) {
    this.identity = identity || new LocalIdentityProvider(store);
  }
  private get db() {
    return this.store.db;
  }
  user(id: string): User {
    const row = this.db.prepare("SELECT * FROM users WHERE id=?").get(id) as
      UserRow | undefined;
    if (!row) throw new UnauthorizedException("登录已失效");
    return toUser(row);
  }
  require(id: string, role?: Role): User {
    const u = this.user(id);
    if (!u.active) throw new UnauthorizedException("账号已停用");
    if (role && !u.roles.includes(role))
      throw new ForbiddenException("没有访问权限");
    return u;
  }
  audit(actorId: string, action: string, details: Record<string, unknown>) {
    this.db
      .prepare(
        "INSERT INTO audit(actor_id,action,details,created_at) VALUES(?,?,?,?)",
      )
      .run(actorId, action, JSON.stringify(details), new Date().toISOString());
  }
  async createUser(body: unknown, actorId?: string): Promise<User> {
    if (actorId) this.require(actorId, "admin");
    const input = parse(userSchema, body);
    const passwordHash = await hashPassword(input.password);
    return this.db
      .transaction(() => {
        if (actorId) this.require(actorId, "admin");
        else if (
          (
            this.db.prepare("SELECT count(*) n FROM users").get() as {
              n: number;
            }
          ).n
        )
          throw new ConflictException("管理员已初始化，请在后台创建成员");
        if (!actorId && !input.roles.includes("admin"))
          throw new BadRequestException("首个账号必须是管理员");
        if (
          this.db
            .prepare("SELECT id FROM users WHERE username=?")
            .get(input.username)
        )
          throw new ConflictException("用户名已存在");
        const id = randomUUID();
        this.db
          .prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?)")
          .run(
            id,
            input.username,
            input.name,
            passwordHash,
            JSON.stringify([...new Set(input.roles)]),
            1,
            new Date().toISOString(),
          );
        this.audit(actorId || id, "user.created", {
          userId: id,
          name: input.name,
          roles: input.roles,
        });
        return this.user(id);
      })
      .immediate();
  }
  updateUser(actorId: string, id: string, body: unknown) {
    const input = parse(
      z
        .object({
          name: z.string().trim().min(1).max(60),
          roles: z
            .array(z.enum(["admin", "judge"]))
            .min(1)
            .max(2),
          active: z.boolean(),
        })
        .strict(),
      body,
    );
    return this.db
      .transaction(() => {
        this.require(actorId, "admin");
        const before = this.user(id);
        if (
          before.active &&
          before.roles.includes("admin") &&
          (!input.active || !input.roles.includes("admin"))
        ) {
          const count = this.users(actorId).filter(
            (u) => u.active && u.roles.includes("admin"),
          ).length;
          if (count <= 1) throw new ConflictException("至少保留一个可用管理员");
        }
        this.db
          .prepare("UPDATE users SET name=?,roles=?,active=? WHERE id=?")
          .run(
            input.name,
            JSON.stringify([...new Set(input.roles)]),
            Number(input.active),
            id,
          );
        if (!input.active)
          this.db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
        this.audit(actorId, "user.updated", {
          userId: id,
          before,
          after: input,
        });
        return this.user(id);
      })
      .immediate();
  }
  users(actorId: string) {
    this.require(actorId, "admin");
    return (
      this.db
        .prepare("SELECT * FROM users ORDER BY created_at,id")
        .all() as UserRow[]
    ).map(toUser);
  }
  async resetPassword(actorId: string, id: string, body: unknown) {
    this.require(actorId, "admin");
    const { password } = parse(
      z.object({ password: z.string().min(12).max(128) }).strict(),
      body,
    );
    const hashed = await hashPassword(password);
    this.db
      .transaction(() => {
        this.require(actorId, "admin");
        this.user(id);
        this.db
          .prepare("UPDATE users SET password_hash=? WHERE id=?")
          .run(hashed, id);
        this.db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
        this.audit(actorId, "user.password_reset", { userId: id });
      })
      .immediate();
    return { ok: true };
  }
  async login(body: unknown, ip: string) {
    const input = parse(
      z
        .object({
          username: z.string().trim().max(40),
          password: z.string().max(128),
        })
        .strict(),
      body,
    );
    const now = Date.now();
    const keys = [`ip:${ip}`, `user:${input.username.toLowerCase()}`];
    this.db
      .transaction(() => {
        this.db
          .prepare("DELETE FROM login_attempts WHERE window_start<?")
          .run(now - 900000);
        for (const key of keys) {
          const attempt = this.db
            .prepare("SELECT count FROM login_attempts WHERE key=?")
            .get(key) as { count: number } | undefined;
          if (attempt && attempt.count >= (key.startsWith("ip:") ? 100 : 10))
            throw new HttpException("尝试次数过多，请 15 分钟后重试", 429);
        }
        for (const key of keys)
          this.db
            .prepare(
              "INSERT INTO login_attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
            )
            .run(key, now);
      })
      .immediate();
    const identity = await this.identity.authenticate(input);
    if (!identity)
      throw new UnauthorizedException("账号或密码不正确，或账号已停用");
    const user = this.require(identity.userId);
    const token = randomToken(),
      csrf = randomToken();
    this.db.prepare("DELETE FROM login_attempts WHERE key=?").run(keys[1]);
    this.db.prepare("DELETE FROM sessions WHERE expires_at<?").run(now);
    this.db
      .prepare("INSERT INTO sessions VALUES(?,?,?,?)")
      .run(digest(token), user.id, csrf, now + 12 * 3600000);
    return { user, token, csrfToken: csrf };
  }
  session(token?: string) {
    if (!token) throw new UnauthorizedException("请先登录");
    const row = this.db
      .prepare(
        "SELECT user_id,csrf,expires_at FROM sessions WHERE token_hash=?",
      )
      .get(digest(token)) as
      { user_id: string; csrf: string; expires_at: number } | undefined;
    if (!row || row.expires_at < Date.now())
      throw new UnauthorizedException("登录已过期，请重新登录");
    return { user: this.require(row.user_id), csrfToken: row.csrf };
  }
  logout(token: string) {
    this.db
      .prepare("DELETE FROM sessions WHERE token_hash=?")
      .run(digest(token));
  }
  contest(): Contest {
    const c = this.db
      .prepare("SELECT * FROM contest WHERE id=?")
      .get(CID) as Omit<Contest, "roster">;
    return {
      ...c,
      roster: (
        this.db
          .prepare(
            "SELECT user_id FROM roster WHERE contest_id=? ORDER BY user_id",
          )
          .all(CID) as { user_id: string }[]
      ).map((r) => r.user_id),
    };
  }
  teams(): Team[] {
    return (
      this.db
        .prepare("SELECT * FROM teams ORDER BY performance_order")
        .all() as {
        id: string;
        performance_order: number;
        name: string;
        photo: string;
        members: string;
      }[]
    ).map((t) => ({
      id: t.id,
      order: t.performance_order,
      name: t.name,
      photo: t.photo,
      members: JSON.parse(t.members),
    }));
  }
  workspace(id: string): Workspace {
    const u = this.require(id, "judge");
    const c = this.contest();
    const eligible = c.roster.includes(u.id);
    return {
      contest: { ...c, roster: [] },
      teams: this.teams(),
      criteria,
      scores: (
        this.db
          .prepare("SELECT * FROM scores WHERE contest_id=? AND judge_id=?")
          .all(CID, id) as ScoreRow[]
      ).map(toScore),
      eligible,
    };
  }
  setStatus(actorId: string, body: unknown) {
    const input = parse(
      z
        .object({
          status: z.enum(["open", "closed"]),
          reason: z.string().trim().max(500).default(""),
          expectedRevision: z.number().int().nonnegative(),
        })
        .strict(),
      body,
    );
    return this.db
      .transaction(() => {
        this.require(actorId, "admin");
        const c = this.contest();
        if (c.revision !== input.expectedRevision)
          throw new ConflictException("赛事状态已变化，请刷新后操作");
        if (c.status === input.status)
          throw new ConflictException("赛事已处于此状态");
        if (c.status === "draft" && input.status === "closed")
          throw new BadRequestException("赛事尚未开始");
        if (c.status === "closed" && !input.reason)
          throw new BadRequestException("重新开放需要填写原因");
        if (c.status === "draft") {
          const judges = this.users(actorId).filter(
            (u) => u.active && u.roles.includes("judge"),
          );
          if (!judges.length)
            throw new BadRequestException("请先添加至少一位评委");
          for (const j of judges)
            this.db.prepare("INSERT INTO roster VALUES(?,?)").run(CID, j.id);
        }
        this.db
          .prepare("UPDATE contest SET status=?,revision=revision+1 WHERE id=?")
          .run(input.status, CID);
        this.audit(actorId, "contest.status", {
          from: c.status,
          to: input.status,
          reason: input.reason,
        });
        return this.contest();
      })
      .immediate();
  }
  submit(id: string, teamId: string, body: unknown): Score {
    const input = parse(scoreSchema, body);
    const payload = JSON.stringify({
      teamId,
      score: input.score,
      comment: input.comment,
      expectedVersion: input.expectedVersion,
    });
    return this.db
      .transaction(() => {
        this.require(id, "judge");
        const existing = this.db
          .prepare(
            "SELECT payload,response FROM requests WHERE user_id=? AND request_id=?",
          )
          .get(id, input.requestId) as
          { payload: string; response: string } | undefined;
        if (existing) {
          if (existing.payload !== payload)
            throw new ConflictException("此提交标识已用于其他内容");
          return JSON.parse(existing.response) as Score;
        }
        const c = this.contest();
        if (c.status !== "open")
          throw new ConflictException("当前未开放评分，草稿已保留");
        if (!c.roster.includes(id))
          throw new ForbiddenException("你不在本场评委名单中");
        if (!this.db.prepare("SELECT id FROM teams WHERE id=?").get(teamId))
          throw new NotFoundException("队伍不存在");
        const previous = this.db
          .prepare(
            "SELECT * FROM scores WHERE contest_id=? AND judge_id=? AND team_id=?",
          )
          .get(CID, id, teamId) as ScoreRow | undefined;
        if ((previous?.version || 0) !== input.expectedVersion)
          throw new ConflictException(
            "其他设备已更新这份评分，请核对最新记录后再提交",
          );
        const updatedAt = new Date().toISOString(),
          version = (previous?.version || 0) + 1;
        this.db
          .prepare(
            "INSERT INTO scores VALUES(?,?,?,?,?,?,?) ON CONFLICT(contest_id,judge_id,team_id) DO UPDATE SET units=excluded.units,comment=excluded.comment,version=excluded.version,updated_at=excluded.updated_at",
          )
          .run(
            CID,
            id,
            teamId,
            input.score * 2,
            input.comment,
            version,
            updatedAt,
          );
        const response: Score = {
          teamId,
          score: input.score,
          comment: input.comment,
          version,
          updatedAt,
        };
        this.audit(id, previous ? "score.updated" : "score.submitted", {
          teamId,
          before: previous ? toScore(previous) : null,
          after: response,
          requestId: input.requestId,
        });
        this.db
          .prepare("INSERT INTO requests VALUES(?,?,?,?)")
          .run(id, input.requestId, payload, JSON.stringify(response));
        return response;
      })
      .immediate();
  }
  results(actorId: string): Results {
    this.require(actorId, "admin");
    return this.db.transaction(() => {
      const contest = this.contest();
      const judges = this.users(actorId)
        .filter((u) =>
          contest.status === "draft"
            ? u.active && u.roles.includes("judge")
            : contest.roster.includes(u.id),
        )
        .map((u) => ({
          id: u.id,
          name: u.name,
          active: u.active && u.roles.includes("judge"),
        }));
      const raw = this.db
        .prepare("SELECT * FROM scores WHERE contest_id=?")
        .all(CID) as ScoreRow[];
      const rows = this.teams().map((team) => {
        const matches = raw.filter(
          (s) =>
            s.team_id === team.id && judges.some((j) => j.id === s.judge_id),
        );
        const count = matches.length,
          sumUnits = matches.reduce((n, r) => n + r.units, 0);
        return {
          team,
          scores: Object.fromEntries(
            judges.map((j) => {
              const s = matches.find((s) => s.judge_id === j.id);
              return [j.id, s ? toScore(s) : null];
            }),
          ),
          count,
          sumUnits,
          average: count ? sumUnits / count / 2 : null,
          rank: null as number | null,
          missing: judges
            .filter((j) => !matches.some((s) => s.judge_id === j.id))
            .map((j) => j.id),
        };
      });
      const sorted = rows
        .filter((r) => r.count)
        .sort(
          (a, b) =>
            b.sumUnits * a.count - a.sumUnits * b.count ||
            a.team.order - b.team.order,
        );
      sorted.forEach((r, i) => {
        const p = sorted[i - 1];
        r.rank =
          p && p.sumUnits * r.count === r.sumUnits * p.count ? p.rank : i + 1;
      });
      return {
        contest,
        judges,
        rows,
        total: rows.reduce((n, r) => n + r.count, 0),
        expected: rows.length * judges.length,
        updatedAt: new Date().toISOString(),
      };
    })();
  }
  audits(actorId: string, before = Number.MAX_SAFE_INTEGER, teamId?: string) {
    this.require(actorId, "admin");
    const rows = this.db
      .prepare(
        `SELECT a.*,u.name actor_name FROM audit a JOIN users u ON u.id=a.actor_id WHERE a.id<? ${teamId ? "AND json_extract(a.details,'$.teamId')=?" : ""} ORDER BY a.id DESC LIMIT 100`,
      )
      .all(...(teamId ? [before, teamId] : [before])) as {
      id: number;
      actor_id: string;
      actor_name: string;
      action: string;
      details: string;
      created_at: string;
    }[];
    return rows.map(
      (r) =>
        ({
          id: r.id,
          actorId: r.actor_id,
          actorName: r.actor_name,
          action: r.action,
          details: JSON.parse(r.details),
          createdAt: r.created_at,
        }) satisfies AuditEvent,
    );
  }
  exportCsv(actorId: string, mode: "summary" | "detail") {
    const result = this.results(actorId);
    const final =
      result.contest.status === "closed" &&
      result.expected > 0 &&
      result.total === result.expected;
    const rows: unknown[][] =
      mode === "summary"
        ? [
            [
              "出场顺序",
              "队伍",
              "当前排名",
              "当前均分",
              "已评人数",
              "应评人数",
              "状态",
              "成绩状态",
              "导出时间",
            ],
          ]
        : [["出场顺序", "队伍", "评委", "评分", "评语", "更新时间"]];
    const ordered =
      mode === "summary"
        ? [...result.rows].sort(
            (a, b) =>
              (a.rank ?? Infinity) - (b.rank ?? Infinity) ||
              a.team.order - b.team.order,
          )
        : result.rows;
    for (const r of ordered) {
      if (mode === "summary")
        rows.push([
          r.team.order,
          r.team.name,
          r.rank,
          r.average?.toFixed(2) ?? "",
          r.count,
          result.judges.length,
          r.count === result.judges.length && r.count ? "已收齐" : "尚未收齐",
          final ? "最终成绩" : "暂定排名",
          result.updatedAt,
        ]);
      else
        for (const j of result.judges) {
          const s = r.scores[j.id];
          rows.push([
            r.team.order,
            r.team.name,
            j.name,
            s?.score ?? "",
            s?.comment ?? "",
            s?.updatedAt ?? "",
          ]);
        }
    }
    const cell = (v: unknown) => {
      let s = v == null ? "" : String(v);
      if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    return "\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
  }
}
