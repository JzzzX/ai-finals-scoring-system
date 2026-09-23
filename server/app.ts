import "reflect-metadata";
import {
  Body,
  CanActivate,
  Catch,
  Controller,
  ExceptionFilter,
  ExecutionContext,
  Get,
  HttpException,
  NotFoundException,
  Inject,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  ForbiddenException,
  ArgumentsHost,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { Request, Response, NextFunction } from "express";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Store } from "./database";
import { FinalsService } from "./service";
import type { SessionInfo } from "../shared/types";
import {
  feishuAuthorizeUrl,
  feishuConfigured,
  fetchFeishuIdentity,
} from "./feishu";

type AuthRequest = Request & { identity: SessionInfo };
const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.COOKIE_SECURE === "true",
  path: "/",
});

const oauthOnly = () =>
  process.env.NODE_ENV === "production" && process.env.AUTH_MODE === "feishu";
@Injectable()
class SessionGuard implements CanActivate {
  constructor(@Inject(FinalsService) private service: FinalsService) {}
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    if (
      process.env.AUTH_MODE !== "feishu" &&
      (req.path.startsWith("/api/auth/feishu/") ||
        req.path.startsWith("/api/admin/feishu-"))
    )
      throw new NotFoundException();
    if (process.env.AUTH_MODE === "feishu" && req.path.startsWith("/api/judges"))
      throw new NotFoundException();
    if (
      [
        "/api/login",
        "/api/judges",
        "/api/judges/login",
        "/api/health",
        "/api/auth/feishu/login",
        "/api/auth/feishu/callback",
      ].includes(req.path)
    )
      return true;
    req.identity = {
      ...this.service.session(req.cookies?.finals_session),
    };
    if (req.path.startsWith("/api/admin/") && !req.identity.user.roles.includes("admin"))
      throw new ForbiddenException("没有管理员权限");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers["x-csrf-token"] !== req.identity.csrfToken
    )
      throw new ForbiddenException("请求校验失败，请刷新页面后重试");
    return true;
  }
}
@Catch()
class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    if (status >= 500)
      console.error(
        "API error:",
        error instanceof Error ? error.message : "unknown",
      );
    response.status(status).json({
      message:
        error instanceof HttpException
          ? error.message
          : "服务暂时不可用，草稿已保留，请稍后重试",
    });
  }
}
@Controller("api")
class Api {
  constructor(@Inject(FinalsService) private service: FinalsService) {}
  @Get("health") health() {
    this.service.store.db.prepare("SELECT 1").get();
    return { ok: true };
  }
  @Get("auth/feishu/login")
  feishuLogin(@Res() res: Response) {
    if (!feishuConfigured())
      throw new HttpException("飞书登录尚未完成服务器配置", 503);

    const state = this.service.createOAuthState("login");

    res.cookie("finals_feishu_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "true",
      path: "/api/auth/feishu",
      maxAge: 10 * 60 * 1000,
    });

    return res.redirect(302, feishuAuthorizeUrl(state));
  }

  @Get("auth/feishu/bind")
  feishuBind(@Req() req: AuthRequest, @Res() res: Response) {
    if (oauthOnly()) throw new NotFoundException();

    if (!feishuConfigured())
      throw new HttpException("飞书登录尚未完成服务器配置", 503);

    const state = this.service.createOAuthState("bind", req.identity.user.id);

    res.cookie("finals_feishu_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "true",
      path: "/api/auth/feishu",
      maxAge: 10 * 60 * 1000,
    });

    return res.redirect(302, feishuAuthorizeUrl(state));
  }

  @Get("auth/feishu/callback")
  async feishuCallback(
    @Req() req: Request,
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") oauthError: string | undefined,
    @Res() res: Response,
  ) {
    const clearOAuthCookie = () =>
      res.clearCookie("finals_feishu_state", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.COOKIE_SECURE === "true",
        path: "/api/auth/feishu",
      });

    if (oauthError || !code || !state) {
      clearOAuthCookie();
      return res.redirect(302, "/?feishu=cancelled");
    }

    if (
      !req.cookies?.finals_feishu_state ||
      req.cookies.finals_feishu_state !== state
    ) {
      clearOAuthCookie();
      return res.redirect(302, "/?feishu=state_error");
    }

    try {
      const pending = this.service.consumeOAuthState(state);
      const identity = await fetchFeishuIdentity(code);

      let userId: string | null;

      if (pending.mode === "bind") {
        if (!pending.userId) throw new Error("绑定状态缺少评分系统用户");

        this.service.bindExternalIdentity(pending.userId, identity);

        userId = pending.userId;
      } else {
        userId = this.service.externalUserId(
          identity.provider,
          identity.tenantId,
          identity.subjectId,
        );

        if (!userId) {
          this.service.recordPendingExternalIdentity(identity);
          clearOAuthCookie();
          return res.redirect(302, "/?feishu=unbound");
        }
      }

      const session = this.service.issueSession(userId);

      res.cookie("finals_session", session.token, {
        ...cookieOptions(),
        maxAge: 12 * 3600000,
      });

      clearOAuthCookie();

      const target = session.user.roles.includes("judge")
        ? "/score"
        : "/admin/results";

      return res.redirect(
        302,
        `${target}?feishu=${pending.mode === "bind" ? "bound" : "success"}`,
      );
    } catch (error) {
      clearOAuthCookie();

      console.error(
        "Feishu OAuth callback failed:",
        error instanceof Error ? error.message : "unknown",
      );

      return res.redirect(302, "/?feishu=error");
    }
  }
  @Get("judges") judges() { return this.service.publicJudges(); }
  @Post("judges/login") judgeLogin(@Body() body: unknown, @Req() req: Request, @Res({passthrough: true}) res: Response) {
    const {user, token, csrfToken} = this.service.judgeLogin(body);
    if (req.cookies?.finals_session) this.service.logout(req.cookies.finals_session);
    res.cookie("finals_session", token, {...cookieOptions(), maxAge: 12 * 3600000});
    return {user, csrfToken};
  }
  @Post("admin/judges") createJudge(@Body() body: unknown, @Req() req: AuthRequest) {
    return this.service.createJudge(body, req.identity.user.id);
  }
  @Post("login") async login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (oauthOnly()) throw new NotFoundException();

    const { token, ...session } = await this.service.login(
      body,
      req.ip || "local",
    );
    res.cookie("finals_session", token, {
      ...cookieOptions(),
      maxAge: 12 * 3600000,
    });
    return session;
  }
  @Get("me") me(@Req() req: AuthRequest) {
    return req.identity;
  }
  @Post("logout") logout(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.service.logout(req.cookies.finals_session);
    res.clearCookie("finals_session", cookieOptions());
    return { ok: true };
  }
  @Get("workspace") workspace(@Req() req: AuthRequest) {
    return this.service.workspace(req.identity.user.id);
  }
  @Post("my-scores/:teamId") submit(
    @Req() req: AuthRequest,
    @Param("teamId") teamId: string,
    @Body() body: unknown,
  ) {
    return this.service.submit(req.identity.user.id, teamId, body);
  }
  @Get("admin/results") results(@Req() req: AuthRequest) {
    return this.service.results(req.identity.user.id);
  }
  @Get("admin/users") users(@Req() req: AuthRequest) {
    return this.service.users(req.identity.user.id);
  }

  @Get("admin/feishu-users/search")
  async searchFeishuUsers(@Req() req: AuthRequest, @Query("q") query?: string) {
    return this.service.searchFeishuUsers(req.identity.user.id, query || "");
  }

  @Post("admin/feishu-users/authorize")
  async authorizeFeishuUser(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.authorizeFeishuUser(req.identity.user.id, body);
  }
  @Get("admin/feishu-pending") feishuPending(@Req() req: AuthRequest) {
    return this.service.pendingExternalIdentities(req.identity.user.id);
  }
  @Post("admin/users") createUser(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    if (oauthOnly()) throw new NotFoundException();
    return this.service.createUser(body, req.identity.user.id);
  }
  @Patch("admin/users/:id") updateUser(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.updateUser(req.identity.user.id, id, body);
  }
  @Post("admin/users/:id/password") resetPassword(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    if (oauthOnly()) throw new NotFoundException();
    return this.service.resetPassword(req.identity.user.id, id, body);
  }
  @Post("admin/status") status(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.setStatus(req.identity.user.id, body);
  }
  @Get("admin/audit") audit(
    @Req() req: AuthRequest,
    @Query("before") before?: string,
    @Query("teamId") teamId?: string,
  ) {
    return this.service.audits(
      req.identity.user.id,
      before && /^\d+$/.test(before) ? Number(before) : undefined,
      teamId,
    );
  }
  @Get("admin/export") export(
    @Req() req: AuthRequest,
    @Query("mode") mode: string,
    @Res() res: Response,
  ) {
    const safeMode = mode === "detail" ? "detail" : "summary";
    const csv = this.service.exportCsv(req.identity.user.id, safeMode);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="finals-${safeMode}.csv"`,
    );
    res.send(csv);
  }
}
export async function createApp(path?: string) {
  const store = new Store(path),
    service = new FinalsService(store);
  @Module({
    controllers: [Api],
    providers: [{ provide: FinalsService, useValue: service }],
  })
  class AppModule {}
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn"],
    bodyParser: false,
  });
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: null,
        },
      },
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: process.env.COOKIE_SECURE === "true",
    }),
  );
  app.use(express.json({ limit: "32kb" }));
  app.use(cookieParser());
  app.use("/api", (req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.headers.origin;
      const allowed = new Set(
        [
          process.env.APP_ORIGIN,
          `http://${req.headers.host}`,
          `https://${req.headers.host}`,
        ].filter(Boolean),
      );
      if (
        (origin && !allowed.has(origin)) ||
        req.headers["sec-fetch-site"] === "cross-site"
      )
        return res.status(403).json({ message: "请求来源不受信任" });
      if (!req.is("application/json"))
        return res.status(415).json({ message: "需要 JSON 请求" });
    }
    next();
  });
  app.useGlobalGuards(new SessionGuard(service));
  app.useGlobalFilters(new Errors());
  const client = resolve("dist/client");
  if (existsSync(client)) {
    app.use(express.static(client, { index: false }));
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (
        req.method === "GET" &&
        !req.path.startsWith("/api/") &&
        !req.path.includes(".")
      )
        res.sendFile(resolve(client, "index.html"));
      else next();
    });
  }
  await app.init();
  return { app, store, service };
}
