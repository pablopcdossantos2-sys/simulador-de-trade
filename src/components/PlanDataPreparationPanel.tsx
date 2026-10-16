import { useEffect, useMemo, useState } from "react";
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

export function PlanDataPreparationPanel({
  plan,
  matches,
  onCatalogUpdated,
}: Props) {
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
        next[key] ??= {
          sourcePath: "",
          status: "idle",
          message: "",
          progress: 0,
        };
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
        ...(current[key] ?? {
          sourcePath: "",
          status: "idle",
          message: "",
          progress: 0,
        }),
        ...patch,
      },
    }));
  }

  async function processMatch(match: RequirementMatch): Promise<boolean> {
    const key = keyFor(match.requirement.role, match.requirement.date);
    const row = rows[key];
    const sourcePath = row?.sourcePath.trim().replace(/^"(.*)"$/, "$1") ?? "";

    if (!sourcePath) {
      updateRow(key, {
        status: "error",
        message: "Informe o CSV bruto do Profit para esta data.",
      });
      return false;
    }

    updateRow(key, {
      status: "working",
      message: "Tratando arquivo...",
      progress: 0,
    });

    try {
      const result = await prepareProfitReplayFile(
        sourcePath,
        match.requirement.startTime,
        match.requirement.endTime,
        (progress: ProfitPreparationProgress) =>
          updateRow(key, { progress: progress.percent }),
      );

      const entry = await registerReplayFile(result.outputPath);

      if (entry.tradeDate !== match.requirement.date) {
        updateRow(key, {
          status: "error",
          progress: 100,
          message: `O arquivo tratado pertence a ${brDate(entry.tradeDate)}, mas o plano exige ${brDate(match.requirement.date)}.`,
        });
        return false;
      }

      updateRow(key, {
        status: "done",
        progress: 100,
        message: `${entry.symbol} catalogado com sucesso.`,
      });
      onCatalogUpdated();
      return true;
    } catch (error) {
      updateRow(key, {
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Falha ao tratar o arquivo.",
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
        if (!rows[key]?.sourcePath.trim()) continue;
        await processMatch(match);
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
          <p className="eyebrow">Coleta orientada pelo plano</p>
          <h2>Tratar dados necessários</h2>
        </div>
        <span className="history-count">
          {missing.length} pendência{missing.length === 1 ? "" : "s"}
        </span>
      </div>

      <p className="data-description">
        Para cada item ainda ausente, selecione ou cole o caminho do CSV bruto
        exportado pelo Profit Ultra. Cada arquivo será tratado usando exatamente
        a janela necessária para a função dele no plano.
      </p>

      <div className="plan-data-list">
        {matches.map((match) => {
          const key = keyFor(match.requirement.role, match.requirement.date);
          const row = rows[key];
          const available = match.status === "AVAILABLE";

          return (
            <article
              key={key}
              className={available ? "available" : "pending"}
            >
              <div className="plan-data-identity">
                <span>
                  {match.requirement.role === "WARMUP"
                    ? "Aquecimento oculto"
                    : "Pregão-alvo"}
                </span>
                <strong>{brDate(match.requirement.date)}</strong>
                <small>
                  {match.requirement.startTime}–{match.requirement.endTime}
                </small>
              </div>

              {available ? (
                <div className="plan-data-existing">
                  <strong>Já disponível</strong>
                  <small>
                    {match.entry?.symbol} · {match.entry?.outputPath}
                  </small>
                </div>
              ) : (
                <div className="plan-data-input">
                  <input
                    value={row?.sourcePath ?? ""}
                    onChange={(event) =>
                      updateRow(key, { sourcePath: event.target.value })
                    }
                    placeholder={`CSV bruto de ${brDate(match.requirement.date)}`}
                    disabled={processing || row?.status === "working"}
                  />
                  <button
                    type="button"
                    onClick={() => void processMatch(match)}
                    disabled={
                      processing ||
                      row?.status === "working" ||
                      !(row?.sourcePath ?? "").trim()
                    }
                  >
                    {row?.status === "working" ? "Tratando..." : "Tratar"}
                  </button>
                </div>
              )}

              {!available && row?.status === "working" && (
                <div className="mini-progress">
                  <span style={{ width: `${Math.min(100, row.progress)}%` }} />
                </div>
              )}

              {!available && row?.message && (
                <small className={`plan-data-message ${row.status}`}>
                  {row.message}
                </small>
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
          disabled={
            processing ||
            !missing.some((match) => {
              const key = keyFor(match.requirement.role, match.requirement.date);
              return Boolean(rows[key]?.sourcePath.trim());
            })
          }
        >
          {processing ? "Tratando arquivos..." : "Tratar todos os caminhos informados"}
        </button>
      )}

      {missing.length === 0 && (
        <div className="data-status success">
          Nenhum tratamento adicional é necessário para este plano.
        </div>
      )}
    </section>
  );
}
