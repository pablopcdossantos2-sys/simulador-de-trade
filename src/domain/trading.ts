import { touchDiscipline, finishDiscipline, type DisciplineClock } from "./discipline";
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
  exitReason: Trade["exitReason"],
): number {
  // O alvo é uma ordem limite: não aplicamos slippage adverso de saída.
  if (exitReason === "TARGET") return triggerPrice;

  const slip =
    position.slippageTicksPerSide * tickSizeFor(position.asset);
  // Encerrar BUY significa vender; encerrar SELL significa comprar.
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

function validateEffectiveRiskReward(intent: TradeIntent, executedEntry: number): void {
  const slip = intent.execution.slippageTicksPerSide * tickSizeFor(intent.asset);
  const stopExecution = intent.side === "BUY"
    ? intent.oco.stopLoss - slip
    : intent.oco.stopLoss + slip;
  const riskPoints = intent.side === "BUY"
    ? executedEntry - stopExecution
    : stopExecution - executedEntry;
  const rewardPoints = intent.side === "BUY"
    ? intent.oco.target - executedEntry
    : executedEntry - intent.oco.target;
  const cost = costForAsset(intent);
  const riskBRL = grossResultBRL(intent.asset, riskPoints, 1) + cost;
  const rewardBRL = grossResultBRL(intent.asset, rewardPoints, 1) - cost;
  if (riskPoints <= 0 || rewardPoints <= 0 || rewardBRL + 1e-9 < riskBRL * 2) {
    throw new TradingRuleError(
      "Risco/retorno efetivo inferior a 1:2 após slippage e custos. Ajuste a entrada, o stop, o alvo ou as configurações de execução.",
    );
  }
}

/** Valida alterações OCO durante uma posição aberta usando o risco ainda exposto pelo stop ativo. */
export function validatePositionOco(
  position: Position,
  stopLoss: number,
  target: number,
): void {
  if (!isFinitePrice(stopLoss) || !isFinitePrice(target)) {
    throw new TradingRuleError("Stop loss e alvo devem possuir preços válidos.");
  }
  if (!isPriceOnTick(position.asset, stopLoss) || !isPriceOnTick(position.asset, target)) {
    throw new TradingRuleError(`Stop e alvo precisam respeitar o incremento mínimo de ${tickSizeFor(position.asset)} do ativo.`);
  }
  if (position.side === "BUY" ? stopLoss >= target : stopLoss <= target) {
    throw new TradingRuleError("O Stop não pode alcançar ou ultrapassar o alvo.");
  }

  const slip = position.slippageTicksPerSide * tickSizeFor(position.asset);
  const stopExecution = position.side === "BUY" ? stopLoss - slip : stopLoss + slip;
  const riskPoints = position.side === "BUY"
    ? position.entry - stopExecution
    : stopExecution - position.entry;
  const rewardPoints = position.side === "BUY"
    ? target - position.entry
    : position.entry - target;
  const riskBRL = grossResultBRL(position.asset, Math.max(0, riskPoints), 1)
    + position.costPerContractRoundTripBRL;
  const rewardBRL = grossResultBRL(position.asset, rewardPoints, 1)
    - position.costPerContractRoundTripBRL;

  if (rewardPoints <= 0 || rewardBRL <= 0) {
    throw new TradingRuleError("O alvo precisa permanecer além da entrada e cobrir os custos operacionais.");
  }
  // Stop no breakeven ou em lucro elimina o risco financeiro positivo da posição.
  if (riskPoints <= 0) return;
  if (rewardBRL + 1e-9 < riskBRL * 2) {
    throw new TradingRuleError(
      `Ajuste OCO bloqueado: o alvo precisa manter pelo menos 1:2 em relação ao risco ainda exposto. Risco efetivo: R$ ${riskBRL.toFixed(2)}; retorno efetivo: R$ ${rewardBRL.toFixed(2)}.`,
    );
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

  if (!isFinitePrice(intent.marketPrice)) {
    throw new TradingRuleError("Não há um último preço de mercado válido para validar a entrada.");
  }
  const entryDistance = Math.abs(entry - intent.marketPrice);
  const maximumEntryDistance = tickSizeFor(asset);
  if (entryDistance > maximumEntryDistance + 1e-9) {
    throw new TradingRuleError(
      `Entrada bloqueada: o preço escolhido está a ${entryDistance.toLocaleString("pt-BR")} pontos do mercado. A entrada precisa ficar a no máximo 1 tick (${maximumEntryDistance.toLocaleString("pt-BR")} pontos) do último preço observado. Reposicione a entrada no gráfico.`,
    );
  }

  if (!signal && !intent.reentryAuthorized && !intent.manualDirectionAuthorization) {
    throw new TradingRuleError(
      "Nenhuma operação pode ser aberta sem sinal, reentrada autorizada ou confluência direcional M15 válida.",
    );
  }

  if (signal && intent.manualDirectionAuthorization) {
    throw new TradingRuleError("Não misture sinais automáticos e permissões manuais M15 na mesma operação.");
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
  } else if (intent.manualDirectionAuthorization) {
    const manual = intent.manualDirectionAuthorization;
    if (intent.reentryAuthorized || manual.strategyId !== "MTF_ANGULACAO" ||
        manual.side !== side || !manual.id.startsWith("mtf-confluence:")) {
      throw new TradingRuleError(
        "A autorização manual M15 só permite operações no sentido da confluência atual.",
      );
    }
  } else if (!intent.reentryAuthorized || intent.reentrySide !== side) {
    throw new TradingRuleError(
      "A reentrada pela MME 52 só autoriza a mesma direção da última operação encerrada.",
    );
  }

  // Centraliza tick, geometria e razão nominal em uma única validação.
  validateOcoOrder(asset, side, entry, oco.stopLoss, oco.target);

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

  validateEffectiveRiskReward(intent, executedEntry);
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
    signalId: intent.signal?.id ?? intent.manualDirectionAuthorization?.id ??
      intent.reentryAuthorizationId ?? `MA52_REENTRY_${intent.asset}_${intent.candleIndex}_${intent.side}`,
    openedCandleIndex: intent.candleIndex,
    openedReplaySequence: intent.replaySequence,
    requestedEntry: intent.entry,
    entry: entryExecutionPrice(intent),
    stopLoss: intent.oco.stopLoss,
    initialStopLoss: intent.oco.stopLoss,
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
  clock: DisciplineClock = { now: () => performance.now() },
): Trade {
  const exitPrice = position.discipline ? triggerPrice : exitExecutionPrice(position, triggerPrice, exitReason);
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

  return finishDiscipline(position, {
    id: position.id,
    asset: position.asset,
    side: position.side,
    signalId: position.signalId,
    requestedEntry: position.requestedEntry,
    entry: position.entry,
    stopLoss: position.stopLoss,
    initialStopLoss: position.initialStopLoss ?? position.stopLoss,
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
  }, clock);
}

export function closePositionAtMarket(
  position: Position,
  marketPrice: number,
  closedAt: string,
  clock: DisciplineClock = { now: () => performance.now() },
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
    clock,
  );
}

export function closePositionManually(
  position: Position,
  marketPrice: number,
  closedAt: string,
  clock: DisciplineClock = { now: () => performance.now() },
): Trade {
  if (!Number.isFinite(marketPrice) || marketPrice <= 0) {
    throw new TradingRuleError("Não é possível acionar o stop manual sem um último preço válido.");
  }
  return closePosition(position, marketPrice, "MANUAL_STOP", closedAt, clock);
}

export function resolveOco(
  position: Position,
  candle: Candle,
  now = new Date(candle.timestamp),
  clock: DisciplineClock = { now: () => performance.now() },
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

  const manualStop = position.discipline && position.discipline.level !== 1;
  const targetTouched =
    position.side === "BUY"
      ? candle.high >= position.target
      : candle.low <= position.target;

  position = touchDiscipline(position, candle.low, candle.high, candle.timestamp, clock);
  if (manualStop && !targetTouched) return null;
  if (!stopTouched && !targetTouched) {
    return null;
  }

  // Quando um candle agregado toca Stop e Alvo e não existe sequência
  // intrabar, a política armazenada na posição resolve a ambiguidade.
  // No replay negócio a negócio esta política não é usada.
  const bothTouched = stopTouched && targetTouched;
  const exitReason = manualStop ? "TARGET" : bothTouched
    ? position.intrabarPolicy === "TARGET_FIRST"
      ? "TARGET"
      : "STOP"
    : stopTouched
      ? "STOP"
      : "TARGET";
  const triggerPrice = exitReason === "TARGET"
    ? position.target
    : position.discipline ? position.stopLoss : position.side === "BUY"
      ? Math.min(candle.open, position.stopLoss)
      : Math.max(candle.open, position.stopLoss);

  return closePosition(
    position,
    triggerPrice,
    exitReason,
    now.toISOString(),
    clock,
  );
}

export function resolveOcoTrade(
  position: Position,
  trade: ReplayTrade,
  clock: DisciplineClock = { now: () => performance.now() },
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

  const manualStop = position.discipline && position.discipline.level !== 1;
  const targetTouched =
    position.side === "BUY"
      ? trade.price >= position.target
      : trade.price <= position.target;

  position = touchDiscipline(position, trade.price, trade.price, trade.timestamp, clock);
  if (manualStop && !targetTouched) return null;
  if (!stopTouched && !targetTouched) {
    return null;
  }

  // Com dados negócio a negócio não precisamos supor qual nível veio primeiro:
  // cada evento chega em sequência histórica canônica.
  const exitReason = !manualStop && stopTouched ? "STOP" : "TARGET";
  const triggerPrice = exitReason === "TARGET"
    ? position.target
    : position.discipline ? position.stopLoss : position.side === "BUY"
      ? Math.min(trade.price, position.stopLoss)
      : Math.max(trade.price, position.stopLoss);

  return closePosition(
    position,
    triggerPrice,
    exitReason,
    trade.timestamp,
    clock,
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


export const STOP_REENTRY_COOLDOWN_CANDLES = 10;

export function canReenterAfterStop(
  exitReason: Trade["exitReason"],
  stoppedAtCandleIndex: number,
  latestClosedCandleIndex: number,
): boolean {
  return exitReason === "STOP"
    && Number.isInteger(stoppedAtCandleIndex)
    && Number.isInteger(latestClosedCandleIndex)
    && latestClosedCandleIndex - stoppedAtCandleIndex >= STOP_REENTRY_COOLDOWN_CANDLES;
}
