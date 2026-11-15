import { describe, expect, it } from "vitest";
import {
  bucketMarketTimestamp,
  marketDateKey,
  marketIsoWeekKey,
  marketTimestampOrdinalMs,
  parseMarketTimestamp,
} from "./marketTime";

describe("horário de mercado", () => {
  it("não desloca horário BRT para UTC", () => {
    expect(
      bucketMarketTimestamp("2026-10-07T09:01:59", 120),
    ).toBe("2026-10-07T09:00:00");
  });

  it("ignora offset apenas para a semântica de relógio do mercado", () => {
    expect(
      bucketMarketTimestamp("2026-10-07T09:02:00-03:00", 120),
    ).toBe("2026-10-07T09:02:00");
  });

  it("aceita sufixo UTC sem deslocar o relógio de mercado", () => {
    expect(
      bucketMarketTimestamp("2026-10-07T09:02:00Z", 120),
    ).toBe("2026-10-07T09:02:00");
  });

  it.each([
    "2026-10-07T09:00:00+24:00",
    "2026-10-07T09:00:00-03:60",
  ])("rejeita offset fora do intervalo permitido: %s", (timestamp) => {
    expect(() => parseMarketTimestamp(timestamp)).toThrow(
      /timestamp de mercado inválido/i,
    );
  });

  it("mantém ordenação cronológica de timestamps do mercado", () => {
    expect(
      marketTimestampOrdinalMs("2026-10-07T09:02:00"),
    ).toBeGreaterThan(
      marketTimestampOrdinalMs("2026-10-07T09:01:59"),
    );
  });

  it("gera chaves de sessão e semana sem depender do fuso do computador", () => {
    expect(marketDateKey("2026-10-07T23:59:59-03:00")).toBe(
      "2026-10-07",
    );
    expect(marketIsoWeekKey("2026-10-07T09:00:00")).toBe(
      "2026-W41",
    );
  });
});
