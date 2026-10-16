import { useEffect, useMemo, useState } from "react";
import { CandleChart } from "./components/CandleChart";
import {
  openPosition,
  resolveOco,
  sideLabel,
  signalAllows,
  TradingRuleError,
} from "./domain/trading";
import {
  createDemoCandles,
  nextDemoCandle,
  suggestedOcoDistance,
} from "./data/demoMarket";
import { indicator } from "./services/indicator";
import { loadTrades, saveTrade } from "./services/persistence";
import type { Asset, Position, Side, Trade } from "./types";

const money = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});

export default function App() {
  const [asset, setAsset] = useState<Asset>("WINFUT");
  const [candles, setCandles] = useState(() => createDemoCandles("WINFUT"));
  const [position, setPosition] = useState<Position | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stopLoss, setStopLoss] = useState("");
  const [target, setTarget] = useState("");
  const [feedback, setFeedback] = useState(
    "Aguarde um sinal do indicador para liberar a direção permitida.",
  );

  const signal = useMemo(
    () => indicator.evaluate(asset, candles),
    [asset, candles],
  );
  const lastCandle = candles[candles.length - 1];
  const lastPrice = lastCandle?.close ?? 0;

  useEffect(() => {
    loadTrades()
      .then(setTrades)
      .catch(() => setFeedback("Não foi possível carregar o histórico local."));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCandles((current) => [...current, nextDemoCandle(asset, current)]);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [asset]);

  useEffect(() => {
    if (!position || !lastCandle) return;
    const closed = resolveOco(position, lastCandle);
    if (!closed) return;

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
  }, [lastCandle, position]);

  useEffect(() => {
    if (!signal || position) return;
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
      `${signal.label} liberada pelo indicador. Configure o OCO e envie somente a direção autorizada.`,
    );
  }, [signal?.id, asset, lastPrice, position]);

  function changeAsset(next: Asset) {
    setAsset(next);
    setCandles(createDemoCandles(next));
    setPosition(null);
    setStopLoss("");
    setTarget("");
    setFeedback(
      `Ativo alterado para ${next}. Aguarde o sinal correspondente antes de operar.`,
    );
  }

  function submit(side: Side) {
    try {
      const nextPosition = openPosition({
        asset,
        side,
        entry: lastPrice,
        oco: {
          stopLoss: Number(stopLoss),
          target: Number(target),
        },
        signal,
        hasOpenPosition: Boolean(position),
      });

      setPosition(nextPosition);
      setFeedback(
        `${sideLabel(side)} aberta em ${money.format(lastPrice)} com OCO obrigatório ativo.`,
      );
    } catch (error) {
      setFeedback(
        error instanceof TradingRuleError
          ? error.message
          : "Não foi possível abrir a operação.",
      );
    }
  }

  const buyAllowed =
    !position && signalAllows(signal, asset, "BUY");
  const sellAllowed =
    !position && signalAllows(signal, asset, "SELL");

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Treino de execução disciplinada</p>
          <h1>Simulador de Trade</h1>
          <p className="subtitle">
            WINFUT e WDOFUT · entradas somente após sinal · OCO obrigatório
          </p>
        </div>
        <div className="mode-badge">
          <span className="pulse" />
          Modo demonstração
        </div>
      </header>

      <section className="toolbar card">
        <div className="asset-switch" aria-label="Selecionar ativo">
          {(["WINFUT", "WDOFUT"] as Asset[]).map((item) => (
            <button
              key={item}
              className={asset === item ? "active" : ""}
              onClick={() => changeAsset(item)}
              disabled={Boolean(position)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="quote">
          <span>Último preço</span>
          <strong>{money.format(lastPrice)}</strong>
        </div>
        <div className="indicator-name">
          <span>Indicador</span>
          <strong>{indicator.name}</strong>
        </div>
      </section>

      <section className="workspace">
        <div className="market card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Replay demonstrativo</p>
              <h2>{asset}</h2>
            </div>
            <SignalBadge signal={signal} />
          </div>
          <CandleChart
            candles={candles}
            signal={signal}
            position={position}
          />
          <p className="chart-note">
            Os candles e sinais desta fase são sintéticos. O adaptador do
            indicador real substituirá esta lógica quando o Pine Script for
            integrado.
          </p>
        </div>

        <aside className="order-panel card">
          <p className="eyebrow">Boleta protegida</p>
          <h2>Ordem OCO</h2>

          <div className="rule-box">
            <strong>Regra de treino</strong>
            <span>
              Sem sinal, nenhuma entrada. Com sinal de Compra, Venda permanece
              bloqueada — e vice-versa.
            </span>
          </div>

          <label>
            Preço de entrada
            <input value={money.format(lastPrice)} readOnly />
          </label>

          <label>
            Stop loss
            <input
              type="number"
              step="any"
              value={stopLoss}
              onChange={(event) => setStopLoss(event.target.value)}
              disabled={Boolean(position)}
              placeholder="Obrigatório"
            />
          </label>

          <label>
            Alvo
            <input
              type="number"
              step="any"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              disabled={Boolean(position)}
              placeholder="Obrigatório"
            />
          </label>

          <div className="order-actions">
            <button
              className="buy-button"
              disabled={!buyAllowed}
              onClick={() => submit("BUY")}
            >
              Comprar
            </button>
            <button
              className="sell-button"
              disabled={!sellAllowed}
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
    </main>
  );
}

function SignalBadge({
  signal,
}: {
  signal: ReturnType<typeof indicator.evaluate>;
}) {
  if (!signal) {
    return <div className="signal-badge neutral">Sem sinal</div>;
  }
  return (
    <div
      className={`signal-badge ${signal.side === "BUY" ? "buy" : "sell"}`}
    >
      Sinal: {signal.label}
    </div>
  );
}
