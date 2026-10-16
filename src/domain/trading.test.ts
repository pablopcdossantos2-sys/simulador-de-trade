import { describe, expect, it } from "vitest";
import type { IndicatorSignal, TradeIntent } from "../types";
import {
  TradingRuleError,
  openPosition,
  resolveOco,
  resolveOcoTrade,
  validateTradeIntent,
} from "./trading";

const buySignal: IndicatorSignal = {
  id: "signal-1",
  asset: "WINFUT",
  side: "BUY",
  candleIndex: 10,
  timestamp: "2026-01-01T12:00:00.000Z",
  price: 130000,
  label: "Compra",
};

const baseIntent: TradeIntent = {
  asset: "WINFUT",
  side: "BUY",
  entry: 130000,
  contracts: 2,
  execution: {
    costPerContractRoundTripBRL: 1,
    slippageTicksPerSide: 0,
  },
  candleIndex: 10,
  oco: { stopLoss: 129900, target: 130150 },
  signal: buySignal,
  hasOpenPosition: false,
};

describe("regras de entrada", () => {
  it("bloqueia entrada sem sinal", () => {
    expect(() =>
      validateTradeIntent({ ...baseIntent, signal: null }),
    ).toThrow(TradingRuleError);
  });

  it("bloqueia venda durante sinal de compra", () => {
    expect(() =>
      validateTradeIntent({ ...baseIntent, side: "SELL" }),
    ).toThrow(/autoriza apenas uma operação de compra/i);
  });

  it("exige OCO coerente em compra", () => {
    expect(() =>
      validateTradeIntent({
        ...baseIntent,
        oco: { stopLoss: 130050, target: 130150 },
      }),
    ).toThrow(/stop loss precisa ficar abaixo/i);
  });

  it("bloqueia preços fora do tick do ativo", () => {
    expect(() =>
      validateTradeIntent({
        ...baseIntent,
        oco: { stopLoss: 129903, target: 130150 },
      }),
    ).toThrow(/incremento mínimo de 5/i);
  });

  it("bloqueia quantidade de contratos inválida", () => {
    expect(() =>
      validateTradeIntent({ ...baseIntent, contracts: 0 }),
    ).toThrow(/quantidade de contratos/i);
  });

  it("bloqueia slippage fracionário", () => {
    expect(() =>
      validateTradeIntent({
        ...baseIntent,
        execution: {
          ...baseIntent.execution,
          slippageTicksPerSide: 0.5,
        },
      }),
    ).toThrow(/slippage/i);
  });

  it("aceita compra com sinal e OCO válidos", () => {
    expect(() => validateTradeIntent(baseIntent)).not.toThrow();
  });

  it("aplica slippage adverso na entrada e saída", () => {
    const position = openPosition(
      {
        ...baseIntent,
        contracts: 1,
        execution: {
          costPerContractRoundTripBRL: 1,
          slippageTicksPerSide: 1,
        },
      },
      new Date("2026-01-01T09:30:00Z"),
    );

    expect(position.requestedEntry).toBe(130000);
    expect(position.entry).toBe(130005);

    const closed = resolveOcoTrade(position, {
      asset: "WINFUT",
      timestamp: "2026-01-01T09:31:00Z",
      sourceRow: 1,
      sequence: 1,
      price: 130150,
      quantity: 1,
    });

    expect(closed?.exitPrice).toBe(130145);
    expect(closed?.resultPoints).toBe(140);
    expect(closed?.grossResultBRL).toBe(28);
    expect(closed?.operationalCostsBRL).toBe(1);
    expect(closed?.netResultBRL).toBe(27);
  });
});

describe("resolução OCO", () => {
  const position = {
    id: "trade-1",
    asset: "WINFUT" as const,
    side: "BUY" as const,
    signalId: "signal-1",
    openedCandleIndex: 10,
    requestedEntry: 130000,
    entry: 130000,
    stopLoss: 129900,
    target: 130150,
    contracts: 2,
    slippageTicksPerSide: 0,
    costPerContractRoundTripBRL: 1,
    openedAt: "2026-01-01T12:00:00.000Z",
    status: "OPEN" as const,
  };

  it("ignora o range do candle em que a posição foi aberta", () => {
    const trade = resolveOco(position, {
      index: 10,
      timestamp: "2026-01-01T12:00:00.000Z",
      open: 130000,
      high: 130200,
      low: 129850,
      close: 130050,
      volume: 100,
    });

    expect(trade).toBeNull();
  });

  it("fecha no alvo", () => {
    const trade = resolveOco(position, {
      index: 11,
      timestamp: "2026-01-01T12:01:00.000Z",
      open: 130000,
      high: 130160,
      low: 129990,
      close: 130150,
      volume: 100,
    });

    expect(trade?.exitReason).toBe("TARGET");
    expect(trade?.resultPoints).toBe(150);
    expect(trade?.contracts).toBe(2);
    expect(trade?.grossResultBRL).toBe(60);
    expect(trade?.operationalCostsBRL).toBe(2);
    expect(trade?.netResultBRL).toBe(58);
  });

  it("usa hipótese conservadora quando stop e alvo são tocados", () => {
    const trade = resolveOco(position, {
      index: 11,
      timestamp: "2026-01-01T12:01:00.000Z",
      open: 130000,
      high: 130200,
      low: 129850,
      close: 130100,
      volume: 100,
    });

    expect(trade?.exitReason).toBe("STOP");
    expect(trade?.resultPoints).toBe(-100);
  });
});


describe("resolução OCO negócio a negócio", () => {
  const position = {
    id: "trade-tick-1",
    asset: "WINFUT" as const,
    side: "BUY" as const,
    signalId: "signal-1",
    openedCandleIndex: 10,
    openedReplaySequence: 100,
    requestedEntry: 130000,
    entry: 130000,
    stopLoss: 129900,
    target: 130150,
    contracts: 2,
    slippageTicksPerSide: 0,
    costPerContractRoundTripBRL: 1,
    openedAt: "2026-01-01T09:30:00.000-03:00",
    status: "OPEN" as const,
  };

  it("ignora o próprio negócio de entrada", () => {
    expect(
      resolveOcoTrade(position, {
        asset: "WINFUT",
        timestamp: "2026-01-01T09:30:00.000-03:00",
        sourceRow: 500,
        sequence: 100,
        price: 129850,
        quantity: 1,
      }),
    ).toBeNull();
  });

  it("encerra no primeiro negócio posterior que toca o alvo", () => {
    const result = resolveOcoTrade(position, {
      asset: "WINFUT",
      timestamp: "2026-01-01T09:30:01.000-03:00",
      sourceRow: 499,
      sequence: 101,
      price: 130155,
      quantity: 2,
    });

    expect(result?.exitReason).toBe("TARGET");
    expect(result?.exitPrice).toBe(130150);
    expect(result?.resultPoints).toBe(150);
    expect(result?.grossResultBRL).toBe(60);
    expect(result?.netResultBRL).toBe(58);
  });

  it("encerra no stop sem depender do OHLC do candle", () => {
    const result = resolveOcoTrade(position, {
      asset: "WINFUT",
      timestamp: "2026-01-01T09:30:01.000-03:00",
      sourceRow: 499,
      sequence: 101,
      price: 129895,
      quantity: 2,
    });

    expect(result?.exitReason).toBe("STOP");
    expect(result?.resultPoints).toBe(-100);
  });
});
