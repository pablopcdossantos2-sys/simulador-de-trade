import { useEffect, useMemo, useState } from "react";
import { InfoTip } from "./InfoTip";
import { open } from "@tauri-apps/plugin-dialog";
import type { SimulationPlan } from "../domain/simulationPlan";
import { matchIsUsable, type RequirementMatch } from "../domain/catalogMatch";
import {
  prepareProfitReplayFile,
  type ProfitPreparationProgress,
} from "../services/profitData";
import { registerReplayFile } from "../services/replayCatalog";

interface Props {
  plan: SimulationPlan | null;
  matches: RequirementMatch[];
  onCatalogUpdated: () => void;
}

function readableError(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "");
    if (message.trim()) return message;
  }
  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== "{}") return serialized;
  } catch {
    // Mantém a mensagem alternativa se o erro não puder ser serializado.
  }
  return fallback;
}

interface RowState {
  sourcePath: string;
  sourceTimeframeMinutes: 1 | 2;
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

export function PlanDataPreparationPanel({ plan, matches, onCatalogUpdated }: Props) {
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
        next[key] ??= { sourcePath: "", sourceTimeframeMinutes: 1, status: "idle", message: "", progress: 0 };
      }
      return next;
    });
  }, [plan]);

  const missing = useMemo(
    () => matches.filter((match) => !matchIsUsable(match)),
    [matches],
  );

  function updateRow(key: string, patch: Partial<RowState>) {
    setRows((current) => ({
      ...current,
      [key]: {
        ...(current[key] ?? { sourcePath: "", sourceTimeframeMinutes: 1, status: "idle", message: "", progress: 0 }),
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
        title: "Selecionar CSV M1 ou M2 do Profit",
        multiple: false,
        directory: false,
        filters: [{ name: "Arquivo CSV", extensions: ["csv"] }],
      });
      if (!selected || Array.isArray(selected)) return;
      setRows((current) => ({ ...current, [key]: { ...(current[key] ?? { sourcePath: "", sourceTimeframeMinutes: 1, status: "idle", message: "", progress: 0 }), sourcePath: selected, status: "idle", message: "", progress: 0 } }));
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
      updateRow(key, { status: "error", message: "Selecione o CSV M1 ou M2 que contém esta data." });
      return false;
    }

    updateRow(key, { status: "working", message: "Validando e preparando o replay...", progress: 0 });
    try {
      const result = await prepareProfitReplayFile(
        sourcePath,
        match.requirement.startTime,
        match.requirement.endTime,
        (progress: ProfitPreparationProgress) => updateRow(key, { progress: progress.percent }),
        plan.asset,
        match.requirement.date,
        rows[key]?.sourceTimeframeMinutes ?? 1,
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
      if (result.m1OutputPath) {
        await registerReplayFile(result.m1OutputPath);
      }
      updateRow(key, {
        status: "done",
        progress: 100,
        message: `${entry.symbol}: ${result.keptRows.toLocaleString("pt-BR")} candles M2 preparados${result.m1OutputPath ? " e replay M1 original catalogado" : ""}.`,
      });
      onCatalogUpdated();
      return true;
    } catch (error) {
      updateRow(key, {
        status: "error",
        message: readableError(error, "Falha ao preparar o arquivo M2. Consulte os detalhes técnicos."),
      });
      return false;
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
        <div className="section-title-with-help">
          <h2>Dados do pregão</h2>
          <InfoTip label="Sobre os arquivos do Profit">
            Selecione o timeframe real do CSV. O sistema separa a data solicitada, gera M2 e preserva M1 para replay sintético. Horário planejado não garante candle exatamente naquele minuto: diferenças nas bordas são exibidas, sem bloquear nem criar candles fictícios. Rótulos de série contínua WINFUT/WDOFUT não identificam o vencimento específico.
          </InfoTip>
        </div>
        <span className="history-count">
          {missing.length} pendência{missing.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="plan-data-list">
        {matches.map((match) => {
          const key = keyFor(match.requirement.role, match.requirement.date);
          const row = rows[key];
          const available = matchIsUsable(match);
          return (
            <article key={key} className={available ? "available" : "pending"}>
              <div className="plan-data-identity">
                <span>{match.requirement.role === "WARMUP" ? "Histórico prévio" : "Pregão completo"}</span>
                <strong>{brDate(match.requirement.date)}</strong>
                <small>{match.requirement.startTime}–{match.requirement.endTime}</small>
              </div>

              {available ? (
                <div className="plan-data-existing">
                  <strong>{match.status === "AVAILABLE_WITH_NOTICE" ? "Disponível com observação" : "Já disponível"}</strong>
                  <small>{match.entry?.symbol}{match.status === "AVAILABLE_WITH_NOTICE" ? " · usam-se somente candles existentes" : ""}</small>
                </div>
              ) : (
                <div className="plan-data-input">
                  <div className="plan-data-file-field">
                    <label htmlFor={`source-csv-${key}`}>Arquivo CSV do Profit</label>
                    <div className="plan-data-file-row">
                      <input
                        id={`source-csv-${key}`}
                        value={row?.sourcePath ?? ""}
                        onChange={(event) => updateRow(key, { sourcePath: event.target.value })}
                        placeholder={`CSV com ${brDate(match.requirement.date)}`}
                        disabled={processing || row?.status === "working"}
                      />
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => void chooseSourceFile(key)}
                        disabled={processing || row?.status === "working"}
                      >
                        Selecionar CSV
                      </button>
                    </div>
                  </div>
                  <div className="plan-data-timeframe-field">
                    <label htmlFor={`source-timeframe-${key}`}>Timeframe do CSV</label>
                    <div className="plan-data-timeframe-row">
                      <select
                        id={`source-timeframe-${key}`}
                        value={row?.sourceTimeframeMinutes ?? 1}
                        onChange={(event) => updateRow(key, { sourceTimeframeMinutes: Number(event.target.value) as 1 | 2 })}
                        disabled={processing || row?.status === "working"}
                      >
                        <option value={1}>M1</option>
                        <option value={2}>M2</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => void processMatch(match)}
                        disabled={processing || row?.status === "working" || !(row?.sourcePath ?? "").trim()}
                      >
                        {row?.status === "working" ? "Preparando..." : "Preparar replay"}
                      </button>
                    </div>
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
