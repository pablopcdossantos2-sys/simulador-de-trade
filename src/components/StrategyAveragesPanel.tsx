import { useEffect, useState } from "react";
import { InfoTip } from "./InfoTip";
import type { MovingAverageSettings, MtfVoteFilters, TradingStrategyId } from "../types";
import { DEFAULT_MTF_VOTE_FILTERS, MTF_CONFLUENCE_DEFAULTS } from "../services/mtfConfluence";
import {
  defaultsForMovingAverages,
  MIN_MOVING_AVERAGE_PERIOD,
  MAX_MOVING_AVERAGE_PERIOD,
  selectedMovingAveragesLabel,
  validateMovingAverageSettings,
} from "../services/strategyMovingAverages";

interface Props {
  strategyId: TradingStrategyId;
  settings: MovingAverageSettings;
  disabled: boolean;
  onSave: (value: MovingAverageSettings) => Promise<void>;
}

function inputsFor(settings: MovingAverageSettings, id: TradingStrategyId): string[] {
  return id === "MTF_ANGULACAO"
    ? settings.mtf.periods.map(String)
    : [
        settings.multiMedias.emaFastLength,
        settings.multiMedias.wmaLength,
        settings.multiMedias.emaSlowLength,
      ].map(String);
}

export function StrategyAveragesPanel({ strategyId, settings, disabled, onSave }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [fields, setFields] = useState(() => inputsFor(settings, strategyId));
  const [filters, setFilters] = useState<MtfVoteFilters>(() => ({
    ...DEFAULT_MTF_VOTE_FILTERS, ...settings.mtf.filters,
    voteOn: [...(settings.mtf.filters?.voteOn ?? DEFAULT_MTF_VOTE_FILTERS.voteOn)],
  }));
  const [shadeNeutral, setShadeNeutral] = useState(settings.mtf.shadeNeutral ?? true);
  const [plotOn, setPlotOn] = useState<boolean[]>(() => [...(settings.mtf.plotOn ?? [true, true, true, true])]);
  const [angleFields, setAngleFields] = useState<string[]>(() =>
    (settings.mtf.filters?.angleThresholds ?? MTF_CONFLUENCE_DEFAULTS.angleThresholds).map(String));
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFields(inputsFor(settings, strategyId));
    setShadeNeutral(settings.mtf.shadeNeutral ?? true);
    setPlotOn([...(settings.mtf.plotOn ?? [true, true, true, true])]);
    setAngleFields((settings.mtf.filters?.angleThresholds ?? MTF_CONFLUENCE_DEFAULTS.angleThresholds).map(String));
    setExpanded(false);
    setFilters({
      ...DEFAULT_MTF_VOTE_FILTERS, ...settings.mtf.filters,
      voteOn: [...(settings.mtf.filters?.voteOn ?? DEFAULT_MTF_VOTE_FILTERS.voteOn)],
    });
    setFeedback(null);
  }, [strategyId, settings]);

  const isMtf = strategyId === "MTF_ANGULACAO";
  const labels = isMtf
    ? ["MME 1 · M15", "MME 2 · M15", "MME 3 · M15", "MME 4 · M15"]
    : ["MME rápida", "MMP intermediária", "MME lenta"];
  const updated = (index: number, value: string) => {
    setFields((current) => current.map((item, position) => position === index ? value : item));
    setFeedback(null);
  };
  const updateAngle = (index: number, value: string) => {
    setAngleFields((current) => current.map((item, position) => position === index ? value : item));
    setFeedback(null);
  };
  const togglePlot = (index: number, checked: boolean) => {
    setPlotOn((current) => current.map((value, i) => i === index ? checked : value));
    setFeedback(null);
  };

  async function save() {
    if (disabled || saving) return;
    const numbers = fields.map((value) => value.trim() === "" ? Number.NaN : Number(value));
    const next: MovingAverageSettings = {
      multiMedias: { ...settings.multiMedias },
      mtf: {
        periods: [...settings.mtf.periods] as [number, number, number, number],
        shadeNeutral,
        plotOn: [...plotOn] as [boolean, boolean, boolean, boolean],
        filters: {
          ...settings.mtf.filters, ...filters,
          voteOn: [...filters.voteOn] as [boolean, boolean, boolean, boolean],
          angleThresholds: angleFields.map((value) =>
            value.trim() === "" ? Number.NaN : Number(value.replace(",", "."))) as [number, number, number, number],
        },
      },
    };
    if (isMtf) {
      next.mtf.periods = numbers as [number, number, number, number];
    } else {
      [next.multiMedias.emaFastLength, next.multiMedias.wmaLength, next.multiMedias.emaSlowLength] = numbers;
    }
    try {
      validateMovingAverageSettings(next, strategyId);
      setSaving(true);
      await onSave(next);
      setFeedback("Configurações salvas para esta estratégia. Vá ao Simulador para planejar o próximo treino.");
      setExpanded(false);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível salvar as médias.");
    } finally {
      setSaving(false);
    }
  }

  function restoreDefaultFields() {
    if (disabled || saving) return;
    setFields(inputsFor(defaultsForMovingAverages(), strategyId));
    if (isMtf) {
      setFilters({
        ...DEFAULT_MTF_VOTE_FILTERS,
        voteOn: [...DEFAULT_MTF_VOTE_FILTERS.voteOn],
        angleThresholds: [...MTF_CONFLUENCE_DEFAULTS.angleThresholds],
      });
      setAngleFields(MTF_CONFLUENCE_DEFAULTS.angleThresholds.map(String));
      setShadeNeutral(true);
      setPlotOn([true, true, true, true]);
    }
    setFeedback("Valores padrão preenchidos. Clique em Salvar médias para aplicá-los.");
  }


  function toggleFilter(key: "useAngles" | "requireAlignment" | "useVwap" | "useTpv", checked: boolean) {
    setFilters((current) => ({ ...current, [key]: checked }));
    setFeedback(null);
  }

  function toggleAverage(index: number, checked: boolean) {
    setFilters((current) => ({
      ...current,
      voteOn: current.voteOn.map((value, i) => i === index ? checked : value) as [boolean, boolean, boolean, boolean],
    }));
    setFeedback(null);
  }

  return (
    <details className="strategy-averages-panel card" open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary className="strategy-averages-toggle">
        <span className="strategy-averages-summary">
          <strong>Editar parâmetros da estratégia</strong>
          <small>{selectedMovingAveragesLabel(settings, strategyId)} · configuração salva</small>
        </span>
        <span aria-hidden="true" className="strategy-averages-chevron">⌄</span>
      </summary>
      <div className="strategy-averages-body">
        <div className="section-title-with-help">
          <h3>{isMtf ? "Médias exponenciais de contexto M15" : "Médias do sistema Multi Médias"}</h3>
          <InfoTip label="Como configurar as médias">
            <p>Informe períodos inteiros entre {MIN_MOVING_AVERAGE_PERIOD} e {MAX_MOVING_AVERAGE_PERIOD}, em ordem crescente. As médias conservam seus métodos: MME exponencial, MMP ponderada. A VWAP não é uma média móvel e permanece inalterada.</p>
            <p>Alterar períodos muda os cálculos, sinais e autorizações do sistema correspondente. Salve aqui antes de acessar o Simulador. Novos treinos registram os períodos utilizados. Durante uma sessão ou com posição aberta, a edição fica bloqueada.</p>
          </InfoTip>
        </div>
        <p className="strategy-averages-explanation">
          {isMtf
            ? "Quatro MMEs do contexto M15; escolha abaixo quais entram na confluência. A quarta é apenas referência por padrão."
            : "MME rápida, MMP intermediária e MME lenta. O alinhamento entre as três médias determina os sinais e o toque na MME lenta permite reentradas."}
        </p>
        <div className="strategy-averages-fields">
          {labels.map((label, index) => (
            <label key={label} htmlFor={`avg-period-${index}`}>
              {label}
              <input
                id={`avg-period-${index}`}
                type="number"
                min={MIN_MOVING_AVERAGE_PERIOD}
                max={MAX_MOVING_AVERAGE_PERIOD}
                step="1"
                value={fields[index] ?? ""}
                onChange={(event) => updated(index, event.target.value)}
                disabled={disabled || saving}
              />
            </label>
          ))}
        </div>
        {isMtf && (
          <div className="strategy-confluence-controls" aria-label="Critérios do fundo da segunda estratégia">
            <div className="section-title-with-help">
              <h3>Filtros que participam da confluência M15</h3>
              <InfoTip label="Como os filtros de confluência funcionam">
                O interruptor global de angulação afeta as médias e a VWAP. Com ele desligado, as médias só votam juntas pelo alinhamento, quando essa opção está ligada. Os filtros marcados precisam concordar na direção. O ATR 14 é utilizado para normalizar ângulos em graus, não é um voto isolado. Com todos os critérios inativos, nenhuma entrada é autorizada.
              </InfoTip>
            </div>
            <div className="strategy-confluence-switches">
              <label><input type="checkbox" checked={shadeNeutral} disabled={disabled || saving}
                onChange={(event) => setShadeNeutral(event.target.checked)} /> Usar cinza nas áreas neutras</label>
              <label><input type="checkbox" checked={filters.useAngles}
                onChange={(event) => toggleFilter("useAngles", event.target.checked)}
                disabled={disabled || saving} /> Usar angulação no fundo (ATR 14)</label>
              <label><input type="checkbox" checked={filters.requireAlignment}
                onChange={(event) => toggleFilter("requireAlignment", event.target.checked)}
                disabled={disabled || saving} /> Usar alinhamento das médias</label>
            </div>
            <p className="strategy-averages-explanation">
              Configure cada MME separadamente: exibir a linha no gráfico não significa participar do fundo verde/vermelho.
              O limiar de angulação é independente, aplicado apenas quando a média vota e a angulação global está ativa.
            </p>
            <div className="strategy-average-rules" role="group" aria-label="Exibição, angulação e votação das médias M15">
              {filters.voteOn.map((enabled, index) => (
                <div className="strategy-average-rule" key={index}>
                  <strong>MME {fields[index] || settings.mtf.periods[index]} · M15</strong>
                  <label className="strategy-average-checkbox">
                    <input type="checkbox" checked={plotOn[index] ?? true}
                      onChange={(event) => togglePlot(index, event.target.checked)}
                      disabled={disabled || saving} />
                    Exibir no gráfico
                  </label>
                  <label className="strategy-average-angle">
                    Angulação mínima (°)
                    <input type="number" min="0.1" max="89" step="0.1"
                      aria-label={`Angulação mínima da MME ${index + 1} em graus`}
                      value={angleFields[index] ?? ""}
                      onChange={(event) => updateAngle(index, event.target.value)}
                      disabled={disabled || saving} />
                  </label>
                  <label className="strategy-average-checkbox">
                    <input type="checkbox" checked={enabled}
                      onChange={(event) => toggleAverage(index, event.target.checked)}
                      disabled={disabled || saving} />
                    Usar no fundo
                  </label>
                </div>
              ))}
            </div>
            <div className="strategy-confluence-switches">
              <label><input type="checkbox" checked={filters.useVwap}
                onChange={(event) => toggleFilter("useVwap", event.target.checked)}
                disabled={disabled || saving || !filters.useAngles} />
                Usar VWAP diária no fundo <small>±1°{!filters.useAngles ? " · inativa sem angulação" : ""}</small>
              </label>
              <label><input type="checkbox" checked={filters.useTpv}
                onChange={(event) => toggleFilter("useTpv", event.target.checked)}
                disabled={disabled || saving} />
                Usar TPV no fundo <small>Acima/abaixo da média de 50 · sem desvio-padrão</small>
              </label>
            </div>
            <p className="strategy-averages-explanation">
              As médias e a VWAP usam ângulos normalizados pelo ATR 14. Os limites de angulação das MMEs são editáveis
              (padrões: 2°/1°/1,5°/1°). A visibilidade no gráfico e a participação no fundo são opções independentes.
            </p>
          </div>
        )}
        <div className="strategy-averages-actions">
          <button type="button" className="secondary" onClick={restoreDefaultFields}
            disabled={disabled || saving}>
            Preencher valores padrão
          </button>
          <button type="button" onClick={() => void save()} disabled={disabled || saving}>
            {saving ? "Salvando..." : "Salvar médias e filtros"}
          </button>
        </div>
        {disabled && <p className="strategy-averages-disabled">Finalize o treino e qualquer posição aberta antes de alterar as médias.</p>}
        {feedback && <p className="strategy-averages-feedback" role="status">{feedback}</p>}
      </div>
    </details>
  );
}
