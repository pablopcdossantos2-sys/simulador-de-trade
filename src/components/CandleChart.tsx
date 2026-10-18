import { useState, type MouseEvent as ReactMouseEvent } from "react";
import type { Asset, Candle, IndicatorEvaluation, IndicatorPoint, Position } from "../types";

interface Props {
  candles: Candle[];
  contextCandles?: Candle[];
  evaluation: IndicatorEvaluation;
  position: Position | null;
  asset: Asset;
}
interface ChartCandle extends Candle { source: "context" | "target"; }
interface Crosshair { candleIndex: number; y: number; }

const WIDTH = 1120;
const HEIGHT = 510;
const PLOT_LEFT = 72;
const PLOT_RIGHT = 980;
const PLOT_TOP = 38;
const PLOT_BOTTOM = 385;
const VOLUME_TOP = 407;
const VOLUME_BOTTOM = 454;
const TIME_LABEL_Y = 484;
const DEFAULT_VISIBLE_BARS = 48;
const MIN_VISIBLE_BARS = 12;
const MAX_VISIBLE_BARS = 120;
const CONTEXT_BARS = 24;

function formatPrice(value: number, asset: Asset): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: asset === "WDOFUT" ? 1 : 0,
    maximumFractionDigits: asset === "WDOFUT" ? 1 : 0,
  }).format(value);
}
function formatTime(timestamp: string): string {
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(timestamp)) {
    const date = new Date(timestamp);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false,
      }).format(date);
    }
  }
  const match = timestamp.match(/T(\d{2}):(\d{2})/);
  return match ? match[1] + ":" + match[2] : timestamp;
}
function formatDate(timestamp: string): string { return timestamp.slice(0, 10); }

function buildLinePath(
  visible: ChartCandle[],
  points: Map<number, IndicatorPoint>,
  xForIndex: (index: number) => number,
  y: (price: number) => number,
  selector: (point: IndicatorPoint) => number | null,
): string {
  let path = "";
  let drawing = false;
  visible.forEach((candle, idx) => {
    const point = points.get(candle.index);
    const value = point ? selector(point) : null;
    if (value === null || !Number.isFinite(value)) {
      drawing = false;
      return;
    }
    path += (drawing ? "L" : "M") + " " + xForIndex(idx) + " " + y(value) + " ";
    drawing = true;
  });
  return path.trim();
}

export function CandleChart({ candles, contextCandles = [], evaluation, position, asset }: Props) {
  const [visibleBars, setVisibleBars] = useState(DEFAULT_VISIBLE_BARS);
  const [crosshair, setCrosshair] = useState<Crosshair | null>(null);

  // O aquecimento completo continua alimentando o indicador; só os candles finais
  // do pregão anterior são exibidos como contexto visual.
  const context: ChartCandle[] = contextCandles
    .map((candle, index) => ({ ...candle, index, source: "context" as const }))
    .slice(-CONTEXT_BARS);
  const target: ChartCandle[] = candles.map((candle) => ({ ...candle, source: "target" as const }));
  const allCandles = [...context, ...target];
  const visible = allCandles.slice(-visibleBars);
  if (!visible.length) return null;

  const visibleIndices = new Set(visible.map((candle) => candle.index));
  const pointMap = new Map(
    evaluation.series.filter((point) => visibleIndices.has(point.candleIndex))
      .map((point) => [point.candleIndex, point]),
  );
  const extraPrices = position ? [position.stopLoss, position.target, position.entry] : [];
  const indicatorPrices = Array.from(pointMap.values()).flatMap((point) =>
    [point.wma20, point.vwap, point.ema8, point.ema52].filter(
      (value): value is number => value !== null && Number.isFinite(value),
    ),
  );
  const rawMin = Math.min(...visible.map((candle) => candle.low), ...indicatorPrices, ...extraPrices);
  const rawMax = Math.max(...visible.map((candle) => candle.high), ...indicatorPrices, ...extraPrices);
  const padding = Math.max((rawMax - rawMin) * 0.07, asset === "WINFUT" ? 10 : 1);
  const min = rawMin - padding;
  const max = rawMax + padding;
  const range = Math.max(max - min, asset === "WINFUT" ? 5 : 0.5);
  const xStep = (PLOT_RIGHT - PLOT_LEFT) / visibleBars;
  const emptySlots = visibleBars - visible.length;
  const xForIndex = (idx: number) => PLOT_LEFT + (emptySlots + idx + 0.5) * xStep;
  const y = (price: number) => PLOT_BOTTOM - ((price - min) / range) * (PLOT_BOTTOM - PLOT_TOP);

  const wmaPath = buildLinePath(visible, pointMap, xForIndex, y, (point) => point.wma20);
  const vwapPath = buildLinePath(visible, pointMap, xForIndex, y, (point) => point.vwap);
  const ema8Path = buildLinePath(visible, pointMap, xForIndex, y, (point) => point.ema8);
  const ema52Path = buildLinePath(visible, pointMap, xForIndex, y, (point) => point.ema52);
  const visibleSignals = evaluation.signals.filter((signal) => visibleIndices.has(signal.candleIndex));
  const maxVolume = Math.max(...visible.map((candle) => candle.volume), 1);
  const lastCandle = visible[visible.length - 1];
  const hoveredCandle = crosshair
    ? visible.find((candle) => candle.index === crosshair.candleIndex) ?? null
    : null;
  const readoutCandle = hoveredCandle ?? lastCandle;
  const targetStartIndex = visible.findIndex((candle) => candle.source === "target");
  const hasVisibleContext = visible.some((candle) => candle.source === "context");
  const labelCount = Math.min(6, visible.length);
  const timeLabelIndices = Array.from({ length: labelCount }, (_, index) =>
    labelCount === 1 ? visible.length - 1 : Math.round((visible.length - 1) * index / (labelCount - 1)),
  );
  const uniqueTimeLabelIndices = Array.from(new Set(timeLabelIndices));
  const crosshairIndex = crosshair
    ? visible.findIndex((candle) => candle.index === crosshair.candleIndex)
    : -1;
  const crosshairX = crosshairIndex >= 0 ? xForIndex(crosshairIndex) : null;

  function handleMouseMove(event: ReactMouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const x = (event.clientX - rect.left) * WIDTH / rect.width;
    const yValue = (event.clientY - rect.top) * HEIGHT / rect.height;
    if (x < PLOT_LEFT || x > PLOT_RIGHT || yValue < PLOT_TOP || yValue > VOLUME_BOTTOM) {
      setCrosshair(null);
      return;
    }
    const slot = Math.floor((x - PLOT_LEFT) / xStep);
    const visibleIndex = slot - emptySlots;
    if (visibleIndex < 0 || visibleIndex >= visible.length) {
      setCrosshair(null);
      return;
    }
    setCrosshair({
      candleIndex: visible[visibleIndex].index,
      y: Math.max(PLOT_TOP, Math.min(PLOT_BOTTOM, yValue)),
    });
  }

  return (
    <div className="chart-shell">
      <div className="chart-toolbar">
        <div className="chart-ohlc" aria-live="polite" aria-label="Dados do candle selecionado">
          <strong>{hoveredCandle ? "Candle selecionado" : "Último candle"}</strong>
          <span>{formatDate(readoutCandle.timestamp)} {formatTime(readoutCandle.timestamp)}</span>
          <span>O {formatPrice(readoutCandle.open, asset)}</span>
          <span>H {formatPrice(readoutCandle.high, asset)}</span>
          <span>L {formatPrice(readoutCandle.low, asset)}</span>
          <span>C {formatPrice(readoutCandle.close, asset)}</span>
          <span>Vol. {new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(readoutCandle.volume)}</span>
        </div>
        <div className="chart-controls" aria-label="Controles de zoom do gráfico">
          <button type="button" aria-label="Zoom out: mostrar mais candles" title="Mostrar mais candles"
            disabled={visibleBars >= MAX_VISIBLE_BARS}
            onClick={() => { setVisibleBars((value) => Math.min(MAX_VISIBLE_BARS, value + 12)); setCrosshair(null); }}>−</button>
          <span>{visibleBars} candles</span>
          <button type="button" aria-label="Zoom in: mostrar menos candles" title="Mostrar menos candles"
            disabled={visibleBars <= MIN_VISIBLE_BARS}
            onClick={() => { setVisibleBars((value) => Math.max(MIN_VISIBLE_BARS, value - 12)); setCrosshair(null); }}>+</button>
          <button type="button" onClick={() => { setVisibleBars(DEFAULT_VISIBLE_BARS); setCrosshair(null); }}>Padrão</button>
        </div>
      </div>

      <div className="indicator-legend" aria-label="Legenda do indicador">
        <span className="legend-wma">MMP 20</span><span className="legend-vwap">VWAP</span>
        <span className="legend-ema8">MME 8</span><span className="legend-ema52">MME 52</span>
        <span className="legend-volume">Volume</span>
      </div>

      <svg className="chart" viewBox={"0 0 " + WIDTH + " " + HEIGHT} role="img"
        aria-label="Gráfico de candles com eixo de preços e horários, volume, médias, VWAP, sinais e controles de zoom"
        onMouseMove={handleMouseMove} onMouseLeave={() => setCrosshair(null)}>
        <rect width={WIDTH} height={HEIGHT} className="chart-bg" />
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const value = max - range * ratio;
          const lineY = PLOT_TOP + (PLOT_BOTTOM - PLOT_TOP) * ratio;
          return <g key={"price-grid-" + ratio}>
            <line x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={lineY} y2={lineY} className="grid-line" />
            <text x={WIDTH - 8} y={lineY + 4} textAnchor="end" className="axis-label">{formatPrice(value, asset)}</text>
          </g>;
        })}

        {uniqueTimeLabelIndices.map((idx) => <line key={"time-grid-" + visible[idx].index}
          x1={xForIndex(idx)} x2={xForIndex(idx)} y1={PLOT_TOP} y2={VOLUME_BOTTOM} className="time-grid" />)}

        {visible.slice(1).map((candle, idx) => {
          const previous = visible[idx];
          const currentPoint = pointMap.get(candle.index);
          const previousPoint = pointMap.get(previous.index);
          if (!currentPoint || !previousPoint || currentPoint.zone === "NONE" || currentPoint.zone !== previousPoint.zone) return null;
          const x0 = xForIndex(idx);
          const x1 = xForIndex(idx + 1);
          const points = [
            x0 + "," + y(previousPoint.ema8), x1 + "," + y(currentPoint.ema8),
            x1 + "," + y(currentPoint.ema52), x0 + "," + y(previousPoint.ema52),
          ].join(" ");
          return <polygon key={"cloud-" + candle.index} points={points}
            className={currentPoint.zone === "GREEN" ? "indicator-cloud-green" : "indicator-cloud-red"} />;
        })}

        {visible.map((candle, idx) => {
          const x = xForIndex(idx);
          const bullish = candle.close >= candle.open;
          const bodyTop = y(Math.max(candle.open, candle.close));
          const bodyBottom = y(Math.min(candle.open, candle.close));
          const contextClass = candle.source === "context" ? " candle-context" : "";
          const candleClass = (bullish ? "candle-up" : "candle-down") + contextClass;
          const fillClass = (bullish ? "candle-up-fill" : "candle-down-fill") + contextClass;
          const volumeClass = (bullish ? "volume-up" : "volume-down") + (candle.source === "context" ? " volume-context" : "");
          const bodyWidth = Math.max(2, Math.min(16, xStep * 0.58));
          const volumeHeight = Math.max(1, (candle.volume / maxVolume) * (VOLUME_BOTTOM - VOLUME_TOP));
          return <g key={candle.source + "-" + candle.index}>
            <line x1={x} x2={x} y1={y(candle.high)} y2={y(candle.low)} className={candleClass} />
            <rect x={x - bodyWidth / 2} width={bodyWidth} y={bodyTop}
              height={Math.max(1.5, bodyBottom - bodyTop)} className={fillClass} rx="1" />
            <rect x={x - bodyWidth / 2} width={bodyWidth} y={VOLUME_BOTTOM - volumeHeight}
              height={volumeHeight} className={volumeClass} rx="1" />
          </g>;
        })}

        {wmaPath && <path d={wmaPath} className="indicator-wma-line" />}
        {vwapPath && <path d={vwapPath} className="indicator-vwap-line" />}
        {ema8Path && <path d={ema8Path} className="indicator-ema8-line" />}
        {ema52Path && <path d={ema52Path} className="indicator-ema52-line" />}

        {lastCandle && <>
          <line x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={y(lastCandle.close)} y2={y(lastCandle.close)} className="last-price-line" />
          <rect x={PLOT_RIGHT + 4} y={y(lastCandle.close) - 10} width="78" height="20" rx="4" className="last-price-tag" />
          <text x={PLOT_RIGHT + 43} y={y(lastCandle.close) + 4} textAnchor="middle" className="last-price-tag-text">{formatPrice(lastCandle.close, asset)}</text>
        </>}

        {position && <>
          <PriceLine y={y(position.entry)} label={"Entrada " + formatPrice(position.entry, asset)} className="entry-line" />
          <PriceLine y={y(position.stopLoss)} label={"Stop " + formatPrice(position.stopLoss, asset)} className="stop-line" />
          <PriceLine y={y(position.target)} label={"Alvo " + formatPrice(position.target, asset)} className="target-line" />
        </>}

        {visibleSignals.map((signal) => {
          const idx = visible.findIndex((candle) => candle.index === signal.candleIndex);
          if (idx < 0) return null;
          const candle = visible[idx];
          const x = xForIndex(idx);
          const isBuy = signal.side === "BUY";
          const markerY = isBuy ? Math.min(PLOT_BOTTOM - 9, y(candle.low) + 23) : Math.max(PLOT_TOP + 9, y(candle.high) - 23);
          return <g key={signal.id}>
            <circle cx={x} cy={markerY} r="9" className={isBuy ? "signal-buy" : "signal-sell"} />
            <text x={x} y={isBuy ? markerY + 25 : markerY - 15} textAnchor="middle" className="signal-label">{signal.label.toUpperCase()}</text>
          </g>;
        })}

        {visible.map((candle, idx) => {
          const previous = visible[idx - 1];
          if (!previous || formatDate(previous.timestamp) === formatDate(candle.timestamp)) return null;
          const x = (xForIndex(idx - 1) + xForIndex(idx)) / 2;
          return <line key={"session-change-" + candle.index} x1={x} x2={x} y1={PLOT_TOP} y2={VOLUME_BOTTOM} className="session-divider" />;
        })}

        {hasVisibleContext && targetStartIndex > 0 && <>
          <line x1={xForIndex(targetStartIndex) - xStep / 2} x2={xForIndex(targetStartIndex) - xStep / 2}
            y1={PLOT_TOP} y2={VOLUME_BOTTOM} className="session-divider" />
          <text x={PLOT_LEFT + 6} y={PLOT_TOP - 12} className="session-label">PREGÃO ANTERIOR</text>
          <text x={Math.min(PLOT_RIGHT - 8, xForIndex(targetStartIndex) + 8)} y={PLOT_TOP - 12}
            className="session-label" textAnchor="start">JANELA DE TREINO</text>
        </>}

        {crosshair && crosshairX !== null && <>
          <line x1={crosshairX} x2={crosshairX} y1={PLOT_TOP} y2={VOLUME_BOTTOM} className="crosshair-line" />
          <line x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={crosshair.y} y2={crosshair.y} className="crosshair-line" />
        </>}

        {uniqueTimeLabelIndices.map((idx) => <text key={"time-label-" + visible[idx].index}
          x={xForIndex(idx)} y={TIME_LABEL_Y} textAnchor="middle" className="axis-label time-axis-label">{formatTime(visible[idx].timestamp)}</text>)}
        <text x={PLOT_LEFT} y={VOLUME_BOTTOM + 17} className="volume-label">VOL</text>
      </svg>

      {contextCandles.length > 0 && <p className="chart-context-note">
        {candles.length === 0
          ? "Contexto do pregão anterior: os últimos candles disponíveis e seu fechamento permanecem visíveis antes do primeiro negócio do treino."
          : "Os candles anteriores são apenas contexto visual; o replay continua revelando somente os negócios do pregão selecionado."}
      </p>}
    </div>
  );
}

function PriceLine({ y, label, className }: { y: number; label: string; className: string }) {
  return <g>
    <line x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={y} y2={y} className={className} />
    <text x={PLOT_RIGHT - 8} y={y - 5} textAnchor="end" className="price-label">{label}</text>
  </g>;
}
