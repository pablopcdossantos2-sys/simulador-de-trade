import { CandleChart } from "./CandleChart";
import type {
  IndicatorEvaluation,
  Position,
  Trade,
} from "../types";

interface Props {
  trade: Trade;
}

function formatTimestamp(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}:\d{2})/);
  if (!match) return value;

  return `${match[3]}/${match[2]}/${match[1]} · ${match[4]}`;
}

export function EntryContextPreview({ trade }: Props) {
  const context = trade.entryContext;

  if (!context) {
    return (
      <div className="entry-context-empty">
        Contexto gráfico não disponível para este trade antigo.
      </div>
    );
  }

  const evaluation: IndicatorEvaluation = {
    authorization: context.signal,
    signals: context.signals,
    series: context.indicatorSeries,
    zone: context.zone,
  };

  const position: Position = {
    id: trade.id,
    asset: trade.asset,
    side: trade.side,
    signalId: trade.signalId,
    openedCandleIndex: context.candleIndex,
    requestedEntry: trade.requestedEntry,
    entry: trade.entry,
    stopLoss: trade.stopLoss,
    target: trade.target,
    contracts: trade.contracts,
    slippageTicksPerSide: trade.slippageTicksPerSide,
    costPerContractRoundTripBRL: trade.costPerContractRoundTripBRL,
    entryContext: context,
    openedAt: trade.openedAt,
    status: "OPEN",
  };

  return (
    <div className="entry-context-preview">
      <div className="entry-context-head">
        <div>
          <span>Contexto capturado na entrada</span>
          <strong>
            {context.asset} · {context.signal.label} · {context.zone}
          </strong>
        </div>
        <small>{formatTimestamp(context.marketTimestamp)}</small>
      </div>

      <CandleChart
        candles={context.candles}
        evaluation={evaluation}
        position={position}
      />

      <div className="entry-context-meta">
        <span>{context.candles.length} candles visíveis</span>
        <span>Preço {context.currentPrice}</span>
        <span>Snapshot {formatTimestamp(context.capturedAt)}</span>
      </div>
    </div>
  );
}
