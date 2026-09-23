import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowRight, LogOut, UserRound } from "lucide-react";
import type { SessionInfo } from "../../shared/types";
import { api, errorMessage, setSession } from "./api";
import { Brand, Notice } from "./ui";
import { Judge } from "./Judge";
import { Admin } from "./Admin";
import "./styles.css";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="recovery">
        <h1>页面遇到了问题</h1>
        <p>本机草稿仍然保留，请重新加载。</p>
        <button className="primary" onClick={() => location.reload()}>
          重新加载
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
function App() {
  const [session, updateSession] = useState<SessionInfo | null>(null),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState("");
  const [route, setRoute] = useState(location.pathname);
  const navigate = (next: string) => {
    history.pushState({}, "", next);
    setRoute(next);
  };
  useEffect(() => {
    const oauthStatus = new URLSearchParams(location.search).get("feishu");

    if (oauthStatus === "success")
      setMessage("飞书登录成功。");
    else if (oauthStatus === "bound")
      setMessage("飞书账号绑定成功，后续可以直接使用飞书登录。");
    else if (oauthStatus === "unbound")
      setMessage(
        "当前飞书账号尚未开通评分系统权限，请联系赛事管理员。",
      );
    else if (oauthStatus === "cancelled")
      setMessage("飞书授权未完成，请重新使用飞书登录。");
    else if (oauthStatus === "state_error")
      setMessage("飞书登录状态校验失败，请重新发起登录。");
    else if (oauthStatus === "error")
      setMessage("飞书登录未完成，请重新使用飞书登录。");

    if (oauthStatus) {
      const url = new URL(location.href);
      url.searchParams.delete("feishu");
      history.replaceState({}, "", url.pathname + url.search + url.hash);
    }

    const pop = () => setRoute(location.pathname);
    window.addEventListener("popstate", pop);
    const expired = () => {
      updateSession(null);
      setSession(null);
      setMessage("");
    };
    window.addEventListener("session-expired", expired);
    void api<SessionInfo>("/me")
      .then((s) => {
        setSession(s);
        updateSession(s);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => {
      window.removeEventListener("popstate", pop);
      window.removeEventListener("session-expired", expired);
    };
  }, []);
  useEffect(() => {
    if (!loading && !session && !message)
      window.location.replace("/api/auth/feishu/login");
  }, [loading, session, message]);

  if (loading)
    return (
      <main className="recovery" role="status">
        正在加载评分系统…
      </main>
    );
  if (!session)
    return message ? (
      <OAuthAccess message={message} />
    ) : (
      <main className="recovery" role="status">
        正在进入飞书登录…
      </main>
    );
  const isAdmin = route.startsWith("/admin"),
    allowed = session.user.roles.includes(isAdmin ? "admin" : "judge");
  async function logout() {
    try {
      await api("/logout", {});
      setSession(null);
      updateSession(null);
      setMessage("");
    } catch (e) {
      setMessage(errorMessage(e));
    }
  }
  return (
    <>
      <header className="app-header">
        <Brand />
        <div className="header-title">
          AI先锋赛<span>决赛评分</span>
        </div>
        <div className="header-actions">
          <span className="identity">
            <UserRound size={18} />
            {session.user.name}
          </span>
          {session.user.roles.length === 2 && (
            <button
              className="text-button"
              onClick={() => navigate(isAdmin ? "/score" : "/admin/results")}
            >
              {isAdmin ? "进入评分" : "管理后台"}
            </button>
          )}
          <button className="text-button logout" onClick={() => void logout()}>
            <LogOut size={18} />
            <span>退出登录</span>
          </button>
        </div>
      </header>
      {message && <Notice>{message}</Notice>}
      {!allowed ? (
        <main className="recovery">
          <h1>没有访问权限</h1>
          <p>当前账号无法访问此页面。</p>
          <button
            className="primary"
            onClick={() =>
              navigate(
                session.user.roles.includes("judge")
                  ? "/score"
                  : "/admin/results",
              )
            }
          >
            返回工作台
          </button>
        </main>
      ) : isAdmin ? (
        <Admin session={session} route={route} navigate={navigate} />
      ) : (
        <Judge session={session} />
      )}
    </>
  );
}
function OAuthAccess({ message }: { message: string }) {
  return (
    <main className="recovery">
      <Brand />
      <h1>飞书身份暂未获得访问权限</h1>
      <p>{message}</p>
      <button
        className="primary"
        onClick={() =>
          window.location.assign("/api/auth/feishu/login")
        }
      >
        重新使用飞书登录
        <ArrowRight size={18} />
      </button>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
