import { describe,expect,it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DisciplinePanel, DisciplineFeedback, type DisciplinePreferences } from './DisciplinePanel';
import { beginDiscipline } from '../domain/discipline';
import { openPosition,closePositionManually } from '../domain/trading';
const preferences:DisciplinePreferences={enabled:true,level:1,capital:10000,unlocked:1};
describe('interface de disciplina no simulador',()=>{
 it('mostra placar e níveis existentes, sem atribuir resultados a históricos vazios',()=>{
  const html=renderToStaticMarkup(<DisciplinePanel preferences={preferences} onChange={()=>{}} locked={false} trades={[]}/>);
  expect(html).toContain('Placar de disciplina');expect(html).toContain('0/20');expect(html).toContain('Capital para risco');
  expect(html).toContain('Manual com alerta');expect(html).toContain('disabled=""');
 });
 it('oferece som/vibração apenas no nível com alerta',()=>{
  const draw=(level:1|2|3)=>renderToStaticMarkup(<DisciplinePanel preferences={{...preferences,level,unlocked:3}} onChange={()=>{}} locked={false} trades={[]}/>);
  expect(draw(2)).toContain('Som no toque do stop');expect(draw(3)).not.toContain('Som no toque do stop');
 });
 it('veredito e regras aparecem antes de finanças recolhidas',()=>{
  const position=beginDiscipline(openPosition({asset:'WDOFUT',side:'BUY',entry:100,marketPrice:100,contracts:1,
    candleIndex:0,signal:null,reentryAuthorized:true,reentrySide:'BUY',signalAlreadyUsed:false,hasOpenPosition:false,
    oco:{stopLoss:98,target:110},execution:{costPerContractRoundTripBRL:0,slippageTicksPerSide:0,intrabarPolicy:'STOP_FIRST'}},'2026-11-18T10:00:00'),1,10000);
  const trade=closePositionManually(position,98,'2026-11-18T10:00:01');
  const html=renderToStaticMarkup(<DisciplineFeedback trade={trade}/>);
  expect(html.indexOf('Bom trade: perda disciplinada')).toBeLessThan(html.indexOf('Resultado financeiro'));
  expect(html).toContain('R4');expect(html).toContain('<details>');expect(html).not.toContain('<details open');
 });
});
