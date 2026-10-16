import { useEffect, useMemo, useState } from "react";
import type { Asset } from "../types";
import type { SimulationPlan } from "../domain/simulationPlan";
import {
  matchSimulationPlan,
  planIsReady,
  type RequirementMatch,
} from "../domain/catalogMatch";
import {
  listReplayCatalog,
  pruneMissingReplayCatalog,
  type ReplayCatalogEntry,
} from "../services/replayCatalog";

interface Props {
  plan: SimulationPlan | null;
  asset: Asset;
  refreshKey: number;
  onMatchesChange?: (matches: RequirementMatch[]) => void;
}

function brDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function ReplayCatalogPanel({
  plan,
  asset,
  refreshKey,
  onMatchesChange,
}: Props) {
  const [entries, setEntries] = useState<ReplayCatalogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh(prune = false) {
    try {
      const next = prune
        ? await pruneMissingReplayCatalog()
        : await listReplayCatalog();
      setEntries(next);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  useEffect(() => {
    void refresh();
  }, [refreshKey]);

  const matches = useMemo(
    () => (plan ? matchSimulationPlan(plan, asset, entries) : []),
    [plan, asset, entries],
  );

  useEffect(() => {
    onMatchesChange?.(matches);
  }, [matches]);

  return (
    <section className="catalog-panel card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Biblioteca local</p>
          <h2>Dados disponíveis para o plano</h2>
        </div>
        <button type="button" className="catalog-refresh" onClick={() => void refresh(true)}>
          Atualizar catálogo
        </button>
      </div>

      {!plan && (
        <p className="data-description">
          Aplique primeiro um plano de simulação para o sistema comparar as datas necessárias
          com os arquivos já preparados neste computador.
        </p>
      )}

      {error && <div className="data-status error">{error}</div>}

      {plan && (
        <>
          <div className={`catalog-readiness ${planIsReady(matches) ? "ready" : "missing"}`}>
            <strong>
              {planIsReady(matches)
                ? "Todos os dados necessários estão disponíveis."
                : "Ainda faltam dados para iniciar esta simulação."}
            </strong>
            <span>
              {matches.filter((match) => match.status === "AVAILABLE").length} de{" "}
              {matches.length} requisitos atendidos
            </span>
          </div>

          <div className="catalog-requirements">
            {matches.map((match) => (
              <article
                key={`${match.requirement.role}-${match.requirement.date}`}
                className={
                  match.status === "AVAILABLE"
                    ? "available"
                    : match.status === "CONTRACT_MISMATCH"
                      ? "mismatch"
                      : "missing"
                }
              >
                <div>
                  <span className="catalog-role">
                    {match.requirement.role === "WARMUP" ? "Aquecimento" : "Pregão-alvo"}
                  </span>
                  <strong>{brDate(match.requirement.date)}</strong>
                  <small>
                    {match.requirement.startTime}–{match.requirement.endTime}
                  </small>
                </div>

                <div className="catalog-status">
                  <strong>
                    {match.status === "AVAILABLE"
                      ? "Disponível"
                      : match.status === "CONTRACT_MISMATCH"
                        ? "Contrato incompatível"
                        : "Faltando"}
                  </strong>
                  <small>
                    {match.entry
                      ? match.status === "CONTRACT_MISMATCH"
                        ? `${match.entry.symbol} disponível, mas o pregão-alvo usa outro contrato.`
                        : `${match.entry.symbol} · ${match.entry.sessionStart}–${match.entry.sessionEnd}`
                      : "Trate e catalogue um arquivo compatível do Profit Ultra."}
                  </small>
                </div>
              </article>
            ))}
          </div>

          <p className="data-footnote">
            Arquivos movidos ou apagados são marcados como indisponíveis. O botão
            “Atualizar catálogo” remove referências a arquivos que não existem mais.
          </p>
        </>
      )}
    </section>
  );
}
