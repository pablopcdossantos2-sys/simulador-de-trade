import { describe, expect, it } from "vitest";
import { readErrorMessage } from "./readErrorMessage";

describe("mensagens de erro do backend", () => {
  it("preserva rejeições do Tauri que chegam como texto", () => {
    expect(readErrorMessage("Arquivo CSV inválido.")).toBe("Arquivo CSV inválido.");
  });

  it("preserva mensagens de instâncias Error", () => {
    expect(readErrorMessage(new Error("Falha ao gravar no SQLite."))).toBe(
      "Falha ao gravar no SQLite.",
    );
  });

  it("extrai mensagem de objetos usados por pontes IPC", () => {
    expect(readErrorMessage({ message: "Sessão inexistente." })).toBe(
      "Sessão inexistente.",
    );
    expect(readErrorMessage({ error: { message: "Permissão negada." } })).toBe(
      "Permissão negada.",
    );
  });

  it("usa fallback apenas quando não há mensagem útil", () => {
    expect(readErrorMessage(null, "Falha ao carregar.")).toBe(
      "Falha ao carregar.",
    );
    expect(readErrorMessage("  ", "Falha ao carregar.")).toBe(
      "Falha ao carregar.",
    );
  });

  it("não entra em recursão com objetos cíclicos", () => {
    const error: Record<string, unknown> = {};
    error.cause = error;
    expect(readErrorMessage(error, "Falha desconhecida.")).toBe(
      "Falha desconhecida.",
    );
  });
});
