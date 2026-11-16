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
        {/* O ponto e a haste vetoriais independem da métrica da fonte. */}
        <svg className="info-tip-symbol" viewBox="0 0 20 20" fill="none"
          aria-hidden="true" focusable="false">
          <circle cx="10" cy="5.2" r="1.35" fill="currentColor" />
          <path d="M10 9v6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </summary>
      <div className="info-tip-content">
        <strong>{label}</strong>
        <div>{children}</div>
      </div>
    </details>
  );
}
