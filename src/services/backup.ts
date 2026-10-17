import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

export interface BackupSummary {
  path: string;
  schemaVersion: number;
  trades: number;
  sessions: number;
  events: number;
}

export function backupAvailable(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

function defaultBackupName(): string {
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  return `simulador-de-trade-backup-${date}.json`;
}

export async function exportBackup(): Promise<BackupSummary | null> {
  if (!backupAvailable()) {
    throw new Error(
      "Backup por arquivo está disponível no aplicativo desktop Tauri.",
    );
  }

  const destinationPath = await save({
    title: "Salvar backup do Simulador de Trade",
    defaultPath: defaultBackupName(),
    filters: [
      {
        name: "Backup JSON",
        extensions: ["json"],
      },
    ],
  });

  if (!destinationPath) return null;

  return invoke<BackupSummary>("export_backup", { destinationPath });
}

export async function importBackup(): Promise<BackupSummary | null> {
  if (!backupAvailable()) {
    throw new Error(
      "Importação de backup está disponível no aplicativo desktop Tauri.",
    );
  }

  const sourcePath = await open({
    title: "Importar backup do Simulador de Trade",
    multiple: false,
    directory: false,
    filters: [
      {
        name: "Backup JSON",
        extensions: ["json"],
      },
    ],
  });

  if (!sourcePath || Array.isArray(sourcePath)) return null;

  return invoke<BackupSummary>("import_backup", { sourcePath });
}
