import { afterEach, describe, expect, it, vi } from "vitest";
import { exportBackup, importBackup } from "./backup";
import { defaultsForMovingAverages, saveMovingAverageSettings } from "./strategyMovingAverages";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("backup das configurações das estratégias", () => {
  it("inclui preferências das duas estratégias no arquivo exportado", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    const preferences = defaultsForMovingAverages();
    preferences.mtf.periods = [9, 21, 55, 240];
    preferences.mtf.plotOn = [true, false, true, false];
    preferences.mtf.filters!.angleThresholds = [3, 1.5, 2.5, 5];
    preferences.mtf.filters!.voteOn = [false, true, true, false];
    saveMovingAverageSettings(preferences);

    vi.mocked(save).mockResolvedValue("arquivo.json");
    vi.mocked(invoke).mockResolvedValue({ path: "arquivo.json", schemaVersion: 1 });
    await exportBackup();

    expect(invoke).toHaveBeenCalledWith("export_backup", {
      destinationPath: "arquivo.json",
      strategySettings: preferences,
    });
  });

  it("preserva compatibilidade com backups antigos sem o campo de estratégias", async () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    vi.mocked(open).mockResolvedValue("backup-antigo.json");
    vi.mocked(invoke).mockResolvedValue({
      path: "backup-antigo.json", schemaVersion: 1,
      trades: 0, sessions: 0, events: 0, usageSessions: 0,
    });
    const result = await importBackup("replace_all");
    expect(result?.strategySettings).toBeUndefined();
    expect(invoke).toHaveBeenCalledWith("import_backup", {
      sourcePath: "backup-antigo.json", mode: "replace_all",
    });
  });
});
