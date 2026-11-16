import { useEffect, useState, type ReactNode } from "react";

interface Props {
  title: string;
  status: string;
  complete: boolean;
  /** Quando falso, a seção continua contraída até o usuário pedir para editá-la. */
  expandWhenIncomplete?: boolean;
  resetKey?: string | number;
  children: ReactNode;
}

/**
 * Fluxo progressivo: etapas concluídas se recolhem, mas permanecem editáveis.
 * Quando o plano ou os requisitos voltam a ficar pendentes, reabre a etapa
 * relevante sem exigir que o usuário descubra onde houve a pendência.
 */
export function SetupDisclosure({
  title, status, complete, expandWhenIncomplete = true, resetKey, children,
}: Props) {
  const [expanded, setExpanded] = useState(() => !complete && expandWhenIncomplete);
  useEffect(() => {
    setExpanded(!complete && expandWhenIncomplete);
  }, [complete, expandWhenIncomplete, resetKey]);

  return (
    <details className="setup-disclosure" open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary className="setup-disclosure-summary">
        <span className="setup-disclosure-name">{title}</span>
        <span className={complete ? "setup-disclosure-status done" : "setup-disclosure-status"}>
          {status}
        </span>
        <span aria-hidden="true" className="setup-disclosure-caret">{expanded ? "−" : "+"}</span>
      </summary>
      <div className="setup-disclosure-content">{children}</div>
    </details>
  );
}
