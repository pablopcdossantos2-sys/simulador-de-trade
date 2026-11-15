import { describe, expect, it } from "vitest";
import type { ReplayTrade } from "../types";
import { countTradesToCandleBoundary } from "./replayStep";

function trade(timestamp: string, sequence: number): ReplayTrade {
  return {
    asset: "WINFUT",
    timestamp,
    sourceRow: sequence,
    sequence,
    price: 130000 + sequence,
    quantity: 1,
  };
}

describe("avanço manual por candle", () => {
  const trades = [
    trade("2026-10-07T09:00:01", 1),
    trade("2026-10-07T09:00:30", 2),
    trade("2026-10-07T09:01:59", 3),
    trade("2026-10-07T09:02:00", 4),
    trade("2026-10-07T09:03:59", 5),
    trade("2026-10-07T09:04:00", 6),
  ];

  it("começa pelo primeiro candle quando ainda não há negócio processado", () => {
    expect(countTradesToCandleBoundary(trades, null, 2)).toBe(3);
  });

  it("conclui o candle atual quando a reprodução parou dentro dele", () => {
    expect(
      countTradesToCandleBoundary(
        trades.slice(1),
        "2026-10-07T09:00:01",
        2,
      ),
    ).toBe(2);
  });

  it("avança para o próximo candle quando o primeiro negócio já cruza a fronteira", () => {
    expect(
      countTradesToCandleBoundary(
        trades.slice(3),
        "2026-10-07T09:01:59",
        2,
      ),
    ).toBe(2);
  });

  it("não ultrapassa a fronteira ao continuar em um novo bloco da fila", () => {
    const firstBlock = trades.slice(0, 2);
    const secondBlock = trades.slice(2);
    const firstCount = countTradesToCandleBoundary(firstBlock, null, 2);
    const continuedCount = countTradesToCandleBoundary(
      secondBlock,
      null,
      2,
      firstBlock[0].timestamp,
    );

    expect(firstCount).toBe(2);
    expect(continuedCount).toBe(1);
  });

  it("funciona quando a fronteira coincide com o primeiro negócio da fila", () => {
    expect(
      countTradesToCandleBoundary(
        trades.slice(3),
        "2026-10-07T09:00:01",
        2,
      ),
    ).toBe(2);
  });

  it("retorna zero para fila vazia e rejeita timeframe inválido", () => {
    expect(countTradesToCandleBoundary([], null, 2)).toBe(0);
    expect(() => countTradesToCandleBoundary(trades, null, 0)).toThrow(
      /timeframe.*maior que zero/i,
    );
  });
});
