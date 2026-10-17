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
