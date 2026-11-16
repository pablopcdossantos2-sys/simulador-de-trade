import { describe, expect, it } from "vitest";
import type {
  SessionPerformance,
  Trade,
  TrainingEvent,
  TrainingSession,
} from "../types";
import {
  buildCompleteSessionExport,
  sessionTradesToCsv,
} from "./reportExport";

const session: TrainingSession = {
  id: "s1",
  asset: "WINFUT",
  tradeDate: "2026-10-14",
  startTime: "09:00",
  endTime: "12:00",
  timeframeMinutes: 2,
  warmupBars: 260,
  mode: "FREE",
  startedAt: "2026-10-16T12:00:00Z",
  endedAt: "2026-10-16T13:00:00Z",
  status: "ENDED",
};

const trade: Trade = {
  id: "t1",
  asset: "WINFUT",
  side: "BUY",
  signalId: "sig1",
  requestedEntry: 130000,
  entry: 130000,
  stopLoss: 129900,
  target: 130150,
  contracts: 1,
  slippageTicksPerSide: 0,
  costPerContractRoundTripBRL: 1,
  intrabarPolicy: "STOP_FIRST",
  openedAt: "2026-10-14T09:10:00",
  status: "CLOSED",
  exitPrice: 130150,
  exitReason: "TARGET",
  closedAt: "2026-10-14T09:20:00",
  resultPoints: 150,
  grossResultBRL: 30,
  operationalCostsBRL: 1,
  netResultBRL: 29,
  postTradeNote: 'Boa execução, sem "hesitação".',
  entryContext: null,
};

const event: TrainingEvent = {
  id: "e1",
  sessionId: "s1",
  type: "TRADE_CLOSED",
  timestamp: "2026-10-16T12:20:00Z",
  marketTimestamp: trade.closedAt,
  signalId: trade.signalId,
  side: trade.side,
  reason: "TARGET",
  tradeId: trade.id,
};

const performance = {
  totalTrades: 1,
  wins: 1,
  losses: 0,
  winRatePct: 100,
  netPoints: 150,
  averagePoints: 150,
  averageWinPoints: 150,
  averageLossPoints: 0,
  payoff: null,
  profitFactor: null,
  bestTradePoints: 150,
  worstTradePoints: 150,
  buyTrades: 1,
  sellTrades: 0,
  buyNetPoints: 150,
  sellNetPoints: 0,
  totalR: 1.5,
  expectancyR: 1.5,
  maxDrawdownPoints: 0,
  grossResultBRL: 30,
  operationalCostsBRL: 1,
  netResultBRL: 29,
  blockedAttempts: 0,
  technicalIssues: 0,
  ignoredSignals: 0,
  signalAdherencePct: 100,
  executionAdherencePct: 100,
} satisfies SessionPerformance;

describe("exportação de relatório por sessão", () => {
  it("gera bundle JSON versionado e autocontido", () => {
    const bundle = buildCompleteSessionExport({
      session,
      performance,
      events: [event],
      trades: [trade],
    });

    expect(bundle.format).toBe("simulador-de-trade-session-report");
    expect(bundle.schemaVersion).toBe(2);
    expect(bundle.session.id).toBe("s1");
    expect(bundle.performance.netResultBRL).toBe(29);
    expect(bundle.setupPerformance).toEqual([
      {
        setup: "Legado / sem classificação",
        trades: 1,
        wins: 1,
        losses: 0,
        winRatePct: 100,
        netPoints: 150,
        netResultBRL: 29,
      },
    ]);
    expect(bundle.trades[0].postTradeNote).toContain("hesitação");
  });

  it("gera CSV compatível com Excel pt-BR e protege fórmulas", () => {
    const csv = sessionTradesToCsv(session, [
      { ...trade, postTradeNote: '=HYPERLINK("https://example.com")' },
    ]);

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("session_id;trade_date;asset");
    expect(csv).toContain("setup");
    expect(csv).toContain("Legado / sem classificação");
    expect(csv).toContain("intrabar_policy");
    expect(csv).toContain("indicator_version");
    expect(csv).toContain("strategy_id");
    expect(csv).toContain("MULTI_MEDIAS");
    expect(csv).toContain("STOP_FIRST");
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toContain("entry_context");
  });
});

it("identifica a estratégia 02 em CSV e JSON da sessão", () => {
  const second = { ...session, strategyId: "MTF_ANGULACAO" as const };
  const csv = sessionTradesToCsv(second, [trade]);
  const headings = csv.split("\r\n")[0];
  const row = csv.split("\r\n")[1];
  const column = headings.replace("\uFEFF", "").split(";").indexOf("strategy_id");
  expect(column).toBeGreaterThan(0);
  expect(row.split(";")[column]).toBe("MTF_ANGULACAO");
  const json = buildCompleteSessionExport({
    session: second, performance, events: [event], trades: [trade],
  });
  expect(json.session.strategyId).toBe("MTF_ANGULACAO");
});

// As configurações personalizadas pertencem ao relatório histórico, não apenas
// à preferência local da interface.
it("inclui snapshot dos períodos no CSV e no relatório JSON", () => {
  const chosen = {
    multiMedias: { emaFastLength: 5, wmaLength: 12, emaSlowLength: 30 },
    mtf: { periods: [10, 24, 60, 250] as [number, number, number, number] },
  };
  const trained = { ...session, strategyAverages: chosen };
  const csv = sessionTradesToCsv(trained, [trade]);
  expect(csv).toContain("moving_average_periods");
  expect(csv).toContain('""emaFastLength"":5');
  const complete = buildCompleteSessionExport({
    session: trained, performance, events: [event], trades: [trade],
  });
  expect(complete.session.strategyAverages).toEqual(chosen);
});
