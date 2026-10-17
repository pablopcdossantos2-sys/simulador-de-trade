import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Erro não tratado na interface:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="fatal-error-screen">
        <section className="fatal-error-card">
          <p className="eyebrow">Falha inesperada da interface</p>
          <h1>O simulador interrompeu esta tela para proteger o estado.</h1>
          <p>
            Nenhuma nova operação será executada até a interface ser recarregada.
            Se o problema se repetir, copie a mensagem abaixo para o diagnóstico.
          </p>
          <pre>{this.state.error.message}</pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
          >
            Recarregar aplicativo
          </button>
        </section>
      </main>
    );
  }
}
