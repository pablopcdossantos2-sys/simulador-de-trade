import { describe, expect, it } from "vitest";
import type { Candle } from "../types";
import {
  calculateCausalMtfAverages,
  type CausalMtfConfig,
} from "./causalMtfIndicator";

const config: CausalMtfConfig = {
  chartTimeframeMinutes: 2,
  indicatorTimeframeMinutes: 15,
  sessionStartHour: 9,
  sessionStartMinute: 0,
  averages: [
    { id: "M1", method: "SMA", length: 2, enabled: true },
    { id: "M2", method: "EMA", length: 2, enabled: true },
  ],
};

function candle(index: number, timestamp: string, close: number): Candle {
  return {
    index,
    timestamp,
    open: close - 1,
    high: close + 1,
    low: close - 2,
    close,
    volume: 10,
  };
}

describe("calculateCausalMtfAverages", () => {
  it("updates the forming 15-minute bar using only data available at each 2-minute close", () => {
    const candles = [
      candle(0, "2026-11-10T09:00:00", 100),
      candle(1, "2026-11-10T09:02:00", 101),
      candle(2, "2026-11-10T09:04:00", 102),
      candle(3, "2026-11-10T09:06:00", 103),
      candle(4, "2026-11-10T09:08:00", 104),
      candle(5, "2026-11-10T09:10:00", 105),
      candle(6, "2026-11-10T09:12:00", 106),
      candle(7, "2026-11-10T09:14:00", 107),
      candle(8, "2026-11-10T09:16:00", 200),
      candle(9, "2026-11-10T09:18:00", 202),
    ];

    const result = calculateCausalMtfAverages(candles, config);

    expect(result).toHaveLength(candles.length);
    expect(result[0].aggregatedBar.close).toBe(100);
    expect(result[7].aggregatedBar.close).toBe(107);
    expect(result[7].indicatorBarIsForming).toBe(false);
    expect(result[8].indicatorBarIsForming).toBe(true);
    expect(result[8].aggregatedBar.close).toBe(200);
    expect(result[9].aggregatedBar.close).toBe(202);
    expect(result[8].averages.M1).toBe(153.5);
    expect(result[9].averages.M1).toBe(154.5);
    expect(result[8].indicatorBarStart).toBe("2026-11-10T09:15:00");
    expect(result[8].availableAt).toBe("2026-11-10T09:18:00");
  });

  it("does not allow later candles to change an earlier snapshot", () => {
    const prefix = [
      candle(0, "2026-11-10T09:00:00", 100),
      candle(1, "2026-11-10T09:02:00", 101),
      candle(2, "2026-11-10T09:04:00", 102),
    ];
    const full = [...prefix, candle(3, "2026-11-10T09:06:00", 999)];

    const firstSnapshot = calculateCausalMtfAverages(prefix, config)[2];
    const sameSnapshotInFullReplay = calculateCausalMtfAverages(full, config)[2];

    expect(sameSnapshotInFullReplay).toEqual(firstSnapshot);
  });

  it("resets daily average history at the next trading day", () => {
    const candles = [
      candle(0, "2026-11-10T09:00:00", 100),
      candle(1, "2026-11-10T09:16:00", 110),
      candle(2, "2026-11-11T09:00:00", 200),
    ];

    const result = calculateCausalMtfAverages(candles, config);

    expect(result[1].averages.M1).toBe(105);
    expect(result[2].averages.M1).toBeNull();
  });

  it("rejects malformed market timestamps instead of silently dropping candles", () => {
    const candles = [
      candle(0, "2026-11-10T09:00:00", 100),
      candle(1, "2026-11-10T09:61:00", 101),
    ];

    expect(() => calculateCausalMtfAverages(candles, config)).toThrow(
      "Timestamp de mercado inválido",
    );
  });

  it("rejects duplicate or out-of-order candles", () => {
    const duplicate = [
      candle(0, "2026-11-10T09:00:00", 100),
      candle(1, "2026-11-10T09:00:00", 101),
    ];
    const reversed = [
      candle(0, "2026-11-10T09:02:00", 100),
      candle(1, "2026-11-10T09:00:00", 101),
    ];

    expect(() => calculateCausalMtfAverages(duplicate, config)).toThrow(
      "ordem cronológica",
    );
    expect(() => calculateCausalMtfAverages(reversed, config)).toThrow(
      "ordem cronológica",
    );
  });

  it("rejects invalid session and fractional timeframe settings", () => {
    expect(() => calculateCausalMtfAverages([], {
      ...config,
      sessionStartHour: 24,
    })).toThrow("Configuração de timeframe");
    expect(() => calculateCausalMtfAverages([], {
      ...config,
      chartTimeframeMinutes: 2.5,
    })).toThrow("Configuração de timeframe");
  });

  it("preserves seconds when calculating candle availability and MTF boundary crossing", () => {
    const candles = [
      candle(0, "2026-11-10T09:14:30", 100),
      candle(1, "2026-11-10T09:16:30", 101),
    ];

    const result = calculateCausalMtfAverages(candles, config);
    expect(result[0].availableAt).toBe("2026-11-10T09:16:30");
    expect(result[0].indicatorBarIsForming).toBe(false);
    expect(result[1].availableAt).toBe("2026-11-10T09:18:30");
    expect(result[1].indicatorBarIsForming).toBe(true);
  });

  it("rejects non-finite prices, invalid OHLC ranges and negative volume", () => {
    const invalidCandles: Candle[] = [
      { ...candle(0, "2026-11-10T09:00:00", 100), close: Number.NaN },
      { ...candle(0, "2026-11-10T09:00:00", 100), high: 99 },
      { ...candle(0, "2026-11-10T09:00:00", 100), volume: -1 },
      { ...candle(0, "2026-11-10T09:00:00", 100), volume: Number.POSITIVE_INFINITY },
    ];

    for (const invalid of invalidCandles) {
      expect(() => calculateCausalMtfAverages([invalid], config)).toThrow(
        "OHLC ou volume inválido",
      );
    }
  });

  it("rejects duplicate MTF average identifiers", () => {
    const invalidConfig: CausalMtfConfig = {
      ...config,
      averages: [
        { id: "M1", method: "SMA", length: 2, enabled: true },
        { id: "M1", method: "EMA", length: 3, enabled: true },
      ],
    };

    expect(() => calculateCausalMtfAverages([], invalidConfig)).toThrow(
      "identificadores duplicados",
    );
  });

  it("preserves zero-volume candles without adding volume to the forming MTF bar", () => {
    const candles = [
      { ...candle(0, "2026-11-10T09:00:00", 100), volume: 0 },
      { ...candle(1, "2026-11-10T09:02:00", 101), volume: 7 },
      { ...candle(2, "2026-11-10T09:04:00", 102), volume: 0 },
    ];

    const result = calculateCausalMtfAverages(candles, config);
    expect(result[0].aggregatedBar.volume).toBe(0);
    expect(result[1].aggregatedBar.volume).toBe(7);
    expect(result[2].aggregatedBar.volume).toBe(7);
    expect(result[2].aggregatedBar.close).toBe(102);
  });

});