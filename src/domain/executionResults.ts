import type { Trade } from "../types";

export function summarizeExecutionResults(trades: readonly Trade[]) {
  let measured = 0, disciplined = 0, touched = 0, onTime = 0;
  for (const { discipline } of trades) {
    if (!discipline) continue;
    measured++;
    if (discipline.rules.every(rule => rule.status !== "FAIL")) disciplined++;
    const exitRule = discipline.rules.find(rule => rule.id === "R3");
    if (exitRule?.status === "PASS" || exitRule?.status === "FAIL") {
      touched++;
      if (exitRule.status === "PASS") onTime++;
    }
  }
  return { measured, disciplined, touched, onTime };
}
