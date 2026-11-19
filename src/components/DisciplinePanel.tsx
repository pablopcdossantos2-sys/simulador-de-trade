import { useEffect, useState, useRef } from 'react';
import type { Position, Trade } from '../types';
import { disciplineStats, liveDisciplineCost, VERDICTS, type StopLevel } from '../domain/discipline';
import { EXIT_TIME_LIMIT_MS, LEVEL_PROMOTION_MIN_GOOD_RATE, LEVEL_PROMOTION_WINDOW } from '../domain/disciplineConfig';
const brl = (v: number) => v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const pct = (v: number | null) => v === null ? '—' : `${(v*100).toFixed(0)}%`;
const time = (v: number | null) => v === null ? 'Sem saída manual' : `${(v/1000).toFixed(2)} s`;
export interface DisciplinePreferences { enabled: boolean; level: StopLevel; capital: number; unlocked: StopLevel; soundEnabled?: boolean; vibrationEnabled?: boolean }
export const DISCIPLINE_KEY = 'simulador-de-trade:discipline:v1';
export function readDisciplinePreferences(): DisciplinePreferences {
  try { const p = JSON.parse(localStorage.getItem(DISCIPLINE_KEY) ?? 'null');
    if(p && typeof p.enabled === 'boolean' && [1,2,3].includes(p.level) && [1,2,3].includes(p.unlocked) && p.level <= p.unlocked && p.capital > 0 && Number.isFinite(p.capital)) return p;
  } catch { /* Fall back to unconfigured mode. */ }
  return { enabled:false,level:1,capital:10000,unlocked:1 };
}
export function DisciplinePanel({preferences:p,onChange,locked,trades}: {preferences:DisciplinePreferences;onChange:(p:DisciplinePreferences)=>void;locked:boolean;trades:Trade[]}) {
  const stats=disciplineStats(trades), level=disciplineStats(trades,p.level);
  return <section className="card discipline-panel"><h2>Disciplina · processo de execução</h2><p>A qualidade depende das regras cumpridas, inclusive nas operações com perda.</p>
    <label><input type="checkbox" checked={p.enabled} disabled={locked} onChange={e=>onChange({...p,enabled:e.target.checked})}/> Treinar stop em níveis e registrar disciplina</label>
    <div className="discipline-grid"><label>Capital para risco (R$)<input type="number" min="0.01" step="any" value={p.capital} disabled={locked} onChange={e=>onChange({...p,capital:Number(e.target.value)})}/></label><label>Nível de stop<select disabled={locked} value={p.level} onChange={e=>onChange({...p,level:Number(e.target.value) as StopLevel})}>{([1,2,3] as const).map(l=><option key={l} value={l} disabled={l>p.unlocked}>{l} · {l===1?'Automático':l===2?'Manual com alerta':'Manual discreto'}</option>)}</select></label></div>
    {p.level===2 && <div className="discipline-grid"><label><input type="checkbox" disabled={locked} checked={p.soundEnabled===true} onChange={e=>onChange({...p,soundEnabled:e.target.checked})}/> Som no toque do stop</label><label><input type="checkbox" disabled={locked} checked={p.vibrationEnabled===true} onChange={e=>onChange({...p,vibrationEnabled:e.target.checked})}/> Vibração, se suportada</label></div>}
    <p>{level.count}/{LEVEL_PROMOTION_WINDOW} trades no nível · {pct(level.recentRate)} bons. Avanço com {pct(LEVEL_PROMOTION_MIN_GOOD_RATE)} bons na janela completa, por confirmação.</p>
    {level.canPromote && <button disabled={locked} onClick={()=>onChange({...p,level:(p.level+1) as StopLevel,unlocked:Math.max(p.unlocked,p.level+1) as StopLevel})}>Confirmar avanço para o nível {p.level+1}</button>}
    {p.level>1 && <p>Mediana: {level.median===null?'—':time(level.median)} · p90: {level.p90===null?'—':time(level.p90)} · Dentro de {EXIT_TIME_LIMIT_MS/1000}s: {pct(level.withinLimit)} · Custo médio: {level.meanCost===null?'—':`${brl(level.meanCost)} / ${level.meanCostR!.toFixed(2)}R`} · Sem saída manual: {level.missing}</p>}
    <h3>Placar de disciplina</h3><div className="discipline-grid"><strong>Bons trades: {pct(stats.goodRate)}</strong><strong>Últimos {LEVEL_PROMOTION_WINDOW}: {pct(stats.recentRate)}</strong><span>Sequência atual: {stats.streak}</span><span>Melhor sequência: {stats.best}</span></div>
    <table><thead><tr><th>Regras</th><th>Ganho ou zero</th><th>Perda</th></tr></thead><tbody><tr><th>Cumpridas</th><td>{stats.matrix.GOOD_WIN}</td><td>{stats.matrix.GOOD_LOSS}</td></tr><tr><th>Violadas</th><td>{stats.matrix.BAD_WIN}</td><td>{stats.matrix.BAD_LOSS}</td></tr></tbody></table>
    <ul>{stats.violations.map(r=><li key={r.id}>{r.id} · {r.label}: {r.count}</li>)}</ul><p>Custo da indisciplina: {brl(stats.indisciplineCost)} · Lucro de mau trade: {brl(stats.badWinProfit)}</p>
    <small>Somente trades com medição registrada. Histórico anterior não é reclassificado. Métricas de tempo/custo: últimos {LEVEL_PROMOTION_WINDOW} do nível; tempos consideram cliques após toque, ausências contam fora do limite. Custo médio mantém o sinal.</small>
  </section>;
}
export function DisciplineExit({position,price,onExit,soundEnabled=false,vibrationEnabled=false}: {position:Position;price:number;onExit:()=>void;soundEnabled?:boolean;vibrationEnabled?:boolean}) {
  const [now,setNow]=useState(()=>performance.now());
  useEffect(()=>{ const timer=window.setInterval(()=>setNow(performance.now()),50); return ()=>clearInterval(timer); },[]);
  const d=position.discipline;
  const alerted = useRef<string | null>(null);
  useEffect(()=>{
    if(d?.level!==2 || !d.stopTouchedAt || alerted.current===position.id) return;
    alerted.current=position.id;
    if(vibrationEnabled && typeof navigator.vibrate==='function') navigator.vibrate([120,60,120]);
    if(soundEnabled && window.AudioContext) {
      try {
        const ctx=new AudioContext(), oscillator=ctx.createOscillator(), gain=ctx.createGain();
        oscillator.connect(gain); gain.connect(ctx.destination); oscillator.frequency.value=660;
        gain.gain.setValueAtTime(.08,ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.3);
        oscillator.start();oscillator.stop(ctx.currentTime+.3);oscillator.onended=()=>{void ctx.close();};
        void ctx.resume().catch(()=>undefined);
      } catch { /* Alert remains usable when audio is unavailable. */ }
    }
  },[position.id,d?.level,d?.stopTouchedAt,soundEnabled,vibrationEnabled]);
  if(!d || d.level===1 || !d.stopTouchedAt) return null;
  const cost=liveDisciplineCost(position,price);
  return <div className={d.level===2?'discipline-stop-alert':'discipline-stop-discreet'} role={d.level===2?'alert':undefined}>
    {d.level===2 && <p>Seu stop foi atingido. Você definiu esse ponto antes de entrar. Sair agora é seguir o plano.</p>}
    <span>Tempo desde o stop: {time(Math.max(0,now-d.stopTouchedAt.monotonicMs))} · Custo da demora: {cost.r.toFixed(2)}R / {brl(cost.brl)}</span>
    <button type="button" className="market-close-button" onClick={onExit}>SAIR AGORA</button>
  </div>;
}
export function DisciplineFeedback({trade}: {trade:Trade|null}) {
  if(!trade?.discipline) return null;
  const d=trade.discipline;
  return <section className="card discipline-feedback" aria-live="polite"><h2>{VERDICTS[d.verdict]}</h2>
    {d.level===1 && trade.exitReason==='STOP' && <p>Stop executado: {Math.abs(trade.grossResultBRL+d.plannedLossBRL)<1e-8?'perda planejada de 1R':`resultado de ${(trade.grossResultBRL/d.plannedLossBRL).toFixed(2)}R após ajustes do stop`}</p>}
    <ul>{d.rules.map(r=><li key={r.id}>{r.status==='FAIL'?'✗':'✓'} {r.id} · {r.label}{r.status==='NA'?' (não aplicável; cumprida)':''}</li>)}</ul>
    {d.level>1 && <p>Saída: {d.stopTouchedAt?time(d.exitDelayMs):'Stop não tocado'} · Tempo simulado: {d.simulatedExitDelayMs===null?'—':time(d.simulatedExitDelayMs)} · Custo da demora: {d.stopTouchedAt?`${d.delayCostR.toFixed(2)}R / ${brl(d.delayCostBRL)}`:'Não aplicável'}</p>}
    <details><summary>Resultado financeiro</summary><p>Líquido: {brl(trade.netResultBRL)} · 1R inicial: {brl(d.plannedLossBRL)} · Custos: {brl(trade.operationalCostsBRL)}</p></details>
  </section>;
}
