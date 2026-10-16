import type {
  Candle,
  IndicatorEvaluation,
  IndicatorPoint,
  Position,
} from "../types";

interface Props {
  candles: Candle[];
  evaluation: IndicatorEvaluation;
  position: Position | null;
}

const WIDTH = 980;
const HEIGHT = 420;
const PAD = 28;

function buildLinePath(
  visible: Candle[],
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

    const command = drawing ? "L" : "M";
    path += `${command} ${xForIndex(idx)} ${y(value)} `;
    drawing = true;
  });

  return path.trim();
}

export function CandleChart({ candles, evaluation, position }: Props) {
  const visible = candles.slice(-48);
  if (!visible.length) return null;

  const firstIndex = visible[0].index;
  const pointMap = new Map(
    evaluation.series
      .filter((point) => point.candleIndex >= firstIndex)
      .map((point) => [point.candleIndex, point]),
  );

  const extraPrices = position
    ? [position.stopLoss, position.target, position.entry]
    : [];

  const indicatorPrices = Array.from(pointMap.values()).flatMap((point) =>
    [point.wma20, point.vwap, point.ema8, point.ema52].filter(
      (value): value is number => value !== null && Number.isFinite(value),
    ),
  );

  const min = Math.min(
    ...visible.map((candle) => candle.low),
    ...indicatorPrices,
    ...extraPrices,
  );
  const max = Math.max(
    ...visible.map((candle) => candle.high),
    ...indicatorPrices,
    ...extraPrices,
  );
  const range = Math.max(max - min, 1);
  const xStep = (WIDTH - PAD * 2) / Math.max(visible.length, 1);
  const xForIndex = (idx: number) => PAD + idx * xStep + xStep / 2;
  const y = (price: number) =>
    HEIGHT - PAD - ((price - min) / range) * (HEIGHT - PAD * 2);

  const wmaPath = buildLinePath(
    visible,
    pointMap,
    xForIndex,
    y,
    (point) => point.wma20,
  );
  const vwapPath = buildLinePath(
    visible,
    pointMap,
    xForIndex,
    y,
    (point) => point.vwap,
  );
  const ema8Path = buildLinePath(
    visible,
    pointMap,
    xForIndex,
    y,
    (point) => point.ema8,
  );
  const ema52Path = buildLinePath(
    visible,
    pointMap,
    xForIndex,
    y,
    (point) => point.ema52,
  );

  const visibleSignals = evaluation.signals.filter(
    (signal) => signal.candleIndex >= firstIndex,
  );

  return (
    <div className="chart-shell">
      <div className="indicator-legend" aria-label="Legenda do indicador">
        <span className="legend-wma">MMP 20</span>
        <span className="legend-vwap">VWAP</span>
        <span className="legend-ema8">MME 8</span>
        <span className="legend-ema52">MME 52</span>
      </div>

      <svg
        className="chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Gráfico de candles com Multi Médias, VWAP, nuvem e sinais"
      >
        <rect width={WIDTH} height={HEIGHT} className="chart-bg" />

        {[0.25, 0.5, 0.75].map((ratio) => (
          <line
            key={ratio}
            x1={PAD}
            x2={WIDTH - PAD}
            y1={PAD + (HEIGHT - PAD * 2) * ratio}
            y2={PAD + (HEIGHT - PAD * 2) * ratio}
            className="grid-line"
          />
        ))}

        {visible.slice(1).map((candle, idx) => {
          const previous = visible[idx];
          const currentPoint = pointMap.get(candle.index);
          const previousPoint = pointMap.get(previous.index);

          if (
            !currentPoint ||
            !previousPoint ||
            currentPoint.zone === "NONE" ||
            currentPoint.zone !== previousPoint.zone
          ) {
            return null;
          }

          const x0 = xForIndex(idx);
          const x1 = xForIndex(idx + 1);
          const points = [
            `${x0},${y(previousPoint.ema8)}`,
            `${x1},${y(currentPoint.ema8)}`,
            `${x1},${y(currentPoint.ema52)}`,
            `${x0},${y(previousPoint.ema52)}`,
          ].join(" ");

          return (
            <polygon
              key={`cloud-${candle.index}`}
              points={points}
              className={
                currentPoint.zone === "GREEN"
                  ? "indicator-cloud-green"
                  : "indicator-cloud-red"
              }
            />
          );
        })}

        {visible.map((candle, idx) => {
          const x = xForIndex(idx);
          const bullish = candle.close >= candle.open;
          const bodyTop = y(Math.max(candle.open, candle.close));
          const bodyBottom = y(Math.min(candle.open, candle.close));

          return (
            <g key={candle.index}>
              <line
                x1={x}
                x2={x}
                y1={y(candle.high)}
                y2={y(candle.low)}
                className={bullish ? "candle-up" : "candle-down"}
              />
              <rect
                x={x - Math.max(2, xStep * 0.27)}
                width={Math.max(4, xStep * 0.54)}
                y={bodyTop}
                height={Math.max(2, bodyBottom - bodyTop)}
                className={bullish ? "candle-up-fill" : "candle-down-fill"}
                rx="1"
              />
            </g>
          );
        })}

        {wmaPath && <path d={wmaPath} className="indicator-wma-line" />}
        {vwapPath && <path d={vwapPath} className="indicator-vwap-line" />}
        {ema8Path && <path d={ema8Path} className="indicator-ema8-line" />}
        {ema52Path && <path d={ema52Path} className="indicator-ema52-line" />}

        {position && (
          <>
            <PriceLine
              y={y(position.entry)}
              label={`Entrada ${position.entry}`}
              className="entry-line"
            />
            <PriceLine
              y={y(position.stopLoss)}
              label={`Stop ${position.stopLoss}`}
              className="stop-line"
            />
            <PriceLine
              y={y(position.target)}
              label={`Alvo ${position.target}`}
              className="target-line"
            />
          </>
        )}

        {visibleSignals.map((signal) => {
          const idx = visible.findIndex(
            (candle) => candle.index === signal.candleIndex,
          );
          if (idx < 0) return null;

          const candle = visible[idx];
          const x = xForIndex(idx);
          const isBuy = signal.side === "BUY";
          const markerY = isBuy
            ? Math.min(HEIGHT - PAD - 9, y(candle.low) + 23)
            : Math.max(PAD + 9, y(candle.high) - 23);

          return (
            <g key={signal.id}>
              <circle
                cx={x}
                cy={markerY}
                r="9"
                className={isBuy ? "signal-buy" : "signal-sell"}
              />
              <text
                x={x}
                y={isBuy ? markerY + 25 : markerY - 15}
                textAnchor="middle"
                className="signal-label"
              >
                {signal.label.toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function PriceLine({
  y,
  label,
  className,
}: {
  y: number;
  label: string;
  className: string;
}) {
  return (
    <g>
      <line x1={PAD} x2={WIDTH - PAD} y1={y} y2={y} className={className} />
      <text
        x={WIDTH - PAD - 4}
        y={y - 5}
        textAnchor="end"
        className="price-label"
      >
        {label}
      </text>
    </g>
  );
}
