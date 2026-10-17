import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import {
  blockedAttemptBreakdown,
  performanceByHour,
  performanceBySetup,
  tradeSetupLabel,
} from "../domain/sessionReport";
import type {
  SessionPerformance,
  Trade,
  TrainingEvent,
  TrainingSession,
} from "../types";

export interface CompleteSessionExport {
  format: "simulador-de-trade-session-report";
  schemaVersion: 2;
  exportedAt: string;
  session: TrainingSession;
  performance: SessionPerformance;
  hourlyPerformance: ReturnType<typeof performanceByHour>;
  setupPerformance: ReturnType<typeof performanceBySetup>;
  blockedAttempts: ReturnType<typeof blockedAttemptBreakdown>;
  events: TrainingEvent[];
  trades: Trade[];
}

function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function csvEscape(value: unknown): string {
  let text: string;

  if (value === null || value === undefined) {
    text = "";
  } else if (typeof value === "number") {
    const rounded = Number(value.toFixed(8));
    text = String(rounded).replace(".", ",");
  } else {
    text =
      typeof value === "object"
        ? JSON.stringify(value)
        : String(value);

    // Evita formula injection ao abrir o CSV em Excel/LibreOffice.
    if (/^[=+\-@]/.test(text)) {
      text = `'${text}`;
    }
  }

  if (/[";\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

export function buildCompleteSessionExport(input: {
  session: TrainingSession;
  performance: SessionPerformance;
  events: TrainingEvent[];
  trades: Trade[];
}): CompleteSessionExport {
  return {
    format: "simulador-de-trade-session-report",
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    session: input.session,
    performance: input.performance,
    hourlyPerformance: performanceByHour(input.trades),
    setupPerformance: performanceBySetup(input.trades),
    blockedAttempts: blockedAttemptBreakdown(input.events),
    events: input.events,
    trades: input.trades,
  };
}

export function sessionTradesToCsv(
  session: TrainingSession,
  trades: Trade[],
): string {
  const headers = [
    "session_id",
    "trade_date",
    "asset",
    "timeframe_minutes",
    "mode",
    "trade_id",
    "side",
    "signal_id",
    "setup",
    "requested_entry",
    "executed_entry",
    "stop_loss",
    "target",
    "contracts",
    "opened_at",
    "closed_at",
    "exit_reason",
    "exit_price",
    "result_points",
    "gross_result_brl",
    "operational_costs_brl",
    "net_result_brl",
    "slippage_ticks_per_side",
    "intrabar_policy",
    "post_trade_note",
    "indicator_version",
    "entry_zone",
    "context_market_timestamp",
  ];

  const rows = trades.map((trade) => [
    session.id,
    session.tradeDate,
    trade.asset,
    session.timeframeMinutes,
    session.mode,
    trade.id,
    trade.side,
    trade.signalId,
    tradeSetupLabel(trade),
    trade.requestedEntry,
    trade.entry,
    trade.stopLoss,
    trade.target,
    trade.contracts,
    trade.openedAt,
    trade.closedAt,
    trade.exitReason,
    trade.exitPrice,
    trade.resultPoints,
    trade.grossResultBRL,
    trade.operationalCostsBRL,
    trade.netResultBRL,
    trade.slippageTicksPerSide,
    trade.intrabarPolicy ?? "STOP_FIRST",
    trade.postTradeNote,
    trade.entryContext?.indicatorVersion ?? "",
    trade.entryContext?.zone ?? "",
    trade.entryContext?.marketTimestamp ?? "",
  ]);

  return "\uFEFF" + [
    headers.join(";"),
    ...rows.map((row) => row.map(csvEscape).join(";")),
  ].join("\r\n");
}

async function choosePath(
  session: TrainingSession,
  extension: "json" | "csv",
): Promise<string | null> {
  if (!isTauriRuntime()) {
    throw new Error(
      "A exportação para arquivo está disponível no aplicativo desktop Tauri.",
    );
  }

  const label = extension === "json" ? "relatorio" : "trades";
  return save({
    title:
      extension === "json"
        ? "Exportar relatório completo da sessão"
        : "Exportar trades da sessão em CSV",
    defaultPath: `${safeName(session.tradeDate)}-${session.asset}-${label}.${extension}`,
    filters: [
      {
        name: extension === "json" ? "Relatório JSON" : "Planilha CSV",
        extensions: [extension],
      },
    ],
  });
}

async function writeExport(
  destinationPath: string,
  content: string,
  extension: "json" | "csv",
): Promise<void> {
  await invoke("write_report_export", {
    destinationPath,
    content,
    extension,
  });
}

export async function exportSessionJson(
  bundle: CompleteSessionExport,
): Promise<string | null> {
  const destinationPath = await choosePath(bundle.session, "json");
  if (!destinationPath) return null;

  await writeExport(
    destinationPath,
    JSON.stringify(bundle, null, 2),
    "json",
  );
  return destinationPath;
}

export async function exportSessionCsv(
  session: TrainingSession,
  trades: Trade[],
): Promise<string | null> {
  const destinationPath = await choosePath(session, "csv");
  if (!destinationPath) return null;

  await writeExport(
    destinationPath,
    sessionTradesToCsv(session, trades),
    "csv",
  );
  return destinationPath;
}
