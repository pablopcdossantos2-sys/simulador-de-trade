import { describe, expect, it } from "vitest";
import type { Candle } from "../types";
import { calculateMtfConfluence, MTF_CONFLUENCE_DEFAULTS } from "./mtfConfluence";

function trending(step: number, days = 4): Candle[] {
  const result: Candle[] = [];
  for (let day = 0; day < days; day += 1) {
    const date = String(day + 10).padStart(2, "0");
    for (let n = 0; n < 270; n += 1) {
      const price = 5000 + (result.length + 1) * step;
      const hour = String(9 + Math.floor((n * 2) / 60)).padStart(2, "0");
      const minute = String((n * 2) % 60).padStart(2, "0");
      result.push({
        index: result.length,
        timestamp: `2026-11-${date}T${hour}:${minute}:00`,
        open: price - Math.sign(step),
        high: Math.max(price, price - Math.sign(step)) + 2,
        low: Math.min(price, price - Math.sign(step)) - 2,
        close: price,
        volume: 100,
      });
    }
  }
  return result;
}

describe("confluência MTF da estratégia 02", () => {
  it("respeita parâmetros efetivos da referência v13, incluindo MME 200 não votante", () => {
    expect(MTF_CONFLUENCE_DEFAULTS.periods).toEqual([8, 20, 50, 200]);
    expect(MTF_CONFLUENCE_DEFAULTS.voteOn).toEqual([true, true, true, false]);
    expect(MTF_CONFLUENCE_DEFAULTS.angleThresholds).toEqual([2, 1, 1.5, 1]);
    expect(MTF_CONFLUENCE_DEFAULTS.tpvPeriod).toBe(50);
    expect(MTF_CONFLUENCE_DEFAULTS.tpvProximity).toBe(0.45);
  });

  it("não libera direção nem inventa TPV antes de 50 barras M15", () => {
    const candles = trending(2, 1).slice(0, 180);
    const actual = calculateMtfConfluence(candles);
    expect(actual.zone).toBe("NONE");
    expect(actual.points.at(-1)?.tpvVote).toBeNull();
    expect(actual.points.at(-1)?.showBackground).toBe(false);
  });

  it("produz regime coerente em tendência contínua com todos os votos disponíveis", () => {
    const buy = calculateMtfConfluence(trending(3));
    const sell = calculateMtfConfluence(trending(-3));
    expect(buy.points.at(-1)?.aligned).toBe("BUY");
    expect(sell.points.at(-1)?.aligned).toBe("SELL");
    expect(buy.points.at(-1)?.averages.M4).not.toBeNull();
    expect(buy.points.at(-1)?.tpvVote).toBe(1);
    expect(sell.points.at(-1)?.tpvVote).toBe(-1);
    expect(buy.points.at(-1)?.vwapAngle).not.toBeNull();
    expect(sell.points.at(-1)?.vwapAngle).not.toBeNull();
    expect(buy.zone).toBe("GREEN");
    expect(sell.zone).toBe("RED");
  });

  it("não recalcula um snapshot passado com a informação de um candle futuro", () => {
    const all = trending(1, 2);
    const base = calculateMtfConfluence(all.slice(0, 250));
    const later = calculateMtfConfluence(all.slice(0, 280));
    expect(later.points[249]).toEqual(base.points[249]);
  });

  it("permanece neutro em série sem tendência nem volume, sem gerar valores infinitos", () => {
    const flat = trending(0, 2).map((bar) => ({
      ...bar, open: bar.close, high: bar.close, low: bar.close, volume: 0,
    }));
    const result = calculateMtfConfluence(flat);
    expect(result.zone).toBe("NONE");
    expect(result.points.at(-1)?.vwap).toBeNull();
    expect(result.points.at(-1)?.atr).toBe(0);
  });
});

describe("configurações personalizadas do contexto M15", () => {
  it("muda a curva M15 e a confluência calculada, sem antecipar dados", () => {
    const candles = trending(4, 2);
    const original = calculateMtfConfluence(candles);
    const custom = calculateMtfConfluence(candles, [5, 12, 30, 180]);
    expect(custom.points.at(-1)?.averages.M1).not.toBe(original.points.at(-1)?.averages.M1);
    expect(custom.points.at(-1)?.averages.M2).not.toBe(original.points.at(-1)?.averages.M2);
    expect(custom.points.at(-1)?.averages.M3).not.toBe(original.points.at(-1)?.averages.M3);
    expect(custom.points.at(-1)?.averages.M4).not.toBe(original.points.at(-1)?.averages.M4);
    expect(custom.points[249]).toEqual(calculateMtfConfluence(candles.slice(0, 250), [5, 12, 30, 180]).points[249]);
  });
  it("rejeita parâmetro não inteiro", () => {
    expect(() => calculateMtfConfluence([], [8, 20, 50.5, 200])).toThrow(/inválidos/);
  });
});

describe("interruptores equivalentes aos do Pine v13", () => {
  const defaults = {
    useAngles: true, requireAlignment: true,
    voteOn: [true, true, true, false] as [boolean, boolean, boolean, boolean],
    useVwap: true, useTpv: true,
  };

  it("mantém o modo original quando todos os filtros padrão estão ligados", () => {
    const candles = trending(3, 2);
    const original = calculateMtfConfluence(candles);
    const explicit = calculateMtfConfluence(candles, [8, 20, 50, 200], defaults);
    expect(explicit).toEqual(original);
  });

  it("desligar TPV remove requisito das 50 barras e libera somente os outros votos", () => {
    const candles = trending(3, 1);
    expect(calculateMtfConfluence(candles).points.at(-1)?.tpvVote).toBeNull();
    const withoutTpv = calculateMtfConfluence(candles, [8,20,50,200], { ...defaults, useTpv: false });
    expect(withoutTpv.points.at(-1)?.showBackground).toBe(true);
    expect(withoutTpv.zone).toBe("GREEN");
  });

  it("sem angulação o alinhamento atua como um único voto; VWAP fica inativa", () => {
    const candles = trending(3, 1);
    const alignmentOnly = calculateMtfConfluence(candles, [8,20,50,200], {
      ...defaults, useAngles: false, useVwap: true, useTpv: false,
    });
    expect(alignmentOnly.zone).toBe("GREEN");
    const none = calculateMtfConfluence(candles, [8,20,50,200], {
      ...defaults, useAngles: false, requireAlignment: false, useTpv: false,
    });
    expect(none.zone).toBe("NONE");
    expect(none.points.at(-1)?.showBackground).toBe(false);
  });

  it("médias desmarcadas não votam; TPV sozinho pode definir o fundo", () => {
    const candles = trending(4, 4);
    const tpvOnly = calculateMtfConfluence(candles, [8,20,50,200], {
      ...defaults, voteOn: [false,false,false,false], useVwap: false, useTpv: true,
    });
    expect(tpvOnly.zone).toBe("GREEN");
    const noVotes = calculateMtfConfluence(candles, [8,20,50,200], {
      ...defaults, voteOn: [false,false,false,false], useVwap: false, useTpv: false,
    });
    expect(noVotes.zone).toBe("NONE");
  });

  it("valida os interruptores contra tipos incorretos", () => {
    expect(() => calculateMtfConfluence([], [8,20,50,200], {
      ...defaults, voteOn: [true, true] as unknown as [boolean,boolean,boolean,boolean],
    })).toThrow(/Filtros/);
  });
});
