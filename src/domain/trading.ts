import type {
  Candle,
  IndicatorSignal,
  Position,
  ReplayTrade,
  Side,
  Trade,
  TradeIntent,
} from "../types";
import {
  grossResultBRL,
  isPriceOnTick,
  tickSizeFor,
} from "./marketSpecs";

export class TradingRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TradingRuleError";
  }
}

const isFinitePrice = (value: number) => Number.isFinite(value) && value > 0;

export function validateTradeIntent(intent: TradeIntent): void {
  const {
    signal,
    side,
    entry,
    contracts,
    oco,
    asset,
    hasOpenPosition,
  } = intent;

  if (hasOpenPosition) {
    throw new TradingRuleError("Já existe uma posição aberta.");
  }

  if (!Number.isInteger(contracts) || contracts < 1) {
    throw new TradingRuleError(
      "A quantidade de contratos precisa ser um número inteiro maior ou igual a 1.",
    );
  }

  if (!signal) {
    throw new TradingRuleError(
      "Nenhuma operação pode ser aberta sem um sinal ativo do indicador.",
    );
  }

  if (signal.asset !== asset) {
    throw new TradingRuleError(
      "O sinal ativo pertence a outro ativo e não pode autorizar esta operação.",
    );
  }

  if (signal.side !== side) {
    const expected = signal.side === "BUY" ? "compra" : "venda";
    throw new TradingRuleError(
      `O sinal ativo autoriza apenas uma operação de ${expected}.`,
    );
  }

  if (
    !isFinitePrice(entry) ||
    !isFinitePrice(oco.stopLoss) ||
    !isFinitePrice(oco.target)
  ) {
    throw new TradingRuleError(
      "Entrada, stop loss e alvo devem possuir preços válidos.",
    );
  }

  if (
    !isPriceOnTick(asset, entry) ||
    !isPriceOnTick(asset, oco.stopLoss) ||
    !isPriceOnTick(asset, oco.target)
  ) {
    throw new TradingRuleError(
      `Entrada, stop loss e alvo precisam respeitar o incremento mínimo de ${tickSizeFor(asset)} do ativo.`,
    );
  }

  if (side === "BUY") {
    if (oco.stopLoss >= entry) {
      throw new TradingRuleError(
        "Em uma compra, o stop loss precisa ficar abaixo do preço de entrada.",
      );
    }
    if (oco.target <= entry) {
      throw new TradingRuleError(
        "Em uma compra, o alvo precisa ficar acima do preço de entrada.",
      );
    }
  }

  if (side === "SELL") {
    if (oco.stopLoss <= entry) {
      throw new TradingRuleError(
        "Em uma venda, o stop loss precisa ficar acima do preço de entrada.",
      );
    }
    if (oco.target >= entry) {
      throw new TradingRuleError(
        "Em uma venda, o alvo precisa ficar abaixo do preço de entrada.",
      );
    }
  }
}

export function openPosition(intent: TradeIntent, now = new Date()): Position {
  validateTradeIntent(intent);

  return {
    id: crypto.randomUUID(),
    asset: intent.asset,
    side: intent.side,
    signalId: intent.signal!.id,
    openedCandleIndex: intent.candleIndex,
    openedReplaySequence: intent.replaySequence,
    entry: intent.entry,
    stopLoss: intent.oco.stopLoss,
    target: intent.oco.target,
    contracts: intent.contracts,
    openedAt: now.toISOString(),
    status: "OPEN",
  };
}

function pointsFor(side: Side, entry: number, exit: number): number {
  return side === "BUY" ? exit - entry : entry - exit;
}

export function resolveOco(
  position: Position,
  candle: Candle,
  now = new Date(candle.timestamp),
): Trade | null {
  // Não usamos a máxima/mínima do próprio candle de entrada para resolver a OCO,
  // pois parte desse range pode ter ocorrido antes da ordem ser aberta.
  if (candle.index <= position.openedCandleIndex) {
    return null;
  }

  const stopTouched =
    position.side === "BUY"
      ? candle.low <= position.stopLoss
      : candle.high >= position.stopLoss;

  const targetTouched =
    position.side === "BUY"
      ? candle.high >= position.target
      : candle.low <= position.target;

  if (!stopTouched && !targetTouched) {
    return null;
  }

  // Quando um candle histórico toca stop e alvo e não há informação intrabar,
  // adotamos deliberadamente a hipótese conservadora: o stop é considerado
  // executado primeiro. Essa política será configurável na fase de replay.
  const exitReason = stopTouched ? "STOP" : "TARGET";
  const exitPrice =
    exitReason === "STOP" ? position.stopLoss : position.target;

  const resultPoints = pointsFor(
    position.side,
    position.entry,
    exitPrice,
  );

  return {
    id: position.id,
    asset: position.asset,
    side: position.side,
    signalId: position.signalId,
    entry: position.entry,
    stopLoss: position.stopLoss,
    target: position.target,
    contracts: position.contracts,
    openedAt: position.openedAt,
    status: "CLOSED",
    exitPrice,
    exitReason,
    closedAt: now.toISOString(),
    resultPoints,
    grossResultBRL: grossResultBRL(
      position.asset,
      resultPoints,
      position.contracts,
    ),
  };
}

export function resolveOcoTrade(
  position: Position,
  trade: ReplayTrade,
): Trade | null {
  if (
    position.openedReplaySequence !== undefined &&
    trade.sequence <= position.openedReplaySequence
  ) {
    return null;
  }

  const stopTouched =
    position.side === "BUY"
      ? trade.price <= position.stopLoss
      : trade.price >= position.stopLoss;

  const targetTouched =
    position.side === "BUY"
      ? trade.price >= position.target
      : trade.price <= position.target;

  if (!stopTouched && !targetTouched) {
    return null;
  }

  // Com dados negócio a negócio não precisamos supor qual nível veio primeiro:
  // cada evento chega em sequência histórica canônica.
  const exitReason = stopTouched ? "STOP" : "TARGET";
  const exitPrice =
    exitReason === "STOP" ? position.stopLoss : position.target;

  const resultPoints = pointsFor(
    position.side,
    position.entry,
    exitPrice,
  );

  return {
    id: position.id,
    asset: position.asset,
    side: position.side,
    signalId: position.signalId,
    entry: position.entry,
    stopLoss: position.stopLoss,
    target: position.target,
    contracts: position.contracts,
    openedAt: position.openedAt,
    status: "CLOSED",
    exitPrice,
    exitReason,
    closedAt: trade.timestamp,
    resultPoints,
    grossResultBRL: grossResultBRL(
      position.asset,
      resultPoints,
      position.contracts,
    ),
  };
}

export function sideLabel(side: Side): string {
  return side === "BUY" ? "Compra" : "Venda";
}

export function signalAllows(
  signal: IndicatorSignal | null,
  asset: TradeIntent["asset"],
  side: Side,
): boolean {
  return Boolean(signal && signal.asset === asset && signal.side === side);
}
