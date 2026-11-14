import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { SimulationPlan } from "../domain/simulationPlan";
import type { RequirementMatch } from "../domain/catalogMatch";
import {
  prepareProfitReplayFile,
  type ProfitPreparationProgress,
} from "../services/profitData";
import { registerReplayFile } from "../services/replayCatalog";

interface Props {
  plan: SimulationPlan | null;
  matches: RequirementMatch[];
  onCatalogUpdated: () => void;
  onFullSessionFilePrepared?: (path: string) => void;
}

interface RowState {
  sourcePath: string;
  status: "idle" | "working" | "done" | "error";
  message: string;
  progress: number;
}

function keyFor(role: string, date: string): string {
  return `${role}-${date}`;
}

function brDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function PlanDataPreparationPanel({ plan, matches, onCatalogUpdated, onFullSessionFilePrepared }: Props) {
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!plan) {
      setRows({});
      return;
    }
    setRows((current) => {
      const next = { ...current };
      for (const requirement of plan.dataRequirements) {
        const key = keyFor(requirement.role, requirement.date);
        next[key] ??= { sourcePath: "", status: "idle", message: "", progress: 0 };
      }
      return next;
    });
  }, [plan]);

  const missing = useMemo(
    () => matches.filter((match) => match.status !== "AVAILABLE"),
    [matches],
  );

  function updateRow(key: string, patch: Partial<RowState>) {
    setRows((current) => ({
      ...current,
      [key]: {
        ...(current[key] ?? { sourcePath: "", status: "idle", message: "", progress: 0 }),
        ...patch,
      },
    }));
  }

  async function chooseSourceFile(key: string) {
    if (!( "__TAURI_INTERNALS__" in window)) {
      updateRow(key, { status: "error", message: "A seleção de arquivos locais está disponível no aplicativo desktop." });
      return;
    }
    try {
      const selected = await open({
        title: "Selecionar CSV de candles M2 do Profit",
        multiple: false,
        directory: false,
        filters: [{ name: "Arquivo CSV", extensions: ["csv"] }],
      });
      if (!selected || Array.isArray(selected)) return;
      updateRow(key, { sourcePath: selected, status: "idle", message: "", progress: 0 });
    } catch (error) {
      updateRow(key, {
        status: "error",
        message: error instanceof Error ? error.message : "Não foi possível abrir o seletor de arquivos.",
      });
    }
  }

  async function processMatch(match: RequirementMatch): Promise<boolean> {
    if (!plan) return false;
    const key = keyFor(match.requirement.role, match.requirement.date);
    const sourcePath = rows[key]?.sourcePath.trim().replace(/^"(.*)"$/, "$1") ?? "";
    if (!sourcePath) {
      updateRow(key, { status: "error", message: "Selecione o CSV M2 correspondente a esta data." });
      return false;
    }

    updateRow(key, { status: "working", message: "Validando e preparando candles M2...", progress: 0 });
    try {
      const result = await prepareProfitReplayFile(
        sourcePath,
        match.requirement.startTime,
        match.requirement.endTime,
        (progress: ProfitPreparationProgress) => updateRow(key, { progress: progress.percent }),
        plan.asset,
      );
      const entry = await registerReplayFile(result.outputPath);
      if (entry.tradeDate !== match.requirement.date) {
        updateRow(key, {
          status: "error",
          progress: 100,
          message: `O arquivo pertence a ${brDate(entry.tradeDate)}, mas o plano exige ${brDate(match.requirement.date)}.`,
        });
        return false;
      }
      updateRow(key, {
        status: "done",
        progress: 100,
        message: `${entry.symbol}: ${result.keptRows.toLocaleString("pt-BR")} candles M2 preparados (${(result.outputBytes / 1024).toFixed(1)} KB).`,
      });
      onCatalogUpdated();
      return true;
    } catch (error) {
      updateRow(key, {
        status: "error",
        message: error instanceof Error ? error.message : "Falha ao preparar o arquivo M2.",
      });
      return false;
    }
  }

  async function prepareFullSession(match: RequirementMatch) {
    if (!plan || match.requirement.role !== "TARGET") return;
    const key = keyFor(match.requirement.role, match.requirement.date);
    const sourcePath = rows[key]?.sourcePath.trim().replace(/^"(.*)"$/, "$1") ?? "";
    if (!sourcePath) {
      updateRow(key, { status: "error", message: "Selecione o CSV original que contém o pregão completo para habilitar a análise de Stops." });
      return;
    }
    updateRow(key, { status: "working", message: "Preparando o pregão completo para a análise contrafactual...", progress: 0 });
    try {
      const result = await prepareProfitReplayFile(
        sourcePath,
        plan.fullSessionStart,
        plan.fullSessionEnd,
        (progress) => updateRow(key, { progress: progress.percent }),
        plan.asset,
      );
      const entry = await registerReplayFile(result.outputPath);
      if (entry.tradeDate !== plan.targetDate) {
        throw new Error("O CSV selecionado não corresponde à data do pregão planejado.");
      }
      onFullSessionFilePrepared?.(result.outputPath);
      updateRow(key, {
        status: "done",
        progress: 100,
        message: `Pregão completo preparado: ${result.keptRows.toLocaleString("pt-BR")} candles M2 (${plan.fullSessionStart}–${plan.fullSessionEnd}).`,
      });
      onCatalogUpdated();
    } catch (error) {
      updateRow(key, {
        status: "error",
        message: error instanceof Error ? error.message : "Não foi possível preparar o pregão completo.",
      });
    }
  }

  async function processAll() {
    if (!plan || processing) return;
    setProcessing(true);
    try {
      for (const match of missing) {
        const key = keyFor(match.requirement.role, match.requirement.date);
        if (rows[key]?.sourcePath.trim()) await processMatch(match);
      }
    } finally {
      setProcessing(false);
    }
  }

  if (!plan) return null;

  return (
    <section className="plan-data-panel card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Etapa 3 · Preparar dados</p>
          <h2>Importar candles M2</h2>
        </div>
        <span className="history-count">
          {missing.length} pendência{missing.length === 1 ? "" : "s"}
        </span>
      </div>

      <p className="data-description">
        No Profit, exporte o histórico em período gráfico de 2 minutos (M2). O CSV deve conter
        Ativo/Contrato, Data/Hora (ou Data com data e hora juntas), Abertura, Máxima, Mínima, Fechamento e Volume Quantidade/Quantidade. Se o Profit exportar Volume Financeiro e Volume Quantidade, o simulador utiliza a quantidade. Não é necessário
        exportar negócios tick a tick. O sistema guarda somente os candles M2 e gera uma
        trajetória sintética segundo a segundo durante a reprodução. Arquivos antigos de
        negócios individuais continuam aceitos, mas não são a fonte recomendada.
      </p>

      <div className="plan-data-list">
        {matches.map((match) => {
          const key = keyFor(match.requirement.role, match.requirement.date);
          const row = rows[key];
          const available = match.status === "AVAILABLE";
          return (
            <article key={key} className={available ? "available" : "pending"}>
              <div className="plan-data-identity">
                <span>{match.requirement.role === "WARMUP" ? "Aquecimento oculto" : "Pregão-alvo"}</span>
                <strong>{brDate(match.requirement.date)}</strong>
                <small>{match.requirement.startTime}–{match.requirement.endTime}</small>
              </div>

              {available ? (
                <div className="plan-data-existing">
                  <strong>Já disponível</strong>
                  <small>{match.entry?.symbol} · {match.entry?.outputPath}</small>
                  {match.requirement.role === "TARGET" && (
                    <div className="full-session-source">
                      <label htmlFor={`full-session-${key}`}>CSV original para análise do pregão completo (opcional)</label>
                      <input
                        id={`full-session-${key}`}
                        value={row?.sourcePath ?? ""}
                        onChange={(event) => updateRow(key, { sourcePath: event.target.value })}
                        placeholder="Selecione o CSV M2 que contém o dia completo"
                        disabled={processing || row?.status === "working"}
                      />
                      <div className="plan-data-actions">
                        <button type="button" className="secondary" onClick={() => void chooseSourceFile(key)} disabled={processing || row?.status === "working"}>Selecionar CSV original</button>
                        <button type="button" onClick={() => void prepareFullSession(match)} disabled={processing || row?.status === "working" || !(row?.sourcePath ?? "").trim()}>Preparar pregão completo</button>
                      </div>
                      <small>A análise posterior usará ${plan.fullSessionStart}–${plan.fullSessionEnd}. Sem esse arquivo, será possível analisar apenas a janela carregada no replay.</small>
                    </div>
                  )}
                </div>
              ) : (
                <div className="plan-data-input">
                  <input
                    value={row?.sourcePath ?? ""}
                    onChange={(event) => updateRow(key, { sourcePath: event.target.value })}
                    placeholder={`CSV M2 de ${brDate(match.requirement.date)}`}
                    disabled={processing || row?.status === "working"}
                  />
                  <div className="plan-data-actions">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => void chooseSourceFile(key)}
                      disabled={processing || row?.status === "working"}
                    >
                      Selecionar CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => void processMatch(match)}
                      disabled={processing || row?.status === "working" || !(row?.sourcePath ?? "").trim()}
                    >
                      {row?.status === "working" ? "Preparando..." : "Preparar M2"}
                    </button>
                  </div>
                </div>
              )}

              {!available && row?.status === "working" && (
                <div className="mini-progress">
                  <span style={{ width: `${Math.min(100, row.progress)}%` }} />
                </div>
              )}
              {!available && row?.message && (
                <small className={`plan-data-message ${row.status}`}>{row.message}</small>
              )}
            </article>
          );
        })}
      </div>

      {missing.length > 0 && (
        <button
          type="button"
          className="planner-apply"
          onClick={() => void processAll()}
          disabled={processing || !missing.some((match) => Boolean(rows[keyFor(match.requirement.role, match.requirement.date)]?.sourcePath.trim()))}
        >
          {processing ? "Preparando arquivos..." : "Preparar todos os caminhos informados"}
        </button>
      )}

      {missing.length === 0 && (
        <div className="data-status success">Nenhuma importação adicional é necessária para este plano.</div>
      )}
    </section>
  );
}
