export async function consumeReplayBatches<T>(
  readBatch: () => Promise<T[]>,
  consumeBatch: (batch: T[]) => void | Promise<void>,
  maxBatchSize = 5000,
): Promise<number> {
  if (!Number.isInteger(maxBatchSize) || maxBatchSize <= 0) {
    throw new Error("O tamanho máximo do lote precisa ser um inteiro positivo.");
  }

  let processed = 0;
  while (true) {
    const batch = await readBatch();
    if (batch.length === 0) return processed;
    if (batch.length > maxBatchSize) {
      throw new Error(
        `O leitor retornou um lote maior que o limite de segurança (${maxBatchSize}).`,
      );
    }

    await consumeBatch(batch);
    processed += batch.length;
  }
}
