import React from 'react';
import { RiskAwarenessLevel } from '../lib/riskAwareness';

const badgeMeta = {
  [RiskAwarenessLevel.LOW_AWARENESS]: {
    label: "Risk Awareness: Low",
    tone: "bg-emerald-50 text-emerald-800 border-emerald-200",
    note: "Confident with safeguards; keep monitoring habits.",
  },
  [RiskAwarenessLevel.MEDIUM_AWARENESS]: {
    label: "Risk Awareness: Medium",
    tone: "bg-amber-50 text-amber-800 border-amber-200",
    note: "Balanced caution; continue practicing discipline.",
  },
  [RiskAwarenessLevel.HIGH_AWARENESS]: {
    label: "Risk Awareness: High",
    tone: "bg-rose-50 text-rose-800 border-rose-200",
    note: "Heightened risk signals; review behaviors before trades.",
  },
};

/**
 * Informational-only badge for risk awareness level.
 * Does not override risk profile or discrepancy logic.
 */
const RiskAwarenessBadge = ({ level, greenCount = 0, redCount = 0 }) => {
  const meta = badgeMeta[level] || badgeMeta[RiskAwarenessLevel.MEDIUM_AWARENESS];

  return (
    <div
      className={`inline-flex flex-col gap-1 rounded-lg border px-3 py-2 text-xs ${meta.tone}`}
      aria-label="risk-awareness-badge"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold uppercase tracking-wide">{meta.label}</span>
        <span className="text-[11px] font-medium">
          Green: {greenCount} · Red: {redCount}
        </span>
      </div>
      <p className="text-[11px] leading-snug opacity-80">{meta.note}</p>
    </div>
  );
};

export default RiskAwarenessBadge;
