export interface MarketTimestampParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

const MARKET_TIMESTAMP_RE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(?:Z|[+-]\d{2}:\d{2})?$/;

export function parseMarketTimestamp(
  value: string,
): MarketTimestampParts {
  const match = value.trim().match(MARKET_TIMESTAMP_RE);
  if (!match) {
    throw new Error(`Timestamp de mercado inválido: ${value}`);
  }

  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    fraction = "0",
  ] = match;

  const parts: MarketTimestampParts = {
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
    hour: Number(hourText),
    minute: Number(minuteText),
    second: Number(secondText),
    millisecond: Number(fraction.padEnd(3, "0")),
  };

  const pseudoUtc = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond,
    ),
  );

  if (
    pseudoUtc.getUTCFullYear() !== parts.year ||
    pseudoUtc.getUTCMonth() + 1 !== parts.month ||
    pseudoUtc.getUTCDate() !== parts.day ||
    pseudoUtc.getUTCHours() !== parts.hour ||
    pseudoUtc.getUTCMinutes() !== parts.minute ||
    pseudoUtc.getUTCSeconds() !== parts.second
  ) {
    throw new Error(`Timestamp de mercado inválido: ${value}`);
  }

  return parts;
}

export function marketTimestampOrdinalMs(value: string): number {
  const parts = parseMarketTimestamp(value);
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );
}

function two(value: number): string {
  return String(value).padStart(2, "0");
}

export function marketTimestampFromOrdinalMs(value: number): string {
  const date = new Date(value);
  return [
    `${date.getUTCFullYear()}-${two(date.getUTCMonth() + 1)}-${two(date.getUTCDate())}`,
    `${two(date.getUTCHours())}:${two(date.getUTCMinutes())}:${two(date.getUTCSeconds())}`,
  ].join("T");
}

export function bucketMarketTimestamp(
  timestamp: string,
  intervalSeconds: number,
): string {
  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
    throw new Error("O intervalo do replay precisa ser maior que zero.");
  }

  const intervalMs = intervalSeconds * 1000;
  const ordinal = marketTimestampOrdinalMs(timestamp);
  return marketTimestampFromOrdinalMs(
    Math.floor(ordinal / intervalMs) * intervalMs,
  );
}

export function marketDateKey(timestamp: string): string {
  const parts = parseMarketTimestamp(timestamp);
  return `${parts.year}-${two(parts.month)}-${two(parts.day)}`;
}

export function marketMonthKey(timestamp: string): string {
  const parts = parseMarketTimestamp(timestamp);
  return `${parts.year}-${two(parts.month)}`;
}

export function marketYearKey(timestamp: string): string {
  return String(parseMarketTimestamp(timestamp).year);
}

export function marketIsoWeekKey(timestamp: string): string {
  const parts = parseMarketTimestamp(timestamp);
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${date.getUTCFullYear()}-W${two(week)}`;
}
