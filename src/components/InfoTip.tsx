import type { ReactNode } from "react";

interface InfoTipProps {
  label: string;
  children: ReactNode;
  className?: string;
}

export function InfoTip({ label, children, className }: InfoTipProps) {
  return (
    <details className={["info-tip", className].filter(Boolean).join(" ")}>
      <summary aria-label={label} title={label}>
        <span aria-hidden="true">i</span>
      </summary>
      <div className="info-tip-content">
        <strong>{label}</strong>
        <div>{children}</div>
      </div>
    </details>
  );
}
