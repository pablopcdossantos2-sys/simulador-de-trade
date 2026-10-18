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

function costForAsset(intent: TradeIntent): number {
  const assetCost = intent.asset === "WINFUT"
    ? intent.execution.costWinRoundTripBRL
    : intent.execution.costWdoRoundTripBRL;
  return assetCost ?? intent.execution.costPerContractRoundTripBRL;
}

function validateExecutionSettings(intent: TradeIntent): void {
  const costPerContractRoundTripBRL = costForAsset(intent);
  const { slippageTicksPerSide, intrabarPolicy } = intent.execution;
  if (!Number.isFinite(costPerContractRoundTripBRL) || costPerContractRoundTripBRL < 0) {
    throw new TradingRuleError("O custo operacional por contrato precisa ser maior ou igual a zero.");
  }
  if (!Number.isInteger(slippageTicksPerSide) || slippageTicksPerSide < 0) {
    throw new TradingRuleError("O slippage precisa ser informado como uma quantidade inteira de ticks maior ou igual a zero.");
  }
  if (intrabarPolicy !== "STOP_FIRST" && intrabarPolicy !== "TARGET_FIRST") {
    throw new TradingRuleError("A política intrabar configurada é inválida.");
  }
}

function entryExecutionPrice(intent: TradeIntent): number {
  const slip =
    intent.execution.slippageTicksPerSide * tickSizeFor(intent.asset);
  return intent.side === "BUY"
    ? intent.entry + slip
    : intent.entry - slip;
}

function exitExecutionPrice(
  position: Position,
  triggerPrice: number,
): number {
  const slip =
    position.slippageTicksPerSide * tickSizeFor(position.asset);

  // Encerrar BUY significa vender: pior execução = preço menor.
  // Encerrar SELL significa comprar: pior execução = preço maior.
  return position.side === "BUY"
    ? triggerPrice - slip
    : triggerPrice + slip;
}

export function validateOcoOrder(
  asset: TradeIntent["asset"],
  side: Side,
  entry: number,
  stopLoss: number,
  target: number,
): void {
  if (!isFinitePrice(entry) || !isFinitePrice(stopLoss) || !isFinitePrice(target)) {
    throw new TradingRuleError("Entrada, stop loss e alvo devem possuir preços válidos.");
  }
  if (!isPriceOnTick(asset, entry) || !isPriceOnTick(asset, stopLoss) || !isPriceOnTick(asset, target)) {
    throw new TradingRuleError(`Entrada, stop loss e alvo precisam respeitar o incremento mínimo de ${tickSizeFor(asset)} do ativo.`);
  }
  if (side === "BUY" && (stopLoss >= entry || target <= entry)) {
    throw new TradingRuleError("Em uma compra, o stop deve ficar abaixo da entrada e o alvo acima dela.");
  }
  if (side === "SELL" && (stopLoss <= entry || target >= entry)) {
    throw new TradingRuleError("Em uma venda, o stop deve ficar acima da entrada e o alvo abaixo dela.");
  }
  const risk = side === "BUY" ? entry - stopLoss : stopLoss - entry;
  const reward = side === "BUY" ? target - entry : entry - target;
  if (reward + 1e-9 < risk * 2) {
    throw new TradingRuleError(`Risco/retorno fora das regras: o alvo precisa oferecer pelo menos 2 vezes o risco (mínimo 1:2). Risco: ${risk.toFixed(2)} pontos; alvo: ${reward.toFixed(2)} pontos.`);
  }
}

export function validateTradeIntent(intent: TradeIntent): void {
  const {
    signal,
    side,
    entry,
    contracts,
    oco,
    asset,
    signalAlreadyUsed,
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

  validateExecutionSettings(intent);

  if (!signal && !intent.reentryAuthorized) {
    throw new TradingRuleError(
      "Nenhuma operação pode ser aberta sem sinal ativo ou autorização válida de reentrada pela MME 52.",
    );
  }

  if (signal) {
    if (signalAlreadyUsed) {
      throw new TradingRuleError(
        "Este sinal já foi utilizado em uma operação. Aguarde um novo gatilho do indicador ou uma reentrada autorizada pela MME 52.",
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
  } else if (!intent.reentryAuthorized || intent.reentrySide !== side) {
    throw new TradingRuleError(
      "A reentrada pela MME 52 só autoriza a mesma direção da última operação encerrada.",
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

  const executedEntry = entryExecutionPrice(intent);

  if (side === "BUY" && executedEntry >= oco.target) {
    throw new TradingRuleError(
      "O slippage configurado torna o preço executado da compra igual ou superior ao alvo. Reduza o slippage ou afaste o alvo.",
    );
  }

  if (side === "BUY" && executedEntry <= oco.stopLoss) {
    throw new TradingRuleError(
      "O slippage configurado torna a entrada da compra incompatível com o stop.",
    );
  }

  if (side === "SELL" && executedEntry <= oco.target) {
    throw new TradingRuleError(
      "O slippage configurado torna o preço executado da venda igual ou inferior ao alvo. Reduza o slippage ou afaste o alvo.",
    );
  }

  if (side === "SELL" && executedEntry >= oco.stopLoss) {
    throw new TradingRuleError(
      "O slippage configurado torna a entrada da venda incompatível com o stop.",
    );
  }

  validateOcoOrder(asset, side, entry, oco.stopLoss, oco.target);
}

export function openPosition(
  intent: TradeIntent,
  openedAt: Date | string = new Date(),
): Position {
  validateTradeIntent(intent);

  const openedAtText =
    typeof openedAt === "string" ? openedAt : openedAt.toISOString();

  return {
    id: crypto.randomUUID(),
    asset: intent.asset,
    side: intent.side,
    signalId: intent.signal?.id ?? intent.reentryAuthorizationId ?? `MA52_REENTRY_${intent.asset}_${intent.candleIndex}_${intent.side}`,
    openedCandleIndex: intent.candleIndex,
    openedReplaySequence: intent.replaySequence,
    requestedEntry: intent.entry,
    entry: entryExecutionPrice(intent),
    stopLoss: intent.oco.stopLoss,
    target: intent.oco.target,
    contracts: intent.contracts,
    slippageTicksPerSide: intent.execution.slippageTicksPerSide,
    costPerContractRoundTripBRL: costForAsset(intent),
    intrabarPolicy: intent.execution.intrabarPolicy,
    entryContext: intent.entryContext ?? null,
    openedAt: openedAtText,
    status: "OPEN",
  };
}

function pointsFor(side: Side, entry: number, exit: number): number {
  return side === "BUY" ? exit - entry : entry - exit;
}

function closePosition(
  position: Position,
  triggerPrice: number,
  exitReason: Trade["exitReason"],
  closedAt: string,
): Trade {
  const exitPrice = exitExecutionPrice(position, triggerPrice);
  const resultPoints = pointsFor(
    position.side,
    position.entry,
    exitPrice,
  );
  const gross = grossResultBRL(
    position.asset,
    resultPoints,
    position.contracts,
  );
  const operationalCostsBRL =
    position.costPerContractRoundTripBRL * position.contracts;

  return {
    id: position.id,
    asset: position.asset,
    side: position.side,
    signalId: position.signalId,
    requestedEntry: position.requestedEntry,
    entry: position.entry,
    stopLoss: position.stopLoss,
    target: position.target,
    contracts: position.contracts,
    slippageTicksPerSide: position.slippageTicksPerSide,
    costPerContractRoundTripBRL:
      position.costPerContractRoundTripBRL,
    intrabarPolicy: position.intrabarPolicy,
    openedAt: position.openedAt,
    status: "CLOSED",
    exitPrice,
    exitReason,
    closedAt,
    resultPoints,
    grossResultBRL: gross,
    operationalCostsBRL,
    netResultBRL: gross - operationalCostsBRL,
    postTradeNote: "",
    entryContext: position.entryContext,
  };
}

export function closePositionAtMarket(
  position: Position,
  marketPrice: number,
  closedAt: string,
): Trade {
  if (!Number.isFinite(marketPrice) || marketPrice <= 0) {
    throw new TradingRuleError(
      "Não é possível encerrar a mercado sem um último preço válido.",
    );
  }

  return closePosition(
    position,
    marketPrice,
    "SESSION_END",
    closedAt,
  );
}

export function closePositionManually(
  position: Position,
  marketPrice: number,
  closedAt: string,
): Trade {
  if (!Number.isFinite(marketPrice) || marketPrice <= 0) {
    throw new TradingRuleError("Não é possível acionar o stop manual sem um último preço válido.");
  }
  return closePosition(position, marketPrice, "MANUAL_STOP", closedAt);
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

  // Quando um candle agregado toca Stop e Alvo e não existe sequência
  // intrabar, a política armazenada na posição resolve a ambiguidade.
  // No replay negócio a negócio esta política não é usada.
  const bothTouched = stopTouched && targetTouched;
  const exitReason = bothTouched
    ? position.intrabarPolicy === "TARGET_FIRST"
      ? "TARGET"
      : "STOP"
    : stopTouched
      ? "STOP"
      : "TARGET";
  const triggerPrice =
    exitReason === "STOP" ? position.stopLoss : position.target;

  return closePosition(
    position,
    triggerPrice,
    exitReason,
    now.toISOString(),
  );
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
  const triggerPrice =
    exitReason === "STOP" ? position.stopLoss : position.target;

  return closePosition(
    position,
    triggerPrice,
    exitReason,
    trade.timestamp,
  );
}

export function sideLabel(side: Side): string {
  return side === "BUY" ? "Compra" : "Venda";
}

export function signalAllows(
  signal: IndicatorSignal | null,
  asset: TradeIntent["asset"],
  side: Side,
  signalAlreadyUsed = false,
): boolean {
  return Boolean(
    signal &&
      !signalAlreadyUsed &&
      signal.asset === asset &&
      signal.side === side,
  );
}
