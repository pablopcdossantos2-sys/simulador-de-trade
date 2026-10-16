import { invoke } from "@tauri-apps/api/core";
import type { ExecutionSettings } from "../types";

const STORAGE_KEY = "simulador-de-trade:execution-settings";

export const DEFAULT_EXECUTION_SETTINGS: ExecutionSettings = {
  costPerContractRoundTripBRL: 0,
  slippageTicksPerSide: 0,
};

function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

function normalize(value: Partial<ExecutionSettings> | null): ExecutionSettings {
  const cost = Number(value?.costPerContractRoundTripBRL);
  const slippage = Number(value?.slippageTicksPerSide);

  return {
    costPerContractRoundTripBRL:
      Number.isFinite(cost) && cost >= 0 ? cost : 0,
    slippageTicksPerSide:
      Number.isInteger(slippage) && slippage >= 0 ? slippage : 0,
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

export async function saveExecutionSettings(
  settings: ExecutionSettings,
): Promise<ExecutionSettings> {
  const normalized = normalize(settings);

  if (isTauriRuntime()) {
    await invoke("save_execution_settings", { settings: normalized });
    return normalized;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}
