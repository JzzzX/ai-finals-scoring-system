import React, { useEffect, useState, type FormEvent } from "react";
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
      <Login
        message={message}
        onLogin={(s) => {
          setSession(s);
          updateSession(s);
          setMessage("");
          navigate(
            s.user.roles.includes("judge") ? "/score" : "/admin/results",
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
function Login({
  onLogin,
  message,
}: {
  onLogin: (s: SessionInfo) => void;
  message: string;
}) {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLogin(await api<SessionInfo>("/login", { username, password }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <header>
        <Brand />
      </header>
      <main className="login-layout">
        <section className="login-intro">
          <div className="gold-line" />
          <h1>
            让每一份创新，
            <br />
            被认真看见。
          </h1>
          <p>
            2026 乖宝 AI 先锋赛<span>决赛评分</span>
          </p>
          <div className="login-rules">
            <strong>12 支团队，同场呈现。</strong>
            <p>
              以实际成果为依据，
              <br />
              用专业判断，为创新打分。
            </p>
          </div>
        </section>
        <form className="login-form" onSubmit={(e) => void login(e)}>
          <h2>登录评分系统</h2>
          <p className="muted">使用管理员为你开通的账号</p>
          {(error || message) && <Notice>{error || message}</Notice>}
          <label>
            账号
            <input
              autoComplete="username"
              autoFocus
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入账号"
            />
          </label>
          <label>
            密码
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "正在登录…" : "进入评分系统"}
            <ArrowRight size={18} />
          </button>
          <p className="form-note">账号或权限问题，请联系赛事管理员。</p>
        </form>
      </main>
      <footer>2026 乖宝 AI 先锋赛</footer>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
