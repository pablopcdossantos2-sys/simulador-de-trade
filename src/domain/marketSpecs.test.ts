import { describe, expect, it } from "vitest";
import {
  grossResultBRL,
  pointValueBRLFor,
  roundPriceToTick,
  tickSizeFor,
} from "./marketSpecs";

describe("especificações financeiras WIN/WDO", () => {
  it("usa R$ 0,20 por ponto no WIN", () => {
    expect(tickSizeFor("WINFUT")).toBe(5);
    expect(pointValueBRLFor("WINFUT")).toBe(0.2);
    expect(grossResultBRL("WINFUT", 150, 2)).toBe(60);
  });

  it("arredonda preços para o tick válido mais próximo", () => {
    expect(roundPriceToTick("WINFUT", 130003)).toBe(130005);
    expect(roundPriceToTick("WINFUT", 130002)).toBe(130000);
    expect(roundPriceToTick("WDOFUT", 5321.27)).toBe(5321.5);
    expect(roundPriceToTick("WDOFUT", 5321.24)).toBe(5321);
  });

  it("usa R$ 10 por ponto no WDO", () => {
    expect(tickSizeFor("WDOFUT")).toBe(0.5);
    expect(pointValueBRLFor("WDOFUT")).toBe(10);
    expect(grossResultBRL("WDOFUT", 1.5, 3)).toBe(45);
  });
});
