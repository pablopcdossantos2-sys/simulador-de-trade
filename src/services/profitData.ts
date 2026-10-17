import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface ProfitPreparationResult {
  sourcePath: string;
  outputPath: string;
  metadataPath: string;
  symbol: string;
  sourceOrder: "ASCENDING" | "DESCENDING" | "UNKNOWN";
  sourceRows: number;
  keptRows: number;
  discardedRows: number;
  sourceBytes: number;
  outputBytes: number;
  reductionPct: number;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  sessionStart: string;
  sessionEnd: string;
}

export interface ProfitPreparationProgress {
  operationId: string;
  percent: number;
  bytesProcessed: number;
  bytesTotal: number;
  sourceRows: number;
  keptRows: number;
}


export interface ProfitIndexProgress {
  operationId: string;
  percent: number;
  bytesProcessed: number;
  bytesTotal: number;
  sourceRows: number;
  minuteBuckets: number;
}

export interface ProfitTimeIndexResult {
  sourcePath: string;
  indexPath: string;
  symbol: string;
  tradeDate: string;
  sourceOrder: "ASCENDING" | "DESCENDING";
  sourceRows: number;
  minuteBuckets: number;
  sourceBytes: number;
  firstTimestamp: string;
  lastTimestamp: string;
}

export interface ProfitTimeWindowResult {
  sourcePath: string;
  indexPath: string;
  symbol: string;
  tradeDate: string;
  sourceOrder: "ASCENDING" | "DESCENDING";
  startByte: number;
  endByteExclusive: number;
  firstLine: number;
  lastLine: number;
  selectedTrades: number;
  selectedMinutes: number;
}

function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export async function prepareProfitReplayFile(
  sourcePath: string,
  sessionStart: string,
  sessionEnd: string,
  onProgress?: (progress: ProfitPreparationProgress) => void,
): Promise<ProfitPreparationResult> {
  if (!isTauriRuntime()) {
    throw new Error(
      "O tratamento de arquivos locais do Profit está disponível no aplicativo desktop Tauri.",
    );
  }

  const operationId = crypto.randomUUID();
  const unlisten = onProgress
    ? await listen<ProfitPreparationProgress>(
        "profit-preparation-progress",
        (event) => {
          if (event.payload.operationId === operationId) {
            onProgress(event.payload);
          }
        },
      )
    : null;

  try {
    return await invoke<ProfitPreparationResult>("prepare_profit_replay_file", {
      operationId,
      sourcePath,
      sessionStart,
      sessionEnd,
    });
  } finally {
    unlisten?.();
  }
}

export async function buildProfitTimeIndex(
  sourcePath: string,
  onProgress?: (progress: ProfitIndexProgress) => void,
): Promise<ProfitTimeIndexResult> {
  if (!isTauriRuntime()) {
    throw new Error(
      "A indexação M1 de arquivos locais está disponível no aplicativo desktop Tauri.",
    );
  }

  const operationId = crypto.randomUUID();
  const unlisten = onProgress
    ? await listen<ProfitIndexProgress>(
        "profit-index-progress",
        (event) => {
          if (event.payload.operationId === operationId) {
            onProgress(event.payload);
          }
        },
      )
    : null;

  try {
    return await invoke<ProfitTimeIndexResult>("build_profit_time_index", {
      operationId,
      sourcePath,
    });
  } finally {
    unlisten?.();
  }
}

export async function locateProfitTimeWindow(
  sourcePath: string,
  sessionStart: string,
  sessionEnd: string,
): Promise<ProfitTimeWindowResult> {
  if (!isTauriRuntime()) {
    throw new Error(
      "A localização por índice M1 está disponível no aplicativo desktop Tauri.",
    );
  }

  return invoke<ProfitTimeWindowResult>("locate_profit_time_window", {
    sourcePath,
    sessionStart,
    sessionEnd,
  });
}

