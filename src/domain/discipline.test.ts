import { describe, expect, it } from 'vitest';
import type { Position, TradeIntent, ReplayTrade } from '../types';
import { openPosition, resolveOcoTrade, resolveOco, closePositionManually, closePositionAtMarket } from './trading';
import { beginDiscipline, trackDisciplineChange, touchDiscipline, disciplineStats, type StopLevel } from './discipline';
const start='2026-11-18T10:00:00';
const intent:TradeIntent={asset:'WDOFUT',side:'BUY',entry:100,marketPrice:100,contracts:1,
 execution:{costPerContractRoundTripBRL:0,slippageTicksPerSide:0,intrabarPolicy:'STOP_FIRST'},
 candleIndex:0,oco:{stopLoss:98,target:110},signal:null,reentryAuthorized:true,reentrySide:'BUY',signalAlreadyUsed:false,hasOpenPosition:false};
function setup(level:StopLevel=2) { return beginDiscipline(openPosition(intent,start),level,10000); }
const quote=(price:number,timestamp='2026-11-18T10:00:01'):ReplayTrade=>({asset:'WDOFUT',timestamp,sequence:1,sourceRow:1,price,quantity:1});
function touched(level:StopLevel=2) { return touchDiscipline(setup(level),98,98,'2026-11-18T10:00:01',{now:()=>1000}); }
const rule=(t:ReturnType<typeof closePositionManually>,id:string)=>t.discipline!.rules.find(r=>r.id===id)!.status;
describe('disciplina integrada ao motor OCO existente',()=>{
 it('1. nível 1 executa no stop em −1R, inclusive gap; GOOD_LOSS',()=>{
  const p=setup(1), t=resolveOcoTrade(p,quote(97),{now:()=>1000})!;
  expect(t.exitPrice).toBe(98);expect(t.grossResultBRL).toBe(-t.discipline!.plannedLossBRL);
  expect(t.discipline!.verdict).toBe('GOOD_LOSS');expect(rule(t,'R3')).toBe('NA');expect(t.discipline!.exitDelayMs).toBeNull();
 });
 it('2. saída em 1,2 s é GOOD_LOSS e custa além do planejado',()=>{
  const p=touched();expect(resolveOcoTrade(p,quote(97.5),{now:()=>2200})).toBeNull();
  const t=closePositionManually(p,97.5,'2026-11-18T10:00:13',{now:()=>2200});
  expect(rule(t,'R3')).toBe('PASS');expect(t.discipline!.verdict).toBe('GOOD_LOSS');
  expect(t.discipline!.exitDelayMs).toBe(1200);expect(t.discipline!.simulatedExitDelayMs).toBe(12000);
  expect(t.discipline!.delayCostBRL).toBe(5);
 });
 it('3. saída em 8 s viola R3: BAD_LOSS',()=>{
  const t=closePositionManually(touched(),97,'2026-11-18T10:00:09',{now:()=>9000});
  expect(rule(t,'R3')).toBe('FAIL');expect(t.discipline!.verdict).toBe('BAD_LOSS');
 });
 it('4. stop 98→95 e ganho +2R mantém R2 violada: BAD_WIN',()=>{
  const p=setup();const moved=trackDisciplineChange(p,{...p,stopLoss:95},100);
  const t=closePositionManually(moved,104,'2026-11-18T10:00:02',{now:()=>2000});
  expect(t.grossResultBRL/t.discipline!.plannedLossBRL).toBe(2);expect(rule(t,'R2')).toBe('FAIL');expect(t.discipline!.verdict).toBe('BAD_WIN');
 });
 it('5. sem saída após toque, recuperação e alvo mantém BAD_WIN e atraso nulo',()=>{
  const p=touched(),recovered=touchDiscipline(p,101,101,'2026-11-18T10:00:02',{now:()=>1500});
  expect(recovered.discipline!.stopTouchedAt).toEqual(p.discipline!.stopTouchedAt);
  const t=resolveOcoTrade(recovered,quote(110,'2026-11-18T10:00:03'),{now:()=>2000})!;
  expect(t.exitReason).toBe('TARGET');expect(t.discipline!.exitDelayMs).toBeNull();expect(rule(t,'R3')).toBe('FAIL');expect(t.discipline!.verdict).toBe('BAD_WIN');
 });
 it('6. regras iguais, −1R ou +3R, pontuação igual',()=>{
  const p=setup(1);const a=resolveOcoTrade(p,quote(98))!,b=closePositionManually(p,106,'2026-11-18T10:00:02');
  expect(a.discipline!.score).toBe(b.discipline!.score);expect(a.discipline!.rules).toEqual(b.discipline!.rules);
 });
 it('7. sem stop ou lado incorreto é rejeitado pelo motor existente',()=>{
  expect(()=>openPosition({...intent,oco:{stopLoss:undefined as unknown as number,target:110}})).toThrow();
  expect(()=>openPosition({...intent,oco:{stopLoss:102,target:110}})).toThrow();
 });
 it('venda toca pela máxima do candle, nível 3 não fecha no stop',()=>{
  let p:Position=beginDiscipline(openPosition({...intent,side:'SELL',reentrySide:'SELL',oco:{stopLoss:102,target:90}},start),3,10000);
  p=touchDiscipline(p,99,102,'2026-11-18T10:00:01',{now:()=>0});
  expect(resolveOco(p,{index:1,timestamp:'2026-11-18T10:00:01',open:100,high:102,low:99,close:100,volume:1},undefined,{now:()=>0})).toBeNull();
  const t=closePositionManually(p,103,'2026-11-18T10:00:04',{now:()=>3000});expect(rule(t,'R3')).toBe('PASS');expect(t.discipline!.exitDelayMs).toBe(3000);
 });
 it('fim da sessão sem clique viola R3; ausência entra no denominador',()=>{
  const t=closePositionAtMarket(touched(),101,'2026-11-18T10:00:02',{now:()=>1200});
  expect(rule(t,'R3')).toBe('FAIL');expect(disciplineStats([t],2).withinLimit).toBe(0);expect(disciplineStats([t],2).missing).toBe(1);
 });
 it('trailing não viola, afastamento posterior permanece e aumento perdedor viola R4',()=>{
  let p=setup();p=trackDisciplineChange(p,{...p,stopLoss:99},101);expect(p.discipline!.stopWidened).toBe(false);
  p=trackDisciplineChange(p,{...p,stopLoss:98},101);p=trackDisciplineChange(p,{...p,stopLoss:99},101);
  p=trackDisciplineChange(p,{...p,contracts:2},99);const t=closePositionManually(p,104,'2026-11-18T10:00:02');
  expect(rule(t,'R2')).toBe('FAIL');expect(rule(t,'R4')).toBe('FAIL');expect(t.discipline!.plannedLossBRL).toBe(20);
 });
 it('R1 registra excesso de risco e progressão exige 20 por nível e 80% bons',()=>{
  const p=beginDiscipline(openPosition(intent,start),2,1000);expect(rule(closePositionManually(p,100,'2026-11-18T10:00:02'),'R1')).toBe('FAIL');
  const good=closePositionManually(setup(),100,'2026-11-18T10:00:02');
  const bad=closePositionManually(touched(),97,'2026-11-18T10:00:03',{now:()=>9000});
  const history=[...Array(16).fill(good),...Array(4).fill(bad)];
  expect(disciplineStats(history,2).canPromote).toBe(true);expect(disciplineStats(history.slice(1),2).canPromote).toBe(false);
  expect(disciplineStats(history,1).count).toBe(0);
  const stats=disciplineStats([good,bad],2);expect(stats.goodRate).toBe(.5);expect(stats.indisciplineCost).toBe(10);expect(stats.matrix.BAD_LOSS).toBe(1);
 });
 it('legado mantém execução, sem atribuir disciplina retroativamente',()=>{
  const p=openPosition(intent,start), t=resolveOcoTrade(p,quote(97))!;expect(t.exitPrice).toBe(97);expect(t.discipline).toBeUndefined();expect(disciplineStats([t]).total).toBe(0);
 });
});
