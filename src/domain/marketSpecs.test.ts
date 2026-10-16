import { describe, expect, it } from "vitest";
import {
  grossResultBRL,
  pointValueBRLFor,
  tickSizeFor,
} from "./marketSpecs";

describe("especificações financeiras WIN/WDO", () => {
  it("usa R$ 0,20 por ponto no WIN", () => {
    expect(tickSizeFor("WINFUT")).toBe(5);
    expect(pointValueBRLFor("WINFUT")).toBe(0.2);
    expect(grossResultBRL("WINFUT", 150, 2)).toBe(60);
  });

  it("usa R$ 10 por ponto no WDO", () => {
    expect(tickSizeFor("WDOFUT")).toBe(0.5);
    expect(pointValueBRLFor("WDOFUT")).toBe(10);
    expect(grossResultBRL("WDOFUT", 1.5, 3)).toBe(45);
  });
});
