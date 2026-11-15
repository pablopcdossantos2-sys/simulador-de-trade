import type { Position, ReplayTrade, Side } from "../types";
import { grossResultBRL, isPriceOnTick, tickSizeFor } from "./marketSpecs";

export type StopWideningOutcome = "TARGET" | "BANKRUPTCY" | "SESSION_END";

export interface StopWideningAdjustment {
  timestamp: string;
  marketPrice: number;
  previousStop: number;
  nextStop: number;
}

export interface StopWideningScenario {
  outcome: StopWideningOutcome;
  startingBalanceBRL: number;
  finalBalanceBRL: number;
  netResultBRL: number;
  exitPrice: number;
  exitTimestamp: string;
  widenedTimes: number;
  initialRiskPoints: number;
  attemptedStop: number;
  lastStop: number;
  processedTrades: number;
  adjustments: StopWideningAdjustment[];
}

/**
 * Interpreta timestamps como relógio local do mercado, igual ao backend Rust.
 * O Profit fornece horários de pregão; offsets/Z não devem deslocar o relógio
 * informado. A conversão para UTC é apenas uma representação numérica estável
 * para comparar os componentes de data/hora, independentemente do fuso do PC.
 */
function parseMarketTimestamp(raw: string): number {
  const value = raw.trim();
  const match = /^(\\d{4}-\\d{2}-\\d{2})[T ](\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?)(?:Z|[+-]\\d{2}:?\\d{2})?$/i.exec(value);
  if (!match) return Number.NaN;
  return Date.parse(`${match[1]}T${match[2]}Z`);
}

function pointsFor(side: Side, entry: number, exit: number): number {
  return side === "BUY" ? exit - entry : entry - exit;
}

function effectiveExitPrice(
  position: Position,
  triggerPrice: number,
  outcome: StopWideningOutcome,
): number {
  if (outcome === "TARGET") return triggerPrice;
  const slippage = position.slippageTicksPerSide * tickSizeFor(position.asset);
  return position.side === "BUY"
    ? triggerPrice - slippage
    : triggerPrice + slippage;
}

function resultAt(
  position: Position,
  triggerPrice: number,
  outcome: StopWideningOutcome,
  startingBalanceBRL: number,
): Pick<StopWideningScenario, "exitPrice" | "netResultBRL" | "finalBalanceBRL"> {
  const exitPrice = effectiveExitPrice(position, triggerPrice, outcome);
  if (!Number.isFinite(exitPrice) || exitPrice <= 0 || !isPriceOnTick(position.asset, exitPrice)) {
    throw new Error("O preço de saída após slippage é inválido ou incompatível com o tick do ativo.");
  }
  const gross = grossResultBRL(
    position.asset,
    pointsFor(position.side, position.entry, exitPrice),
    position.contracts,
  );
  const costs = position.costPerContractRoundTripBRL * position.contracts;
  const netResultBRL = gross - costs;
  return {
    exitPrice,
    netResultBRL,
    finalBalanceBRL: startingBalanceBRL + netResultBRL,
  };
}

/**
 * Counterfactual educational scenario:
 * start with the user's attempted widened stop. Every time that level is
 * reached, move it one original-risk unit farther away instead of exiting.
 * The target remains unchanged. This is a hypothetical rule, not an actual
 * execution or a margin/liquidation simulator.
 */
export function simulateStopWideningScenario(input: {
  position: Position;
  attemptedStop: number;
  tradesAfterViolation: ReplayTrade[];
  startingBalanceBRL: number;
  lastObservedPrice: number;
  lastObservedTimestamp: string;
}): StopWideningScenario {
  const {
    position,
    attemptedStop,
    tradesAfterViolation,
    startingBalanceBRL,
    lastObservedPrice,
    lastObservedTimestamp,
  } = input;

  if (!Number.isFinite(startingBalanceBRL) || startingBalanceBRL <= 0) {
    throw new Error("Informe um saldo inicial maior que zero para simular o risco da conta.");
  }
  if (!Number.isFinite(lastObservedPrice) || lastObservedPrice <= 0) {
    throw new Error("Não há preço válido para iniciar a análise contrafactual.");
  }
  const lastObservedTime = parseMarketTimestamp(lastObservedTimestamp);
  if (!lastObservedTimestamp.trim() || !Number.isFinite(lastObservedTime)) {
    throw new Error("Informe um horário válido para o último preço observado.");
  }
  if (!Number.isInteger(position.contracts) || position.contracts <= 0) {
    throw new Error("A quantidade de contratos precisa ser um inteiro maior que zero.");
  }
  if (!Number.isFinite(position.slippageTicksPerSide) || position.slippageTicksPerSide < 0 ||
      !Number.isFinite(position.costPerContractRoundTripBRL) || position.costPerContractRoundTripBRL < 0) {
    throw new Error("Custos e slippage precisam ser valores válidos e não negativos.");
  }
  const referencePrices = [
    position.entry, position.stopLoss, position.target, attemptedStop, lastObservedPrice,
  ];
  if (referencePrices.some((price) =>
    !Number.isFinite(price) || price <= 0 || !isPriceOnTick(position.asset, price)
  )) {
    throw new Error("A posição contém preços inválidos ou incompatíveis com o tick do ativo.");
  }
  const validGeometry = position.side === "BUY"
    ? position.stopLoss < position.entry && position.target > position.entry
    : position.stopLoss > position.entry && position.target < position.entry;
  if (!validGeometry) {
    throw new Error("Stop e alvo precisam estar em lados válidos do preço de entrada.");
  }

  const initialRiskPoints = Math.abs(position.entry - position.stopLoss);
  if (!Number.isFinite(initialRiskPoints) || initialRiskPoints <= 0) {
    throw new Error("Não foi possível determinar o risco inicial da posição.");
  }

  const widenedAway = position.side === "BUY"
    ? attemptedStop < position.stopLoss
    : attemptedStop > position.stopLoss;
  if (!widenedAway) {
    throw new Error("O preço informado não representa um afastamento do stop.");
  }

  let currentStop = attemptedStop;
  let widenedTimes = 0;
  let lastPrice = lastObservedPrice;
  let lastTimestamp = lastObservedTimestamp;
  let processedTrades = 0;
  const adjustments: StopWideningAdjustment[] = [];

  let previousSequence = position.openedReplaySequence ?? -1;
  let previousTradeTime = lastObservedTime;
  for (const trade of tradesAfterViolation) {
    if (trade.sequence <= (position.openedReplaySequence ?? -1)) continue;
    if (trade.asset !== position.asset) {
      throw new Error("O replay contém negócio de ativo diferente da posição.");
    }
    if (!Number.isInteger(trade.sequence) || trade.sequence <= previousSequence) {
      throw new Error("Os negócios do replay precisam estar em ordem crescente e sem duplicidade.");
    }
    if (!Number.isFinite(trade.price) || trade.price <= 0 ||
        !isPriceOnTick(position.asset, trade.price)) {
      throw new Error("O replay contém preço inválido ou incompatível com o tick do ativo.");
    }
    const tradeTime = parseMarketTimestamp(trade.timestamp);
    if (!Number.isFinite(trade.quantity) || trade.quantity <= 0 ||
        !trade.timestamp.trim() || !Number.isFinite(tradeTime)) {
      throw new Error("O replay contém quantidade ou horário inválido.");
    }
    if (tradeTime < previousTradeTime) {
      throw new Error("Os horários dos negócios do replay não podem retroceder em relação ao último preço observado.");
    }

    previousSequence = trade.sequence;
    previousTradeTime = tradeTime;
    processedTrades += 1;
    lastPrice = trade.price;
    lastTimestamp = trade.timestamp;

    const targetReached = position.side === "BUY"
      ? trade.price >= position.target
      : trade.price <= position.target;
    if (targetReached) {
      const result = resultAt(position, position.target, "TARGET", startingBalanceBRL);
      return {
        outcome: "TARGET",
        startingBalanceBRL,
        ...result,
        exitTimestamp: trade.timestamp,
        widenedTimes,
        initialRiskPoints,
        attemptedStop,
        lastStop: currentStop,
        processedTrades,
        adjustments,
      };
    }

    const unrealized = grossResultBRL(
      position.asset,
      pointsFor(position.side, position.entry, trade.price),
      position.contracts,
    );
    const estimatedEquity = startingBalanceBRL + unrealized -
      position.costPerContractRoundTripBRL * position.contracts;
    if (estimatedEquity <= 0) {
      const result = resultAt(position, trade.price, "BANKRUPTCY", startingBalanceBRL);
      return {
        outcome: "BANKRUPTCY",
        startingBalanceBRL,
        ...result,
        exitTimestamp: trade.timestamp,
        widenedTimes,
        initialRiskPoints,
        attemptedStop,
        lastStop: currentStop,
        processedTrades,
        adjustments,
      };
    }

    const stopReached = position.side === "BUY"
      ? trade.price <= currentStop
      : trade.price >= currentStop;
    if (stopReached) {
      const previousStop = currentStop;
      currentStop = position.side === "BUY"
        ? currentStop - initialRiskPoints
        : currentStop + initialRiskPoints;
      widenedTimes += 1;
      adjustments.push({
        timestamp: trade.timestamp,
        marketPrice: trade.price,
        previousStop,
        nextStop: currentStop,
      });
    }
  }

  const result = resultAt(position, lastPrice, "SESSION_END", startingBalanceBRL);
  return {
    outcome: "SESSION_END",
    startingBalanceBRL,
    ...result,
    exitTimestamp: lastTimestamp,
    widenedTimes,
    initialRiskPoints,
    attemptedStop,
    lastStop: currentStop,
    processedTrades,
    adjustments,
  };
}
