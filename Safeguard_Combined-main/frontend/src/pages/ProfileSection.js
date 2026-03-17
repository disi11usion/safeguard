import React, { useEffect, useMemo, useState } from 'react';
import RangeSelector from '../components/Rangeseletor';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const QUESTION_CONFIG = [
  { text: "I am comfortable adding to an investment after a short-term price drop.", invert: true },
  { text: "I frequently monitor my investment portfolio.", invert: true },
  { text: "I feel uncomfortable missing out when others profit from market movements.", invert: true },
  { text: "I am influenced by others’ actions when making investment decisions.", invert: true },
  { text: "I sometimes make trades without a predefined plan.", invert: true },
  { text: "Market volatility makes me uncomfortable.", invert: false },
  { text: "I follow a clearly defined investment or trading plan.", invert: false },
  { text: "I regularly use risk control tools such as stop-loss orders.", invert: false },
  { text: "I trade or rebalance my investments frequently.", invert: true },
  { text: "I remain invested during major market downturns.", invert: false },
];

const toOutcome = (value, invert = false) => {
  const score = Math.max(0, Math.min(100, Number(value)));
  if (score <= 33) return invert ? 'green' : 'red';
  if (score <= 66) return 'yellow';
  return invert ? 'red' : 'green';
};

const toLikertScore = (value) => {
  const score = Math.max(0, Math.min(100, Number(value)));
  if (score <= 20) return 1;
  if (score <= 40) return 2;
  if (score <= 60) return 3;
  if (score <= 80) return 4;
  return 5;
};

const toRiskScore = (value, invert = false) => {
  const base = toLikertScore(value);
  return invert ? 6 - base : base;
};

const classifyRiskLevel = (totalRiskScore) => {
  if (totalRiskScore <= 22) return 'low';
  if (totalRiskScore <= 36) return 'medium';
  return 'high';
};

const RISK_LABELS = {
  low: 'Low Risk-Inclined',
  medium: 'Medium Risk-Inclined',
  high: 'High Risk-Inclined',
};

const computeAwareness = (greenCount, redCount) => {
  if (greenCount >= 6 && redCount <= 2) return 'low';
  if (greenCount >= 3 && greenCount <= 5 && redCount >= 2 && redCount <= 4) return 'medium';
  if (redCount >= 4 && greenCount <= 3) return 'high';
  return 'medium';
};

const TOTAL_PSYCH_QUESTIONS = 10;

const ProfileSection = () => {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [persistedProfile, setPersistedProfile] = useState(null);
  const [answers, setAnswers] = useState({});
  const { updateUserPreferences, user } = useAuth();
  const STORAGE_KEY = 'investmentProfile_v1';

  const totalSteps = TOTAL_PSYCH_QUESTIONS + 1; // 10 questions + summary
  const stage =
    currentQuestionIndex < TOTAL_PSYCH_QUESTIONS
      ? 'psychological'
      : 'summary';
  const hasAnsweredCurrent =
    stage === 'psychological'
      ? answers[currentQuestionIndex] !== undefined
      : true;

  const handleRangeChange = (value) => {
    setAnswers(prev => ({
      ...prev,
      [currentQuestionIndex]: Number(value)
    }));
  };

  const handleNext = () => {
    if (stage === 'psychological') {
      setCurrentQuestionIndex(prev => prev + 1);
      return;
    }
    if (stage === 'summary') {
      handleFinish();
    }
  };

  const handlePrevious = () => {
    if (stage === 'summary') {
      setCurrentQuestionIndex(TOTAL_PSYCH_QUESTIONS - 1);
      return;
    }
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(step => step - 1);
    }
  };

  const allPsychAnswered = QUESTION_CONFIG.every((_, idx) => answers[idx] !== undefined);

  const awarenessSummary = useMemo(() => {
    if (!allPsychAnswered) {
      if (persistedProfile?.riskAwareness) {
        return {
          ...persistedProfile.riskAwareness,
          ready: true,
        };
      }
      return {
        perQuestionOutcomes: {},
        greenCount: 0,
        redCount: 0,
        level: null,
        ready: false,
      };
    }

    const perQuestionOutcomes = {};
    let greenCount = 0;
    let redCount = 0;

    QUESTION_CONFIG.forEach((q, idx) => {
      const outcome = toOutcome(answers[idx], q.invert);
      perQuestionOutcomes[idx + 1] = outcome; // 1-based keys
      if (outcome === 'green') greenCount += 1;
      if (outcome === 'red') redCount += 1;
    });

    const level = computeAwareness(greenCount, redCount);

    return {
      perQuestionOutcomes,
      greenCount,
      redCount,
      level,
      ready: true,
    };
  }, [answers, allPsychAnswered, persistedProfile]);

  const totalRiskScore = useMemo(() => {
    if (!allPsychAnswered) {
      return persistedProfile?.totalRiskScore ?? null;
    }
    return QUESTION_CONFIG.reduce((sum, q, idx) => (
      sum + toRiskScore(answers[idx], q.invert)
    ), 0);
  }, [answers, allPsychAnswered, persistedProfile]);

  const calculatedRiskLevel = useMemo(() => {
    if (totalRiskScore === null) {
      return persistedProfile?.primaryRiskProfile || null;
    }
    return classifyRiskLevel(totalRiskScore);
  }, [persistedProfile, totalRiskScore]);

  // Derive simple behavioral flags for informational copy only; no scoring or reclassification.
  const behavioralFlags = useMemo(() => {
    if (persistedProfile?.behavioralFlags && !allPsychAnswered) {
      return persistedProfile.behavioralFlags;
    }
    if (!allPsychAnswered) {
      return {};
    }
    return {
      fomo_flag: toOutcome(answers[2], true) === 'red' || toOutcome(answers[3], true) === 'red',
      impulsive_flag: toOutcome(answers[4], true) === 'red',
      overactive_flag: toOutcome(answers[1], true) === 'red' || toOutcome(answers[8], true) === 'red',
      low_plan_flag: toOutcome(answers[6], false) === 'red',
      low_risk_control_flag: toOutcome(answers[7], false) === 'red',
    };
  }, [answers, allPsychAnswered, persistedProfile]);

  const handleFinish = async () => {
    if (!calculatedRiskLevel) return;
    if (!allPsychAnswered) {
      if (persistedProfile) {
        navigate('/');
      }
      return;
    }

    setIsSubmitting(true);
    const profileData = {
      primaryRiskProfile: calculatedRiskLevel,
      totalRiskScore,
      behavioralFlags,
      riskAwareness: {
        level: awarenessSummary.level,
        greenCount: awarenessSummary.greenCount,
        redCount: awarenessSummary.redCount,
        perQuestionOutcomes: awarenessSummary.perQuestionOutcomes,
      },
    };
    const payload = {
      ...(user?.preferences || {}),
      investmentProfile: profileData,
    };

    try {
      await updateUserPreferences(payload);
      // Persist a local copy so the user doesn't need to re-complete if they revisit.
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profileData));
      navigate('/');
    } catch (error) {
      console.error('Error saving profile payload:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // On mount, load any persisted profile (backend via user preferences or localStorage) to prefill summary.
  useEffect(() => {
    const fromUser = user?.preferences?.investmentProfile;
    if (fromUser) {
      setPersistedProfile(fromUser);
      setCurrentQuestionIndex(TOTAL_PSYCH_QUESTIONS);
      return;
    }
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        setPersistedProfile(parsed);
        setCurrentQuestionIndex(TOTAL_PSYCH_QUESTIONS);
      }
    } catch (e) {
      console.error('Failed to load cached investment profile:', e);
    }
  }, [user]);

  const progressPercent = ((Math.min(currentQuestionIndex, totalSteps - 1) + 1) / totalSteps) * 100;

  return (
    <div className="min-h-screen bg-background py-8 px-4 mt-10 flex flex-col items-center">
      <h1 className="font-bold text-center mb-2">Investment Profile Assessment</h1>
      <span className="mb-8 text-center">
        Complete your psychological prompts to finish your profile.
      </span>

      {stage !== 'summary' && (
        <div className="text-center mb-6 w-full max-w-2xl">
          <div className="w-full h-2 bg-muted/30 rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-gradient-to-r from-blue-900 to-blue-600 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
          <span className="text-primary text-sm font-medium">
            Step {currentQuestionIndex + 1} of {totalSteps}
          </span>
        </div>
      )}

      {stage === 'psychological' && (
        <div className="w-full max-w-3xl mb-8">
          <div className="mb-2 text-center">
            <h2 className="text-lg font-semibold text-foreground">Psychological Assessment</h2>
          </div>
          <RangeSelector
            key={currentQuestionIndex}
            question={QUESTION_CONFIG[currentQuestionIndex].text}
            onChange={handleRangeChange}
          />
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Answer sequentially; all questions carry equal importance.
          </p>
        </div>
      )}

      {stage === 'summary' && (
        <div className="w-full max-w-3xl mb-8 bg-card/70 border border-border rounded-xl p-4">
          <h2 className="text-xl font-semibold text-foreground mb-2">Your Calculated Risk Profile</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Based on your responses to the previous questions, the system has assessed your overall investment risk tolerance.
          </p>
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-border px-3 py-2">
              <div className="text-xs uppercase text-muted-foreground">Risk profile</div>
              <div className="text-sm font-semibold text-foreground">
                {calculatedRiskLevel ? RISK_LABELS[calculatedRiskLevel] : '—'}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              This result is generated automatically from your behavioral responses and does not require manual selection.
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-4 justify-center items-center w-full max-w-md">
        <button
          className="w-full sm:w-auto min-w-[140px] px-6 py-3 bg-background/80 hover:bg-background text-muted-foreground hover:text-foreground border border-border rounded-xl font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handlePrevious}
          disabled={currentQuestionIndex === 0}
        >
          ← Previous
        </button>

        {stage === 'summary' ? (
          <button
            className="w-full sm:w-auto min-w-[140px] px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:shadow-lg hover:shadow-green-500/30 text-white rounded-xl font-semibold transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
            disabled={!calculatedRiskLevel || isSubmitting || (!allPsychAnswered && !persistedProfile)}
            onClick={handleFinish}
          >
            {isSubmitting ? 'Saving...' : 'Submit'}
          </button>
        ) : (
          <button
            className="w-full sm:w-auto min-w-[140px] px-6 py-3 bg-primary hover:shadow-lg hover:shadow-primary/30 text-primary-foreground rounded-xl font-semibold transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
            onClick={handleNext}
            disabled={!hasAnsweredCurrent}
          >
            Next →
          </button>
        )}
      </div>
    </div>
  );
};

export default ProfileSection;
