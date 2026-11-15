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

  it("continua o mesmo candle quando o limite real de 5.000 eventos divide seus 120 segundos", () => {
    const events = Array.from({ length: 5_100 }, (_, second) => {
      const timestamp = new Date(
        Date.UTC(2026, 9, 7, 9, 0, second),
      ).toISOString().slice(0, 19);
      return trade(timestamp, second + 1);
    });

    // 5.000 não é divisível por 120: o 41º candle termina no bloco seguinte.
    const candleStartIndex = 41 * 120;
    const targetTimestamp = events[candleStartIndex].timestamp;
    const finalEventsOfFirstBlock = events.slice(candleStartIndex, 5_000);
    const firstEventsOfSecondBlock = events.slice(5_000);

    const firstCount = countTradesToCandleBoundary(
      finalEventsOfFirstBlock,
      null,
      2,
      targetTimestamp,
    );
    const continuedCount = countTradesToCandleBoundary(
      firstEventsOfSecondBlock,
      null,
      2,
      targetTimestamp,
    );

    expect(firstCount).toBe(80);
    expect(continuedCount).toBe(40);
    expect(
      firstEventsOfSecondBlock[continuedCount].timestamp,
    ).toBe("2026-10-07T10:24:00");
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
