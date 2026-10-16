import { useCallback, useEffect, useMemo, useState } from "react";
import { CandleChart } from "./components/CandleChart";
import { DataPreparationPanel } from "./components/DataPreparationPanel";
import { ReplayControls } from "./components/ReplayControls";
import { ReplayCatalogPanel } from "./components/ReplayCatalogPanel";
import { RuleViolationModal } from "./components/RuleViolationModal";
import { SimulationPlanner } from "./components/SimulationPlanner";
import {
  ThemeToggle,
  type ThemeMode,
} from "./components/ThemeToggle";
import { tickSizeFor } from "./domain/marketSpecs";
import { applyReplayTrade } from "./domain/replay";
import {
  planIsReady,
  targetFileFromMatches,
  warmupFilesFromMatches,
  type RequirementMatch,
} from "./domain/catalogMatch";
import {
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
import { loadTrades, saveTrade } from "./services/persistence";
import { registerReplayFile } from "./services/replayCatalog";
import { loadWarmupCandles } from "./services/replayData";
import type {
  Asset,
  IndicatorEvaluation,
  Position,
  ReplayTrade,
  Side,
  Trade,
} from "./types";
import type { SimulationPlan } from "./domain/simulationPlan";

const THEME_KEY = "simulador-de-trade:theme";

const money = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});

function initialTheme(): ThemeMode {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;

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
  const [theme, setTheme] = useState<ThemeMode>(initialTheme);
  const [ruleViolation, setRuleViolation] = useState<string | null>(null);
  const [feedback, setFeedback] = useState(
    "Aguarde a formação de uma zona válida do indicador para liberar uma direção.",
  );
  const [simulationPlan, setSimulationPlan] = useState<SimulationPlan | null>(null);
  const [catalogMatches, setCatalogMatches] = useState<RequirementMatch[]>([]);
  const [catalogRefreshKey, setCatalogRefreshKey] = useState(0);
  const [warmupCandles, setWarmupCandles] = useState<import("./types").Candle[]>([]);

  const handleReplayTrade = useCallback((trade: ReplayTrade) => {
    setCurrentReplayTrade(trade);
    setCandles((current) => applyReplayTrade(current, trade));
  }, []);

  const replay = useReplayPlayer(handleReplayTrade);

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
  const lastCandle = visibleCandles[visibleCandles.length - 1];
  const lastPrice = lastCandle?.close ?? 0;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    loadTrades()
      .then(setTrades)
      .catch(() => setFeedback("Não foi possível carregar o histórico local."));
  }, []);

  useEffect(() => {
    if (dataMode !== "demo") return;

    const timer = window.setInterval(() => {
      setCandles((current) => [...current, nextDemoCandle(asset, current)]);
    }, 1500);

    return () => window.clearInterval(timer);
  }, [asset, dataMode]);

  function persistClosedTrade(closed: Trade) {
    setPosition(null);
    setTrades((current) => [
      closed,
      ...current.filter((trade) => trade.id !== closed.id),
    ]);
    setFeedback(
      closed.exitReason === "TARGET"
        ? `Alvo atingido. Resultado: ${money.format(closed.resultPoints)} pontos.`
        : `Stop atingido. Resultado: ${money.format(closed.resultPoints)} pontos.`,
    );
    void saveTrade(closed).catch(() =>
      setFeedback(
        "A operação foi encerrada, mas houve falha ao salvar o histórico local.",
      ),
    );
  }

  useEffect(() => {
    if (dataMode !== "demo" || !position || !lastCandle) return;
    const closed = resolveOco(position, lastCandle);
    if (closed) persistClosedTrade(closed);
  }, [dataMode, lastCandle, position]);

  useEffect(() => {
    if (
      dataMode !== "replay" ||
      !position ||
      !currentReplayTrade
    ) {
      return;
    }

    const closed = resolveOcoTrade(position, currentReplayTrade);
    if (closed) persistClosedTrade(closed);
  }, [dataMode, currentReplayTrade?.sequence, position]);

  useEffect(() => {
    if (!signal || position || !lastCandle) return;

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
  }, [signal?.id, asset, position, lastCandle?.index]);

  useEffect(() => {
    if (signal || position || !lastCandle) return;
    setFeedback(
      "Sem zona autorizadora ativa. Compra e Venda permanecem bloqueadas.",
    );
  }, [indicatorEvaluation.zone, signal, position, lastCandle?.index]);

  useEffect(() => {
    if (replay.error) {
      setFeedback(replay.error);
    }
  }, [replay.error]);

  function changeAsset(next: Asset) {
    if (dataMode === "replay") return;
    setAsset(next);
    setCandles(createDemoCandles(next));
    setPosition(null);
    setStopLoss("");
    setTarget("");
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
        simulationPlan.visibleMinutes / simulationPlan.visibleBars,
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
      setCurrentReplayTrade(null);
      setPosition(null);
      setStopLoss("");
      setTarget("");
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
    await replay.reset();
    setCandles([]);
    setCurrentReplayTrade(null);
    setPosition(null);
    setStopLoss("");
    setTarget("");
    setFeedback("Replay reiniciado no começo da sessão.");
  }

  function submit(side: Side) {
    try {
      if (!lastCandle) {
        throw new TradingRuleError(
          "Não há candle disponível para executar a entrada.",
        );
      }

      const marketTime =
        dataMode === "replay" && currentReplayTrade
          ? new Date(currentReplayTrade.timestamp)
          : new Date();

      const nextPosition = openPosition(
        {
          asset,
          side,
          entry: lastPrice,
          candleIndex: lastCandle.index,
          replaySequence:
            dataMode === "replay" ? currentReplayTrade?.sequence : undefined,
          oco: {
            stopLoss: Number(stopLoss),
            target: Number(target),
          },
          signal,
          hasOpenPosition: Boolean(position),
        },
        marketTime,
      );

      setPosition(nextPosition);
      setFeedback(
        `${sideLabel(side)} aberta em ${money.format(lastPrice)} com OCO obrigatório ativo.`,
      );
    } catch (error) {
      const reason =
        error instanceof TradingRuleError
          ? error.message
          : "Não foi possível abrir a operação.";
      setFeedback(reason);
      setRuleViolation(reason);
    }
  }

  const buyAllowed = !position && signalAllows(signal, asset, "BUY");
  const sellAllowed = !position && signalAllows(signal, asset, "SELL");

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

      <SimulationPlanner
        onPlanChange={(plan) => {
          setSimulationPlan(plan);
          setCatalogMatches([]);
          setWarmupCandles([]);
          setFeedback(
            `Plano definido: ${plan.targetDate} · ${plan.targetStartTime}–${plan.targetEndTime}. Use os mesmos horários ao tratar o arquivo do pregão-alvo.`,
          );
        }}
      />

      <ReplayCatalogPanel
        plan={simulationPlan}
        asset={simulationPlan ? asset : asset}
        refreshKey={catalogRefreshKey}
        onMatchesChange={(matches) => {
          setCatalogMatches(matches);
          const targetPath = targetFileFromMatches(matches);
          if (targetPath) replay.setPath(targetPath);
        }}
      />

      <ReplayControls
        path={replay.path}
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
        onStep={() => void replay.step()}
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
              Carregue o replay e avance o primeiro negócio para iniciar o gráfico M2.
            </div>
          )}

          <p className="chart-note">
            {dataMode === "replay"
              ? "Cada negócio revelado atualiza o candle M2 aberto, o volume, o indicador e as regras de execução. Candles futuros permanecem ocultos."
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
            Stop loss
            <input
              type="number"
              step={tickSizeFor(asset)}
              value={stopLoss}
              onChange={(event) => setStopLoss(event.target.value)}
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
                {sideLabel(position.side)} · {money.format(position.entry)}
              </strong>
              <small>
                Stop {money.format(position.stopLoss)} · Alvo{" "}
                {money.format(position.target)}
              </small>
            </div>
          )}
        </aside>
      </section>

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
          <span className="history-count">{trades.length} registradas</span>
        </div>

        {trades.length === 0 ? (
          <p className="empty-state">
            As operações encerradas aparecerão aqui.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ativo</th>
                  <th>Direção</th>
                  <th>Entrada</th>
                  <th>Saída</th>
                  <th>Motivo</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {trades.slice(0, 10).map((trade) => (
                  <tr key={trade.id}>
                    <td>{trade.asset}</td>
                    <td>{sideLabel(trade.side)}</td>
                    <td>{money.format(trade.entry)}</td>
                    <td>{money.format(trade.exitPrice)}</td>
                    <td>{trade.exitReason === "TARGET" ? "Alvo" : "Stop"}</td>
                    <td
                      className={
                        trade.resultPoints >= 0 ? "positive" : "negative"
                      }
                    >
                      {money.format(trade.resultPoints)} pts
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
