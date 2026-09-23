import React, { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { ArrowRight, LogOut, UserRound } from "lucide-react";
import type { SessionInfo } from "../../shared/types";
import { api, errorMessage, setSession } from "./api";
import { Brand, Notice, Modal } from "./ui";
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
        if (location.pathname === "/" || location.pathname === "/admin/login") navigate(s.user.roles.includes("judge") ? "/score" : "/admin/results");
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
        admin={route === "/admin/login"}
        navigate={navigate}
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
      navigate("/");
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
            {!isAdmin && "当前评委："}{session.user.name}
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
type JudgeIdentity = {id: string; name: string; title: string};
function Entry({admin, navigate, message, onLogin}: {
  admin: boolean; navigate: (path: string) => void; message: string;
  onLogin: (s: SessionInfo) => void;
}) {
  const [judges, setJudges] = useState<JudgeIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<JudgeIdentity | null>(null);
  const [busy, setBusy] = useState(false);
  async function load() {
    setLoading(true); setError("");
    try { setJudges(await api<JudgeIdentity[]>("/judges")); }
    catch(e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function enter() {
    if (!selected || busy) return;
    setBusy(true); setError("");
    try { onLogin(await api<SessionInfo>("/judges/login", {id: selected.id})); }
    catch(e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  if (admin) return <Login onLogin={onLogin} message={message} onBack={() => navigate("/")} />;
  return <div className="judge-entry">
    <header className="entry-header"><Brand /><button className="admin-entry" onClick={() => navigate("/admin/login")}>管理员登录</button></header>
    <main className="entry-main">
      <div className="entry-event">2026 乖宝 AI 先锋赛</div>
      <p className="entry-caption">决赛 · 评委评分</p><div className="entry-gold" />
      <h1>请选择您的姓名</h1><p className="muted">选择本人身份，确认后即可进入评分。</p>
      {message && <Notice>{message}</Notice>}
      {!selected && error && <Notice>{error}</Notice>}
      {loading ? <p role="status" className="entry-empty">正在加载评委名单…</p> : error && !selected ? <button onClick={() => void load()}>重新加载名单</button> : judges.length ?
        <div className="judge-list">{judges.map(judge => <button className="judge-card" key={judge.id} onClick={() => {setError(""); setSelected(judge);}}><span className="judge-avatar"><UserRound size={24} /></span><span className="judge-details"><strong>{judge.name}</strong>{judge.title && <small>{judge.title}</small>}</span><ArrowRight size={20} /></button>)}</div> :
        <div className="entry-empty"><p>评委名单尚未配置</p><p className="muted">请联系现场工作人员，或稍后刷新名单。</p><button onClick={() => void load()}>刷新名单</button></div>}
      <p className="entry-hint">请仅选择本人姓名，评分将记入所选评委名下。</p>
    </main>
    {selected && <Modal title="请确认您的评委身份" onClose={() => {if (!busy) {setSelected(null); setError("");}}}>
      <div className="judge-confirm"><span className="judge-avatar"><UserRound size={32} /></span><h3>{selected.name}</h3>{selected.title && <p className="muted">{selected.title}</p>}<p className="muted">请确认是本人，避免评分记入他人名下。</p>{error && <Notice>{error}</Notice>}<button className="primary" disabled={busy} onClick={() => void enter()}>{busy ? "正在进入…" : "确认是本人，进入评分"}</button><button className="text-button" disabled={busy} onClick={() => {setSelected(null); setError(""); void load();}}>返回重新选择</button></div>
    </Modal>}
  </div>;
}
function Login({
  onLogin,
  onBack,
  message,
}: {
  onLogin: (s: SessionInfo) => void;
  onBack: () => void;
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
        <button className="text-button" onClick={onBack}>返回评委入口</button>
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
          <h2>管理员登录</h2>
          <p className="muted">请输入管理员账号和密码</p>
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
