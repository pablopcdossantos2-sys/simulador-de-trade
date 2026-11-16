import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CandleChart } from "./components/CandleChart";
import { DataPreparationPanel } from "./components/DataPreparationPanel";
import { ReplayControls } from "./components/ReplayControls";
import { ReplayLoadPanel } from "./components/ReplayLoadPanel";
import { ReplayCatalogPanel } from "./components/ReplayCatalogPanel";
import { AvailableReplaysPanel } from "./components/AvailableReplaysPanel";
import { PlanDataPreparationPanel } from "./components/PlanDataPreparationPanel";
import { RuleViolationModal } from "./components/RuleViolationModal";
import { SimulationPlanner } from "./components/SimulationPlanner";
import { TrainingSessionPanel } from "./components/TrainingSessionPanel";
import { SessionHistoryPanel } from "./components/SessionHistoryPanel";
import { ProgressOverviewPanel } from "./components/ProgressOverviewPanel";
import { StudentProgressPanel } from "./components/StudentProgressPanel";
import { TraderEvolutionPanel } from "./components/TraderEvolutionPanel";
import { TradingSystemsPanel } from "./components/TradingSystemsPanel";
import { ExecutionSettingsPanel } from "./components/ExecutionSettingsPanel";
import { StrategyAveragesPanel } from "./components/StrategyAveragesPanel";
import { DatabaseMaintenancePanel } from "./components/DatabaseMaintenancePanel";
import { BackupPanel } from "./components/BackupPanel";
import { InfoTip } from "./components/InfoTip";
import { ManualPanel } from "./components/ManualPanel";
import {
  ThemeToggle,
  type ThemeMode,
} from "./components/ThemeToggle";
import {
  isPriceOnTick,
  roundPriceToTick,
  tickSizeFor,
} from "./domain/marketSpecs";
import { applyReplayTradeInPlace } from "./domain/replay";
import { captureEntryContext } from "./domain/entryContext";
import {
  planIsReady,
  targetFileFromMatches,
  warmupFilesFromMatches,
  type RequirementMatch,
} from "./domain/catalogMatch";
import {
  createTrainingEvent,
  createTrainingSession,
  endTrainingSession,
  summarizeTraining,
  visibleTradesForTrainingState,
} from "./domain/training";
import {
  canReenterAfterStop,
  closePositionAtMarket,
  closePositionManually,
  openPosition,
  validateOcoOrder,
  validatePositionOco,
  resolveOco,
  resolveOcoTrade,
  sideLabel,
  TradingRuleError,
} from "./domain/trading";
import {
  createDemoCandles,
  nextDemoCandle,
  suggestedOcoDistance,
} from "./data/demoMarket";
import { useReplayPlayer } from "./hooks/useReplayPlayer";
import { DEFAULT_MULTI_MEDIAS_CONFIG, MultiMediasNuvemAdapter } from "./services/indicator";
import { calculateMtfConfluence, MTF_CONFLUENCE_VERSION } from "./services/mtfConfluence";
import {
  loadMovingAverageSettings, saveMovingAverageSettings,
  selectedMovingAveragesLabel, describeMtfVotes,
} from "./services/strategyMovingAverages";
import {
  normalizeStrategyId, strategyLabel, strategySelectionAllowed,
} from "./domain/tradingStrategies";
import {
  deleteAllDatabaseData,
  deleteAllTrades,
  loadTrades,
  saveClosedTrade,
  saveTrade,
  saveTrainingEvent,
  saveTrainingSession,
} from "./services/persistence";
import { registerReplayFile } from "./services/replayCatalog";
import { playSignalAlert } from "./services/signalAlerts";
import {
  DEFAULT_EXECUTION_SETTINGS,
  loadExecutionSettings,
} from "./services/executionSettings";
import { loadWarmupCandles } from "./services/replayData";
import { startUsageTracking } from "./services/usageTracking";
import { readErrorMessage } from "./services/readErrorMessage";
import type {
  Asset,
  ExecutionSettings,
  IndicatorEvaluation,
  IndicatorSignal,
  MovingAverageSettings,
  Position,
  ReplayTrade,
  Side,
  Trade,
  TrainingEvent,
  TrainingMode,
  TrainingSession,
  TradingStrategyId,
} from "./types";
import type { SimulationPlan } from "./domain/simulationPlan";

const THEME_KEY = "simulador-de-trade:theme";
const STRATEGY_KEY = "simulador-de-trade:strategy";
// Injetado pela compilação Windows sob demanda. A revisão é mostrada ao usuário
// para diferenciar executáveis antigos de builds produzidos a partir da main.
const BUILD_COMMIT = import.meta.env.VITE_BUILD_COMMIT_SHA?.trim() ?? "";
const BUILD_LABEL = BUILD_COMMIT && /^[a-f0-9]{40}$/i.test(BUILD_COMMIT)
  ? BUILD_COMMIT.slice(0, 7) : "local";

function initialStrategyId(): TradingStrategyId {
  try { return normalizeStrategyId(localStorage.getItem(STRATEGY_KEY)); }
  catch { return "MULTI_MEDIAS"; }
}

const money = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});

function formatTradeDateTime(value: string, part: "date" | "time"): string {
  // Timestamps sem offset representam o relógio do pregão, não o fuso da máquina.
  const marketClock = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(value);
  const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  if (marketClock && !hasExplicitZone) {
    return part === "date"
      ? `${marketClock[3]}/${marketClock[2]}/${marketClock[1]}`
      : `${marketClock[4]}:${marketClock[5]}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    ...(part === "date"
      ? { day: "2-digit", month: "2-digit", year: "numeric" }
      : { hour: "2-digit", minute: "2-digit", hour12: false }),
  }).format(parsed);
}

function marketClockSeconds(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /(?:T| )?(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] ?? 0);
}

function initialTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // O app continua funcional mesmo se o armazenamento local estiver indisponível.
  }

  return window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

type DataMode = "demo" | "replay";

function ocoLevelsFromDistances(asset: Asset, side: Side, entry: number, stopPoints: number, targetPoints: number) {
  return {
    stopLoss: roundPriceToTick(asset, side === "BUY" ? entry - stopPoints : entry + stopPoints),
    target: roundPriceToTick(asset, side === "BUY" ? entry + targetPoints : entry - targetPoints),
  };
}

export default function App() {
  const [activeArea, setActiveArea] = useState<"SIMULADOR" | "PREGOES" | "RESULTADOS" | "EVOLUCAO" | "SISTEMAS" | "MANUAL" | "CONFIGURACOES">("SIMULADOR");
  const [asset, setAsset] = useState<Asset>("WINFUT");
  const [selectedStrategyId, setSelectedStrategyId] = useState<TradingStrategyId>(initialStrategyId);
  const [movingAverages, setMovingAverages] = useState(loadMovingAverageSettings);
  const configuredMultiMedias = useMemo(
    () => new MultiMediasNuvemAdapter({
      ...DEFAULT_MULTI_MEDIAS_CONFIG,
      ...movingAverages.multiMedias,
    }),
    [movingAverages.multiMedias],
  );
  const [dataMode, setDataMode] = useState<DataMode>("demo");
  const [candles, setCandles] = useState(() => createDemoCandles("WINFUT"));
  const [currentReplayTrade, setCurrentReplayTrade] =
    useState<ReplayTrade | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stopDistance, setStopDistance] = useState("");
  const [targetDistance, setTargetDistance] = useState("");
  const [draftEntryPrice, setDraftEntryPrice] = useState<number | null>(null);
  const [draftSide, setDraftSide] = useState<Side | null>(null);
  const [lastClosedTradeMarker, setLastClosedTradeMarker] = useState<{ trade: Trade; candleIndex: number } | null>(null);
  const [deletingHistory, setDeletingHistory] = useState(false);
  const [contracts, setContracts] = useState("1");
  const [executionSettings, setExecutionSettings] =
    useState<ExecutionSettings>(DEFAULT_EXECUTION_SETTINGS);
  const [cloudOpacity, setCloudOpacity] = useState(() => {
    try {
      const raw = localStorage.getItem("simulador-de-trade:cloud-opacity");
      if (raw === null) return 0.2;
      const stored = Number(raw);
      return Number.isFinite(stored) ? Math.max(0, Math.min(1, stored)) : 0.2;
    } catch {
      return 0.2;
    }
  });
  const [theme, setTheme] = useState<ThemeMode>(initialTheme);
  const [ruleViolation, setRuleViolation] = useState<string | null>(null);
  const [feedback, setFeedback] = useState(
    "Aguarde a formação de uma zona válida do indicador para liberar uma direção.",
  );
  const [simulationPlan, setSimulationPlan] = useState<SimulationPlan | null>(null);
  const [catalogMatches, setCatalogMatches] = useState<RequirementMatch[]>([]);
  const [catalogRefreshKey, setCatalogRefreshKey] = useState(0);
  const [warmupCandles, setWarmupCandles] = useState<import("./types").Candle[]>([]);
  const [trainingSession, setTrainingSession] =
    useState<TrainingSession | null>(null);
  const [trainingEvents, setTrainingEvents] = useState<TrainingEvent[]>([]);
  const [trainingMode, setTrainingMode] = useState<TrainingMode>("FREE");
  const [sessionHistoryRefreshKey, setSessionHistoryRefreshKey] = useState(0);
  const [startingTraining, setStartingTraining] = useState(false);
  const [loadingReplay, setLoadingReplay] = useState(false);
  const [switchingStrategy, setSwitchingStrategy] = useState(false);
  const switchingStrategyRef = useRef(false);
  const activeSignalRef = useRef<{ id: string; side: Side } | null>(null);
  const usedSignalIdsRef = useRef<Set<string>>(new Set());
  const ignoredSignalIdsRef = useRef<Set<string>>(new Set());
  const lastSuggestedSignalIdRef = useRef<string | null>(null);
  const lastSeenReplaySignalRef = useRef<string | null>(null);
  const lastAlertedSignalIdRef = useRef<string | null>(null);
  const signalAlertEffectMountedRef = useRef(false);
  const startingTrainingRef = useRef(false);
  const positionRef = useRef<Position | null>(null);
  const candlesRef = useRef(candles);
  const replayBatchOpenRef = useRef(false);
  const replaceCandles = (next: typeof candles) => {
    // Atualiza ref e estado juntos. Evita que um efeito atrasado restaure
    // uma referência antiga enquanto o próximo frame já está sendo agregado.
    candlesRef.current = next;
    replayBatchOpenRef.current = false;
    setCandles(next);
  };
  const persistClosedTradeRef = useRef<(trade: Trade) => void>(() => undefined);
  const protectNextAutoFeedbackRef = useRef(false);

  const replayTimeframeMinutes =
    simulationPlan?.timeframeMinutes ?? 2;

  const handleReplayTrade = useCallback(
    (trade: ReplayTrade) => {
      // O buffer do frame é separado do estado React. Os negócios são agregados
      // nele em sequência e a interface recebe uma única publicação por frame.
      if (!replayBatchOpenRef.current) {
        candlesRef.current = candlesRef.current.map((candle) => ({ ...candle }));
        replayBatchOpenRef.current = true;
      }
      const previousCandles = candlesRef.current;
      const previousLength = previousCandles.length;
      const nextCandles = applyReplayTradeInPlace(
        previousCandles,
        trade,
        replayTimeframeMinutes * 60,
      );
      const candleJustClosed = nextCandles.length > previousLength;

      const openPosition = positionRef.current;
      if (openPosition) {
        const closed = resolveOcoTrade(openPosition, trade);
        if (!closed) return;

        positionRef.current = null;
        persistClosedTradeRef.current(closed);
      }

      // Sinais são informativos: o replay deve continuar sem interrupção.
      if (
        dataMode !== "replay" ||
        trainingSession?.status !== "ACTIVE" ||
        !candleJustClosed ||
        positionRef.current
      ) return;

      const offset = warmupCandles.length;
      const hidden = warmupCandles.map((candle, index) => ({ ...candle, index }));
      const closedVisible = nextCandles.slice(0, -1).map((candle, index) => ({
        ...candle,
        index: offset + index,
      }));
      if (selectedStrategyId === "MTF_ANGULACAO") return;
      const closedEvaluation = configuredMultiMedias.calculate(
        asset,
        [...hidden, ...closedVisible],
        trainingSession?.id ?? "preview",
      );
      const authorization = closedEvaluation.authorization;
      const previousSignalId = lastSeenReplaySignalRef.current;
      lastSeenReplaySignalRef.current = authorization?.id ?? null;

      if (
        authorization &&
        authorization.candleIndex >= offset &&
        authorization.id !== previousSignalId &&
        !usedSignalIdsRef.current.has(authorization.id)
      ) {
        setFeedback(
          `Sinal de ${sideLabel(authorization.side)} confirmado no fechamento do candle. A reprodução continua normalmente.`,
        );
      }
    },
    [asset, dataMode, replayTimeframeMinutes, trainingSession?.id, trainingSession?.status, warmupCandles, selectedStrategyId, configuredMultiMedias],
  );

  const flushReplayBatch = useCallback((lastTrade: ReplayTrade) => {
    replaceCandles(candlesRef.current);
    setCurrentReplayTrade(lastTrade);
  }, []);

  const replay = useReplayPlayer(
    handleReplayTrade,
    replayTimeframeMinutes,
    flushReplayBatch,
  );

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  const visibleCandles = useMemo(() => {
    if (dataMode !== "replay") return candles;
    const offset = warmupCandles.length;
    return candles.map((candle, index) => ({
      ...candle,
      index: offset + index,
    }));
  }, [candles, dataMode, warmupCandles.length]);

  const indicatorCandles = useMemo(() => {
    if (dataMode !== "replay") return candles;

    const hidden = warmupCandles.map((candle, index) => ({
      ...candle,
      index,
    }));

    // O último candle do replay ainda está em formação: não deve autorizar sinal.
    return [...hidden, ...visibleCandles.slice(0, -1)];
  }, [candles, dataMode, visibleCandles, warmupCandles]);

  const mtfEvaluation = useMemo(
    () => selectedStrategyId === "MTF_ANGULACAO"
      ? calculateMtfConfluence(indicatorCandles, movingAverages.mtf.periods, movingAverages.mtf.filters) : null,
    [selectedStrategyId, indicatorCandles, movingAverages.mtf.periods, movingAverages.mtf.filters],
  );
  const indicatorEvaluation: IndicatorEvaluation = useMemo(
    () => selectedStrategyId === "MTF_ANGULACAO"
      ? { authorization: null, signals: [], series: [], zone: mtfEvaluation?.zone ?? "NONE" }
      : configuredMultiMedias.calculate(asset, indicatorCandles, trainingSession?.id ?? "preview"),
    [selectedStrategyId, asset, indicatorCandles, trainingSession?.id, mtfEvaluation?.zone, configuredMultiMedias],
  );
  const signal = indicatorEvaluation.authorization;
  const signalAlreadyUsed = Boolean(
    signal && usedSignalIdsRef.current.has(signal.id),
  );
  const reentryAuthorization = useMemo(() => {
    if (selectedStrategyId === "MTF_ANGULACAO" || !lastClosedTradeMarker) return null;
    const side = lastClosedTradeMarker.trade.side;
    const requiredZone = side === "BUY" ? "GREEN" : "RED";
    if (indicatorEvaluation.zone !== requiredZone) return null;
    if (signal && !signalAlreadyUsed) return null;
    if (signal && signal.side !== side) return null;

    const candleByIndex = new Map(indicatorCandles.map((candle) => [candle.index, candle] as const));
    const latestClosedIndex = indicatorCandles.at(-1)?.index;
    if (latestClosedIndex === undefined) return null;

    const touchedPoint = [...indicatorEvaluation.series].reverse().find((point) => {
      if (
        point.candleIndex <= lastClosedTradeMarker.candleIndex ||
        point.zone !== requiredZone ||
        point.ema52 === null ||
        !Number.isFinite(point.ema52)
      ) return false;
      const candle = candleByIndex.get(point.candleIndex);
      return Boolean(candle && candle.low <= point.ema52 && candle.high >= point.ema52);
    });
    const ma52Candle = touchedPoint && latestClosedIndex - touchedPoint.candleIndex <= 3
      ? candleByIndex.get(touchedPoint.candleIndex)
      : undefined;
    const stopCooldownElapsed = canReenterAfterStop(
      lastClosedTradeMarker.trade.exitReason,
      lastClosedTradeMarker.candleIndex,
      latestClosedIndex,
    );
    if (!ma52Candle && !stopCooldownElapsed) return null;

    const authorizationCandle = ma52Candle ?? candleByIndex.get(latestClosedIndex);
    if (!authorizationCandle) return null;
    const method = ma52Candle ? "MA52" as const : "STOP_COOLDOWN" as const;
    return {
      id: `${method === "MA52" ? "ma52-reentry" : "stop-cooldown-reentry"}:${lastClosedTradeMarker.trade.id}:${authorizationCandle.index}`,
      side,
      candleIndex: authorizationCandle.index,
      timestamp: authorizationCandle.timestamp,
      price: authorizationCandle.close,
      method,
    };
  }, [selectedStrategyId, lastClosedTradeMarker, signal?.id, signalAlreadyUsed, indicatorEvaluation.series, indicatorEvaluation.zone, indicatorCandles]);
  const authorizedSideForChart: Side | null = selectedStrategyId === "MTF_ANGULACAO"
    ? mtfEvaluation?.zone === "GREEN" ? "BUY" : mtfEvaluation?.zone === "RED" ? "SELL" : null
    : signal && !signalAlreadyUsed ? signal.side : reentryAuthorization?.side ?? null;
  const lastCandle = visibleCandles[visibleCandles.length - 1];
  const lastPrice = lastCandle?.close ?? 0;
  const trainingActive = trainingSession?.status === "ACTIVE";
  const sessionCountdownSeconds = useMemo(() => {
    if (!trainingActive || !trainingSession) return null;
    const end = marketClockSeconds(trainingSession.endTime);
    const current = marketClockSeconds(currentReplayTrade?.timestamp) ??
      marketClockSeconds(trainingSession.startTime);
    if (end === null || current === null) return null;
    return Math.max(0, end - current);
  }, [trainingActive, trainingSession, currentReplayTrade?.timestamp]);
  const examActive = Boolean(
    trainingActive && trainingSession?.mode === "EXAM",
  );
  const trainingSummary = useMemo(
    () =>
      trainingSession
        ? summarizeTraining(trainingSession, trainingEvents)
        : null,
    [trainingSession, trainingEvents],
  );
  const draftOrder = useMemo(() => {
    if (position || draftEntryPrice === null || !draftSide) return null;
    const stopPoints = Number(stopDistance);
    const targetPoints = Number(targetDistance);
    if (!Number.isFinite(stopPoints) || !Number.isFinite(targetPoints) || stopPoints <= 0 || targetPoints <= 0) return null;
    return {
      side: draftSide,
      entry: draftEntryPrice,
      ...ocoLevelsFromDistances(asset, draftSide, draftEntryPrice, stopPoints, targetPoints),
    };
  }, [position, draftEntryPrice, draftSide, stopDistance, targetDistance, asset]);

  function appendTrainingEvent(event: TrainingEvent) {
    setTrainingEvents((current) => [...current, event]);
    void saveTrainingEvent(event).catch((error) =>
      setFeedback(readErrorMessage(error, "O evento de treino ocorreu, mas não pôde ser persistido.")),
    );
  }

  function recordTrainingEvent(input: {
    type: TrainingEvent["type"];
    marketTimestamp?: string | null;
    signalId?: string | null;
    side?: Side | null;
    reason?: string | null;
    tradeId?: string | null;
  }) {
    if (!trainingSession || trainingSession.status !== "ACTIVE") return;

    appendTrainingEvent(
      createTrainingEvent({
        sessionId: trainingSession.id,
        ...input,
      }),
    );
  }

  useEffect(() => {
    startUsageTracking();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Preferência visual não é crítica para a execução do simulador.
    }
  }, [theme]);

  useEffect(() => {
    loadTrades()
      .then(setTrades)      .catch((error) => setFeedback(readErrorMessage(error, "Não foi possível carregar o histórico local.")));

    loadExecutionSettings()
      .then(setExecutionSettings)
      .catch((error) =>
        setFeedback(readErrorMessage(error, "Não foi possível carregar as configurações de execução.")),
      );
  }, []);

  useEffect(() => {
    if (dataMode !== "demo") return;
    const timer = window.setInterval(() => {
      const current = candlesRef.current;
      replaceCandles([...current, nextDemoCandle(asset, current)]);
    }, 1500);

    return () => window.clearInterval(timer);
  }, [asset, dataMode]);

  function persistClosedTrade(closed: Trade) {
    protectNextAutoFeedbackRef.current = true;
    const currentCandle = candlesRef.current[candlesRef.current.length - 1];
    setLastClosedTradeMarker({
      trade: closed,
      candleIndex: dataMode === "replay"
        ? (currentCandle?.index ?? closed.entryContext?.candleIndex ?? -1) + warmupCandles.length
        : currentCandle?.index ?? closed.entryContext?.candleIndex ?? -1,
    });
    setDraftEntryPrice(null);
    setDraftSide(null);
    positionRef.current = null;
    setPosition(null);

    const closureEvent = trainingSession?.status === "ACTIVE"
      ? createTrainingEvent({
          sessionId: trainingSession.id,
          type: "TRADE_CLOSED",
          marketTimestamp: closed.closedAt,
          signalId: closed.signalId,
          side: closed.side,
          tradeId: closed.id,
          reason: closed.exitReason,
        })
      : null;
    const persistedTrade = closureEvent
      ? { ...closed, sessionId: closureEvent.sessionId }
      : closed;

    setTrades((current) => [
      persistedTrade,
      ...current.filter((trade) => trade.id !== persistedTrade.id),
    ]);
    if (closureEvent) {
      setTrainingEvents((current) => [...current, closureEvent]);
    }

    setFeedback(
      examActive
        ? "Operação encerrada. O resultado será revelado ao final da prova."
        : closed.exitReason === "TARGET"
          ? "Alvo acionado. " + money.format(closed.resultPoints) + " pts · líquido R$ " + money.format(closed.netResultBRL) + "."
          : "Stop atingido. " + money.format(closed.resultPoints) + " pts · líquido R$ " + money.format(closed.netResultBRL) + ".",
    );

    const persistence = closureEvent
      ? saveClosedTrade(persistedTrade, closureEvent)
      : saveTrade(persistedTrade);
    void persistence.catch((error) => {
      const reason = readErrorMessage(error, "Falha ao salvar o histórico local da operação.");
      setFeedback(
        "A operação foi encerrada, mas não foi possível salvar conjuntamente a operação e seu vínculo com a sessão.",
      );
      recordTrainingEvent({
        type: "TECHNICAL_ISSUE",
        marketTimestamp: closed.closedAt,
        reason,
        tradeId: closed.id,
      });
    });
  }

  useEffect(() => {
    persistClosedTradeRef.current = persistClosedTrade;
  });

  const alertableSignal = signal && !signalAlreadyUsed ? signal : reentryAuthorization;

  useEffect(() => {
    if (!signalAlertEffectMountedRef.current) {
      signalAlertEffectMountedRef.current = true;
      lastAlertedSignalIdRef.current = alertableSignal?.id ?? null;
      return;
    }
    if (!alertableSignal) {
      lastAlertedSignalIdRef.current = null;
      return;
    }
    if (lastAlertedSignalIdRef.current === alertableSignal.id) return;
    lastAlertedSignalIdRef.current = alertableSignal.id;
    playSignalAlert(alertableSignal.side);
  }, [alertableSignal?.id]);

  useEffect(() => {
    if (dataMode !== "demo" || !position || !lastCandle) return;
    const closed = resolveOco(position, lastCandle);
    if (closed) persistClosedTrade(closed);
  }, [dataMode, lastCandle, position]);

  useEffect(() => {
    if (selectedStrategyId === "MTF_ANGULACAO" || !signal || position || !lastCandle) return;

    if (protectNextAutoFeedbackRef.current) {
      protectNextAutoFeedbackRef.current = false;
      return;
    }

    if (signalAlreadyUsed) {
      setFeedback(
        reentryAuthorization
          ? reentryAuthorization.method === "STOP_COOLDOWN"
            ? "Dez candles fechados após o stop. A reentrada na mesma direção está autorizada."
            : `Um candle posterior tocou na MME ${movingAverages.multiMedias.emaSlowLength}. A reentrada na mesma direção está autorizada.`
          : `O sinal ativo já foi utilizado. Aguarde um novo gatilho, um toque posterior na MME ${movingAverages.multiMedias.emaSlowLength} ou dez candles fechados após um stop.`,
      );
      return;
    }

    if (lastSuggestedSignalIdRef.current === signal.id) return;
    lastSuggestedSignalIdRef.current = signal.id;

    // Sugestões padrão só preenchem campos vazios; valores preparados pelo usuário
    // permanecem intactos quando um novo sinal aparece.
    const suggested = suggestedOcoDistance(asset);
    if (!stopDistance.trim()) setStopDistance(String(suggested.stop));
    if (!targetDistance.trim()) setTargetDistance(String(suggested.target));

    setFeedback(
      `Zona ${signal.side === "BUY" ? "verde" : "vermelha"} ativa após sinal de ${signal.label}. Somente ${signal.label.toLowerCase()} está autorizada.`,
    );
  }, [
    signal?.id,
    signalAlreadyUsed,
    reentryAuthorization?.id,
    movingAverages.multiMedias.emaSlowLength,
    asset,
    position,
    lastCandle?.index,
    stopDistance,
    targetDistance,
  ]);

  useEffect(() => {
    if (selectedStrategyId === "MTF_ANGULACAO" || signal || position || !lastCandle) return;

    if (protectNextAutoFeedbackRef.current) {
      protectNextAutoFeedbackRef.current = false;
      return;
    }

    setFeedback(
      reentryAuthorization
        ? reentryAuthorization.method === "STOP_COOLDOWN"
          ? `Dez candles fechados após o stop. Reentrada de ${sideLabel(reentryAuthorization.side).toLowerCase()} autorizada.`
          : `Candle posterior tocou na MME ${movingAverages.multiMedias.emaSlowLength}. Reentrada de ${sideLabel(reentryAuthorization.side).toLowerCase()} autorizada.`
        : `Sem zona autorizadora ativa, toque na MME ${movingAverages.multiMedias.emaSlowLength} ou dez candles fechados após um stop. Compra e Venda permanecem bloqueadas.`,
    );
  }, [selectedStrategyId, indicatorEvaluation.zone, signal, position, lastCandle?.index, reentryAuthorization?.id, movingAverages.multiMedias.emaSlowLength]);

  useEffect(() => {
    if (selectedStrategyId !== "MTF_ANGULACAO" || position || !lastCandle) return;
    const message = mtfEvaluation?.zone === "GREEN"
      ? "Confluência M15 positiva: somente compras manuais autorizadas."
      : mtfEvaluation?.zone === "RED"
        ? "Confluência M15 negativa: somente vendas manuais autorizadas."
        : "Confluência M15 neutra ou incompleta: novas entradas bloqueadas.";
    setFeedback(message);
  }, [selectedStrategyId, mtfEvaluation?.zone, position, lastCandle?.index]);

  useEffect(() => {
    if (!replay.error) return;

    setFeedback(replay.error);
    if (trainingActive) {
      recordTrainingEvent({
        type: "TECHNICAL_ISSUE",
        marketTimestamp: currentReplayTrade?.timestamp ?? null,
        reason: replay.error,
      });
    }
  }, [replay.error]);

  useEffect(() => {
    if (!trainingActive) {
      activeSignalRef.current = null;
      return;
    }

    const previous = activeSignalRef.current;

    if (signal && (!previous || previous.id !== signal.id)) {
      if (
        previous &&
        !usedSignalIdsRef.current.has(previous.id) &&
        !ignoredSignalIdsRef.current.has(previous.id)
      ) {
        ignoredSignalIdsRef.current.add(previous.id);
        recordTrainingEvent({
          type: "SIGNAL_IGNORED",
          marketTimestamp: currentReplayTrade?.timestamp ?? null,
          signalId: previous.id,
          side: previous.side,
        });
      }

      activeSignalRef.current = {
        id: signal.id,
        side: signal.side,
      };
      return;
    }

    if (!signal && previous) {
      if (
        !usedSignalIdsRef.current.has(previous.id) &&
        !ignoredSignalIdsRef.current.has(previous.id)
      ) {
        ignoredSignalIdsRef.current.add(previous.id);
        recordTrainingEvent({
          type: "SIGNAL_IGNORED",
          marketTimestamp: currentReplayTrade?.timestamp ?? null,
          signalId: previous.id,
          side: previous.side,
        });
      }

      activeSignalRef.current = null;
    }
  }, [trainingActive, signal?.id, currentReplayTrade?.sequence]);

  function changeAsset(next: Asset) {
    if (dataMode === "replay") return;
    setLastClosedTradeMarker(null);
    setDraftEntryPrice(null);
    setDraftSide(null);
    setAsset(next);
    replaceCandles(createDemoCandles(next));
    setPosition(null);
    setStopDistance("");
    setTargetDistance("");
    setContracts("1");
    setFeedback(
      `Ativo alterado para ${next}. Aguarde a formação de uma zona válida antes de operar.`,
    );
  }

  async function loadReplay() {
    if (position || trainingActive) {
      setFeedback(
        "Encerre a posição e a sessão de treino antes de carregar outro replay.",
      );
      return;
    }

    if (!simulationPlan) {
      setFeedback("Defina e aplique um plano de simulação antes de carregar o replay.");
      return;
    }

    if (!planIsReady(catalogMatches)) {
      setFeedback(
        "O plano ainda possui dados ausentes ou contratos incompatíveis. Complete o catálogo antes de iniciar.",
      );
      return;
    }

    const targetPath = targetFileFromMatches(catalogMatches);
    if (!targetPath) {
      setFeedback("O arquivo do pregão-alvo não foi encontrado no catálogo.");
      return;
    }

    if (loadingReplay) return;
    setLoadingReplay(true);
    replay.setPath(targetPath);

    try {
      const warmupPaths = warmupFilesFromMatches(catalogMatches);
      const hiddenCandles = await loadWarmupCandles(
        warmupPaths,
        simulationPlan.timeframeMinutes,
        simulationPlan.warmupBars,
      );
      const info = await replay.loadReplay(
        simulationPlan.targetStartTime,
        simulationPlan.targetEndTime,
        targetPath,
      );
      if (!info) return;
      setWarmupCandles(hiddenCandles);

      setDataMode("replay");
      setAsset(info.asset);
      replaceCandles([]);
      setCurrentReplayTrade(null);
      positionRef.current = null;
      setPosition(null);
      setLastClosedTradeMarker(null);
      setDraftEntryPrice(null);
      setDraftSide(null);
      setStopDistance("");
      setTargetDistance("");
      setContracts("1");
      setTrainingSession(null);
      setTrainingEvents([]);
      activeSignalRef.current = null;
      lastSeenReplaySignalRef.current = null;
      usedSignalIdsRef.current = new Set();
      ignoredSignalIdsRef.current = new Set();
      lastSuggestedSignalIdRef.current = null;
      setFeedback(
        `Replay ${info.symbol} carregado. Histórico anterior: ${hiddenCandles.length} candles ocultos.`,
      );
    } catch (error) {
      setFeedback(
        readErrorMessage(error, "Falha ao preparar o histórico anterior do indicador."),
      );
    } finally {
      setLoadingReplay(false);
    }
  }

  async function resetReplay() {
    const resetOk = await replay.reset();
    if (!resetOk) {
      setFeedback("Não foi possível reiniciar o replay.");
      return;
    }
    replaceCandles([]);
    setCurrentReplayTrade(null);
    positionRef.current = null;
    setPosition(null);
    setLastClosedTradeMarker(null);
    lastSeenReplaySignalRef.current = null;
    setDraftEntryPrice(null);
    setDraftSide(null);
    activeSignalRef.current = null;
    usedSignalIdsRef.current = new Set();
    ignoredSignalIdsRef.current = new Set();
    lastSuggestedSignalIdRef.current = null;
    setStopDistance("");
    setTargetDistance("");
    setContracts("1");
    setFeedback("Replay reiniciado no começo da sessão.");
  }

  async function startTraining() {
    if (startingTrainingRef.current) return;

    const disciplinedBalance = executionSettings.disciplinedTrainingStartingBalanceBRL ?? null;
    const startingBalanceBRL = disciplinedBalance;
    if (!simulationPlan || !replay.session || !planIsReady(catalogMatches)) {
      setFeedback(
        "Carregue um replay compatível e complete todos os dados do plano antes de iniciar o treino.",
      );
      return;
    }

    startingTrainingRef.current = true;
    setStartingTraining(true);

    const resetOk = await replay.reset();
    if (!resetOk) {
      startingTrainingRef.current = false;
      setStartingTraining(false);
      setFeedback(
        "Não foi possível reiniciar o replay. O treino não foi iniciado.",
      );
      return;
    }

    replaceCandles([]);
    setCurrentReplayTrade(null);
    positionRef.current = null;
    setPosition(null);
    setLastClosedTradeMarker(null);
    lastSeenReplaySignalRef.current = null;
    setDraftEntryPrice(null);
    setDraftSide(null);
    setStopDistance("");
    setTargetDistance("");
    setContracts("1");
    activeSignalRef.current = null;
    usedSignalIdsRef.current = new Set();
    ignoredSignalIdsRef.current = new Set();
    lastSuggestedSignalIdRef.current = null;


    const timeframeMinutes = simulationPlan.timeframeMinutes;
    const session = createTrainingSession({
      asset: simulationPlan.asset,
      tradeDate: simulationPlan.targetDate,
      startTime: simulationPlan.targetStartTime,
      endTime: simulationPlan.targetEndTime,
      timeframeMinutes,
      warmupBars: simulationPlan.warmupBars,
      mode: trainingMode,
      strategyId: selectedStrategyId,
      strategyAverages: movingAverages,
      startingBalanceBRL,
    });
    const startedEvent = createTrainingEvent({
      sessionId: session.id,
      type: "SESSION_STARTED",
      marketTimestamp: null,
    });

    setTrainingSession(session);
    setTrainingEvents([startedEvent]);
    await Promise.all([
      saveTrainingSession(session),
      saveTrainingEvent(startedEvent),
    ]).catch((error) =>
      setFeedback(readErrorMessage(error, "O treino foi iniciado, mas houve falha ao persistir parte dos metadados.")),
    );

    setFeedback(
      `Treino com ${strategyLabel(selectedStrategyId)} iniciado para ${session.tradeDate}, das ${session.startTime} às ${session.endTime}.`,
    );
    startingTrainingRef.current = false;
    setStartingTraining(false);
  }

  async function finishTraining() {
    if (!trainingSession || trainingSession.status !== "ACTIVE") return;

    if (position) {
      setFeedback("Encerre a posição aberta antes de finalizar a sessão de treino.");
      return;
    }
    replay.setPlaying(false);

    const finalEvents = [...trainingEvents];
    const pendingSignal = activeSignalRef.current;
    if (
      pendingSignal &&
      !usedSignalIdsRef.current.has(pendingSignal.id)
    ) {
      const ignored = createTrainingEvent({
        sessionId: trainingSession.id,
        type: "SIGNAL_IGNORED",
        marketTimestamp: currentReplayTrade?.timestamp ?? null,
        signalId: pendingSignal.id,
        side: pendingSignal.side,
      });
      finalEvents.push(ignored);
      void saveTrainingEvent(ignored).catch((error) =>
        setFeedback(readErrorMessage(error, "O sinal ignorado foi registrado na sessão, mas não pôde ser persistido.")),
      );
    }
    activeSignalRef.current = null;

    const ended = endTrainingSession(trainingSession);
    const endedEvent = createTrainingEvent({
      sessionId: trainingSession.id,
      type: "SESSION_ENDED",
      marketTimestamp: currentReplayTrade?.timestamp ?? null,
    });
    finalEvents.push(endedEvent);

    setTrainingSession(ended);
    setTrainingEvents(finalEvents);

    await Promise.all([
      saveTrainingSession(ended),
      saveTrainingEvent(endedEvent),
    ]).catch((error) =>
      setFeedback(readErrorMessage(error, "A sessão foi encerrada, mas houve falha ao persistir parte do resumo.")),
    );

    setSessionHistoryRefreshKey((value) => value + 1);
    setFeedback("Sessão de treino encerrada. O resumo disciplinar foi atualizado.");
  }

  useEffect(() => {
    if (!replay.finished || !trainingActive) return;

    if (position) {
      setFeedback(
        "O replay chegou ao fim com uma posição aberta. Use “Encerrar posição a mercado” para registrar o fechamento antes de finalizar o treino.",
      );
      return;
    }

    void finishTraining();
  }, [replay.finished, trainingActive, position]);

  function closeOpenPositionAtReplayEnd() {
    if (!replay.finished || !position || !currentReplayTrade) {
      setFeedback(
        "O encerramento a mercado só fica disponível no fim do replay com uma posição aberta.",
      );
      return;
    }

    try {
      const closed = closePositionAtMarket(
        position,
        currentReplayTrade.price,
        currentReplayTrade.timestamp,
      );
      persistClosedTrade(closed);
      setFeedback(
        examActive
          ? "Posição encerrada a mercado no fim da prova. O resultado permanece oculto até o encerramento."
          : `Posição encerrada a mercado no último preço do replay: ${money.format(closed.exitPrice)}.`,
      );
    } catch (error) {
      const reason =
        readErrorMessage(error, "Não foi possível encerrar a posição a mercado.");
      setFeedback(reason);
      recordTrainingEvent({
        type: "TECHNICAL_ISSUE",
        marketTimestamp: currentReplayTrade.timestamp,
        reason,
        tradeId: position.id,
      });
    }
  }

  function stopPositionManually() {
    if (!position) return;
    const marketPrice = dataMode === "replay" ? currentReplayTrade?.price : lastPrice;
    const timestamp = dataMode === "replay" ? currentReplayTrade?.timestamp : new Date().toISOString();
    try {
      const closed = closePositionManually(position, marketPrice ?? 0, timestamp ?? new Date().toISOString());
      persistClosedTrade(closed);
      setFeedback(
        examActive
          ? "Stop manual acionado. O resultado será revelado ao final da prova."
          : `Stop manual acionado a ${money.format(closed.exitPrice)}. Resultado: ${money.format(closed.resultPoints)} pontos.`,
      );
    } catch (error) {
      const reason = readErrorMessage(error, "Não foi possível estopar manualmente a operação.");
      setFeedback(reason);
      setRuleViolation(reason);
    }
  }

  function normalizeDistance(
    raw: string,
    setter: (value: string) => void,
    label: string,
  ) {
    if (!raw.trim()) return;

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return;

    const rounded = roundPriceToTick(asset, parsed);
    setter(String(rounded));

    if (Math.abs(rounded - parsed) > 1e-9) {
      setFeedback(
        `${label} ajustada de ${parsed.toLocaleString("pt-BR")} para ${rounded.toLocaleString("pt-BR")} pontos para respeitar o tick de ${tickSizeFor(asset)} do ${asset}.`,
      );
    }
  }

  function submit(side: Side) {
    try {
      if (dataMode === "replay" && !trainingActive) {
        throw new TradingRuleError("Inicie a sessão formal de treino antes de enviar uma operação.");
      }
      if (!lastCandle) {
        throw new TradingRuleError("Não há candle disponível para executar a entrada.");
      }
      // Sistema 02: o fundo direcional autoriza apenas a DIREÇÃO. Não cria
      // gatilho automático nem depende da regra de reentrada da estratégia 01.
      const useMtfPermission = selectedStrategyId === "MTF_ANGULACAO" &&
        authorizedSideForChart === side && mtfEvaluation?.points.length;
      const useFreshSignal = selectedStrategyId === "MULTI_MEDIAS" && Boolean(signal && !signalAlreadyUsed);
      const useReentry = selectedStrategyId === "MULTI_MEDIAS" && !useFreshSignal &&
        Boolean(reentryAuthorization && reentryAuthorization.side === side);
      if (!useFreshSignal && !useReentry && !useMtfPermission) {
        throw new TradingRuleError(selectedStrategyId === "MTF_ANGULACAO"
          ? "Entrada bloqueada: aguarde confluência M15 verde para comprar ou vermelha para vender. Em cinza, não há autorização."
          : `Entrada fora do operacional: aguarde um sinal válido, um toque posterior na MME ${movingAverages.multiMedias.emaSlowLength} ou dez candles fechados após um stop.`);
      }
      const entrySignal = useFreshSignal ? signal : null;
      const orderEntry = draftEntryPrice !== null && draftSide === side ? draftEntryPrice : lastPrice;
      const marketTimestamp = dataMode === "replay" && currentReplayTrade
        ? currentReplayTrade.timestamp
        : lastCandle.timestamp;
      const openedAt = dataMode === "replay" && currentReplayTrade
        ? currentReplayTrade.timestamp
        : new Date().toISOString();

      const mtfPermissionId = useMtfPermission
        ? `mtf-confluence:${asset}:${lastCandle.index}:${side}` : null;
      const contextSignal: IndicatorSignal | null = entrySignal ?? (
        useMtfPermission || (useReentry && reentryAuthorization)
          ? {
              id: mtfPermissionId ?? reentryAuthorization!.id,
              asset,
              side,
              candleIndex: useMtfPermission ? lastCandle.index : reentryAuthorization!.candleIndex,
              timestamp: useMtfPermission ? lastCandle.timestamp : reentryAuthorization!.timestamp,
              price: orderEntry,
              label: side === "BUY" ? "Compra" : "Venda",
            }
          : null
      );
      const entryContext = captureEntryContext({
        asset,
        candles: visibleCandles,
        evaluation: indicatorEvaluation,
        signal: contextSignal,
        marketTimestamp,
        indicatorVersion: `${selectedStrategyId === "MTF_ANGULACAO"
          ? MTF_CONFLUENCE_VERSION : configuredMultiMedias.version} [${selectedMovingAveragesLabel(movingAverages, selectedStrategyId)}]`,
      });

      const nextPosition = openPosition(
        {
          asset,
          side,
          entry: orderEntry,
          marketPrice: dataMode === "replay"
            ? currentReplayTrade?.price ?? lastPrice
            : lastPrice,
          contracts: Number(contracts),
          execution: executionSettings,
          candleIndex: lastCandle.index,
          replaySequence: dataMode === "replay" ? currentReplayTrade?.sequence : undefined,
          oco: ocoLevelsFromDistances(asset, side, orderEntry, Number(stopDistance), Number(targetDistance)),
          signal: entrySignal,
          entryContext,
          signalAlreadyUsed: entrySignal ? signalAlreadyUsed : false,
          hasOpenPosition: Boolean(position),
          reentryAuthorized: useReentry,
          reentrySide: useReentry ? reentryAuthorization?.side : undefined,
          reentryAuthorizationId: useReentry ? reentryAuthorization?.id : undefined,
          manualDirectionAuthorization: mtfPermissionId ? {
            strategyId: "MTF_ANGULACAO", side, id: mtfPermissionId,
          } : undefined,
        },
        openedAt,
      );

      positionRef.current = nextPosition;
      setPosition(nextPosition);
      if (entrySignal) usedSignalIdsRef.current.add(entrySignal.id);
      setDraftEntryPrice(null);
      setDraftSide(null);
      recordTrainingEvent({
        type: "TRADE_OPENED",
        marketTimestamp: currentReplayTrade?.timestamp ?? null,
        signalId: entrySignal?.id ?? mtfPermissionId ?? (useReentry ? reentryAuthorization?.id ?? null : null),
        side,
        tradeId: nextPosition.id,
      });
      setFeedback(
        `${sideLabel(side)} aberta em ${money.format(orderEntry)} com OCO obrigatório ativo.${useMtfPermission ? " Entrada manual autorizada pela confluência M15." : useReentry ? reentryAuthorization?.method === "STOP_COOLDOWN" ? " Reentrada autorizada após dez candles fechados desde o stop." : ` Reentrada autorizada pelo toque posterior na MME ${movingAverages.multiMedias.emaSlowLength}.` : ""}`,
      );
      // Após a entrada, a reprodução continua com a posição sendo monitorada.
      if (dataMode === "replay" && replay.session && !replay.finished) {
        replay.setPlaying(true);
      }
    } catch (error) {
      const isDisciplineError = error instanceof TradingRuleError;
      const reason = isDisciplineError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Não foi possível abrir a operação.";
      setFeedback(reason);
      setRuleViolation(reason);
      if (trainingActive) {
        recordTrainingEvent({
          type: isDisciplineError ? "BLOCKED_ATTEMPT" : "TECHNICAL_ISSUE",
          marketTimestamp: currentReplayTrade?.timestamp ?? null,
          signalId: signal?.id ?? reentryAuthorization?.id ?? null,
          side: isDisciplineError ? side : null,
          reason,
        });
      }
    }
  }

  const tradingEnabled = dataMode === "demo" || trainingActive;

  function placeOrderFromChart(rawPrice: number) {
    if (!tradingEnabled || position || !authorizedSideForChart) {
      setFeedback("O posicionamento pelo gráfico exige uma direção atualmente autorizada pelo operacional.");
      return;
    }
    const entry = roundPriceToTick(asset, rawPrice);
    const distance = suggestedOcoDistance(asset);
    setDraftSide(authorizedSideForChart);
    setDraftEntryPrice(entry);
    // Preenche apenas campos ainda vazios; não sobrescreve a preparação do usuário.
    if (!stopDistance.trim()) setStopDistance(String(distance.stop));
    if (!targetDistance.trim()) setTargetDistance(String(distance.target));
    setFeedback(`Entrada ${sideLabel(authorizedSideForChart)} preparada em ${money.format(entry)}. Para enviar, o preço precisa permanecer a no máximo 1 tick do mercado; o mínimo 1:2 também será validado.`);
  }

  function adjustOcoFromChart(kind: "stop" | "target", rawPrice: number, mode: "position" | "draft") {
    const rounded = roundPriceToTick(asset, rawPrice);
    try {
      if (mode === "position" && position) {
        const marketPrice = dataMode === "replay"
          ? currentReplayTrade?.price ?? lastPrice
          : lastPrice;
        const nextStop = kind === "stop" ? rounded : position.stopLoss;
        const nextTarget = kind === "target" ? rounded : position.target;
        if (!isPriceOnTick(asset, nextStop) || !isPriceOnTick(asset, nextTarget)) {
          throw new TradingRuleError(`Stop e alvo precisam respeitar o tick de ${tickSizeFor(asset)} do ativo.`);
        }
        if (kind === "stop") {
          const riskReduced = position.side === "BUY"
            ? nextStop > position.stopLoss && nextStop < marketPrice
            : nextStop < position.stopLoss && nextStop > marketPrice;
          if (!riskReduced) {
            throw new TradingRuleError(position.side === "BUY"
              ? "Para reduzir o risco de uma compra, mova o Stop somente para cima, sem alcançar o preço atual."
              : "Para reduzir o risco de uma venda, mova o Stop somente para baixo, sem alcançar o preço atual.");
          }
        } else if (position.side === "BUY") {
          if (nextTarget <= Math.max(position.entry, marketPrice)) throw new TradingRuleError("O alvo de uma compra precisa permanecer acima da entrada e do preço atual.");
        } else if (nextTarget >= Math.min(position.entry, marketPrice)) {
          throw new TradingRuleError("O alvo de uma venda precisa permanecer abaixo da entrada e do preço atual.");
        }
        validatePositionOco(position, nextStop, nextTarget);
        const updated = { ...position, stopLoss: nextStop, target: nextTarget };
        positionRef.current = updated;
        setPosition(updated);
        setFeedback(kind === "stop"
          ? `Stop ajustado para ${money.format(rounded)}. O risco da posição foi reduzido.`
          : `Alvo ajustado para ${money.format(rounded)}.`);
        return;
      }
      if (mode === "draft" && draftEntryPrice !== null && draftSide) {
        const current = ocoLevelsFromDistances(asset, draftSide, draftEntryPrice, Number(stopDistance), Number(targetDistance));
        const nextStop = kind === "stop" ? rounded : current.stopLoss;
        const nextTarget = kind === "target" ? rounded : current.target;
        if (kind === "stop") {
          const riskReduced = draftSide === "BUY"
            ? nextStop > current.stopLoss && nextStop < draftEntryPrice
            : nextStop < current.stopLoss && nextStop > draftEntryPrice;
          if (!riskReduced) {
            throw new TradingRuleError("No rascunho, o Stop só pode ser aproximado da entrada, sem ultrapassá-la.");
          }
        }
        validateOcoOrder(asset, draftSide, draftEntryPrice, nextStop, nextTarget);
        setStopDistance(String(Math.abs(draftEntryPrice - nextStop)));
        setTargetDistance(String(Math.abs(nextTarget - draftEntryPrice)));
        setFeedback(kind === "stop"
          ? "Stop do rascunho ajustado para reduzir o risco. A relação risco/retorno mínimo de 1:2 foi preservada."
          : "Alvo do rascunho ajustado. A relação risco/retorno continua em pelo menos 1:2.");
      }
    } catch (error) {
      const reason = readErrorMessage(error, "Ajuste OCO inválido.");
      setFeedback(reason);
      setRuleViolation(reason);
    }
  }

  async function deleteOperationHistory() {
    if (position || trainingActive) {
      setFeedback("Encerre a posição e a sessão de treino antes de apagar o histórico.");
      return;
    }
    if (!window.confirm("Apagar permanentemente todo o histórico de operações? Esta ação não pode ser desfeita. As sessões, configurações e eventos disciplinares/técnicos serão preservados; os eventos de abertura/fechamento de operações também serão apagados.")) return;
    setDeletingHistory(true);
    try {
      await deleteAllTrades();
      setTrades([]);      setTrainingEvents((current) => current.filter((event) => event.type !== "TRADE_OPENED" && event.type !== "TRADE_CLOSED"));
      setSessionHistoryRefreshKey((value) => value + 1);
      setFeedback("Histórico de operações apagado. Sessões e eventos disciplinares/técnicos foram preservados.");
    } catch (error) {
      setFeedback(readErrorMessage(error, "Não foi possível apagar o histórico de operações."));
    } finally {
      setDeletingHistory(false);
    }
  }

  async function applyMovingAverages(next: MovingAverageSettings) {
    if (!strategySelectionAllowed(trainingActive, Boolean(position),
      startingTraining || loadingReplay || switchingStrategyRef.current)) {
      throw new Error("Finalize o treino e a posição aberta antes de alterar as médias.");
    }
    switchingStrategyRef.current = true;
    setSwitchingStrategy(true);
    try {
      // Um replay carregado e o plano de aquecimento pertencem aos parâmetros antigos.
      if (replay.session) {
        replay.setPlaying(false);
        await replay.unload();
      }
      const saved = saveMovingAverageSettings(next);
      setMovingAverages(saved);
      setSimulationPlan(null);
      setCatalogMatches([]);
      setWarmupCandles([]);
      setDataMode("demo");
      replaceCandles(createDemoCandles(asset));
      setCurrentReplayTrade(null);
      setTrainingSession(null);
      setTrainingEvents([]);
      setLastClosedTradeMarker(null);
      setDraftEntryPrice(null);
      setDraftSide(null);
      setStopDistance("");
      setTargetDistance("");
      activeSignalRef.current = null;
      lastSeenReplaySignalRef.current = null;
      usedSignalIdsRef.current = new Set();
      ignoredSignalIdsRef.current = new Set();
      lastSuggestedSignalIdRef.current = null;
      setFeedback(`Médias e filtros aplicados: ${selectedMovingAveragesLabel(saved, selectedStrategyId)}. Reaplique o plano de simulação; os arquivos CSV catalogados foram preservados.`);
    } catch (error) {
      throw new Error(readErrorMessage(error, "Não foi possível aplicar as médias."));
    } finally {
      switchingStrategyRef.current = false;
      setSwitchingStrategy(false);
    }
  }

  async function selectStrategy(next: TradingStrategyId) {
    if (!strategySelectionAllowed(
      trainingActive, Boolean(position),
      startingTraining || loadingReplay || switchingStrategyRef.current,
    )) {
      setFeedback("Finalize a sessão e a posição, ou aguarde o processamento, antes de trocar de sistema.");
      return;
    }
    if (next === selectedStrategyId) { setActiveArea("SIMULADOR"); return; }

    // O aquecimento mínimo muda por estratégia. Não reutilizar em silêncio
    // o replay preparado com os 260 candles do Sistema 01 para TPV M15/50.
    switchingStrategyRef.current = true;
    setSwitchingStrategy(true);
    try {
      if (replay.session) {
        replay.setPlaying(false);
        await replay.unload();
      }
      setSelectedStrategyId(next);
      try { localStorage.setItem(STRATEGY_KEY, next); } catch { /* preferência opcional */ }
      setSimulationPlan(null);
      setCatalogMatches([]);
      setWarmupCandles([]);
      setDataMode("demo");
      replaceCandles(createDemoCandles(asset));
      setCurrentReplayTrade(null);
      positionRef.current = null;
      setPosition(null);
      setTrainingSession(null);
      setTrainingEvents([]);
      setLastClosedTradeMarker(null);
      setDraftEntryPrice(null);
      setDraftSide(null);
      setStopDistance("");
      setTargetDistance("");
      activeSignalRef.current = null;
      lastSeenReplaySignalRef.current = null;
      usedSignalIdsRef.current = new Set();
      ignoredSignalIdsRef.current = new Set();
      lastSuggestedSignalIdRef.current = null;
      setActiveArea("SIMULADOR");
      setFeedback(`Sistema selecionado: ${strategyLabel(next)}. Aplique um novo plano para preparar o aquecimento específico. Os CSVs catalogados foram preservados.`);
    } catch (error) {
      setFeedback(readErrorMessage(error, "Não foi possível descarregar o replay antigo. A estratégia foi mantida."));
    } finally {
      switchingStrategyRef.current = false;
      setSwitchingStrategy(false);
    }
  }

  async function handlePreparedReplay(result: import("./services/profitData").ProfitPreparationResult) {
    try {
      await registerReplayFile(result.outputPath);
      if (result.m1OutputPath) await registerReplayFile(result.m1OutputPath);
      setCatalogRefreshKey((value) => value + 1);
      setFeedback("Arquivo tratado e adicionado ao catálogo local de pregões.");
    } catch (error) {
      const message = readErrorMessage(error, "O replay foi preparado, mas não pôde ser catalogado.");
      setFeedback(message);
      throw new Error(message);
    }
  }

  const historyTradesForDisplay = visibleTradesForTrainingState(
    trades,
    trainingSession,
    trainingEvents,
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Simulador de Trade</h1>
          <p className="subtitle">
            WINFUT e WDOFUT · {strategyLabel(selectedStrategyId)} · OCO obrigatório
          </p>
          <small className="build-identity" title={BUILD_COMMIT || "Execução de desenvolvimento"}>
            Compilação: {BUILD_LABEL}
          </small>
        </div>

        <div className="topbar-actions">
          <div className="mode-badge">
            <span className="pulse" />
            {dataMode === "replay"
              ? replay.session?.synthetic
                ? `Replay M2 · movimento simulado · ${replay.session.symbol}`
                : `Replay tick histórico (legado) · ${replay.session?.symbol ?? asset}`
              : "Indicador real · candles sintéticos"}
          </div>
          <ThemeToggle
            theme={theme}
            onToggle={() =>
              setTheme((current) => (current === "dark" ? "light" : "dark"))
            }
          />
        </div>
      </header>

      <section className="toolbar card">
        <div className="asset-switch" aria-label="Selecionar ativo">
          {(["WINFUT", "WDOFUT"] as Asset[]).map((item) => (
            <button
              key={item}
              className={asset === item ? "active" : ""}
              onClick={() => changeAsset(item)}
              disabled={Boolean(position) || dataMode === "replay"}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="indicator-name">
          <span>Sistema de trading</span>
          <strong>{strategyLabel(selectedStrategyId)}</strong>
          <small>{selectedMovingAveragesLabel(movingAverages, selectedStrategyId)}
            {selectedStrategyId === "MTF_ANGULACAO"
              ? ` · ${describeMtfVotes(movingAverages)} · entrada manual` : " · VWAP Session"}</small>
        </div>
      </section>

      <nav className="main-navigation" aria-label="Áreas principais">
        <button type="button" className={activeArea === "SIMULADOR" ? "active" : ""} aria-current={activeArea === "SIMULADOR" ? "page" : undefined} onClick={() => setActiveArea("SIMULADOR")}>Simulador</button>
        <button type="button" className={activeArea === "PREGOES" ? "active" : ""} aria-current={activeArea === "PREGOES" ? "page" : undefined} onClick={() => setActiveArea("PREGOES")}>Pregões e replays</button>
        <button type="button" className={activeArea === "RESULTADOS" ? "active" : ""} aria-current={activeArea === "RESULTADOS" ? "page" : undefined} onClick={() => setActiveArea("RESULTADOS")}>Resultados</button>
        <button type="button" className={activeArea === "EVOLUCAO" ? "active" : ""} aria-current={activeArea === "EVOLUCAO" ? "page" : undefined} onClick={() => setActiveArea("EVOLUCAO")} disabled={examActive} title={examActive ? "A Evolução do Trader fica bloqueada durante uma prova." : undefined}>Evolução do Trader</button>
        <button type="button" className={activeArea === "SISTEMAS" ? "active" : ""} aria-current={activeArea === "SISTEMAS" ? "page" : undefined} onClick={() => setActiveArea("SISTEMAS")}>Sistemas de trading</button>
        <button type="button" className={activeArea === "MANUAL" ? "active" : ""} aria-current={activeArea === "MANUAL" ? "page" : undefined} onClick={() => setActiveArea("MANUAL")}>Manual</button>
        <button type="button" className={activeArea === "CONFIGURACOES" ? "active" : ""} aria-current={activeArea === "CONFIGURACOES" ? "page" : undefined} onClick={() => setActiveArea("CONFIGURACOES")}>Configurações</button>
      </nav>

      <section className="app-area" hidden={activeArea !== "SISTEMAS"}>
        <TradingSystemsPanel selectedStrategyId={selectedStrategyId}
          movingAverages={movingAverages}
          disabled={!strategySelectionAllowed(trainingActive, Boolean(position), startingTraining || loadingReplay || switchingStrategy)}
          onSelect={selectStrategy} />
      </section>

      <section className="app-area simulator-area" hidden={activeArea !== "SIMULADOR"}>
      {/* Fluxo principal: escolher sistema → planejar → preparar → carregar → treinar. */}
      <section className="strategy-selection-panel card" aria-label="Escolher estratégia de treinamento">
        <div>
          <h2>Estratégia de treinamento</h2>
          <p>Escolha antes de iniciar a sessão. Cada sistema possui sua própria autorização de entradas.</p>
        </div>
        <label htmlFor="strategy-select">Sistema
          <select id="strategy-select" value={selectedStrategyId}
            disabled={!strategySelectionAllowed(trainingActive, Boolean(position), startingTraining || loadingReplay || switchingStrategy)}
            onChange={(event) => { void selectStrategy(event.target.value as TradingStrategyId); }}>
            <option value="MULTI_MEDIAS">01 — Multi Médias · Nuvem e Sinais</option>
            <option value="MTF_ANGULACAO">02 — MMs MTF + Angulação (beta)</option>
          </select>
        </label>
      </section>
      <StrategyAveragesPanel
        strategyId={selectedStrategyId}
        settings={movingAverages}
        disabled={!strategySelectionAllowed(trainingActive, Boolean(position), startingTraining || loadingReplay || switchingStrategy)}
        onSave={applyMovingAverages}
      />
      <SimulationPlanner
        strategyId={selectedStrategyId}
        movingAverages={movingAverages}
        disabled={trainingActive || Boolean(position) || startingTraining || switchingStrategy}
        onPlanChange={async (plan) => {
          if (trainingActive || position || startingTrainingRef.current) {
            setFeedback(
              "Encerre a sessão e qualquer posição aberta antes de alterar o plano.",
            );
            return;
          }

          if (replay.session) {
            try {
              await replay.unload();
            } catch (error) {
              setFeedback(
                readErrorMessage(error, "Não foi possível descarregar o replay atual. O plano anterior foi mantido."),
              );
              return;
            }
          }

          const demoCandles = createDemoCandles(plan.asset);
          setSimulationPlan(plan);
          setAsset(plan.asset);
          setDataMode("demo");
          setCatalogMatches([]);
          setWarmupCandles([]);
          replaceCandles(demoCandles);
          setCurrentReplayTrade(null);
          positionRef.current = null;
          setPosition(null);
          setLastClosedTradeMarker(null);
          setDraftEntryPrice(null);
          setDraftSide(null);
          setTrainingSession(null);
          setTrainingEvents([]);
          setTrainingMode("FREE");
          activeSignalRef.current = null;
          lastSeenReplaySignalRef.current = null;
          usedSignalIdsRef.current = new Set();
          ignoredSignalIdsRef.current = new Set();
          lastSuggestedSignalIdRef.current = null;
          setFeedback(
            `Plano definido: ${plan.targetDate} · ${plan.targetStartTime}–${plan.targetEndTime}. Use os mesmos horários ao tratar o arquivo do pregão-alvo.`,
          );
        }}
      />

      <ReplayCatalogPanel
        plan={simulationPlan}
        asset={simulationPlan?.asset ?? asset}
        refreshKey={catalogRefreshKey}
        onMatchesChange={(matches) => {
          setCatalogMatches(matches);
          const targetPath = targetFileFromMatches(matches);
          replay.setPath(targetPath ?? "");
        }}
      />

      <PlanDataPreparationPanel
        plan={simulationPlan}
        matches={catalogMatches}
        onCatalogUpdated={() =>
          setCatalogRefreshKey((value) => value + 1)
        }
      />


      <ReplayLoadPanel
        path={replay.path}
        timeframeMinutes={replayTimeframeMinutes}
        session={replay.session}
        playing={replay.playing}
        busy={replay.busy || loadingReplay}
        trainingActive={trainingActive}
        onLoad={() => void loadReplay()}
      />

      <TrainingSessionPanel
        session={trainingSession}
        summary={trainingSummary}
        events={trainingEvents}
        mode={trainingMode}
        selectedStrategyId={selectedStrategyId}
        startingBalanceBRL={executionSettings.disciplinedTrainingStartingBalanceBRL ?? null}
        onModeChange={setTrainingMode}
        canStart={
          Boolean(simulationPlan) &&
          planIsReady(catalogMatches) &&
          Boolean(replay.session) &&
          !startingTraining
        }
        startBlockedReason={
          startingTraining
            ? "Aguarde a inicialização da sessão."
            : !replay.session
              ? "Carregue o replay do pregão-alvo antes de iniciar."
              : null
        }
        replayLoaded={Boolean(replay.session)}
        onOpenSettings={() => setActiveArea("CONFIGURACOES")}
        onStart={() => void startTraining()}
        onEnd={() => void finishTraining()}
      />

      <ReplayControls
        timeframeMinutes={replayTimeframeMinutes}
        session={replay.session}
        playing={replay.playing}
        speed={replay.speed}
        processed={replay.processed}
        currentTimestamp={replay.currentTimestamp}
        countdownSeconds={sessionCountdownSeconds}
        finished={replay.finished}
        busy={replay.busy}
        onPlayPause={() => {
          if (!trainingActive || startingTraining) return;
          replay.setPlaying(!replay.playing);
        }}
        trainingActive={trainingActive}
        locked={!trainingActive || startingTraining}
        onStep={() => {
          if (!trainingActive || startingTraining) return;
          void replay.step();
        }}
        onStepCandle={() => {
          if (!trainingActive || startingTraining) return;
          void replay.stepCandle();
        }}
        onReset={() => {
          if (!trainingActive || startingTraining) return;
          void resetReplay();
        }}
        onSpeedChange={(value) => {
          if (!trainingActive || startingTraining) return;
          replay.setSpeed(value);
        }}
      />

      <section className="workspace">
        <div className="market card">
          <div className="section-heading">
            <div className="section-title-with-help">
              <h2>{asset}</h2>
              <InfoTip label="Sobre os dados e controles do gráfico">
                <p>{dataMode === "replay"
                  ? `O replay usa candles M${replayTimeframeMinutes} do Profit e atualiza o candle aberto com dados sintéticos revelados ao longo do tempo. Candles futuros permanecem ocultos.`
                  : "O modo demonstrativo utiliza candles sintéticos. Para reproduzir dados do Profit Ultra, use os CSVs de um pregão."}</p>
                <p>Arraste os candles para navegar pelo gráfico. Amplie ou reduza pelas opções de zoom. Quando uma direção estiver autorizada, clique no preço para preparar uma entrada manual. O alvo pode ser ajustado; o Stop só pode avançar para reduzir o risco.</p>
              </InfoTip>
            </div>
            <SignalBadge strategyId={selectedStrategyId} slowLength={movingAverages.multiMedias.emaSlowLength} evaluation={indicatorEvaluation} signalAlreadyUsed={signalAlreadyUsed} reentrySide={reentryAuthorization?.side ?? null} reentryMethod={reentryAuthorization?.method ?? null} />
          </div>

          {visibleCandles.length || warmupCandles.length ? (
            <CandleChart
              candles={visibleCandles}
              contextCandles={warmupCandles}
              evaluation={indicatorEvaluation}
              strategyId={selectedStrategyId}
              mtfPoints={mtfEvaluation?.points ?? []}
              movingAverages={movingAverages}
              replayTimestamp={dataMode === "replay" ? replay.currentTimestamp : null}
              replayTimeframeMinutes={replayTimeframeMinutes}
              showCountdown={dataMode === "replay" && Boolean(replay.session)}
              position={position}
              asset={asset}
              draftOrder={draftOrder}
              entryPlacementEnabled={Boolean(tradingEnabled && !position && authorizedSideForChart)}
              onEntryPlacement={placeOrderFromChart}
              onAdjustOco={adjustOcoFromChart}
              cloudOpacity={cloudOpacity}
            />
          ) : (
            <div className="chart-placeholder">
              Carregue o replay para visualizar o contexto do pregão anterior e avance o primeiro negócio para iniciar o gráfico M{replayTimeframeMinutes}.
            </div>
          )}

        </div>

        <aside className="order-panel card">
          <h2>Ordem OCO</h2>

          <div className="rule-box">
            <strong>Regras</strong>
            <span>{selectedStrategyId === "MTF_ANGULACAO"
              ? "Confluência M15 verde: somente compra manual; vermelha: somente venda manual; cinza: bloqueado. OCO e risco/retorno mínimo de 1:2 são obrigatórios."
              : `Compra na zona verde; venda na vermelha. Risco/retorno mínimo: 1:2. Reentrada após toque na MME ${movingAverages.multiMedias.emaSlowLength} ou dez candles fechados depois de um stop.`}</span>
          </div>

          <label>
            Preço de entrada (ou clique no gráfico)
            <input value={lastCandle ? money.format(draftEntryPrice ?? lastPrice) : ""} readOnly />
          </label>

          <label>
            Quantidade de contratos
            <input
              type="number"
              min="1"
              step="1"
              value={contracts}
              onChange={(event) => setContracts(event.target.value)}
              disabled={Boolean(position) || !lastCandle}
            />
          </label>

          <label>
            Distância do stop (pontos)
            <input
              type="number"
              min={tickSizeFor(asset)}
              step={tickSizeFor(asset)}
              value={stopDistance}
              onChange={(event) => setStopDistance(event.target.value)}
              onBlur={() => normalizeDistance(stopDistance, setStopDistance, "Distância do stop")}
              disabled={Boolean(position) || !lastCandle}
              placeholder="Ex.: 100"
            />
          </label>

          <label>
            Distância do alvo (pontos)
            <input
              type="number"
              min={tickSizeFor(asset)}
              step={tickSizeFor(asset)}
              value={targetDistance}
              onChange={(event) => setTargetDistance(event.target.value)}
              onBlur={() => normalizeDistance(targetDistance, setTargetDistance, "Distância do alvo")}
              disabled={Boolean(position) || !lastCandle}
              placeholder="Ex.: 200"
            />
          </label>
          {!position && (() => {
            const risk = Number(stopDistance);
            const reward = Number(targetDistance);
            const valid = Number.isFinite(risk) && Number.isFinite(reward) && risk > 0 && reward + 1e-9 >= risk * 2;
            return (
              <div className={valid ? "risk-reward-status valid" : "risk-reward-status warning"} role="status">
                {valid
                  ? `Risco/retorno: 1:${(reward / risk).toFixed(2)} · requisito mínimo atendido.`
                  : "Atenção: configure um alvo de pelo menos 2 vezes a distância do stop (risco:retorno mínimo 1:2) antes de enviar a ordem."}
              </div>
            );
          })()}

          <div className="order-actions">
            <button
              className="buy-button"
              onClick={() => submit("BUY")}
            >
              Comprar
            </button>
            <button
              className="sell-button"
              onClick={() => submit("SELL")}
            >
              Vender
            </button>
          </div>

          <div className="feedback" aria-live="polite">
            {feedback}
          </div>

          {position && (
            <div className="position-box">
              <span>Posição aberta</span>
              <strong>
                {sideLabel(position.side)} · {position.contracts} contrato
                {position.contracts === 1 ? "" : "s"} · execução{" "}
                {money.format(position.entry)}
              </strong>
              <small>
                Solicitada {money.format(position.requestedEntry)} · Stop{" "}
                {money.format(position.stopLoss)} · Alvo{" "}
                {money.format(position.target)}
              </small>
              <small>
                Slippage {position.slippageTicksPerSide} tick/lado · custo R$ {money.format(position.costPerContractRoundTripBRL)} por contrato
              </small>
              <small>
                OHLC ambíguo:{" "}
                {position.intrabarPolicy === "TARGET_FIRST"
                  ? "Alvo primeiro"
                  : "Stop primeiro"}
              </small>
              <button type="button" className="market-close-button" onClick={stopPositionManually}>
                Estopar manualmente a mercado
              </button>
              {dataMode === "replay" && replay.finished && (
                <button type="button" className="market-close-button" onClick={closeOpenPositionAtReplayEnd}>
                  Encerrar a mercado no último preço
                </button>
              )}
            </div>
          )}
        </aside>
      </section>





      <details className="advanced-tools">
        <summary>
          <span>Modo de importação alternativo</span>
          <small>Avançado · preparar um CSV fora do plano atual</small>
        </summary>
        <DataPreparationPanel
          plannedStart={simulationPlan?.targetStartTime}
          plannedEnd={simulationPlan?.targetEndTime}
          onPrepared={handlePreparedReplay}
        />      </details>
      </section>

      <section className="app-area available-replays-area" hidden={activeArea !== "PREGOES"}>
        <h2 className="area-title">Pregões e replays</h2>
        <p className="data-description">Adicione seus CSVs do Profit diretamente aqui. Não é preciso criar um plano no Simulador para organizar o acervo.</p>
        <DataPreparationPanel
          disabled={trainingActive || Boolean(position) || startingTraining || loadingReplay}
          onPrepared={handlePreparedReplay}
        />
        <AvailableReplaysPanel
          refreshKey={catalogRefreshKey}
          onCatalogUpdated={() => setCatalogRefreshKey((value) => value + 1)}
        />
      </section>

      <section className="app-area results-area" hidden={activeArea !== "RESULTADOS"}>
        <h2 className="area-title">Resultados</h2>
      <StudentProgressPanel
        refreshKey={sessionHistoryRefreshKey}
        hidden={examActive}
      />

      <ProgressOverviewPanel trades={trades} hidden={examActive} />

      <SessionHistoryPanel refreshKey={sessionHistoryRefreshKey} />

      <section className="history card">
        <div className="section-heading">
          <div>
            <h2>Histórico de operações</h2>
          </div>
          <div className="history-actions">
            <span className="history-count">{historyTradesForDisplay.length} visíveis</span>
            <button type="button" className="danger-button" onClick={() => void deleteOperationHistory()} disabled={deletingHistory || Boolean(position) || Boolean(trainingActive)}>
              {deletingHistory ? "Apagando..." : "Apagar todo o histórico"}
            </button>
          </div>
        </div>

        {historyTradesForDisplay.length === 0 ? (
          <p className="empty-state">
            {examActive
              ? "As operações da prova atual permanecem ocultas até o encerramento."
              : "As operações encerradas aparecerão aqui."}
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Dia</th>
                  <th>Horário</th>
                  <th>Ativo</th>
                  <th>Direção</th>
                  <th>Qtd.</th>
                  <th>Entrada</th>
                  <th>Saída</th>
                  <th>Motivo</th>
                  <th>Resultado</th>
                  <th>Bruto (R$)</th>
                  <th>Custos (R$)</th>
                  <th>Líquido (R$)</th>
                </tr>
              </thead>
              <tbody>
                {historyTradesForDisplay.slice(0, 10).map((trade) => (
                  <tr key={trade.id}>
                    <td>{formatTradeDateTime(trade.openedAt, "date")}</td>
                    <td>{formatTradeDateTime(trade.openedAt, "time")}</td>
                    <td>{trade.asset}</td>
                    <td>{sideLabel(trade.side)}</td>
                    <td>{trade.contracts}</td>
                    <td>{money.format(trade.entry)}</td>
                    <td>{money.format(trade.exitPrice)}</td>
                    <td>
                      {trade.exitReason === "TARGET"
                        ? "Alvo"
                        : trade.exitReason === "STOP"
                          ? "Stop OCO"
                          : trade.exitReason === "MANUAL_STOP"
                            ? "Stop manual"
                            : "Fim da sessão"}
                    </td>
                    <td
                      className={
                        trade.resultPoints >= 0 ? "positive" : "negative"
                      }
                    >
                      {money.format(trade.resultPoints)} pts
                    </td>
                    <td
                      className={
                        trade.grossResultBRL >= 0 ? "positive" : "negative"
                      }
                    >
                      {money.format(trade.grossResultBRL)}
                    </td>
                    <td>{money.format(trade.operationalCostsBRL)}</td>
                    <td
                      className={
                        trade.netResultBRL >= 0 ? "positive" : "negative"
                      }
                    >
                      {money.format(trade.netResultBRL)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </section>

      <section className="app-area evolution-area" hidden={activeArea !== "EVOLUCAO"}>
        <h2 className="area-title">Evolução do Trader</h2>
        {examActive ? (
          <p role="status">A Evolução do Trader e seus resultados ficam ocultos durante uma prova ativa.</p>
        ) : (
          <TraderEvolutionPanel refreshKey={sessionHistoryRefreshKey + trades.length + trainingEvents.length} />
        )}
      </section>

      <section className="app-area manual-area" hidden={activeArea !== "MANUAL"}>
        <h2 className="area-title">Manual</h2>
        <ManualPanel />
      </section>

      <section className="app-area settings-area" hidden={activeArea !== "CONFIGURACOES"}>
        <h2 className="area-title">Configurações</h2>
      <ExecutionSettingsPanel
        settings={executionSettings}
        cloudOpacity={cloudOpacity}
        onCloudOpacitySaved={(value) => {
          setCloudOpacity(value);
          try { localStorage.setItem("simulador-de-trade:cloud-opacity", String(value)); } catch { /* Preferência visual opcional. */ }
        }}
        onSaved={setExecutionSettings}
      />
      <BackupPanel
        disabled={Boolean(position) || Boolean(trainingActive)}
        onImported={async () => {
          const [nextTrades, nextSettings] = await Promise.all([
            loadTrades(),
            loadExecutionSettings(),
          ]);
          setTrades(nextTrades);
          setExecutionSettings(nextSettings);
          setSessionHistoryRefreshKey((value) => value + 1);
          setCatalogRefreshKey((value) => value + 1);
          setFeedback(
            "Backup importado. Histórico, relatórios, configurações e catálogo de replays foram atualizados.",
          );
        }}
      />
      <DatabaseMaintenancePanel
        disabled={Boolean(position) || Boolean(trainingActive)}
        onDeleteAll={async () => {
          await deleteAllDatabaseData();
          setTrades([]);
          setTrainingSession(null);
          setTrainingEvents([]);
          setExecutionSettings(DEFAULT_EXECUTION_SETTINGS);
          setTrainingMode("FREE");
          setLastClosedTradeMarker(null);
          activeSignalRef.current = null;
          usedSignalIdsRef.current = new Set();
          ignoredSignalIdsRef.current = new Set();
          lastSuggestedSignalIdRef.current = null;
          setCloudOpacity(0.2);
          try { localStorage.removeItem("simulador-de-trade:cloud-opacity"); } catch { /* Preferência visual opcional. */ }
          setSessionHistoryRefreshKey((value) => value + 1);
          setFeedback("Banco de dados apagado. As configurações de execução voltaram aos valores iniciais.");
        }}
      />
      </section>

      <RuleViolationModal
        message={ruleViolation}
        onClose={() => setRuleViolation(null)}
      />
    </main>
  );
}

function SignalBadge({
  strategyId,
  slowLength = 52,
  evaluation,
  signalAlreadyUsed = false,
  reentrySide = null,
  reentryMethod = null,
}: {
  strategyId: TradingStrategyId;
  slowLength?: number;
  evaluation: IndicatorEvaluation;
  signalAlreadyUsed?: boolean;
  reentrySide?: Side | null;
  reentryMethod?: "MA52" | "STOP_COOLDOWN" | null;
}) {
  if (strategyId === "MTF_ANGULACAO") {
    return (
      <div className={`signal-badge ${evaluation.zone === "GREEN" ? "buy" : evaluation.zone === "RED" ? "sell" : "neutral"}`}>
        {evaluation.zone === "GREEN"
          ? "M15 · somente compra manual autorizada"
          : evaluation.zone === "RED"
            ? "M15 · somente venda manual autorizada"
            : "M15 · sem confluência para nova entrada"}
      </div>
    );
  }
  const signal = evaluation.authorization;

  if (reentrySide && (!signal || signalAlreadyUsed)) {
    return (
      <div className={`signal-badge ${reentrySide === "BUY" ? "buy" : "sell"}`}>
        {reentryMethod === "STOP_COOLDOWN" ? "Reentrada após 10 candles" : `Reentrada MME ${slowLength}`} · {sideLabel(reentrySide)} autorizada
      </div>
    );
  }

  if (!signal) {
    return <div className="signal-badge neutral">Sem zona ativa</div>;
  }

  if (signalAlreadyUsed) {
    return <div className="signal-badge neutral">Sinal utilizado · aguardando novo gatilho ou critério de reentrada</div>;
  }

  return (
    <div
      className={`signal-badge ${signal.side === "BUY" ? "buy" : "sell"}`}
    >
      {evaluation.zone === "GREEN" ? "Zona verde" : "Zona vermelha"} ·{" "}
      {signal.label} autorizada
    </div>
  );
}
