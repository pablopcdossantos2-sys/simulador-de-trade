export type Asset = "WINFUT" | "WDOFUT";
export type Side = "BUY" | "SELL";
export type SignalSide = Side | "NONE";
export type IndicatorZone = "GREEN" | "RED" | "NONE";
export type VwapAnchor = "Session" | "Week" | "Month" | "Year";

export interface Candle {
  index: number;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ReplayTrade {
  asset: Asset;
  timestamp: string;
  sourceRow: number;
  sequence: number;
  price: number;
  quantity: number;
}

export interface IndicatorSignal {
  id: string;
  asset: Asset;
  side: Side;
  candleIndex: number;
  timestamp: string;
  price: number;
  label: "Compra" | "Venda";
}

export interface IndicatorPoint {
  candleIndex: number;
  wma20: number | null;
  vwap: number | null;
  ema8: number;
  ema52: number;
  zone: IndicatorZone;
}

export interface IndicatorEvaluation {
  authorization: IndicatorSignal | null;
  signals: IndicatorSignal[];
  series: IndicatorPoint[];
  zone: IndicatorZone;
}

export interface OcoOrder {
  stopLoss: number;
  target: number;
}

export interface ExecutionSettings {
  costPerContractRoundTripBRL: number;
  slippageTicksPerSide: number;
}

export interface Position {
  id: string;
  asset: Asset;
  side: Side;
  signalId: string;
  openedCandleIndex: number;
  openedReplaySequence?: number;
  requestedEntry: number;
  requestedEntry: number;
  entry: number;
  stopLoss: number;
  target: number;
  contracts: number;
  slippageTicksPerSide: number;
  costPerContractRoundTripBRL: number;
  openedAt: string;
  status: "OPEN";
}

export type ExitReason = "STOP" | "TARGET";

export interface Trade {
  id: string;
  asset: Asset;
  side: Side;
  signalId: string;
  entry: number;
  stopLoss: number;
  target: number;
  contracts: number;
  slippageTicksPerSide: number;
  costPerContractRoundTripBRL: number;
  openedAt: string;
  status: "CLOSED";
  exitPrice: number;
  exitReason: ExitReason;
  closedAt: string;
  resultPoints: number;
  grossResultBRL: number;
  operationalCostsBRL: number;
  netResultBRL: number;
}

export interface TradeIntent {
  asset: Asset;
  side: Side;
  entry: number;
  contracts: number;
  execution: ExecutionSettings;
  candleIndex: number;
  replaySequence?: number;
  oco: OcoOrder;
  signal: IndicatorSignal | null;
  hasOpenPosition: boolean;
}


export type TrainingSessionStatus = "ACTIVE" | "ENDED";

export type TrainingEventType =
  | "SESSION_STARTED"
  | "SESSION_ENDED"
  | "BLOCKED_ATTEMPT"
  | "SIGNAL_IGNORED"
  | "TRADE_OPENED"
  | "TRADE_CLOSED"
  | "TECHNICAL_ISSUE";

export interface TrainingSession {
  id: string;
  asset: Asset;
  tradeDate: string;
  startTime: string;
  endTime: string;
  timeframeMinutes: number;
  warmupBars: number;
  startedAt: string;
  endedAt: string | null;
  status: TrainingSessionStatus;
}

export interface TrainingEvent {
  id: string;
  sessionId: string;
  type: TrainingEventType;
  timestamp: string;
  marketTimestamp: string | null;
  signalId: string | null;
  side: Side | null;
  reason: string | null;
  tradeId: string | null;
}

export interface TrainingSummary {
  tradesExecuted: number;
  blockedAttempts: number;
  ignoredSignals: number;
  closedTrades: number;
  executionAdherencePct: number;
}


export type TrainingEventClass =
  | "DISCIPLINE"
  | "EXECUTION"
  | "OBSERVATION"
  | "TECHNICAL"
  | "SESSION";

export interface SessionPerformance {
  totalTrades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  netPoints: number;
  averagePoints: number;
  averageWinPoints: number;
  averageLossPoints: number;
  payoff: number | null;
  profitFactor: number | null;
  bestTradePoints: number;
  worstTradePoints: number;
  buyTrades: number;
  sellTrades: number;
  buyNetPoints: number;
  sellNetPoints: number;
  totalR: number;
  expectancyR: number;
  maxDrawdownPoints: number;
  grossResultBRL: number;
  operationalCostsBRL: number;
  netResultBRL: number;
  blockedAttempts: number;
  technicalIssues: number;
  ignoredSignals: number;
  executionAdherencePct: number;
}

export interface SessionReport {
  session: TrainingSession;
  events: TrainingEvent[];
  trades: Trade[];
  performance: SessionPerformance;
}
