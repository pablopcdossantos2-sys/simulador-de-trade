import { useMemo } from "react";
import { performanceByAsset } from "../domain/portfolioMetrics";
import { performanceBySetup } from "../domain/sessionReport";
import type { Trade } from "../types";

interface Props {
  trades: Trade[];
  hidden?: boolean;
}

function money(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function ProgressOverviewPanel({ trades, hidden = false }: Props) {
  const assets = useMemo(() => performanceByAsset(trades), [trades]);
  const setups = useMemo(() => performanceBySetup(trades), [trades]);

  return (
    <section className="progress-overview card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Evolução agregada</p>
          <h2>Resultado por ativo</h2>
        </div>
        <span className="history-count">{trades.length} trades</span>
      </div>

      {hidden ? (
        <div className="exam-lock">
          <strong>Painel oculto durante o Modo Prova</strong>
          <span>
            As métricas agregadas ficam indisponíveis enquanto a prova atual
            estiver em andamento.
          </span>
        </div>
      ) : (
        <>
        <div className="asset-performance-grid">
          {assets.map((item) => (
            <article key={item.asset}>
              <div className="asset-performance-head">
                <strong>{item.asset}</strong>
                <span>{item.trades} trades</span>
              </div>

              <dl>
                <div>
                  <dt>Win rate</dt>
                  <dd>{item.winRatePct.toFixed(1)}%</dd>
                </div>
                <div>
                  <dt>Pontos</dt>
                  <dd>{item.netPoints.toFixed(1)}</dd>
                </div>
                <div>
                  <dt>Bruto</dt>
                  <dd>{money(item.grossResultBRL)}</dd>
                </div>
                <div>
                  <dt>Custos</dt>
                  <dd>{money(item.operationalCostsBRL)}</dd>
                </div>
                <div>
                  <dt>Líquido</dt>
                  <dd
                    className={
                      item.netResultBRL >= 0 ? "positive" : "negative"
                    }
                  >
                    {money(item.netResultBRL)}
                  </dd>
                </div>
                <div>
                  <dt>Vitórias / derrotas</dt>
                  <dd>
                    {item.wins} / {item.losses}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>

        <div className="aggregate-setup-section">
          <div className="training-timeline-heading">
            <strong>Resultado histórico por setup/sinal</strong>
            <span>{setups.length} grupo{setups.length === 1 ? "" : "s"}</span>
          </div>
          <div className="setup-report-grid">
            {setups.map((item) => (
              <article key={item.setup}>
                <strong>{item.setup}</strong>
                <dl>
                  <div>
                    <dt>Trades</dt>
                    <dd>{item.trades}</dd>
                  </div>
                  <div>
                    <dt>Win rate</dt>
                    <dd>{item.winRatePct.toFixed(1)}%</dd>
                  </div>
                  <div>
                    <dt>Pontos</dt>
                    <dd className={item.netPoints >= 0 ? "positive" : "negative"}>
                      {item.netPoints.toFixed(1)}
                    </dd>
                  </div>
                  <div>
                    <dt>Líquido</dt>
                    <dd className={item.netResultBRL >= 0 ? "positive" : "negative"}>
                      {money(item.netResultBRL)}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </div>
        </>
      )}
    </section>
  );
}
