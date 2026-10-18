import { invoke } from "@tauri-apps/api/core";
import type { ExecutionSettings } from "../types";

const STORAGE_KEY = "simulador-de-trade:execution-settings";

export const DEFAULT_EXECUTION_SETTINGS: ExecutionSettings = {
  // Campo legado mantido para compatibilidade com trades e backups antigos.
  costPerContractRoundTripBRL: 0.5,
  costWinRoundTripBRL: 0.5,
  costWdoRoundTripBRL: 2.12,
  slippageTicksPerSide: 0,
  intrabarPolicy: "STOP_FIRST",
};

function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}
function validCost(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function normalize(value: Partial<ExecutionSettings> | null): ExecutionSettings {
  const legacy = Number(value?.costPerContractRoundTripBRL);
  const hasLegacyCustomValue = Number.isFinite(legacy) && legacy > 0;
  const fallbackWin = hasLegacyCustomValue ? legacy : DEFAULT_EXECUTION_SETTINGS.costWinRoundTripBRL ?? 0.5;
  const fallbackWdo = hasLegacyCustomValue ? legacy : DEFAULT_EXECUTION_SETTINGS.costWdoRoundTripBRL ?? 2.12;
  const winValue = value?.costWinRoundTripBRL;
  const wdoValue = value?.costWdoRoundTripBRL;
  const winCost = validCost(winValue) ? winValue : fallbackWin;
  const wdoCost = validCost(wdoValue) ? wdoValue : fallbackWdo;
  const slippage = Number(value?.slippageTicksPerSide);
  const intrabarPolicy = value?.intrabarPolicy === "TARGET_FIRST" ? "TARGET_FIRST" : "STOP_FIRST";

  return {
    costPerContractRoundTripBRL: hasLegacyCustomValue ? legacy : winCost,
    costWinRoundTripBRL: winCost,
    costWdoRoundTripBRL: wdoCost,
    slippageTicksPerSide: Number.isInteger(slippage) && slippage >= 0 ? slippage : 0,
    intrabarPolicy,
  };
}

export async function loadExecutionSettings(): Promise<ExecutionSettings> {
  if (isTauriRuntime()) {
    const settings = await invoke<ExecutionSettings>("load_execution_settings");
    return normalize(settings);
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_EXECUTION_SETTINGS;
  try {
    return normalize(JSON.parse(raw) as Partial<ExecutionSettings>);
  } catch {
    return DEFAULT_EXECUTION_SETTINGS;
  }
}

export async function saveExecutionSettings(settings: ExecutionSettings): Promise<ExecutionSettings> {
  const normalized = normalize({
    ...settings,
    costPerContractRoundTripBRL: settings.costWinRoundTripBRL ?? settings.costPerContractRoundTripBRL,
  });
  if (isTauriRuntime()) {
    await invoke("save_execution_settings", { settings: normalized });
    return normalized;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}
