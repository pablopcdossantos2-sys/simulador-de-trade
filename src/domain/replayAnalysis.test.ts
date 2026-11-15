import { describe, expect, it, vi } from "vitest";
import { consumeReplayBatches } from "./replayAnalysis";

describe("consumeReplayBatches", () => {
  it("processes each batch sequentially without building a combined array", async () => {
    const batches = [[1, 2], [3], []];
    const readBatch = vi.fn(async () => batches.shift() ?? []);
    const consumed: number[][] = [];

    const count = await consumeReplayBatches(readBatch, async (batch) => {
      await Promise.resolve();
      consumed.push([...batch]);
    }, 2);

    expect(count).toBe(3);
    expect(consumed).toEqual([[1, 2], [3]]);
    expect(readBatch).toHaveBeenCalledTimes(3);
  });

  it("rejects a batch that exceeds the configured bound", async () => {
    await expect(
      consumeReplayBatches(async () => [1, 2, 3], () => undefined, 2),
    ).rejects.toThrow("maior que o limite de segurança");
  });

  it("propagates consumer failures so the caller can abort and close the reader", async () => {
    const failure = new Error("Falha ao analisar lote");
    await expect(
      consumeReplayBatches(async () => [1], () => { throw failure; }),
    ).rejects.toBe(failure);
  });

  it("rejects invalid batch limits", async () => {
    await expect(
      consumeReplayBatches(async () => [], () => undefined, 0),
    ).rejects.toThrow("inteiro positivo");
  });
});
