import { describe, expect, it } from "vitest";
import type { ReplayTrade } from "../types";
import {
  applyReplayTrade,
  buildReplayCandles,
  REPLAY_INTERVAL_SECONDS,
} from "./replay";

function trade(
  timestamp: string,
  price: number,
  quantity = 1,
  sourceRow = 1,
): ReplayTrade {
  return {
    asset: "WINFUT",
    timestamp,
    sourceRow,
    sequence: sourceRow,
    price,
    quantity,
  };
}

describe("replay por timeframe", () => {
  it("usa 120 segundos como timeframe padrão", () => {
    expect(REPLAY_INTERVAL_SECONDS).toBe(120);
  });

  it("forma OHLC e volume progressivamente dentro do mesmo candle", () => {
    const candles = buildReplayCandles([
      trade("2026-10-07T09:00:01-03:00", 130000, 2, 1),
      trade("2026-10-07T09:00:12-03:00", 130010, 3, 2),
      trade("2026-10-07T09:01:05-03:00", 129995, 4, 3),
      trade("2026-10-07T09:01:59-03:00", 130005, 5, 4),
    ]);

    expect(candles).toHaveLength(1);
    expect(candles[0]).toMatchObject({
      index: 0,
      open: 130000,
      high: 130010,
      low: 129995,
      close: 130005,
      volume: 14,
    });
  });

  it("abre um novo candle exatamente na fronteira de dois minutos", () => {
    const candles = buildReplayCandles([
      trade("2026-10-07T09:01:59-03:00", 130000, 1, 1),
      trade("2026-10-07T09:02:00-03:00", 130005, 2, 2),
    ]);

    expect(candles).toHaveLength(2);
    expect(candles[0].close).toBe(130000);
    expect(candles[1]).toMatchObject({
      index: 1,
      open: 130005,
      high: 130005,
      low: 130005,
      close: 130005,
      volume: 2,
    });
  });

  it("forma candles M5 quando o intervalo é de 300 segundos", () => {
    const candles = buildReplayCandles(
      [
        trade("2026-10-07T09:00:00-03:00", 130000, 1, 1),
        trade("2026-10-07T09:04:59-03:00", 130010, 2, 2),
        trade("2026-10-07T09:05:00-03:00", 130020, 3, 3),
      ],
      300,
    );

    expect(candles).toHaveLength(2);
    expect(candles[0]).toMatchObject({
      open: 130000,
      high: 130010,
      close: 130010,
      volume: 3,
    });
    expect(candles[1]).toMatchObject({
      open: 130020,
      high: 130020,
      close: 130020,
      volume: 3,
    });
  });

  it("rejeita negócios entregues fora de ordem", () => {
    const first = applyReplayTrade(
      [],
      trade("2026-10-07T09:04:00-03:00", 130000),
    );

    expect(() =>
      applyReplayTrade(
        first,
        trade("2026-10-07T09:02:00-03:00", 129990),
      ),
    ).toThrow(/fora de ordem cronológica/i);
  });

  it("mantém quantidade negociada para permitir VWAP", () => {
    const candles = buildReplayCandles([
      trade("2026-10-07T09:00:00-03:00", 130000, 100),
      trade("2026-10-07T09:00:01-03:00", 130005, 250),
    ]);

    expect(candles[0].volume).toBe(350);
  });
});
