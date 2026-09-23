import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { LogOut, UserRound } from "lucide-react";
import type { SessionInfo } from "../../shared/types";
import { api, errorMessage, setSession } from "./api";
import { Brand, Notice } from "./ui";
import { Judge } from "./Judge";
import { Admin } from "./Admin";
import { Entry } from "./Entry";
import "./styles.css";
import "./entry.css";
import "./admin.css";
import "./typography.css";
import "./leaderboard.css";
import "./score-colors.css";

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
    const pop = () => setRoute(location.pathname);
    window.addEventListener("popstate", pop);
    const expired = () => {
      updateSession(null);
      setSession(null);
      setMessage("登录已过期，请重新登录；本机草稿仍然保留。");
    };
    window.addEventListener("session-expired", expired);
    void api<SessionInfo>("/me")
      .then((s) => {
        setSession(s);
        updateSession(s);
        if (location.pathname === "/" || location.pathname === "/admin/login")
          navigate(
            route.startsWith("/admin") && s.user.roles.includes("admin")
              ? "/admin/results"
              : s.user.roles.includes("judge")
                ? "/score"
                : "/admin/results",
          );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => {
      window.removeEventListener("popstate", pop);
      window.removeEventListener("session-expired", expired);
    };
  }, []);
  if (loading)
    return (
      <main className="recovery" role="status">
        正在加载评分系统…
      </main>
    );
  if (!session)
    return (
      <Entry
        admin={route.startsWith("/admin")}
        navigate={navigate}
        message={message}
        onLogin={(s) => {
          setSession(s);
          updateSession(s);
          setMessage("");
          navigate(
            route.startsWith("/admin") && s.user.roles.includes("admin")
              ? "/admin/results"
              : s.user.roles.includes("judge")
                ? "/score"
                : "/admin/results",
          );
        }}
      />
    );
  const isAdmin = route.startsWith("/admin"),
    allowed = session.user.roles.includes(isAdmin ? "admin" : "judge");
  async function logout() {
    try {
      await api("/logout", {});
      setSession(null);
      updateSession(null);
      setMessage("");
      navigate("/");
    } catch (e) {
      setMessage(errorMessage(e));
    }
  }
  return (
    <>
      <header
        className={`app-header ${isAdmin ? "admin-header" : "judge-header"}`}
      >
        <Brand />
        <div className="header-title">
          AI先锋赛<span>决赛评分</span>
        </div>
        <div className="header-actions">
          <span className="identity">
            <UserRound size={18} />
            {!isAdmin && "当前评委："}
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
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
