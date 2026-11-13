import type { TradeReview } from "../types";

export type TradeReviewAssessment = "ALIGNED" | "PARTIAL" | "NEEDS_REVIEW";

export type TradeReviewDraft = {
  entryExecution: TradeReview["entryExecution"] | "";
  stopDiscipline: TradeReview["stopDiscipline"] | "";
  targetDiscipline: TradeReview["targetDiscipline"] | "";
  ruleAdherence: TradeReview["ruleAdherence"] | "";
  emotionalInterference: TradeReview["emotionalInterference"] | "";
  lesson: string;
};

export function createTradeReviewDraft(review?: TradeReview): TradeReviewDraft {
  return {
    entryExecution: review?.entryExecution ?? "",
    stopDiscipline: review?.stopDiscipline ?? "",
    targetDiscipline: review?.targetDiscipline ?? "",
    ruleAdherence: review?.ruleAdherence ?? "",
    emotionalInterference: review?.emotionalInterference ?? "",
    lesson: review?.lesson ?? "",
  };
}

export function assessTradeReview(review: TradeReview): TradeReviewAssessment {
  if (
    review.entryExecution === "OUTSIDE_PLAN" ||
    review.stopDiscipline === "MOVED_AGAINST_PLAN" ||
    review.targetDiscipline === "EXTENDED_WITHOUT_PLAN" ||
    review.ruleAdherence === "BROKE"
  ) {
    return "NEEDS_REVIEW";
  }

  const stopAligned =
    review.stopDiscipline === "RESPECTED" ||
    review.stopDiscipline === "MOVED_WITH_PLAN" ||
    review.stopDiscipline === "NOT_APPLICABLE";
  const targetAligned =
    review.targetDiscipline === "RESPECTED" ||
    review.targetDiscipline === "EXTENDED_WITH_PLAN" ||
    review.targetDiscipline === "NOT_APPLICABLE";

  if (
    review.entryExecution === "PLANNED" &&
    stopAligned &&
    targetAligned &&
    review.ruleAdherence === "ALL" &&
    review.emotionalInterference === "NONE"
  ) {
    return "ALIGNED";
  }

  return "PARTIAL";
}
