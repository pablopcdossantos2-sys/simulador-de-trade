interface Props {
  message: string | null;
  onClose: () => void;
}

export function RuleViolationModal({ message, onClose }: Props) {
  if (!message) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="rule-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="rule-modal-title"
        aria-describedby="rule-modal-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="rule-modal-icon" aria-hidden="true">!</div>
        <p className="eyebrow">Operação bloqueada</p>
        <h2 id="rule-modal-title">Fora do operacional</h2>
        <p id="rule-modal-description">
          Você está infringindo as regras do operacional. A operação não será executada.
        </p>
        <div className="rule-modal-reason">
          <strong>Motivo</strong>
          <span>{message}</span>
        </div>
        <button className="modal-primary" autoFocus onClick={onClose}>
          Entendi
        </button>
      </section>
    </div>
  );
}
