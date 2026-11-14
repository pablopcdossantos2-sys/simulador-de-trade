import type { Position, ReplayTrade, Side } from "../types";
import { grossResultBRL, tickSizeFor } from "./marketSpecs";

export type StopWideningOutcome = "TARGET" | "BANKRUPTCY" | "SESSION_END";

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

  for (const trade of tradesAfterViolation) {
    if (trade.sequence <= (position.openedReplaySequence ?? -1)) continue;
    if (!Number.isFinite(trade.price) || trade.price <= 0) continue;

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
      };
    }

    const stopReached = position.side === "BUY"
      ? trade.price <= currentStop
      : trade.price >= currentStop;
    if (stopReached) {
      currentStop = position.side === "BUY"
        ? currentStop - initialRiskPoints
        : currentStop + initialRiskPoints;
      widenedTimes += 1;
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
  };
}
