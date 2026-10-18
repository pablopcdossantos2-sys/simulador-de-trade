import { describe, expect, it } from "vitest";
import {
  replayMarketTimeAt,
  reanchorReplayClock,
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

  it("não retrocede o relógio quando recebe um instante anterior à âncora", () => {
    const anchor = { marketTimeMs: 50_000, wallTimeMs: 2_000, speed: 10 };
    expect(replayMarketTimeAt(anchor, 1_000)).toBe(50_000);
  });
});
