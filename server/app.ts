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

type AuthRequest = Request & { identity: SessionInfo };
const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.COOKIE_SECURE === "true",
  path: "/",
});
@Injectable()
class SessionGuard implements CanActivate {
  constructor(@Inject(FinalsService) private service: FinalsService) {}
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    if (["/api/login", "/api/health"].includes(req.path)) return true;
    req.identity = {
      ...this.service.session(req.cookies?.finals_session),
    };
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
  @Post("login") async login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
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
  @Post("admin/users") createUser(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
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
