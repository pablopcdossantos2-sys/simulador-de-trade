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
  const levelDescriptions: Record<StopLevel, string> = {
    1: 'O sistema executa o stop automaticamente. Observe o cumprimento do risco planejado.',
    2: 'Você executa a saída com alerta visível, cronômetro e custo da demora em tempo real.',
    3: 'Você executa a saída com a linha do stop e o cronômetro discretos, sem som.',
  };
  return (
    <section className="card discipline-panel" aria-labelledby="discipline-title">
      <div className="discipline-heading">
        <div><h2 id="discipline-title">Disciplina · processo de execução</h2>
          <p>A qualidade depende das regras cumpridas, inclusive nas operações com perda.</p></div>
        <span className={`discipline-status ${p.enabled ? 'is-active' : ''}`}>{p.enabled ? 'Treino ativado' : 'Treino desativado'}</span>
      </div>

      <div className="discipline-setup-layout">
        <div className="discipline-settings">
          <label className="discipline-toggle"><input type="checkbox" checked={p.enabled} disabled={locked} onChange={e=>onChange({...p,enabled:e.target.checked})}/>
            <span><strong>Treinar stop em níveis e registrar disciplina</strong><small>Defina o capital e o nível antes de iniciar a sessão.</small></span>
          </label>
          <div className="discipline-fields">
            <label>Capital para risco (R$)<input type="number" min="0.01" step="any" value={p.capital} disabled={locked} onChange={e=>onChange({...p,capital:Number(e.target.value)})}/></label>
            <label>Nível de stop<select disabled={locked} value={p.level} onChange={e=>onChange({...p,level:Number(e.target.value) as StopLevel})}>
              {([1,2,3] as const).map(l=><option key={l} value={l} disabled={l>p.unlocked}>{l} · {l===1?'Automático':l===2?'Manual com alerta':'Manual discreto'}</option>)}
            </select></label>
          </div>
          <p className="discipline-level-description">{levelDescriptions[p.level]}</p>
          {p.level===2 && <fieldset className="discipline-alert-options"><legend>Alertas opcionais</legend>
            <label><input type="checkbox" disabled={locked} checked={p.soundEnabled===true} onChange={e=>onChange({...p,soundEnabled:e.target.checked})}/> Som no toque do stop</label>
            <label><input type="checkbox" disabled={locked} checked={p.vibrationEnabled===true} onChange={e=>onChange({...p,vibrationEnabled:e.target.checked})}/> Vibração, se suportada</label>
          </fieldset>}
          {locked && <small className="discipline-locked-note">Configuração bloqueada durante o treino. Finalize a sessão para alterar.</small>}
        </div>

        <div className="discipline-progress">
          <div className="discipline-progress-heading"><h3>Progresso no nível {p.level}</h3><span>{level.count}/{LEVEL_PROMOTION_WINDOW} trades</span></div>
          <progress max={LEVEL_PROMOTION_WINDOW} value={level.count} aria-label="Trades na janela de progressão" />
          <div className="discipline-progress-rate"><strong>{pct(level.recentRate)}</strong><span>bons trades nesta janela</span></div>
          <p>Avanço com {pct(LEVEL_PROMOTION_MIN_GOOD_RATE)} bons na janela completa, por confirmação.</p>
          {level.canPromote && <button className="planner-apply" disabled={locked} onClick={()=>onChange({...p,level:(p.level+1) as StopLevel,unlocked:Math.max(p.unlocked,p.level+1) as StopLevel})}>Confirmar avanço para o nível {p.level+1}</button>}
          {p.level===3 && <small>Último nível disponível. Você pode continuar praticando ou retornar a um nível anterior.</small>}
        </div>
      </div>

      {p.level>1 && <dl className="discipline-timing">
        <div><dt>Tempo mediano</dt><dd>{level.median===null?'—':time(level.median)}</dd></div>
        <div><dt>Percentil 90</dt><dd>{level.p90===null?'—':time(level.p90)}</dd></div>
        <div><dt>Saídas em até {EXIT_TIME_LIMIT_MS/1000}s</dt><dd>{pct(level.withinLimit)}</dd></div>
        <div><dt>Custo médio da demora</dt><dd>{level.meanCost===null?'—':brl(level.meanCost)}</dd><small>{level.meanCostR===null?'—':`${level.meanCostR.toFixed(2)}R`}</small></div>
        <div><dt>Sem saída manual</dt><dd>{level.missing}</dd></div>
      </dl>}

      <div className="discipline-score-heading"><h3>Placar de disciplina</h3><span>{stats.total} trades com medição</span></div>
      <dl className="discipline-metrics">
        <div className="discipline-metric-main"><dt>Bons trades · total</dt><dd>{pct(stats.goodRate)}</dd></div>
        <div><dt>Últimos {LEVEL_PROMOTION_WINDOW}</dt><dd>{pct(stats.recentRate)}</dd></div>
        <div><dt>Sequência atual</dt><dd>{stats.streak}</dd><small>bons trades consecutivos</small></div>
        <div><dt>Melhor sequência</dt><dd>{stats.best}</dd><small>bons trades consecutivos</small></div>
      </dl>

      <div className="discipline-breakdown">
        <div><h4>Processo × resultado</h4><div className="discipline-table-wrap"><table>
          <thead><tr><th scope="col">Regras</th><th scope="col">Ganho ou zero</th><th scope="col">Perda</th></tr></thead>
          <tbody><tr><th scope="row">Cumpridas</th><td className="discipline-good-cell">{stats.matrix.GOOD_WIN}</td><td className="discipline-good-cell">{stats.matrix.GOOD_LOSS}</td></tr><tr><th scope="row">Violadas</th><td>{stats.matrix.BAD_WIN}</td><td>{stats.matrix.BAD_LOSS}</td></tr></tbody>
        </table></div><p className="discipline-matrix-note">Uma perda com regras cumpridas conta como bom trade.</p></div>
        <div><h4>Violações por regra</h4><ul className="discipline-ranking">{stats.violations.map(r=><li key={r.id}><span className="discipline-rule-id">{r.id}</span><span>{r.label}</span><strong>{r.count}</strong></li>)}</ul></div>
      </div>
      <div className="discipline-costs"><div><span>Custo da indisciplina</span><strong>{brl(stats.indisciplineCost)}</strong><small>Excesso de perda positivo nos trades com violação.</small></div><div><span>Lucro de mau trade</span><strong>{brl(stats.badWinProfit)}</strong><small>Ganhos com violação não contam para a progressão.</small></div></div>
      <details className="discipline-method"><summary>Como as métricas são calculadas</summary><p>Somente trades com medição registrada. Histórico anterior não é reclassificado. Métricas de tempo/custo: últimos {LEVEL_PROMOTION_WINDOW} do nível; tempos consideram cliques após toque, ausências contam fora do limite. Custo médio mantém o sinal.</p></details>
    </section>
  );
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
