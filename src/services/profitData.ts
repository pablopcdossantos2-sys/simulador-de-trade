import { invoke } from "@tauri-apps/api/core";

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

function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export async function prepareProfitReplayFile(
  sourcePath: string,
): Promise<ProfitPreparationResult> {
  if (!isTauriRuntime()) {
    throw new Error(
      "O tratamento de arquivos locais do Profit está disponível no aplicativo desktop Tauri.",
    );
  }

  return invoke<ProfitPreparationResult>("prepare_profit_replay_file", {
    sourcePath,
  });
}
