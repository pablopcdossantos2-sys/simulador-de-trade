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
    intrabarPolicy: "STOP_FIRST",
  },
  candleIndex: 10,
  oco: { stopLoss: 129900, target: 130150 },
  signal: buySignal,
  signalAlreadyUsed: false,
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

  it("bloqueia reutilização do mesmo sinal", () => {
    expect(() =>
      validateTradeIntent({ ...baseIntent, signalAlreadyUsed: true }),
    ).toThrow(/já foi utilizado/i);
  });

  it("bloqueia política intrabar inválida", () => {
    expect(() =>
      validateTradeIntent({
        ...baseIntent,
        execution: {
          ...baseIntent.execution,
          intrabarPolicy: "INVALID" as "STOP_FIRST",
        },
      }),
    ).toThrow(/política intrabar/i);
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
          intrabarPolicy: "STOP_FIRST",
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
    expect(closed?.entryContext).toBeNull();
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
    intrabarPolicy: "STOP_FIRST",
    entryContext: null,
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

  it("usa Stop primeiro por padrão quando stop e alvo são tocados", () => {
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

  it("pode priorizar o alvo em candle OHLC ambíguo", () => {
    const trade = resolveOco(
      { ...position, intrabarPolicy: "TARGET_FIRST" as const },
      {
        index: 11,
        timestamp: "2026-01-01T12:01:00.000Z",
        open: 130000,
        high: 130200,
        low: 129850,
        close: 130100,
        volume: 100,
      },
    );

    expect(trade?.exitReason).toBe("TARGET");
    expect(trade?.resultPoints).toBe(150);
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
    intrabarPolicy: "STOP_FIRST",
    entryContext: null,
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


describe("regras e execução SELL", () => {
  const sellSignal: IndicatorSignal = {
    id: "signal-sell-1",
    asset: "WINFUT",
    side: "SELL",
    candleIndex: 20,
    timestamp: "2026-01-01T13:00:00.000Z",
    price: 130000,
    label: "Venda",
  };

  const sellIntent: TradeIntent = {
    asset: "WINFUT",
    side: "SELL",
    entry: 130000,
    contracts: 2,
    execution: {
      costPerContractRoundTripBRL: 1,
      slippageTicksPerSide: 1,
      intrabarPolicy: "STOP_FIRST",
    },
    candleIndex: 20,
    oco: {
      stopLoss: 130100,
      target: 129850,
    },
    signal: sellSignal,
    signalAlreadyUsed: false,
    hasOpenPosition: false,
  };

  it("aceita venda com OCO coerente", () => {
    expect(() => validateTradeIntent(sellIntent)).not.toThrow();
  });

  it("rejeita stop abaixo da entrada em venda", () => {
    expect(() =>
      validateTradeIntent({
        ...sellIntent,
        oco: { stopLoss: 129950, target: 129850 },
      }),
    ).toThrow(/stop loss precisa ficar acima/i);
  });

  it("aplica slippage adverso na entrada e no alvo da venda", () => {
    const position = openPosition(
      sellIntent,
      new Date("2026-01-01T13:00:00Z"),
    );

    expect(position.requestedEntry).toBe(130000);
    expect(position.entry).toBe(129995);

    const result = resolveOcoTrade(position, {
      asset: "WINFUT",
      timestamp: "2026-01-01T13:01:00Z",
      sourceRow: 1,
      sequence: 1,
      price: 129850,
      quantity: 1,
    });

    expect(result?.exitReason).toBe("TARGET");
    expect(result?.exitPrice).toBe(129855);
    expect(result?.resultPoints).toBe(140);
    expect(result?.grossResultBRL).toBe(56);
    expect(result?.operationalCostsBRL).toBe(2);
    expect(result?.netResultBRL).toBe(54);
  });

  it("piora também a execução do stop da venda", () => {
    const position = openPosition(
      sellIntent,
      new Date("2026-01-01T13:00:00Z"),
    );

    const result = resolveOcoTrade(position, {
      asset: "WINFUT",
      timestamp: "2026-01-01T13:01:00Z",
      sourceRow: 1,
      sequence: 1,
      price: 130100,
      quantity: 1,
    });

    expect(result?.exitReason).toBe("STOP");
    expect(result?.exitPrice).toBe(130105);
    expect(result?.resultPoints).toBe(-110);
    expect(result?.netResultBRL).toBe(-46);
  });
});
