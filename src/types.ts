export type Asset = "WINFUT" | "WDOFUT";
export type Side = "BUY" | "SELL";
export type SignalSide = Side | "NONE";
export type IndicatorZone = "GREEN" | "RED" | "NONE";
export type VwapAnchor = "Session" | "Week" | "Month" | "Year";

export interface Candle {
  index: number;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorSignal {
  id: string;
  asset: Asset;
  side: Side;
  candleIndex: number;
  timestamp: string;
  price: number;
  label: "Compra" | "Venda";
}

export interface IndicatorPoint {
  candleIndex: number;
  wma20: number | null;
  vwap: number | null;
  ema8: number;
  ema52: number;
  zone: IndicatorZone;
}

export interface IndicatorEvaluation {
  authorization: IndicatorSignal | null;
  signals: IndicatorSignal[];
  series: IndicatorPoint[];
  zone: IndicatorZone;
}

export interface OcoOrder {
  stopLoss: number;
  target: number;
}

export interface Position {
  id: string;
  asset: Asset;
  side: Side;
  signalId: string;
  openedCandleIndex: number;
  entry: number;
  stopLoss: number;
  target: number;
  openedAt: string;
  status: "OPEN";
}

export type ExitReason = "STOP" | "TARGET";

export interface Trade {
  id: string;
  asset: Asset;
  side: Side;
  signalId: string;
  entry: number;
  stopLoss: number;
  target: number;
  openedAt: string;
  status: "CLOSED";
  exitPrice: number;
  exitReason: ExitReason;
  closedAt: string;
  resultPoints: number;
}

export interface TradeIntent {
  asset: Asset;
  side: Side;
  entry: number;
  candleIndex: number;
  oco: OcoOrder;
  signal: IndicatorSignal | null;
  hasOpenPosition: boolean;
}
