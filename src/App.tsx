import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CandleChart } from "./components/CandleChart";
import { DataPreparationPanel } from "./components/DataPreparationPanel";
import { ReplayControls } from "./components/ReplayControls";
import { ReplayCatalogPanel } from "./components/ReplayCatalogPanel";
import { PlanDataPreparationPanel } from "./components/PlanDataPreparationPanel";
import { RuleViolationModal } from "./components/RuleViolationModal";
import { SimulationPlanner } from "./components/SimulationPlanner";
import { TrainingSessionPanel } from "./components/TrainingSessionPanel";
import { SessionHistoryPanel } from "./components/SessionHistoryPanel";
import { ProgressOverviewPanel } from "./components/ProgressOverviewPanel";
import { StudentProgressPanel } from "./components/StudentProgressPanel";
import { ExecutionSettingsPanel } from "./components/ExecutionSettingsPanel";
import { BackupPanel } from "./components/BackupPanel";
import {
  ThemeToggle,
  type ThemeMode,
} from "./components/ThemeToggle";
import {
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
} from "./domain/training";
import {
  closePositionAtMarket,
  openPosition,
  resolveOco,
  resolveOcoTrade,
  sideLabel,
  signalAllows,
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
  loadTrades,
  saveTrade,
  saveTrainingEvent,
  saveTrainingSession,
} from "./services/persistence";
import { registerReplayFile } from "./services/replayCatalog";
import {
  DEFAULT_EXECUTION_SETTINGS,
  loadExecutionSettings,
} from "./services/executionSettings";
import { loadWarmupCandles } from "./services/replayData";
import type {
  Asset,
  ExecutionSettings,
  IndicatorEvaluation,
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

export default function App() {
  const [asset, setAsset] = useState<Asset>("WINFUT");
  const [dataMode, setDataMode] = useState<DataMode>("demo");
  const [candles, setCandles] = useState(() => createDemoCandles("WINFUT"));
  const [currentReplayTrade, setCurrentReplayTrade] =
    useState<ReplayTrade | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stopLoss, setStopLoss] = useState("");
  const [target, setTarget] = useState("");
  const [contracts, setContracts] = useState("1");
  const [executionSettings, setExecutionSettings] =
    useState<ExecutionSettings>(DEFAULT_EXECUTION_SETTINGS);
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
  const activeSignalRef = useRef<{ id: string; side: Side } | null>(null);
  const usedSignalIdsRef = useRef<Set<string>>(new Set());
  const ignoredSignalIdsRef = useRef<Set<string>>(new Set());
  const lastSuggestedSignalIdRef = useRef<string | null>(null);
  const startingTrainingRef = useRef(false);
  const positionRef = useRef<Position | null>(null);
  const candlesRef = useRef(candles);
  const persistClosedTradeRef = useRef<(trade: Trade) => void>(() => undefined);

  const replayTimeframeMinutes =
    simulationPlan?.timeframeMinutes ?? 2;

  const handleReplayTrade = useCallback(
    (trade: ReplayTrade) => {
      const nextCandles = applyReplayTrade(
        candlesRef.current,
        trade,
        replayTimeframeMinutes * 60,
      );

      candlesRef.current = nextCandles;
      setCandles(nextCandles);
      setCurrentReplayTrade(trade);

      const openPosition = positionRef.current;
      if (!openPosition) return;

      const closed = resolveOcoTrade(openPosition, trade);
      if (!closed) return;

      positionRef.current = null;
      persistClosedTradeRef.current(closed);
    },
    [replayTimeframeMinutes],
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

    return [...hidden, ...visibleCandles];
  }, [candles, dataMode, visibleCandles, warmupCandles]);

  const indicatorEvaluation = useMemo(
    () => indicator.calculate(asset, indicatorCandles),
    [asset, indicatorCandles],
  );
  const signal = indicatorEvaluation.authorization;
  const signalAlreadyUsed = Boolean(
    signal && usedSignalIdsRef.current.has(signal.id),
  );
  const lastCandle = visibleCandles[visibleCandles.length - 1];
  const lastPrice = lastCandle?.close ?? 0;
  const trainingActive = trainingSession?.status === "ACTIVE";
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
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Preferência visual não é crítica para a execução do simulador.
    }
  }, [theme]);

  useEffect(() => {
    loadTrades()
      .then(setTrades)
      .catch(() => setFeedback("Não foi possível carregar o histórico local."));

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
          ? `Alvo atingido. ${money.format(closed.resultPoints)} pts · líquido R$ ${money.format(closed.netResultBRL)}.`
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
    if (dataMode !== "demo" || !position || !lastCandle) return;
    const closed = resolveOco(position, lastCandle);
    if (closed) persistClosedTrade(closed);
  }, [dataMode, lastCandle, position]);

  useEffect(() => {
    if (!signal || position || !lastCandle) return;

    if (signalAlreadyUsed) {
      setFeedback(
        "O sinal ativo já foi utilizado em uma operação. Aguarde um novo gatilho do indicador antes de reentrar.",
      );
      return;
    }

    if (lastSuggestedSignalIdRef.current === signal.id) return;
    lastSuggestedSignalIdRef.current = signal.id;

    const distance = suggestedOcoDistance(asset);
    const entry = lastPrice;

    if (signal.side === "BUY") {
      setStopLoss(String(entry - distance.stop));
      setTarget(String(entry + distance.target));
    } else {
      setStopLoss(String(entry + distance.stop));
      setTarget(String(entry - distance.target));
    }

    setFeedback(
      `Zona ${signal.side === "BUY" ? "verde" : "vermelha"} ativa após sinal de ${signal.label}. Somente ${signal.label.toLowerCase()} está autorizada.`,
    );
  }, [
    signal?.id,
    signalAlreadyUsed,
    asset,
    position,
    lastCandle?.index,
  ]);

  useEffect(() => {
    if (signal || position || !lastCandle) return;
    lastSuggestedSignalIdRef.current = null;
    setFeedback(
      "Sem zona autorizadora ativa. Compra e Venda permanecem bloqueadas.",
    );
  }, [indicatorEvaluation.zone, signal, position, lastCandle?.index]);

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
    setAsset(next);
    setCandles(createDemoCandles(next));
    setPosition(null);
    setStopLoss("");
    setTarget("");
    setContracts("1");
    setFeedback(
      `Ativo alterado para ${next}. Aguarde a formação de uma zona válida antes de operar.`,
    );
  }

  async function loadReplay() {
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

    replay.setPath(targetPath);

    try {
      const warmupPaths = warmupFilesFromMatches(catalogMatches);
      const hiddenCandles = await loadWarmupCandles(
        warmupPaths,
        simulationPlan.timeframeMinutes,
        simulationPlan.warmupBars,
      );
      setWarmupCandles(hiddenCandles);

      const info = await replay.loadReplay(
        simulationPlan.targetStartTime,
        simulationPlan.targetEndTime,
        targetPath,
      );
      if (!info) return;

      setDataMode("replay");
      setAsset(info.asset);
      setCandles([]);
      candlesRef.current = [];
      setCurrentReplayTrade(null);
      setPosition(null);
      setStopLoss("");
      setTarget("");
      setContracts("1");
      setTrainingSession(null);
      setTrainingEvents([]);
      activeSignalRef.current = null;
      usedSignalIdsRef.current = new Set();
      ignoredSignalIdsRef.current = new Set();
      lastSuggestedSignalIdRef.current = null;
      setFeedback(
        `Replay ${info.symbol} carregado com ${hiddenCandles.length} candles ocultos de aquecimento.`,
      );
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Falha ao preparar o aquecimento do replay.",
      );
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
    setStopLoss("");
    setTarget("");
    setContracts("1");
    setFeedback("Replay reiniciado no começo da sessão.");
  }

  async function startTraining() {
    if (startingTrainingRef.current) return;

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
    setPosition(null);
    setStopLoss("");
    setTarget("");
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
      setFeedback(
        "Encerre a posição aberta antes de finalizar a sessão de treino.",
      );
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
        "O replay chegou ao fim com uma posição aberta. A sessão permanece ativa até definirmos a política de encerramento no fim da janela.",
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

  function normalizeOrderPrice(
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
        `${label} ajustado de ${money.format(parsed)} para ${money.format(rounded)} para respeitar o tick de ${tickSizeFor(asset)} do ${asset}.`,
      );
    }
  }

  function submit(side: Side) {
    try {
      if (dataMode === "replay" && !trainingActive) {
        throw new TradingRuleError(
          "Inicie a sessão formal de treino antes de enviar uma operação.",
        );
      }

      if (!lastCandle) {
        throw new TradingRuleError(
          "Não há candle disponível para executar a entrada.",
        );
      }

      const marketTimestamp =
        dataMode === "replay" && currentReplayTrade
          ? currentReplayTrade.timestamp
          : lastCandle.timestamp;
      const openedAt =
        dataMode === "replay" && currentReplayTrade
          ? currentReplayTrade.timestamp
          : new Date().toISOString();

      const entryContext = captureEntryContext({
        asset,
        candles: visibleCandles,
        evaluation: indicatorEvaluation,
        signal,
        marketTimestamp,
        indicatorVersion: indicator.version,
      });

      const nextPosition = openPosition(
        {
          asset,
          side,
          entry: lastPrice,
          contracts: Number(contracts),
          execution: executionSettings,
          candleIndex: lastCandle.index,
          replaySequence:
            dataMode === "replay" ? currentReplayTrade?.sequence : undefined,
          oco: {
            stopLoss: Number(stopLoss),
            target: Number(target),
          },
          signal,
          entryContext,
          signalAlreadyUsed,
          hasOpenPosition: Boolean(position),
        },
        openedAt,
      );

      positionRef.current = nextPosition;
      setPosition(nextPosition);
      if (signal) {
        usedSignalIdsRef.current.add(signal.id);
      }
      recordTrainingEvent({
        type: "TRADE_OPENED",
        marketTimestamp: currentReplayTrade?.timestamp ?? null,
        signalId: signal?.id ?? null,
        side,
        tradeId: nextPosition.id,
      });
      setFeedback(
        `${sideLabel(side)} aberta em ${money.format(lastPrice)} com OCO obrigatório ativo.`,
      );
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
          signalId: signal?.id ?? null,
          side: isDisciplineError ? side : null,
          reason,
        });
      }
    }
  }

  const tradingEnabled = dataMode === "demo" || trainingActive;
  const buyAllowed =
    tradingEnabled &&
    !position &&
    signalAllows(signal, asset, "BUY", signalAlreadyUsed);
  const sellAllowed =
    tradingEnabled &&
    !position &&
    signalAllows(signal, asset, "SELL", signalAlreadyUsed);

  const historyTradesForDisplay = examActive
    ? trades.filter(
        (trade) =>
          !trainingEvents.some(
            (event) =>
              event.sessionId === trainingSession?.id &&
              event.tradeId === trade.id,
          ),
      )
    : trades;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Treino de execução disciplinada</p>
          <h1>Simulador de Trade</h1>
          <p className="subtitle">
            WINFUT e WDOFUT · Multi Médias - Nuvem e Sinais · OCO obrigatório
          </p>
        </div>

        <div className="topbar-actions">
          <div className="mode-badge">
            <span className="pulse" />
            {dataMode === "replay"
              ? `Replay real · ${replay.session?.symbol ?? asset}`
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

        <div className="quote">
          <span>Último preço</span>
          <strong>{lastCandle ? money.format(lastPrice) : "—"}</strong>
        </div>

        <div className="indicator-name">
          <span>Indicador</span>
          <strong>{indicator.name}</strong>
          <small>MME 8 · MMP 20 · MME 52 · VWAP Session</small>
        </div>
      </section>

      <ExecutionSettingsPanel
        settings={executionSettings}
        onSaved={(settings) => {
          setExecutionSettings(settings);
          setFeedback(
            "Configurações salvas. Elas serão aplicadas somente às próximas operações.",
          );
        }}
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
          setFeedback(
            "Backup importado. Histórico, relatórios e configurações foram atualizados.",
          );
        }}
      />

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
            await replay.unload();
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
          setTrainingSession(null);
          setTrainingEvents([]);
          setTrainingMode("FREE");
          activeSignalRef.current = null;
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
          if (targetPath) replay.setPath(targetPath);
        }}
      />

      <PlanDataPreparationPanel
        plan={simulationPlan}
        matches={catalogMatches}
        onCatalogUpdated={() =>
          setCatalogRefreshKey((value) => value + 1)
        }
      />

      <TrainingSessionPanel
        session={trainingSession}
        summary={trainingSummary}
        events={trainingEvents}
        mode={trainingMode}
        onModeChange={setTrainingMode}
        canStart={
          Boolean(simulationPlan) &&
          planIsReady(catalogMatches) &&
          Boolean(replay.session) &&
          !startingTraining
        }
        replayLoaded={Boolean(replay.session)}
        onStart={() => void startTraining()}
        onEnd={() => void finishTraining()}
      />

      <ReplayControls
        path={replay.path}
        timeframeMinutes={replayTimeframeMinutes}
        onPathChange={replay.setPath}
        session={replay.session}
        playing={replay.playing}
        speed={replay.speed}
        processed={replay.processed}
        currentTimestamp={replay.currentTimestamp}
        finished={replay.finished}
        busy={replay.busy}
        onLoad={() => void loadReplay()}
        onPlayPause={() => replay.setPlaying(!replay.playing)}
        trainingActive={trainingActive}
        onStep={() => void replay.step()}
        onStepCandle={() => void replay.stepCandle()}
        onReset={() => void resetReplay()}
        onSpeedChange={replay.setSpeed}
      />

      <section className="workspace">
        <div className="market card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                {dataMode === "replay"
                  ? "Mercado histórico revelado até agora"
                  : "Motor do indicador integrado"}
              </p>
              <h2>{asset}</h2>
            </div>
            <SignalBadge evaluation={indicatorEvaluation} />
          </div>

          {visibleCandles.length ? (
            <CandleChart
              candles={visibleCandles}
              evaluation={indicatorEvaluation}
              position={position}
            />
          ) : (
            <div className="chart-placeholder">
              Carregue o replay e avance o primeiro negócio para iniciar o gráfico M{replayTimeframeMinutes}.
            </div>
          )}

          <p className="chart-note">
            {dataMode === "replay"
              ? `Cada negócio revelado atualiza o candle M${replayTimeframeMinutes} aberto, o volume, o indicador e as regras de execução. Candles futuros permanecem ocultos.`
              : "Modo demonstrativo com candles sintéticos. Carregue um .replay.csv para usar dados tratados do Profit Ultra."}
          </p>
        </div>

        <aside className="order-panel card">
          <p className="eyebrow">Boleta protegida</p>
          <h2>Ordem OCO</h2>

          <div className="rule-box">
            <strong>Regra de treino</strong>
            <span>
              A zona precisa ter sido iniciada pelo gatilho original do indicador.
              Zona verde autoriza apenas Compra; zona vermelha, apenas Venda.
              Fora das zonas, qualquer tentativa será bloqueada e registrada como
              fora do operacional.
            </span>
          </div>

          <label>
            Preço de entrada
            <input value={lastCandle ? money.format(lastPrice) : ""} readOnly />
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
            Stop loss
            <input
              type="number"
              step={tickSizeFor(asset)}
              value={stopLoss}
              onChange={(event) => setStopLoss(event.target.value)}
              onBlur={() =>
                normalizeOrderPrice(stopLoss, setStopLoss, "Stop loss")
              }
              disabled={Boolean(position) || !lastCandle}
              placeholder="Obrigatório"
            />
          </label>

          <label>
            Alvo
            <input
              type="number"
              step={tickSizeFor(asset)}
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              onBlur={() =>
                normalizeOrderPrice(target, setTarget, "Alvo")
              }
              disabled={Boolean(position) || !lastCandle}
              placeholder="Obrigatório"
            />
          </label>

          <div className="order-actions">
            <button
              className={`buy-button ${buyAllowed ? "" : "locked"}`}
              aria-disabled={!buyAllowed}
              onClick={() => submit("BUY")}
            >
              Comprar
            </button>
            <button
              className={`sell-button ${sellAllowed ? "" : "locked"}`}
              aria-disabled={!sellAllowed}
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
                Slippage {position.slippageTicksPerSide} tick/lado · custo R${" "}\n                {money.format(position.costPerContractRoundTripBRL)} por contrato
              </small>
              <small>
                OHLC ambíguo:{" "}
                {position.intrabarPolicy === "TARGET_FIRST"
                  ? "Alvo primeiro"
                  : "Stop primeiro"}
              </small>
              {dataMode === "replay" && replay.finished && (
                <button
                  type="button"
                  className="market-close-button"
                  onClick={closeOpenPositionAtReplayEnd}
                >
                  Encerrar a mercado no último preço
                </button>
              )}
            </div>
          )}
        </aside>
      </section>

      <StudentProgressPanel
        refreshKey={sessionHistoryRefreshKey}
        hidden={examActive}
      />

      <ProgressOverviewPanel trades={trades} hidden={examActive} />

      <SessionHistoryPanel refreshKey={sessionHistoryRefreshKey} />

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
      />

      <section className="history card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Persistência local</p>
            <h2>Últimas operações</h2>
          </div>
          <span className="history-count">
            {historyTradesForDisplay.length} visíveis
          </span>
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
                    <td>{trade.asset}</td>
                    <td>{sideLabel(trade.side)}</td>
                    <td>{trade.contracts}</td>
                    <td>{money.format(trade.entry)}</td>
                    <td>{money.format(trade.exitPrice)}</td>
                    <td>
                      {trade.exitReason === "TARGET"
                        ? "Alvo"
                        : trade.exitReason === "STOP"
                          ? "Stop"
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

      <RuleViolationModal
        message={ruleViolation}
        onClose={() => setRuleViolation(null)}
      />
    </main>
  );
}

function SignalBadge({
  evaluation,
}: {
  evaluation: IndicatorEvaluation;
}) {
  const signal = evaluation.authorization;

  if (!signal) {
    return <div className="signal-badge neutral">Sem zona ativa</div>;
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
