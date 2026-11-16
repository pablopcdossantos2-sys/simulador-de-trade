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
        {/* O círculo e o 'i' usam o mesmo SVG; não dependem do alinhamento CSS,
            da fonte nem do indicador de expansão nativo do WebView2. */}
        <svg className="info-tip-symbol" viewBox="0 0 24 24" fill="none"
          aria-hidden="true" focusable="false">
          <circle className="info-tip-ring" cx="12" cy="12" r="10.2"
            stroke="currentColor" strokeWidth="1.7" />
          <circle cx="12" cy="7.3" r="1.3" fill="currentColor" />
          <path d="M12 11v6.1" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </summary>
      <div className="info-tip-content">
        <strong>{label}</strong>
        <div>{children}</div>
      </div>
    </details>
  );
}
