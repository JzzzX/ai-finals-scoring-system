import { useEffect, useRef, type ReactNode } from "react";
import { X, AlertCircle, CheckCircle2 } from "lucide-react";
import type { ContestStatus } from "../../shared/types";
export function Brand() {
  return (
    <img
      className="brand-lockup"
      src="/branding/brand-lockup.png"
      width="401"
      height="64"
      alt="乖宝宠物食品集团 · 麦富迪 · 飞书"
    />
  );
}
export function Status({ status }: { status: ContestStatus }) {
  return (
    <span className={`status status-${status}`}>
      <i />
      {status === "open"
        ? "评分进行中"
        : status === "closed"
          ? "评分已结束"
          : "等待开始评分"}
    </span>
  );
}
export function Notice({
  children,
  success = false,
}: {
  children: ReactNode;
  success?: boolean;
}) {
  return (
    <div
      role={success ? "status" : "alert"}
      className={`notice ${success ? "success" : ""}`}
    >
      {success ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
      <span>{children}</span>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={`modal ${wide ? "wide" : ""}`}
      aria-label={title}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="关闭" onClick={onClose}>
          <X size={22} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
