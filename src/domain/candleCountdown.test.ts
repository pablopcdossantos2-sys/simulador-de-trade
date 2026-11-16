import { describe, expect, it } from "vitest";
import { remainingCandleSeconds, formatCandleCountdown } from "./candleCountdown";

describe("cronômetro reverso do candle do replay", () => {
  it("conta apenas o tempo de mercado revelado pelo replay", () => {
    const bar = "2026-11-11T11:04:00";
    expect(remainingCandleSeconds(bar, "2026-11-11T11:04:00", 2)).toBe(120);
    expect(remainingCandleSeconds(bar, "2026-11-11T11:04:01", 2)).toBe(119);
    expect(remainingCandleSeconds(bar, "2026-11-11T11:05:59", 2)).toBe(1);
    expect(remainingCandleSeconds(bar, "2026-11-11T11:06:00", 2)).toBe(0);
    expect(formatCandleCountdown(119)).toBe("01:59");
    expect(formatCandleCountdown(0)).toBe("00:00");
  });
  it("não inventa contagem antes de carregar replay e evita segundos negativos", () => {
    expect(remainingCandleSeconds("2026-11-11T11:04:00", null, 2)).toBeNull();
    expect(remainingCandleSeconds(null, "2026-11-11T11:04:00", 2)).toBeNull();
    expect(remainingCandleSeconds("2026-11-11T11:04:00", "2026-11-11T11:03:59", 2)).toBeNull();
    expect(remainingCandleSeconds("2026-11-11T11:04:00", "2026-11-11T11:08:00", 2)).toBe(0);
    expect(remainingCandleSeconds("2026-11-11T11:04:00", "2026-11-11T11:04:05", 0)).toBeNull();
    expect(formatCandleCountdown(null)).toBe("--:--");
  });
  it("permite a duração de cinco minutos sem depender de velocidade de replay", () => {
    expect(remainingCandleSeconds("2026-11-11T11:00:00", "2026-11-11T11:03:14", 5)).toBe(106);
  });
});
