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
import { ExecutionSettingsPanel } from "./components/ExecutionSettingsPanel";
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
import { applyReplayTrade } from "./domain/replay";
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
import { indicator } from "./services/indicator";
import {
  deleteAllDatabaseData,
  deleteAllTrades,
  loadTrades,
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
import type {
  Asset,
  ExecutionSettings,
  IndicatorEvaluation,
  IndicatorSignal,
  Position,
  ReplayTrade,
  Side,
  Trade,
  TrainingEvent,
  TrainingMode,
  TrainingSession,
} from "./types";
import type { SimulationPlan } from "./domain/simulationPlan";

const THEME_KEY = "simulador-de-trade:theme";

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
  const [activeArea, setActiveArea] = useState<"SIMULADOR" | "PREGOES" | "RESULTADOS" | "EVOLUCAO" | "MANUAL" | "CONFIGURACOES">("SIMULADOR");
  const [asset, setAsset] = useState<Asset>("WINFUT");
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
  const persistClosedTradeRef = useRef<(trade: Trade) => void>(() => undefined);
  const protectNextAutoFeedbackRef = useRef(false);

  const replayTimeframeMinutes =
    simulationPlan?.timeframeMinutes ?? 2;

  const handleReplayTrade = useCallback(
    (trade: ReplayTrade) => {
      const previousCandles = candlesRef.current;
      const nextCandles = applyReplayTrade(
        previousCandles,
        trade,
        replayTimeframeMinutes * 60,
      );
      const candleJustClosed = nextCandles.length > previousCandles.length;

      candlesRef.current = nextCandles;
      setCandles(nextCandles);
      setCurrentReplayTrade(trade);

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
      const closedEvaluation = indicator.calculate(asset, [...hidden, ...closedVisible]);
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
    [asset, dataMode, replayTimeframeMinutes, trainingSession?.status, warmupCandles],
  );

  const replay = useReplayPlayer(
    handleReplayTrade,
    replayTimeframeMinutes,
  );

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);

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

  const indicatorEvaluation = useMemo(
    () => indicator.calculate(asset, indicatorCandles),
    [asset, indicatorCandles],
  );
  const signal = indicatorEvaluation.authorization;
  const signalAlreadyUsed = Boolean(
    signal && usedSignalIdsRef.current.has(signal.id),
  );
  const reentryAuthorization = useMemo(() => {
    if (!lastClosedTradeMarker) return null;
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
  }, [lastClosedTradeMarker, signal?.id, signalAlreadyUsed, indicatorEvaluation.series, indicatorEvaluation.zone, indicatorCandles]);
  const authorizedSideForChart = signal && !signalAlreadyUsed
    ? signal.side
    : reentryAuthorization?.side ?? null;
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
    void saveTrainingEvent(event).catch(() =>
      setFeedback("O evento de treino ocorreu, mas não pôde ser persistido."),
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
      .then(setTrades)      .catch(() => setFeedback("Não foi possível carregar o histórico local."));

    loadExecutionSettings()
      .then(setExecutionSettings)
      .catch(() =>
        setFeedback("Não foi possível carregar as configurações de execução."),
      );
  }, []);

  useEffect(() => {
    if (dataMode !== "demo") return;
    const timer = window.setInterval(() => {
      setCandles((current) => [...current, nextDemoCandle(asset, current)]);
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
    setTrades((current) => [
      closed,
      ...current.filter((trade) => trade.id !== closed.id),
    ]);
    setFeedback(
      examActive
        ? "Operação encerrada. O resultado será revelado ao final da prova."
        : closed.exitReason === "TARGET"
          ? `Alvo acionado. ${money.format(closed.resultPoints)} pts · líquido R$ ${money.format(closed.netResultBRL)}.`
          : `Stop atingido. ${money.format(closed.resultPoints)} pts · líquido R$ ${money.format(closed.netResultBRL)}.`,
    );
    void saveTrade(closed).catch((error) => {
      const reason =
        error instanceof Error
          ? error.message
          : "Falha ao salvar o histórico local da operação.";
      setFeedback(
        "A operação foi encerrada, mas houve falha ao salvar o histórico local.",
      );
      recordTrainingEvent({
        type: "TECHNICAL_ISSUE",
        marketTimestamp: closed.closedAt,
        reason,
        tradeId: closed.id,
      });
    });

    recordTrainingEvent({
      type: "TRADE_CLOSED",
      marketTimestamp: closed.closedAt,
      signalId: closed.signalId,
      side: closed.side,
      tradeId: closed.id,
      reason: closed.exitReason,
    });
  }

  useEffect(() => {
    persistClosedTradeRef.current = persistClosedTrade;
  });

  useEffect(() => {
    if (!signalAlertEffectMountedRef.current) {
      signalAlertEffectMountedRef.current = true;
      lastAlertedSignalIdRef.current = signal?.id ?? null;
      return;
    }
    if (!signal) {
      lastAlertedSignalIdRef.current = null;
      return;
    }
    if (lastAlertedSignalIdRef.current === signal.id) return;
    lastAlertedSignalIdRef.current = signal.id;
    playSignalAlert(signal.side);
  }, [signal?.id]);

  useEffect(() => {
    if (dataMode !== "demo" || !position || !lastCandle) return;
    const closed = resolveOco(position, lastCandle);
    if (closed) persistClosedTrade(closed);
  }, [dataMode, lastCandle, position]);

  useEffect(() => {
    if (!signal || position || !lastCandle) return;

    if (protectNextAutoFeedbackRef.current) {
      protectNextAutoFeedbackRef.current = false;
      return;
    }

    if (signalAlreadyUsed) {
      setFeedback(
        reentryAuthorization
          ? reentryAuthorization.method === "STOP_COOLDOWN"
            ? "Dez candles fechados após o stop. A reentrada na mesma direção está autorizada."
            : "Um candle posterior tocou na MME 52. A reentrada na mesma direção está autorizada."
          : "O sinal ativo já foi utilizado. Aguarde um novo gatilho, um toque posterior na MME 52 ou dez candles fechados após um stop.",
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
    asset,
    position,
    lastCandle?.index,
    stopDistance,
    targetDistance,
  ]);

  useEffect(() => {
    if (signal || position || !lastCandle) return;

    if (protectNextAutoFeedbackRef.current) {
      protectNextAutoFeedbackRef.current = false;
      return;
    }

    setFeedback(
      reentryAuthorization
        ? reentryAuthorization.method === "STOP_COOLDOWN"
          ? `Dez candles fechados após o stop. Reentrada de ${sideLabel(reentryAuthorization.side).toLowerCase()} autorizada.`
          : `Candle posterior tocou na MME 52. Reentrada de ${sideLabel(reentryAuthorization.side).toLowerCase()} autorizada.`
        : "Sem zona autorizadora ativa, toque na MME 52 ou dez candles fechados após um stop. Compra e Venda permanecem bloqueadas.",
    );
  }, [indicatorEvaluation.zone, signal, position, lastCandle?.index, reentryAuthorization?.id]);

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
    setCandles(createDemoCandles(next));
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
      setCandles([]);
      candlesRef.current = [];
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
        error instanceof Error
          ? error.message
          : "Falha ao preparar o histórico anterior do indicador.",
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
    setCandles([]);
    candlesRef.current = [];
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

    setCandles([]);
    candlesRef.current = [];
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
    ]).catch(() =>
      setFeedback(
        "O treino foi iniciado, mas houve falha ao persistir parte dos metadados.",
      ),
    );

    setFeedback(
      `Treino iniciado para ${session.tradeDate}, das ${session.startTime} às ${session.endTime}.`,
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
      void saveTrainingEvent(ignored).catch(() =>
        setFeedback(
          "O sinal ignorado foi registrado na sessão, mas não pôde ser persistido.",
        ),
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
    ]).catch(() =>
      setFeedback(
        "A sessão foi encerrada, mas houve falha ao persistir parte do resumo.",
      ),
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
        error instanceof Error
          ? error.message
          : "Não foi possível encerrar a posição a mercado.";
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
      const reason = error instanceof Error ? error.message : "Não foi possível estopar manualmente a operação.";
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
      const useFreshSignal = Boolean(signal && !signalAlreadyUsed);
      const useReentry = !useFreshSignal && Boolean(reentryAuthorization && reentryAuthorization.side === side);
      if (!useFreshSignal && !useReentry) {
        throw new TradingRuleError("Entrada fora do operacional: aguarde um sinal válido, um toque posterior na MME 52 ou dez candles fechados após um stop.");
      }
      const entrySignal = useFreshSignal ? signal : null;
      const orderEntry = draftEntryPrice !== null && draftSide === side ? draftEntryPrice : lastPrice;
      const marketTimestamp = dataMode === "replay" && currentReplayTrade
        ? currentReplayTrade.timestamp
        : lastCandle.timestamp;
      const openedAt = dataMode === "replay" && currentReplayTrade
        ? currentReplayTrade.timestamp
        : new Date().toISOString();

      const contextSignal: IndicatorSignal | null = entrySignal ?? (
        useReentry && reentryAuthorization
          ? {
              id: reentryAuthorization.id,
              asset,
              side,
              candleIndex: reentryAuthorization.candleIndex,
              timestamp: reentryAuthorization.timestamp,
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
        indicatorVersion: indicator.version,
      });

      const nextPosition = openPosition(
        {
          asset,
          side,
          entry: orderEntry,
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
        signalId: entrySignal?.id ?? (useReentry ? reentryAuthorization?.id ?? null : null),
        side,
        tradeId: nextPosition.id,
      });
      setFeedback(
        `${sideLabel(side)} aberta em ${money.format(orderEntry)} com OCO obrigatório ativo.${useReentry ? reentryAuthorization?.method === "STOP_COOLDOWN" ? " Reentrada autorizada após dez candles fechados desde o stop." : " Reentrada autorizada pelo toque posterior na MME 52." : ""}`,
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
    setFeedback(`Entrada ${sideLabel(authorizedSideForChart)} posicionada em ${money.format(entry)}. Arraste as linhas de Stop e Alvo no gráfico; o mínimo 1:2 será validado antes de aceitar a ordem.`);
  }

  function adjustOcoFromChart(_kind: "target", rawPrice: number, mode: "position" | "draft") {
    const rounded = roundPriceToTick(asset, rawPrice);
    try {
      if (mode === "position" && position) {
        const nextStop = position.stopLoss;
        const nextTarget = rounded;
        const marketPrice = dataMode === "replay"
          ? currentReplayTrade?.price ?? lastPrice
          : lastPrice;
        if (!isPriceOnTick(asset, nextStop) || !isPriceOnTick(asset, nextTarget)) {
          throw new TradingRuleError(`Stop e alvo precisam respeitar o tick de ${tickSizeFor(asset)} do ativo.`);
        }
        if (position.side === "BUY") {
          if (nextStop >= marketPrice) throw new TradingRuleError("O stop de uma compra precisa permanecer abaixo do preço atual.");
          if (nextTarget <= Math.max(position.entry, marketPrice)) throw new TradingRuleError("O alvo de uma compra precisa permanecer acima da entrada e do preço atual.");
        } else {
          if (nextStop <= marketPrice) throw new TradingRuleError("O stop de uma venda precisa permanecer acima do preço atual.");
          if (nextTarget >= Math.min(position.entry, marketPrice)) throw new TradingRuleError("O alvo de uma venda precisa permanecer abaixo da entrada e do preço atual.");
        }
        const updated = { ...position, stopLoss: nextStop, target: nextTarget };
        positionRef.current = updated;
        setPosition(updated);
        setFeedback(`Alvo ajustado para ${money.format(rounded)}.`);
        return;
      }
      if (mode === "draft" && draftEntryPrice !== null && draftSide) {
        const current = ocoLevelsFromDistances(asset, draftSide, draftEntryPrice, Number(stopDistance), Number(targetDistance));
        const nextStop = current.stopLoss;
        const nextTarget = rounded;
        validateOcoOrder(asset, draftSide, draftEntryPrice, nextStop, nextTarget);
        setStopDistance(String(Math.abs(draftEntryPrice - nextStop)));
        setTargetDistance(String(Math.abs(nextTarget - draftEntryPrice)));
        setFeedback(`Alvo do rascunho ajustado. A relação risco/retorno continua em pelo menos 1:2.`);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Ajuste OCO inválido.";
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
      setFeedback(error instanceof Error ? error.message : "Não foi possível apagar o histórico de operações.");
    } finally {
      setDeletingHistory(false);
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
            WINFUT e WDOFUT · Multi Médias - Nuvem e Sinais · OCO obrigatório
          </p>
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
          <span>Indicador</span>
          <strong>{indicator.name}</strong>
          <small>MME 8 · MMP 20 · MME 52 · VWAP Session</small>
        </div>
      </section>

      <nav className="main-navigation" aria-label="Áreas principais">
        <button type="button" className={activeArea === "SIMULADOR" ? "active" : ""} aria-current={activeArea === "SIMULADOR" ? "page" : undefined} onClick={() => setActiveArea("SIMULADOR")}>Simulador</button>
        <button type="button" className={activeArea === "PREGOES" ? "active" : ""} aria-current={activeArea === "PREGOES" ? "page" : undefined} onClick={() => setActiveArea("PREGOES")}>Pregões e replays</button>
        <button type="button" className={activeArea === "RESULTADOS" ? "active" : ""} aria-current={activeArea === "RESULTADOS" ? "page" : undefined} onClick={() => setActiveArea("RESULTADOS")}>Resultados</button>
        <button type="button" className={activeArea === "EVOLUCAO" ? "active" : ""} aria-current={activeArea === "EVOLUCAO" ? "page" : undefined} onClick={() => setActiveArea("EVOLUCAO")}>Evolução do Trader</button>
        <button type="button" className={activeArea === "MANUAL" ? "active" : ""} aria-current={activeArea === "MANUAL" ? "page" : undefined} onClick={() => setActiveArea("MANUAL")}>Manual</button>
        <button type="button" className={activeArea === "CONFIGURACOES" ? "active" : ""} aria-current={activeArea === "CONFIGURACOES" ? "page" : undefined} onClick={() => setActiveArea("CONFIGURACOES")}>Configurações</button>
      </nav>

      <section className="app-area simulator-area" hidden={activeArea !== "SIMULADOR"}>
      {/* Fluxo principal: planejar → conferir → preparar → carregar → treinar. */}
      <SimulationPlanner
        disabled={trainingActive || Boolean(position) || startingTraining}
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
                error instanceof Error
                  ? `Não foi possível descarregar o replay atual: ${error.message}`
                  : "Não foi possível descarregar o replay atual. O plano anterior foi mantido.",
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
          setCandles(demoCandles);
          candlesRef.current = demoCandles;
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
        onPathChange={replay.setPath}
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
        onPlayPause={() => replay.setPlaying(!replay.playing)}
        trainingActive={trainingActive}
        onStep={() => void replay.step()}
        onStepCandle={() => void replay.stepCandle()}
        onReset={() => void resetReplay()}
        onSpeedChange={(value) => replay.setSpeed(value)}
      />

      <section className="workspace">
        <div className="market card">
          <div className="section-heading">
            <div>
              <h2>{asset}</h2>
            </div>
            <SignalBadge evaluation={indicatorEvaluation} signalAlreadyUsed={signalAlreadyUsed} reentrySide={reentryAuthorization?.side ?? null} reentryMethod={reentryAuthorization?.method ?? null} />
          </div>

          {visibleCandles.length || warmupCandles.length ? (
            <CandleChart
              candles={visibleCandles}
              contextCandles={warmupCandles}
              evaluation={indicatorEvaluation}
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

          <div className="chart-note">
            <InfoTip label="Sobre os dados do gráfico">
              {dataMode === "replay"
                ? `Cada negócio revelado atualiza o candle M${replayTimeframeMinutes} aberto, o volume, o indicador e as regras de execução. Candles futuros permanecem ocultos.`
                : "O modo demonstrativo utiliza candles sintéticos. Para reproduzir dados do Profit Ultra, prepare o arquivo pelo fluxo de dados do pregão."}
            </InfoTip>
          </div>
        </div>

        <aside className="order-panel card">
          <h2>Ordem OCO</h2>

          <div className="rule-box">
            <strong>Regras</strong>
            <span>Compra na zona verde; venda na vermelha. Risco/retorno mínimo: 1:2. Reentrada após toque na MME 52 ou dez candles fechados depois de um stop.</span>
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
        <div className="advanced-tools-help">
          <InfoTip label="Quando usar a importação avançada">
            Utilize esta ferramenta para preparar um arquivo avulso, testar um CSV ou adicionar ao catálogo um replay que não pertence ao plano ativo. Para os pregões planejados, use a importação guiada.
          </InfoTip>
        </div>
        <DataPreparationPanel
          plannedStart={simulationPlan?.targetStartTime}
          plannedEnd={simulationPlan?.targetEndTime}
          onPrepared={async (result) => {
            try {
              await registerReplayFile(result.outputPath);
              setCatalogRefreshKey((value) => value + 1);
              setFeedback(
                "Arquivo tratado e adicionado ao catálogo local de dados.",
              );
            } catch (error) {
              setFeedback(
                error instanceof Error
                  ? error.message
                  : "O arquivo foi tratado, mas não pôde ser catalogado.",
              );
            }
          }}
        />      </details>
      </section>

      <section className="app-area available-replays-area" hidden={activeArea !== "PREGOES"}>
        <h2 className="area-title">Pregões e replays</h2>
        <AvailableReplaysPanel
          refreshKey={catalogRefreshKey}
          onUseReplay={(path) => {
            replay.setPath(path);
            setActiveArea("SIMULADOR");
            setFeedback("Replay selecionado. Confira o plano e clique em “Carregar replay” para iniciar.");
          }}
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
        <TraderEvolutionPanel refreshKey={sessionHistoryRefreshKey + trades.length + trainingEvents.length} />
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
  evaluation,
  signalAlreadyUsed = false,
  reentrySide = null,
  reentryMethod = null,
}: {
  evaluation: IndicatorEvaluation;
  signalAlreadyUsed?: boolean;
  reentrySide?: Side | null;
  reentryMethod?: "MA52" | "STOP_COOLDOWN" | null;
}) {
  const signal = evaluation.authorization;

  if (reentrySide && (!signal || signalAlreadyUsed)) {
    return (
      <div className={`signal-badge ${reentrySide === "BUY" ? "buy" : "sell"}`}>
        {reentryMethod === "STOP_COOLDOWN" ? "Reentrada após 10 candles" : "Reentrada MME 52"} · {sideLabel(reentrySide)} autorizada
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