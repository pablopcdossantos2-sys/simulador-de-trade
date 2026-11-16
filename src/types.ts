export type Asset = "WINFUT" | "WDOFUT";
export type Side = "BUY" | "SELL";
export type TradingStrategyId = "MULTI_MEDIAS" | "MTF_ANGULACAO";
export type SignalSide = Side | "NONE";
export type IndicatorZone = "GREEN" | "RED" | "NONE";
export type VwapAnchor = "Session" | "Week" | "Month" | "Year";
export type IntrabarPolicy = "STOP_FIRST" | "TARGET_FIRST";

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
  ema8: number | null;
  ema52: number | null;
  zone: IndicatorZone;
}

export interface IndicatorEvaluation {
  authorization: IndicatorSignal | null;
  signals: IndicatorSignal[];
  series: IndicatorPoint[];
  zone: IndicatorZone;
}


export interface TradeEntryContext {
  capturedAt: string;
  marketTimestamp: string;
  asset: Asset;
  candleIndex: number;
  currentPrice: number;
  zone: IndicatorZone;
  signal: IndicatorSignal;
  indicatorVersion?: string;
  candles: Candle[];
  indicatorSeries: IndicatorPoint[];
  signals: IndicatorSignal[];
}

export interface OcoOrder {
  stopLoss: number;
  target: number;
}

export interface ExecutionSettings {
  /** Campo legado para compatibilidade com versões e backups anteriores. */
  costPerContractRoundTripBRL: number;
  /** Custos aproximados por contrato, round trip, editáveis pelo usuário. */
  costWinRoundTripBRL?: number;
  costWdoRoundTripBRL?: number;
  slippageTicksPerSide: number;
  intrabarPolicy: IntrabarPolicy;
  disciplinedTrainingStartingBalanceBRL?: number | null;
  stopTrainingStartingBalanceBRL?: number | null;
}

export interface Position {
  id: string;
  asset: Asset;
  side: Side;
  signalId: string;
  openedCandleIndex: number;
  openedReplaySequence?: number;
  requestedEntry: number;
  entry: number;
  stopLoss: number;
  /** Stop original da entrada; não muda quando o usuário ajusta o stop ativo. */
  initialStopLoss?: number;
  target: number;
  contracts: number;
  slippageTicksPerSide: number;
  costPerContractRoundTripBRL: number;
  intrabarPolicy: IntrabarPolicy;
  entryContext: TradeEntryContext | null;
  openedAt: string;
  status: "OPEN";
}

export type ExitReason = "STOP" | "TARGET" | "SESSION_END" | "MANUAL_STOP";

export type TradeEntryExecution = "PLANNED" | "PARTIAL" | "OUTSIDE_PLAN";
export type TradeStopDiscipline = "RESPECTED" | "MOVED_WITH_PLAN" | "MOVED_AGAINST_PLAN" | "NOT_APPLICABLE";
export type TradeTargetDiscipline = "RESPECTED" | "CLOSED_EARLY" | "EXTENDED_WITH_PLAN" | "EXTENDED_WITHOUT_PLAN" | "NOT_APPLICABLE";
export type TradeRuleAdherence = "ALL" | "PARTIAL" | "BROKE";
export type TradeEmotionalInterference = "NONE" | "FEAR" | "GREED" | "REVENGE" | "FOMO" | "HESITATION" | "OTHER";

export interface TradeReview {
  tradeId: string;
  reviewedAt: string;
  entryExecution: TradeEntryExecution;
  stopDiscipline: TradeStopDiscipline;
  targetDiscipline: TradeTargetDiscipline;
  ruleAdherence: TradeRuleAdherence;
  emotionalInterference: TradeEmotionalInterference;
  lesson: string;
}

export interface Trade {
  id: string;
  /** Sessão à qual a operação fechada pertence, quando originada em um treino. */
  sessionId?: string | null;
  asset: Asset;
  side: Side;
  signalId: string;
  requestedEntry: number;
  entry: number;
  stopLoss: number;
  /** Stop original da entrada, preservado para métricas de risco (R). */
  initialStopLoss?: number;
  target: number;
  contracts: number;
  slippageTicksPerSide: number;
  costPerContractRoundTripBRL: number;
  intrabarPolicy?: IntrabarPolicy;
  openedAt: string;
  status: "CLOSED";
  exitPrice: number;
  exitReason: ExitReason;
  closedAt: string;
  resultPoints: number;
  grossResultBRL: number;
  operationalCostsBRL: number;
  netResultBRL: number;
  postTradeNote: string;
  entryContext?: TradeEntryContext | null;
  review?: TradeReview;
}

export interface TradeIntent {
  asset: Asset;
  side: Side;
  entry: number;
  /** Último preço efetivamente observado no momento do envio da ordem. */
  marketPrice: number;
  contracts: number;
  execution: ExecutionSettings;
  candleIndex: number;
  replaySequence?: number;
  oco: OcoOrder;
  signal: IndicatorSignal | null;
  entryContext?: TradeEntryContext | null;
  signalAlreadyUsed: boolean;
  hasOpenPosition: boolean;
  /** Re-entry after a later candle touches EMA 52, without a new indicator signal. */
  reentryAuthorized?: boolean;
  reentrySide?: Side;
  reentryAuthorizationId?: string;
  /** Permissão direcional manual do Sistema 02 (distinta da reentrada MME52). */
  manualDirectionAuthorization?: {
    strategyId: "MTF_ANGULACAO";
    side: Side;
    id: string;
  };
}


export type TrainingSessionStatus = "ACTIVE" | "ENDED";
export type TrainingMode = "FREE" | "EXAM";

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
  mode: TrainingMode;
  /** Sessões antigas não têm identificador; nestas aplica-se MULTI_MEDIAS. */
  strategyId?: TradingStrategyId;
  startingBalanceBRL?: number | null;
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
  signalAdherencePct: number;
  executionAdherencePct: number;
}

export interface SessionReport {
  session: TrainingSession;
  events: TrainingEvent[];
  trades: Trade[];
  performance: SessionPerformance;
}
