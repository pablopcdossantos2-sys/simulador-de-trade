/** Extrai mensagens rejeitadas pelo Tauri IPC sem descartar erros que não sejam instâncias de Error. */
export function readErrorMessage(
  error: unknown,
  fallback = "Ocorreu um erro inesperado.",
): string {
  const visited = new Set<object>();

  function extract(value: unknown): string {
    if (typeof value === "string") return value.trim();
    if (value instanceof Error) return value.message.trim();
    if (!value || typeof value !== "object" || visited.has(value)) return "";
    visited.add(value);

    const record = value as Record<string, unknown>;
    for (const key of ["message", "error", "reason", "details", "cause"]) {
      const message = extract(record[key]);
      if (message) return message;
    }

    try {
      const serialized = JSON.stringify(value);
      if (serialized && serialized !== "{}") return serialized;
    } catch {
      // Mantém o fallback quando o objeto de erro não pode ser serializado.
    }
    return "";
  }

  return extract(error) || fallback;
}
