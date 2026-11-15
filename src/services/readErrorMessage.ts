/** Extrai mensagens rejeitadas pelo Tauri IPC sem descartar erros que não sejam instâncias de Error. */
export function readErrorMessage(
  error: unknown,
  fallback = "Ocorreu um erro inesperado.",
): string {
  if (typeof error === "string") {
    const message = error.trim();
    return message || fallback;
  }

  if (error instanceof Error) {
    return error.message.trim() || fallback;
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    for (const key of ["message", "error", "reason", "details", "cause"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (value instanceof Error && value.message.trim()) return value.message.trim();
      if (value && typeof value === "object") {
        const nested = readErrorMessage(value, "");
        if (nested) return nested;
      }
    }

    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== "{}") return serialized;
    } catch {
      // Mantém o fallback quando o objeto de erro não pode ser serializado.
    }
  }

  return fallback;
}
