import type { Position, Trade } from '../types';
import { grossResultBRL } from './marketSpecs';
import { marketTimestampOrdinalMs } from './marketTime';
import { EXIT_TIME_LIMIT_MS, LEVEL_PROMOTION_MIN_GOOD_RATE, LEVEL_PROMOTION_WINDOW, MAX_RISK_PER_TRADE_PCT } from './disciplineConfig';
export type StopLevel = 1 | 2 | 3;
export type Verdict = 'GOOD_LOSS' | 'GOOD_WIN' | 'BAD_LOSS' | 'BAD_WIN';
export interface DisciplineState {
  level: StopLevel; capitalBRL: number; plannedLossBRL: number; initialContracts: number;
  stopWidened: boolean; addedWhileLosing: boolean; maximumRiskPct: number;
  stopTouchedAt: { monotonicMs: number; simulatedMs: number } | null;
}
export interface RuleResult { id: string; label: string; status: 'PASS' | 'FAIL' | 'NA' }
export interface DisciplineResult extends DisciplineState {
  rules: RuleResult[]; verdict: Verdict; score: number;
  exitDelayMs: number | null; simulatedExitDelayMs: number | null;
  delayCostBRL: number; delayCostR: number;
}
export interface DisciplineClock { now(): number }
export const VERDICTS: Record<Verdict, string> = {
  GOOD_LOSS: 'Bom trade: perda disciplinada', GOOD_WIN: 'Bom trade: ganho disciplinado',
  BAD_LOSS: 'Mau trade: perda com violação', BAD_WIN: 'Mau trade: ganho com violação',
};
export function beginDiscipline(position: Position, level: StopLevel, capitalBRL: number): Position {
  if (!Number.isFinite(capitalBRL) || capitalBRL <= 0 || ![1,2,3].includes(level)) throw new Error('Informe um capital positivo para o treino de disciplina.');
  const plannedLossBRL = grossResultBRL(position.asset, Math.abs(position.entry - position.stopLoss), position.contracts);
  return { ...position, discipline: { level, capitalBRL, plannedLossBRL, initialContracts: position.contracts,
    maximumRiskPct: plannedLossBRL / capitalBRL * 100, stopWidened: false, addedWhileLosing: false, stopTouchedAt: null } };
}
export function touchDiscipline(position: Position, low: number, high: number, timestamp: string, clock: DisciplineClock): Position {
  const d = position.discipline;
  if (!d || d.stopTouchedAt || !(position.side === 'BUY' ? low <= position.stopLoss : high >= position.stopLoss)) return position;
  return { ...position, discipline: { ...d, stopTouchedAt: { monotonicMs: clock.now(), simulatedMs: marketTimestampOrdinalMs(timestamp) } } };
}
/** Called whenever a stop or size is changed. Violations remain sticky. */
export function trackDisciplineChange(previous: Position, next: Position, marketPrice: number): Position {
  const d = previous.discipline;
  if (!d) return next;
  const sign = previous.side === 'BUY' ? 1 : -1;
  const risk = grossResultBRL(next.asset, Math.max(0, sign * (next.entry - next.stopLoss)), next.contracts);
  return { ...next, discipline: { ...d,
    maximumRiskPct: Math.max(d.maximumRiskPct, risk / d.capitalBRL * 100),
    stopWidened: d.stopWidened || sign * (next.stopLoss - previous.stopLoss) < 0,
    addedWhileLosing: d.addedWhileLosing || (next.contracts > previous.contracts && sign * (marketPrice - previous.entry) < 0) } };
}
interface RuleContext { state: DisciplineState; exitDelayMs: number | null }
export const DISCIPLINE_RULES: readonly { id: string; label: string; check(c: RuleContext): RuleResult['status'] }[] = [
  { id: 'R1', label: `Risco dentro de ${MAX_RISK_PER_TRADE_PCT}% do capital`, check: ({state}) => state.maximumRiskPct <= MAX_RISK_PER_TRADE_PCT + 1e-9 ? 'PASS' : 'FAIL' },
  { id: 'R2', label: 'Stop nunca afastado', check: ({state}) => state.stopWidened ? 'FAIL' : 'PASS' },
  { id: 'R3', label: 'Saída dentro do limite', check: ({state,exitDelayMs}) => state.level === 1 || !state.stopTouchedAt ? 'NA' : exitDelayMs !== null && exitDelayMs <= EXIT_TIME_LIMIT_MS ? 'PASS' : 'FAIL' },
  { id: 'R4', label: 'Sem aumentar posição perdedora', check: ({state}) => state.addedWhileLosing ? 'FAIL' : 'PASS' },
];
export function classifyDiscipline(rules: readonly RuleResult[], pnl: number): Verdict {
  return rules.every(r => r.status !== 'FAIL') ? pnl >= 0 ? 'GOOD_WIN' : 'GOOD_LOSS' : pnl >= 0 ? 'BAD_WIN' : 'BAD_LOSS';
}
export function finishDiscipline(position: Position, trade: Trade, clock: DisciplineClock): Trade {
  const d = position.discipline;
  if (!d) return trade;
  const measured = d.level !== 1 && d.stopTouchedAt && trade.exitReason === 'MANUAL_STOP';
  const exitDelayMs = measured ? Math.max(0, clock.now() - d.stopTouchedAt!.monotonicMs) : null;
  const simulatedExitDelayMs = measured ? Math.max(0, marketTimestampOrdinalMs(trade.closedAt) - d.stopTouchedAt!.simulatedMs) : null;
  const rules = DISCIPLINE_RULES.map(r => ({ id: r.id, label: r.label, status: r.check({ state: d, exitDelayMs }) }));
  // R is geometric risk; costs/slippage remain in the separate financial result.
  const delayCostBRL = -trade.grossResultBRL - d.plannedLossBRL;
  return { ...trade, discipline: { ...d, rules, verdict: classifyDiscipline(rules, trade.netResultBRL),
    score: rules.filter(r => r.status !== 'FAIL').length / rules.length,
    exitDelayMs, simulatedExitDelayMs, delayCostBRL, delayCostR: delayCostBRL / d.plannedLossBRL } };
}
export function liveDisciplineCost(position: Position, marketPrice: number) {
  const sign = position.side === 'BUY' ? 1 : -1;
  const loss = -grossResultBRL(position.asset, sign * (marketPrice - position.entry), position.contracts);
  const brl = Math.max(0, loss - (position.discipline?.plannedLossBRL ?? 0));
  return { brl, r: brl / (position.discipline?.plannedLossBRL || 1) };
}
export function disciplineStats(trades: readonly Trade[], level?: StopLevel) {
  const results = trades.filter(t => t.discipline && (level === undefined || t.discipline.level === level))
    .slice().sort((a,b) => a.closedAt.localeCompare(b.closedAt) || a.id.localeCompare(b.id)).map(t => ({ trade: t, d: t.discipline! }));
  const recent = results.slice(-LEVEL_PROMOTION_WINDOW);
  const good = (r: typeof results[number]) => r.d.rules.every(rule => rule.status !== 'FAIL');
  const rate = (rows: typeof results) => rows.length ? rows.filter(good).length / rows.length : null;
  let streak = 0, best = 0;
  const matrix: Record<Verdict, number> = { GOOD_LOSS: 0, GOOD_WIN: 0, BAD_LOSS: 0, BAD_WIN: 0 };
  const violations = DISCIPLINE_RULES.map(r => ({ ...r, count: results.filter(t => t.d.rules.some(s => s.id === r.id && s.status === 'FAIL')).length })).sort((a,b) => b.count - a.count);
  for(const r of results) { matrix[r.d.verdict]++; streak = good(r) ? streak + 1 : 0; best = Math.max(best,streak); }
  const touched = recent.filter(r => r.d.level !== 1 && r.d.stopTouchedAt);
  const delays = touched.flatMap(r => r.d.exitDelayMs === null ? [] : [r.d.exitDelayMs]).sort((a,b) => a-b);
  const quantile = (p: number) => { if(!delays.length) return null; const i=(delays.length-1)*p; return delays[Math.floor(i)] + (delays[Math.ceil(i)]-delays[Math.floor(i)])*(i-Math.floor(i)); };
  return { total: results.length, goodRate: rate(results), recentRate: rate(recent), count: recent.length, streak, best, matrix, violations,
    canPromote: level !== undefined && level < 3 && recent.length === LEVEL_PROMOTION_WINDOW && rate(recent)! >= LEVEL_PROMOTION_MIN_GOOD_RATE,
    median: quantile(.5), p90: quantile(.9), withinLimit: touched.length ? delays.filter(d => d <= EXIT_TIME_LIMIT_MS).length / touched.length : null,
    meanCost: touched.length ? touched.reduce((s,r) => s+r.d.delayCostBRL,0)/touched.length : null,
    meanCostR: touched.length ? touched.reduce((s,r) => s+r.d.delayCostR,0)/touched.length : null,
    missing: touched.length-delays.length,
    indisciplineCost: results.filter(r => !good(r)).reduce((s,r) => s+Math.max(0,r.d.delayCostBRL),0),
    badWinProfit: results.filter(r => r.d.verdict === 'BAD_WIN').reduce((s,r) => s+r.trade.netResultBRL,0) };
}
