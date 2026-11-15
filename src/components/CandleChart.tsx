import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { InfoTip } from "./InfoTip";
import type { Asset, Candle, IndicatorEvaluation, IndicatorPoint, Position, Side } from "../types";

interface Props {
  candles: Candle[];
  contextCandles?: Candle[];
  evaluation: IndicatorEvaluation;
  position: Position | null;
  asset: Asset;
  draftOrder?: { side: Side; entry: number; stopLoss: number; target: number } | null;
  entryPlacementEnabled?: boolean;
  onEntryPlacement?: (price: number) => void;
  onAdjustOco?: (kind: "stop" | "target", price: number, mode: "position" | "draft") => void;
  fitAllCandles?: boolean;
  cloudOpacity?: number;
}
interface ChartCandle extends Candle { source: "context" | "target"; }
interface Crosshair { candleIndex: number; y: number; }
interface OcoDrag { kind: "stop" | "target"; mode: "position" | "draft"; min: number; max: number; }
interface AxisDrag { axis: "x" | "y"; startX: number; startY: number; visibleBars: number; priceZoom: number; }
interface ChartPan { startX: number; startY: number; startOffset: number; startPriceOffset: number; range: number; }
interface RulerPoint { x: number; y: number; price: number; candleIndex: number; }

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

export function CandleChart({
  candles,
  contextCandles = [],
  evaluation,
  position,
  asset,
  draftOrder = null,
  entryPlacementEnabled = false,
  onEntryPlacement,
  onAdjustOco,
  fitAllCandles = false,
  cloudOpacity = 0.2,
}: Props) {
  const [visibleBars, setVisibleBars] = useState(DEFAULT_VISIBLE_BARS);
  const [priceZoom, setPriceZoom] = useState(1);
  const [panOffset, setPanOffset] = useState(0);
  const [panPriceOffset, setPanPriceOffset] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [crosshair, setCrosshair] = useState<Crosshair | null>(null);
  const [rulerEnabled, setRulerEnabled] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [rulerStart, setRulerStart] = useState<RulerPoint | null>(null);
  const [rulerEnd, setRulerEnd] = useState<RulerPoint | null>(null);
  const [draggingOco, setDraggingOco] = useState<{ kind: "stop" | "target"; mode: "position" | "draft"; price: number } | null>(null);
  const dragRef = useRef<OcoDrag | null>(null);
  const axisDragRef = useRef<AxisDrag | null>(null);
  const chartPanRef = useRef<ChartPan | null>(null);
  const didDragRef = useRef(false);

  useEffect(() => {
    if (!maximized) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMaximized(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [maximized]);

  // O aquecimento completo continua alimentando o indicador; só os candles finais
  // do pregão anterior são exibidos como contexto visual.
  const context: ChartCandle[] = contextCandles
    .map((candle, index) => ({ ...candle, index, source: "context" as const }))
    .slice(-CONTEXT_BARS);
  const target: ChartCandle[] = candles.map((candle) => ({ ...candle, source: "target" as const }));
  const allCandles = [...context, ...target];
  const panEnd = Math.max(0, allCandles.length - panOffset);
  const panStart = Math.max(0, panEnd - visibleBars);
  const visible = fitAllCandles ? allCandles : allCandles.slice(panStart, panEnd);
  const effectiveVisibleBars = fitAllCandles ? Math.max(visible.length, 1) : visibleBars;
  if (!visible.length) return null;

  const visibleIndices = new Set(visible.map((candle) => candle.index));
  const pointMap = new Map(
    evaluation.series.filter((point) => visibleIndices.has(point.candleIndex))
      .map((point) => [point.candleIndex, point]),
  );
  const extraPrices = position
    ? [position.stopLoss, position.target, position.entry]
    : draftOrder
      ? [draftOrder.stopLoss, draftOrder.target, draftOrder.entry]
      : [];
  const indicatorPrices = Array.from(pointMap.values()).flatMap((point) =>
    [point.wma20, point.vwap, point.ema8, point.ema52].filter(
      (value): value is number => value !== null && Number.isFinite(value),
    ),
  );
  const rawMin = Math.min(...visible.map((candle) => candle.low), ...indicatorPrices, ...extraPrices);
  const rawMax = Math.max(...visible.map((candle) => candle.high), ...indicatorPrices, ...extraPrices);
  const padding = Math.max((rawMax - rawMin) * 0.07, asset === "WINFUT" ? 10 : 1);
  const baseMin = rawMin - padding;
  const baseMax = rawMax + padding;
  const centerPrice = (baseMin + baseMax) / 2;
  const baseRange = Math.max(baseMax - baseMin, asset === "WINFUT" ? 5 : 0.5);
  const range = Math.max(baseRange / priceZoom, asset === "WINFUT" ? 5 : 0.5);
  const min = centerPrice - range / 2 + panPriceOffset;
  const max = centerPrice + range / 2 + panPriceOffset;
  const xStep = (PLOT_RIGHT - PLOT_LEFT) / effectiveVisibleBars;
  const emptySlots = effectiveVisibleBars - visible.length;
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
    if (!rect.width || !rect.height) return;
    const x = (event.clientX - rect.left) * WIDTH / rect.width;
    const yValue = (event.clientY - rect.top) * HEIGHT / rect.height;

    const drag = dragRef.current;
    if (drag) {
      const boundedY = Math.max(PLOT_TOP, Math.min(PLOT_BOTTOM, yValue));
      const price = drag.max - ((boundedY - PLOT_TOP) / (PLOT_BOTTOM - PLOT_TOP)) * (drag.max - drag.min);
      setDraggingOco({ kind: drag.kind, mode: drag.mode, price });
      didDragRef.current = true;
      return;
    }

    const chartPan = chartPanRef.current;
    if (chartPan) {
      const deltaX = x - chartPan.startX;
      const deltaY = yValue - chartPan.startY;
      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        const nextOffset = chartPan.startOffset + Math.round(deltaX / Math.max(xStep, 1));
        setPanOffset(Math.max(0, Math.min(Math.max(0, allCandles.length - visibleBars), nextOffset)));
        setPanPriceOffset(chartPan.startPriceOffset + (deltaY / (PLOT_BOTTOM - PLOT_TOP)) * chartPan.range);
        setCrosshair(null);
        setIsPanning(true);
        didDragRef.current = true;
        return;
      }
    }

    const axisDrag = axisDragRef.current;
    if (axisDrag) {
      if (axisDrag.axis === "x") {
        const nextBars = Math.round(axisDrag.visibleBars * Math.exp((axisDrag.startX - x) * 0.006));
        setVisibleBars(Math.max(MIN_VISIBLE_BARS, Math.min(MAX_VISIBLE_BARS, nextBars)));
      } else {
        const nextZoom = axisDrag.priceZoom * Math.exp((axisDrag.startY - yValue) * 0.01);
        setPriceZoom(Math.max(0.5, Math.min(4, nextZoom)));
      }
      didDragRef.current = true;
      return;
    }

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

  function beginOcoDrag(
    event: ReactMouseEvent<SVGLineElement>,
    kind: "stop" | "target",
    mode: "position" | "draft",
    currentPrice: number,
  ) {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { kind, mode, min, max };
    setDraggingOco({ kind, mode, price: currentPrice });
    didDragRef.current = true;
  }

  function handleAxisMouseDown(event: ReactMouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = (event.clientX - rect.left) * WIDTH / rect.width;
    const yValue = (event.clientY - rect.top) * HEIGHT / rect.height;
    if (!fitAllCandles && x >= PLOT_RIGHT && x <= WIDTH && yValue >= PLOT_TOP && yValue <= PLOT_BOTTOM) {
      axisDragRef.current = { axis: "y", startX: x, startY: yValue, visibleBars, priceZoom };
      didDragRef.current = true;
      event.preventDefault();
    } else if (!fitAllCandles && x >= PLOT_LEFT && x <= PLOT_RIGHT && yValue >= VOLUME_BOTTOM && yValue <= HEIGHT) {
      axisDragRef.current = { axis: "x", startX: x, startY: yValue, visibleBars, priceZoom };
      didDragRef.current = true;
      event.preventDefault();
    } else if (!rulerEnabled && !fitAllCandles && x >= PLOT_LEFT && x <= PLOT_RIGHT && yValue >= PLOT_TOP && yValue <= VOLUME_BOTTOM) {
      chartPanRef.current = { startX: x, startY: yValue, startOffset: panOffset, startPriceOffset: panPriceOffset, range };
      setCrosshair(null);
      event.preventDefault();
    }
  }

  function handleMouseUp(event: ReactMouseEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (drag) {
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width && rect.height) {
        const yValue = (event.clientY - rect.top) * HEIGHT / rect.height;
        const boundedY = Math.max(PLOT_TOP, Math.min(PLOT_BOTTOM, yValue));
        const price = drag.max - ((boundedY - PLOT_TOP) / (PLOT_BOTTOM - PLOT_TOP)) * (drag.max - drag.min);
        onAdjustOco?.(drag.kind, price, drag.mode);
      }
      dragRef.current = null;
      setDraggingOco(null);
      window.setTimeout(() => { didDragRef.current = false; }, 0);
      return;
    }
    axisDragRef.current = null;
    chartPanRef.current = null;
    setIsPanning(false);
    window.setTimeout(() => { didDragRef.current = false; }, 0);
  }

  function handleChartClick(event: ReactMouseEvent<SVGSVGElement>) {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = (event.clientX - rect.left) * WIDTH / rect.width;
    const yValue = (event.clientY - rect.top) * HEIGHT / rect.height;
    if (x < PLOT_LEFT || x > PLOT_RIGHT || yValue < PLOT_TOP || yValue > PLOT_BOTTOM) return;
    const price = max - ((yValue - PLOT_TOP) / (PLOT_BOTTOM - PLOT_TOP)) * (max - min);
    if (rulerEnabled) {
      const slot = Math.floor((x - PLOT_LEFT) / xStep);
      const visibleIndex = slot - emptySlots;
      if (visibleIndex < 0 || visibleIndex >= visible.length) return;
      const point = { x, y: yValue, price, candleIndex: visible[visibleIndex].index };
      if (!rulerStart || rulerEnd) {
        setRulerStart(point);
        setRulerEnd(null);
      } else {
        setRulerEnd(point);
        setRulerEnabled(false);
      }
      return;
    }
    if (entryPlacementEnabled && onEntryPlacement) onEntryPlacement(price);
  }

  return (
    <div className={maximized ? "chart-shell chart-shell-maximized" : "chart-shell"}>
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
          <InfoTip label="Como interagir com o gráfico" className="chart-info-tip">
            <p>Clique em um preço do gráfico para posicionar a entrada. Arraste a área dos candles para mover o gráfico; somente a linha de Alvo pode ser arrastada para ajustar a OCO. O Stop permanece fixo.</p>
            <p>Os candles anteriores são apenas contexto visual; o replay continua revelando somente os negócios do pregão selecionado.</p>
          </InfoTip>
          {fitAllCandles ? (
            <span>{visible.length.toLocaleString("pt-BR")} candles · visão completa</span>
          ) : (
            <>
              <div className="chart-candle-zoom" role="group" aria-label="Quantidade de candles visíveis">
                <button type="button" className="chart-candle-step" aria-label="Mostrar mais candles" title="Mostrar mais candles"
                  disabled={visibleBars >= MAX_VISIBLE_BARS}
                  onClick={() => { setVisibleBars((value) => Math.min(MAX_VISIBLE_BARS, value + 12)); setCrosshair(null); }}>−</button>
                <span>{visibleBars} candles</span>
                <button type="button" className="chart-candle-step" aria-label="Mostrar menos candles" title="Mostrar menos candles"
                  disabled={visibleBars <= MIN_VISIBLE_BARS}
                  onClick={() => { setVisibleBars((value) => Math.max(MIN_VISIBLE_BARS, value - 12)); setCrosshair(null); }}>+</button>
              </div>
            </>
          )}
          <span title="Arraste o eixo de preços para alterar a escala vertical">{priceZoom.toFixed(1)}× Y</span>
          <button type="button" className={rulerEnabled ? "ruler-tool active" : "ruler-tool"}
            aria-pressed={rulerEnabled}
            title="Clique em dois níveis do gráfico para medir a amplitude em pontos"
            onClick={() => { setRulerEnabled((value) => !value); setRulerStart(null); setRulerEnd(null); }}>
            Régua
          </button>
          {(rulerStart || rulerEnd) && <button type="button" onClick={() => { setRulerStart(null); setRulerEnd(null); setRulerEnabled(false); }}>Limpar régua</button>}
          <button type="button" onClick={() => setMaximized((value) => !value)}>
            {maximized ? "Restaurar gráfico" : "Maximizar gráfico"}
          </button>
          <button type="button" onClick={() => { setVisibleBars(DEFAULT_VISIBLE_BARS); setPriceZoom(1); setPanOffset(0); setPanPriceOffset(0); setCrosshair(null); setRulerStart(null); setRulerEnd(null); }}>Padrão</button>
        </div>
      </div>

      <div className="indicator-legend" aria-label="Legenda do indicador">
        <span className="legend-wma">MMP 20</span><span className="legend-vwap">VWAP</span>
        <span className="legend-ema8">MME 8</span><span className="legend-ema52">MME 52</span>
        <span className="legend-volume">Volume</span>
      </div>

      <svg className={"chart" + (isPanning ? " chart-panning" : "")} viewBox={"0 0 " + WIDTH + " " + HEIGHT} role="img"
        aria-label="Gráfico de candles com eixo de preços e horários, volume, médias, VWAP, sinais e controles de zoom"
        onMouseDown={handleAxisMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleChartClick}
        onMouseLeave={() => {
          setCrosshair(null);
          // Sair do SVG cancela o gesto: evita que um mouseup externo deixe o stop preso.
          if (dragRef.current) {
            dragRef.current = null;
            setDraggingOco(null);
          }
          if (axisDragRef.current || chartPanRef.current) {
            axisDragRef.current = null;
            chartPanRef.current = null;
            setIsPanning(false);
          }
          didDragRef.current = false;
        }}>
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
            className={currentPoint.zone === "GREEN" ? "indicator-cloud-green" : "indicator-cloud-red"} style={{ opacity: cloudOpacity }} />;
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

        {position && <>
          <PriceLine y={y(position.entry)} label={"Entrada " + formatPrice(position.entry, asset)} className="entry-line" />
          <PriceLine
            y={y(draggingOco?.mode === "position" && draggingOco.kind === "stop" ? draggingOco.price : position.stopLoss)}
            label={"Stop " + formatPrice(draggingOco?.mode === "position" && draggingOco.kind === "stop" ? draggingOco.price : position.stopLoss, asset)}
            className="stop-line" interactive
            onMouseDown={(event) => beginOcoDrag(event, "stop", "position", position.stopLoss)}
          />
          <PriceLine
            y={y(draggingOco?.mode === "position" && draggingOco.kind === "target" ? draggingOco.price : position.target)}
            label={"Alvo " + formatPrice(draggingOco?.mode === "position" && draggingOco.kind === "target" ? draggingOco.price : position.target, asset)}
            className="target-line" interactive
            onMouseDown={(event) => beginOcoDrag(event, "target", "position", position.target)}
          />
        </>}
        {!position && draftOrder && <>
          <PriceLine y={y(draftOrder.entry)} label={"Entrada proposta " + formatPrice(draftOrder.entry, asset)} className="entry-line" />
          <PriceLine
            y={y(draggingOco?.mode === "draft" && draggingOco.kind === "stop" ? draggingOco.price : draftOrder.stopLoss)}
            label={"Stop " + formatPrice(draggingOco?.mode === "draft" && draggingOco.kind === "stop" ? draggingOco.price : draftOrder.stopLoss, asset)}
            className="stop-line" interactive
            onMouseDown={(event) => beginOcoDrag(event, "stop", "draft", draftOrder.stopLoss)}
          />
          <PriceLine
            y={y(draggingOco?.mode === "draft" && draggingOco.kind === "target" ? draggingOco.price : draftOrder.target)}
            label={"Alvo " + formatPrice(draggingOco?.mode === "draft" && draggingOco.kind === "target" ? draggingOco.price : draftOrder.target, asset)}
            className="target-line" interactive
            onMouseDown={(event) => beginOcoDrag(event, "target", "draft", draftOrder.target)}
          />
        </>}

        {visibleSignals.map((signal) => {
          const idx = visible.findIndex((candle) => candle.index === signal.candleIndex);
          if (idx < 0) return null;
          const candle = visible[idx];
          const x = xForIndex(idx);
          const isBuy = signal.side === "BUY";
          // O marcador usa o preço do candle como âncora, não um deslocamento em pixels.
          const markerY = isBuy ? y(candle.low) : y(candle.high);
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

        {rulerStart && <>
          {rulerEnd && <>
            <line x1={rulerStart.x} y1={rulerStart.y} x2={rulerEnd.x} y2={rulerEnd.y} className="ruler-measure-line" />
            <circle cx={rulerEnd.x} cy={rulerEnd.y} r="5" className="ruler-measure-point" />
            <g className="ruler-measure-label">
              <rect x={Math.max(PLOT_LEFT + 4, Math.min(PLOT_RIGHT - 150, (rulerStart.x + rulerEnd.x) / 2 - 73))}
                y={Math.max(PLOT_TOP + 4, Math.min(PLOT_BOTTOM - 30, (rulerStart.y + rulerEnd.y) / 2 - 25))}
                width="146" height="24" rx="6" />
              <text x={Math.max(PLOT_LEFT + 77, Math.min(PLOT_RIGHT - 77, (rulerStart.x + rulerEnd.x) / 2))}
                y={Math.max(PLOT_TOP + 20, Math.min(PLOT_BOTTOM - 14, (rulerStart.y + rulerEnd.y) / 2 - 9))}
                textAnchor="middle">{formatPrice(Math.abs(rulerEnd.price - rulerStart.price), asset)} pontos</text>
            </g>
          </>}
          <circle cx={rulerStart.x} cy={rulerStart.y} r="5" className="ruler-measure-point" />
        </>}
        {crosshair && crosshairX !== null && <>
          <line x1={crosshairX} x2={crosshairX} y1={PLOT_TOP} y2={VOLUME_BOTTOM} className="crosshair-line" />
          <line x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={crosshair.y} y2={crosshair.y} className="crosshair-line" />
          <g className="crosshair-readout">
            <rect x={PLOT_RIGHT - 190} y={PLOT_BOTTOM - 42} width="184" height="36" rx="6" />
            <text x={PLOT_RIGHT - 180} y={PLOT_BOTTOM - 27}>Preço: {formatPrice(max - ((crosshair.y - PLOT_TOP) / (PLOT_BOTTOM - PLOT_TOP)) * range, asset)}</text>
            <text x={PLOT_RIGHT - 180} y={PLOT_BOTTOM - 13}>Horário: {formatTime(hoveredCandle?.timestamp ?? lastCandle.timestamp)}</text>
          </g>
        </>}

        {uniqueTimeLabelIndices.map((idx) => <text key={"time-label-" + visible[idx].index}
          x={xForIndex(idx)} y={TIME_LABEL_Y} textAnchor="middle" className="axis-label time-axis-label">{formatTime(visible[idx].timestamp)}</text>)}
        <text x={PLOT_LEFT} y={VOLUME_BOTTOM + 17} className="volume-label">VOL</text>
      </svg>

      <p className="chart-axis-hint">
        {rulerEnabled ? "Régua ativa: clique em dois pontos do gráfico para medir a amplitude em pontos. Clique em Régua novamente para cancelar." : entryPlacementEnabled ? "Consulte o ícone de informação para ver os gestos de interação com o gráfico." : "Arraste dentro da área dos candles para mover o gráfico na horizontal e vertical. Arraste o eixo de preços (à direita) para ajustar o zoom vertical e o eixo de horários (embaixo) para ajustar o zoom horizontal."}
      </p>
      {rulerStart && <p className="ruler-readout" role="status">
        {rulerEnd
          ? `Amplitude medida: ${formatPrice(Math.abs(rulerEnd.price - rulerStart.price), asset)} pontos · de ${formatPrice(rulerStart.price, asset)} até ${formatPrice(rulerEnd.price, asset)}`
          : `Ponto inicial: ${formatPrice(rulerStart.price, asset)} · selecione o segundo ponto`}
      </p>}
      {contextCandles.length > 0 && <p className="chart-context-note">
        {candles.length === 0
          ? "Contexto do pregão anterior: os últimos candles disponíveis e seu fechamento permanecem visíveis antes do primeiro negócio do treino."
          : "Os candles anteriores são apenas contexto visual; o replay continua revelando somente os negócios do pregão selecionado."}
      </p>}
    </div>
  );
}

function PriceLine({
  y,
  label,
  className,
  interactive = false,
  blockDrag = false,
  onMouseDown,
}: {
  y: number;
  label: string;
  className: string;
  interactive?: boolean;
  blockDrag?: boolean;
  onMouseDown?: (event: ReactMouseEvent<SVGLineElement>) => void;
}) {
  return <g>
    {(interactive || blockDrag) && <line
      x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={y} y2={y}
      stroke="transparent" strokeWidth="16" pointerEvents="stroke"
      className="oco-drag-hitbox"
      onMouseDown={interactive ? onMouseDown : (event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    />}
    <line x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={y} y2={y} className={className} pointerEvents="none" />
    <text x={PLOT_RIGHT - 8} y={y - 5} textAnchor="end" className="price-label" pointerEvents="none">{label}</text>
  </g>;
}
