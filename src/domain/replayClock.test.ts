import { describe, expect, it } from "vitest";
import {
  anchorReplayClock,
  replayMarketTimeAt,
  reanchorReplayClock,
  resumeReplayClock,
} from "./replayClock";

describe("relógio da reprodução", () => {
  it.each([
    [1, 120_000],
    [2, 60_000],
    [5, 24_000],
    [10, 12_000],
  ])("a velocidade %ix representa dois minutos de mercado em %i ms", (speed, expectedWallMs) => {
    const anchor = { marketTimeMs: 0, wallTimeMs: 1_000, speed };
    const marketTime = replayMarketTimeAt(anchor, 1_000 + expectedWallMs);
    expect(marketTime).toBe(120_000);
  });

  it("troca a velocidade sem saltar o relógio de mercado", () => {
    const initial = { marketTimeMs: 5_000, wallTimeMs: 100, speed: 2 };
    const changed = reanchorReplayClock(initial, 1_100, 10);

    expect(changed.marketTimeMs).toBe(7_000);
    expect(changed.wallTimeMs).toBe(1_100);
    expect(changed.speed).toBe(10);
    expect(replayMarketTimeAt(changed, 1_200)).toBe(8_000);
  });

  it("pausa e retoma sem contabilizar o tempo parado", () => {
    const playing = { marketTimeMs: 10_000, wallTimeMs: 1_000, speed: 2 };
    const paused = reanchorReplayClock(playing, 1_500);
    expect(paused.marketTimeMs).toBe(11_000);

    // A retomada ocorre muito depois, mas preserva exatamente o instante da pausa.
    const resumed = resumeReplayClock(paused, 9_000);
    expect(resumed.marketTimeMs).toBe(11_000);
    expect(replayMarketTimeAt(resumed, 9_500)).toBe(12_000);
  });

  it("permite alterar a velocidade durante a pausa sem salto temporal", () => {
    const paused = { marketTimeMs: 30_000, wallTimeMs: 2_000, speed: 2 };
    const resumed = resumeReplayClock(paused, 20_000, 5);
    expect(resumed.marketTimeMs).toBe(30_000);
    expect(replayMarketTimeAt(resumed, 20_200)).toBe(31_000);
  });

  it("reancora no instante de mercado após avanço manual", () => {
    const afterManualStep = anchorReplayClock(75_000, 5_000, 10);
    expect(replayMarketTimeAt(afterManualStep, 5_000)).toBe(75_000);
    expect(replayMarketTimeAt(afterManualStep, 5_100)).toBe(76_000);
  });


  it("mantém o mesmo tempo de mercado com quadros de reprodução segmentados", () => {
    const initial = { marketTimeMs: 12_000, wallTimeMs: 500, speed: 4 };
    let segmented = initial;
    for (const elapsed of [16, 16, 16, 16, 16, 16]) {
      segmented = reanchorReplayClock(
        segmented,
        segmented.wallTimeMs + elapsed,
      );
    }

    expect(segmented.marketTimeMs).toBe(
      replayMarketTimeAt(initial, initial.wallTimeMs + 96),
    );
    expect(segmented.marketTimeMs).toBe(12_384);
  });

  it("preserva o avanço ao alternar reprodução, pausa e retomada várias vezes", () => {
    let clock = { marketTimeMs: 0, wallTimeMs: 0, speed: 2 };
    clock = reanchorReplayClock(clock, 100);
    expect(clock.marketTimeMs).toBe(200);

    clock = resumeReplayClock(clock, 10_000);
    expect(replayMarketTimeAt(clock, 10_050)).toBe(300);
    clock = reanchorReplayClock(clock, 10_050);
    expect(clock.marketTimeMs).toBe(300);

    clock = resumeReplayClock(clock, 50_000, 5);
    expect(replayMarketTimeAt(clock, 50_020)).toBe(400);
  });

  it("não retrocede o relógio quando recebe um instante anterior à âncora", () => {
    const anchor = { marketTimeMs: 50_000, wallTimeMs: 2_000, speed: 10 };
    expect(replayMarketTimeAt(anchor, 1_000)).toBe(50_000);
  });
});
