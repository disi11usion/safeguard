export const RiskAwarenessLevel = {
  LOW_AWARENESS: "LOW_AWARENESS",
  MEDIUM_AWARENESS: "MEDIUM_AWARENESS",
  HIGH_AWARENESS: "HIGH_AWARENESS",
};

/**
 * Compute the risk awareness level using only simple counts.
 * All flags are treated with equal importance (1 point each).
 */
export function computeRiskAwareness(greenCount = 0, redCount = 0) {
  if (greenCount >= 6 && redCount <= 2) {
    return RiskAwarenessLevel.LOW_AWARENESS;
  }
  if (greenCount >= 3 && greenCount <= 5 && redCount >= 2 && redCount <= 4) {
    return RiskAwarenessLevel.MEDIUM_AWARENESS;
  }
  if (redCount >= 4 && greenCount <= 3) {
    return RiskAwarenessLevel.HIGH_AWARENESS;
  }
  return RiskAwarenessLevel.MEDIUM_AWARENESS;
}

const defaultFlagGroups = {
  green: [
    "staysCalmDuringVolatility",
    "doesIndependentResearch",
    "followsPlanNotHeadlines",
    "diversifiesPositions",
    "usesPositionSizing",
    "reviewsDecisionsPostTrade",
    "setsEntryExitRules",
    "avoidsImpulseBuys",
  ],
  red: [
    "panicSells",
    "fomoBuys",
    "overtrades",
    "ignoresStopLosses",
    "chasesPerformance",
    "addsToLosingPositions",
    "investsWithoutPlan",
    "letsNewsDictateMoves",
  ],
};

const countTrueFlags = (flags, keys) =>
  keys.reduce((count, key) => (flags?.[key] ? count + 1 : count), 0);

/**
 * Map existing boolean behavioral flags into green/red counts.
 * Does not alter or re-weight the underlying flags.
 */
export function mapBehaviorFlagsToAwareness(flags = {}, options = {}) {
  const greenKeys = options.greenFlags || defaultFlagGroups.green;
  const redKeys = options.redFlags || defaultFlagGroups.red;

  const greenCount = countTrueFlags(flags, greenKeys);
  const redCount = countTrueFlags(flags, redKeys);

  const awarenessLevel = computeRiskAwareness(greenCount, redCount);

  return {
    greenCount,
    redCount,
    awarenessLevel,
  };
}
