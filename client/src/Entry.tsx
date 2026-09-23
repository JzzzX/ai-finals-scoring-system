import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Pause,
  Play,
  ShieldCheck,
} from "lucide-react";
import type { SessionInfo } from "../../shared/types";
import { api, errorMessage } from "./api";
import { Brand, Modal, Notice } from "./ui";

type JudgeIdentity = { id: string; name: string; title: string };
type EntryProps = {
  admin: boolean;
  navigate: (path: string) => void;
  message: string;
  onLogin: (s: SessionInfo) => void;
};

/** Official mascots, edited with a central trophy; motion is presentation-only. */
function MascotCelebration() {
  return (
    <div className="mascot-celebration">
      <svg
        className="innovation-orbit"
        viewBox="0 0 600 300"
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="orbit-wash">
            <stop stopColor="#c4d0b7" stopOpacity=".24" />
            <stop offset="1" stopColor="#c4d0b7" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="orbit-fade">
            <stop offset=".65" stopColor="black" />
            <stop offset="1" stopColor="white" />
          </radialGradient>
          <mask id="orbit-center">
            <rect width="600" height="300" fill="white" />
            <ellipse
              cx="300"
              cy="162"
              rx="190"
              ry="125"
              fill="url(#orbit-fade)"
            />
          </mask>
        </defs>
        <ellipse cx="300" cy="155" rx="245" ry="130" fill="url(#orbit-wash)" />
        <g mask="url(#orbit-center)">
          <g className="orbit-lines">
            <ellipse
              cx="300"
              cy="150"
              rx="265"
              ry="82"
              transform="rotate(-22 300 150)"
              stroke="#698261"
              strokeWidth="1.2"
            />
            <ellipse
              cx="300"
              cy="150"
              rx="248"
              ry="76"
              transform="rotate(14 300 150)"
              stroke="#9bad90"
              strokeWidth=".7"
            />
            <ellipse
              cx="300"
              cy="150"
              rx="208"
              ry="72"
              transform="rotate(-43 300 150)"
              stroke="#b3c1a9"
              strokeWidth=".7"
            />
            <circle cx="509" cy="110" r="4" fill="#b96050" />
          </g>
        </g>
      </svg>
      <img
        className="mascot-art"
        src="/branding/mascots-trophy.png"
        width="1536"
        height="1024"
        fetchPriority="high"
        alt="乖宝白色小狗与橙色小猫吉祥物，共同迎接决赛金色奖杯"
      />
    </div>
  );
}

export function Entry(props: EntryProps) {
  // Separate components keep identity-selection state out of the administrator form.
  return props.admin ? (
    <AdminLogin
      onLogin={props.onLogin}
      message={props.message}
      onBack={() => props.navigate("/")}
    />
  ) : (
    <JudgeEntry {...props} />
  );
}

function JudgeEntry({ navigate, message, onLogin }: EntryProps) {
  const [judges, setJudges] = useState<JudgeIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<JudgeIdentity | null>(null);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  async function load() {
    setLoading(true);
    setError("");
    try {
      setJudges(await api<JudgeIdentity[]>("/judges"));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function enter() {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      onLogin(await api<SessionInfo>("/judges/login", { id: selected.id }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`judge-entry ${paused ? "motion-paused" : ""}`}>
      <header className="entry-header">
        <Brand />
        <span className="entry-edition">2026 AI 先锋赛</span>
      </header>
      <main className="entry-main">
        <section className="entry-story" aria-labelledby="entry-title">
          <h1 id="entry-title">
            让每一份创新，
            <br />
            <em>被认真看见。</em>
          </h1>
          <p className="entry-event">
            2026 乖宝 AI 先锋赛 <span>· 决赛评审</span>
          </p>
          <MascotCelebration />
          <p className="entry-philosophy">
            以实际成果为依据，
            <br className="mobile-break" />
            用专业判断为创新打分。
          </p>
        </section>
        <section className="entry-selection" aria-labelledby="judge-welcome">
          <h2 id="judge-welcome">欢迎莅临评审</h2>
          <p className="entry-description">
            请选择您的姓名，确认身份后进入评分。
          </p>
          {message && <Notice>{message}</Notice>}
          {!selected && error && <Notice>{error}</Notice>}
          {loading ? (
            <div className="entry-empty" role="status">
              <span className="loading-ring" />
              正在加载评委名单…
            </div>
          ) : error && !selected ? (
            <div className="entry-empty">
              <button className="outline" onClick={() => void load()}>
                重新加载名单
              </button>
            </div>
          ) : judges.length ? (
            <div className="judge-list">
              {judges.map((judge, index) => (
                <button
                  className="judge-card"
                  key={judge.id}
                  style={{ "--entry-index": index } as CSSProperties}
                  onClick={() => {
                    setError("");
                    setSelected(judge);
                  }}
                >
                  <span className="judge-number" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="judge-details">
                    <strong>{judge.name}</strong>
                    {judge.title && <small>{judge.title}</small>}
                  </span>
                  <ArrowRight
                    className="judge-arrow"
                    size={18}
                    strokeWidth={1.3}
                  />
                </button>
              ))}
            </div>
          ) : (
            <div className="entry-empty">
              <p>评委名单尚未配置</p>
              <p className="muted">请联系现场工作人员，或稍后刷新名单。</p>
              <button className="outline" onClick={() => void load()}>
                刷新名单
              </button>
            </div>
          )}
          <p className="entry-hint">
            <ShieldCheck size={15} strokeWidth={1.4} />
            请仅选择本人姓名，评分将记入所选评委名下。
          </p>
        </section>
      </main>
      <footer className="entry-footer">
        <span>GAMBOL · AI INNOVATION</span>
        <div>
          <button
            className="motion-control"
            onClick={() => setPaused(!paused)}
            aria-label={paused ? "播放背景动效" : "暂停背景动效"}
          >
            {paused ? <Play size={13} /> : <Pause size={13} />}
            <span>{paused ? "播放动效" : "暂停动效"}</span>
          </button>
          <button
            className="admin-entry"
            onClick={() => navigate("/admin/login")}
          >
            管理员入口
            <ArrowUpRight size={15} />
          </button>
        </div>
      </footer>
      {selected && (
        <Modal
          title="请确认您的评委身份"
          onClose={() => {
            if (!busy) {
              setSelected(null);
              setError("");
            }
          }}
        >
          <div className="judge-confirm">
            <span className="judge-avatar" aria-hidden="true">
              {selected.name.slice(-2)}
            </span>
            <h3>{selected.name}</h3>
            {selected.title && <p className="muted">{selected.title}</p>}
            <p className="muted">请确认是本人，避免评分记入他人名下。</p>
            {error && <Notice>{error}</Notice>}
            <button
              className="primary"
              disabled={busy}
              onClick={() => void enter()}
            >
              {busy ? "正在进入…" : "确认是本人，进入评分"}
              <ArrowRight size={18} />
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setSelected(null);
                setError("");
                void load();
              }}
            >
              返回重新选择
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function AdminLogin({
  onLogin,
  onBack,
  message,
}: {
  onLogin: (s: SessionInfo) => void;
  onBack: () => void;
  message: string;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  async function login(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
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
    <div className="admin-login">
      <header className="entry-header">
        <Brand />
        <button className="text-button" onClick={onBack}>
          <ArrowLeft size={16} />
          返回评委入口
        </button>
      </header>
      <main className="admin-login-main">
        <div className="admin-login-symbol">
          <LockKeyhole size={26} strokeWidth={1.3} />
        </div>
        <h1>赛事管理</h1>
        <p className="muted">2026 乖宝 AI 先锋赛 · 管理员工作台</p>
        <form className="admin-login-form" onSubmit={(e) => void login(e)}>
          <h2>管理员登录</h2>
          <p className="muted">使用管理员账号，管理赛事与评分进度。</p>
          {(error || message) && <Notice>{error || message}</Notice>}
          <label htmlFor="admin-username">账号</label>
          <input
            id="admin-username"
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="请输入管理员账号"
          />
          <label htmlFor="admin-password">密码</label>
          <div className="password-field">
            <input
              id="admin-password"
              type={visible ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
            />
            <button
              type="button"
              className="icon-button"
              aria-label={visible ? "隐藏密码" : "显示密码"}
              aria-pressed={visible}
              onClick={() => setVisible(!visible)}
            >
              {visible ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <button className="primary" disabled={busy}>
            {busy ? "正在登录…" : "登录管理后台"}
            <ArrowRight size={17} />
          </button>
          <p className="form-note">
            <ShieldCheck size={14} />
            仅供赛事工作人员使用
          </p>
        </form>
        <button className="text-button admin-judge-return" onClick={onBack}>
          我是评委，前往评分
          <ArrowRight size={15} />
        </button>
      </main>
      <footer className="admin-login-footer">
        GAMBOL · AI INNOVATION 2026
      </footer>
    </div>
  );
}
