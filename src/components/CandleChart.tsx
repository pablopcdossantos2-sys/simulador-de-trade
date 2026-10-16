import type { Candle, IndicatorSignal, Position } from "../types";

interface Props {
  candles: Candle[];
  signal: IndicatorSignal | null;
  position: Position | null;
}

const WIDTH = 980;
const HEIGHT = 380;
const PAD = 26;

export function CandleChart({ candles, signal, position }: Props) {
  const visible = candles.slice(-48);
  if (!visible.length) return null;

  const extraPrices = position
    ? [position.stopLoss, position.target, position.entry]
    : [];
  const min = Math.min(...visible.map((c) => c.low), ...extraPrices);
  const max = Math.max(...visible.map((c) => c.high), ...extraPrices);
  const range = Math.max(max - min, 1);
  const xStep = (WIDTH - PAD * 2) / Math.max(visible.length, 1);
  const y = (price: number) =>
    HEIGHT - PAD - ((price - min) / range) * (HEIGHT - PAD * 2);

  const firstIndex = visible[0].index;
  const signalVisible =
    signal && signal.candleIndex >= firstIndex
      ? visible.find((c) => c.index === signal.candleIndex)
      : null;

  return (
    <div className="chart-shell">
      <svg
        className="chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Gráfico demonstrativo de candles"
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

        {visible.map((candle, idx) => {
          const x = PAD + idx * xStep + xStep / 2;
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

        {signalVisible && signal && (() => {
          const idx = visible.findIndex((c) => c.index === signalVisible.index);
          const x = PAD + idx * xStep + xStep / 2;
          const isBuy = signal.side === "BUY";
          const markerY = isBuy
            ? Math.min(HEIGHT - PAD - 10, y(signalVisible.low) + 25)
            : Math.max(PAD + 10, y(signalVisible.high) - 25);
          return (
            <g>
              <circle
                cx={x}
                cy={markerY}
                r="9"
                className={isBuy ? "signal-buy" : "signal-sell"}
              />
              <text
                x={x}
                y={markerY - 15}
                textAnchor="middle"
                className="signal-label"
              >
                {signal.label}
              </text>
            </g>
          );
        })()}
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
      <text x={WIDTH - PAD - 4} y={y - 5} textAnchor="end" className="price-label">
        {label}
      </text>
    </g>
  );
}
