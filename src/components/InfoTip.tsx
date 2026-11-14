import type { ReactNode } from "react";

interface InfoTipProps {
  label: string;
  children: ReactNode;
}

export function InfoTip({ label, children }: InfoTipProps) {
  return (
    <details className="info-tip">
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
