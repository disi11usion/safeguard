import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import QuestionCard from '../components/QuestionCard';
import { apiService } from '../services/api';
import RiskAwarenessBadge from '../components/RiskAwarenessBadge';
import { computeRiskAwareness, RiskAwarenessLevel } from '../lib/riskAwareness';

const QUESTION_OUTCOME_MAP = {
  1: ["YELLOW", "YELLOW", "GREEN", "GREEN"],
  2: ["GREEN", "GREEN", "GREEN", "RED", "RED"],
  3: ["GREEN", "YELLOW", "YELLOW", "RED"],
  4: ["RED", "YELLOW", "YELLOW", "GREEN", "GREEN"],
  5: ["GREEN", "YELLOW", "GREEN", "RED"],
  6: ["RED", "YELLOW", "YELLOW", "YELLOW", "GREEN"],
  7: ["GREEN", "YELLOW", "RED", "YELLOW", "RED"],
  8: ["RED", "RED", "GREEN", "GREEN"],
  11: ["GREEN", "GREEN", "YELLOW", "RED", "RED"],
  12: ["RED", "RED", "YELLOW", "GREEN", "GREEN"],
};

const PSYCHOLOGICAL_QUESTION_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 11, 12];

const deriveOutcomeForQuestion = (question, answer) => {
  if (!question || typeof answer === 'undefined' || answer === null) return null;
  const mapping = QUESTION_OUTCOME_MAP[question.id];
  if (!mapping) return null;

  const toOutcome = (opt) => {
    const idx = question.options.findIndex(o => o === opt);
    return mapping[idx] || null;
  };

  if (Array.isArray(answer)) {
    const selections = answer.map(toOutcome).filter(Boolean);
    if (!selections.length) return null;
    const hasGreen = selections.includes("GREEN");
    const hasRed = selections.includes("RED");
    if (hasGreen && hasRed) return "YELLOW";
    if (hasRed) return "RED";
    if (hasGreen) return "GREEN";
    return "YELLOW";
  }

  return toOutcome(answer);
};

const Preferences = () => {
  const navigate = useNavigate();
  const { user, updateUserPreferences } = useAuth();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [questions, setQuestions] = useState([
    {
      id: 1,
      question: "How would you describe your knowledge of investing?",
      options: [
        "I'm a beginner, I have very little knowledge",
        "I'm at an intermediate level",
        "I understand concepts like technical analysis",
        "I've been investing for a long time, I'm experienced"
      ],
      category: "knowledge_level"
    },
    {
      id: 2,
      question: "What are your reasons for investing? (Select more than one if applicable)",
      options: [
        "To generate passive income",
        "For future large expenses (house, car, etc.)",
        "For retirement",
        "To try new things",
        "To learn and have fun"
      ],
      category: "investment_motivation",
      multiple: true
    },
    {
      id: 3,
      question: "What portion of your monthly income is usually available for investment?",
      options: [
        "Less than 5%",
        "Between 5% and 15%",
        "Between 15% and 30%",
        "More than 30%"
      ],
      category: "income_balance"
    },
    {
      id: 4,
      question: "How long can you leave your money invested without needing it?",
      options: [
        "1-2 years",
        "3 years",
        "4-5 years",
        "5+ years",
        "7+ years"
      ],
      category: "investment_horizon"
    },
    {
      id: 5,
      question: "What does 'risk' mean to you?",
      options: [
        "Something I cannot afford to lose",
        "Uncertainty but also potential gain",
        "Manageable fluctuations",
        "There's always some risk where there's opportunity"
      ],
      category: "risk_perception"
    },
    {
      id: 6,
      question: "Which of the following causes you the most stress when investing?",
      options: [
        "Not knowing what to do when the market drops",
        "Investing without having enough information",
        "Not knowing who to trust when friends and media say different things",
        "Fear of losing money",
        "I don't get stressed, I stay calm while investing"
      ],
      category: "stress_response"
    },
    {
      id: 7,
      question: "How do you usually make investment decisions?",
      options: [
        "I do detailed research before investing",
        "I follow expert opinions or social media",
        "I go with my gut instincts",
        "I ask friends or community groups",
        "I haven't developed a method yet / haven't invested before"
      ],
      category: "decision_method"
    },
    {
      id: 8,
      question: "You see a headline: 'Bitcoin could drop 40% in two weeks'. What is your reaction?",
      options: [
        "I would sell immediately",
        "I'd panic but wouldn't know what to do",
        "I would check the source and decide accordingly",
        "I wouldn't be affected by this kind of news"
      ],
      category: "emotional_reaction"
    },
    {
      id: 11,
      question: "I often follow my instincts",
      options: [
        "Strongly disagree",
        "Disagree",
        "Neutral",
        "Agree",
        "Strongly agree"
      ],
      category: "behavioral_likert",
      multiple: false
    },
    {
      id: 12,
      question: "I plan and execute with discipline",
      options: [
        "Strongly disagree ",
        "Disagree ",
        "Neutral ",
        "Agree ",
        "Strongly agree "
      ],
      category: "behavioral_likert",
      multiple: false
    },
    {
      id: 9,
      question: "Which option best reflects how you approach investing in general?",
      options: [
        "Low risk-inclined",
        "Moderate risk-inclined",
        "High risk-inclined"
      ],
      category: "investment_personality"
    },
    {
      id: 10,
      question: "Which assets are you most interested in? (Select up to 8 from any category)",
      options: [
      ], // Will be set dynamically from database
      category: "asset_preference",
      multiple: true,
      maxSelections: 8,
      minSelections: 1
    }
  ]);

  const handleAnswer = (questionId, answer) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }));
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  useEffect(() => {
    if (user && user.preferences) {
      const userAnswers = user.preferences.answers || {};
      setAnswers(userAnswers);
      setIsEditing(true);
    }
  }, [user]);

  useEffect(() => {
    // Fetch assets for question 10 from database (crypto, stocks, forex, futures)
    const fetchAssets = async () => {
      try {
        const response = await apiService.getPreferenceList();
        
        // Flatten all assets from different categories with category labels
        const allAssets = [];
        const categoryLabels = {
          'cryptocurrencies': 'Crypto',
          'us_stocks': 'Stock',
          'forex_pairs': 'Forex',
          'metal_futures': 'Futures'
        };

        // Process each category
        Object.entries(response.assets).forEach(([categoryKey, assets]) => {
          const categoryLabel = categoryLabels[categoryKey];
          assets.forEach(asset => {
            // Format: "Bitcoin (BTC) - Crypto"
            allAssets.push({
              display: `${asset.name} (${asset.symbol}) - ${categoryLabel}`,
              name: asset.name,
              symbol: asset.symbol,
              category: categoryLabel
            });
          });
        });

        // Sort by category first, then by name
        allAssets.sort((a, b) => {
          if (a.category !== b.category) {
            return a.category.localeCompare(b.category);
          }
          return a.name.localeCompare(b.name);
        });

        const formatted = allAssets.map(asset => asset.display);

        // Normalize existing answers to new format
        setAnswers(prev => {
          const prevQ10 = prev[10];
          if (!prevQ10 || !Array.isArray(prevQ10)) return prev;

          // Create lookup maps for normalization
          const nameToDisplay = {};
          const symbolToDisplay = {};
          allAssets.forEach(asset => {
            nameToDisplay[asset.name.toLowerCase()] = asset.display;
            symbolToDisplay[asset.symbol.toLowerCase()] = asset.display;
          });

          const normalized = prevQ10.map(v => {
            if (typeof v !== 'string') return v;
            const raw = v.trim();
            
            // If already in new format, keep it
            if (formatted.includes(raw)) return raw;

            // Try to match by name or symbol
            const namePart = raw.split('(')[0].trim().toLowerCase();
            if (nameToDisplay[namePart]) return nameToDisplay[namePart];

            // Try to extract symbol from parentheses
            const match = raw.match(/\(([^)]+)\)/);
            if (match && symbolToDisplay[match[1].toLowerCase()]) {
              return symbolToDisplay[match[1].toLowerCase()];
            }

            // Return as-is if no match found
            return raw;
          });

          return { ...prev, 10: normalized };
        });

        setQuestions(prevQs => prevQs.map(q =>
          q.id === 10 ? { ...q, options: formatted } : q
        ));
      } catch (e) {
        console.error('Error fetching preference list:', e);
      }
    };
    fetchAssets();
  }, []);

  const handleSubmit = async () => {
    setIsSubmitting(true);

    let finalAnswers = { ...answers };

    const preferences = {
      answers: finalAnswers || {},
      primaryRiskProfile: primaryRiskProfile || null,
      riskAwareness: awarenessReady
        ? {
            level: awarenessLevel,
            greenCount,
            redCount,
            questionOutcomes,
            discrepancyFlag: hasDiscrepancy,
          }
        : null,
      completed: true,
      completedAt: new Date().toISOString()
    };
    try {
      await updateUserPreferences(preferences);
      navigate('/dashboard');
    } catch (error) {
      console.error('Error saving preferences:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentQuestion = questions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === questions.length - 1;
  const hasAnsweredCurrent = answers[currentQuestion.id];
  const isPrimaryRiskQuestion = currentQuestion?.id === 9;
  const sectionTitle = isPrimaryRiskQuestion ? "Primary Risk Profile" : "Behavioral Questions";
  const sectionHelper = isPrimaryRiskQuestion
    ? "Single-choice selection for your primary profile."
    : "Behavioral prompts to understand your approach.";

  const {
    questionOutcomes,
    greenCount,
    redCount,
    awarenessLevel,
    awarenessReady
  } = useMemo(() => {
    const outcomes = {};
    const allAnswered = PSYCHOLOGICAL_QUESTION_IDS.every(id => {
      const value = answers[id];
      return Array.isArray(value) ? value.length > 0 : !!value;
    });

    if (!allAnswered) {
      return {
        questionOutcomes: outcomes,
        greenCount: 0,
        redCount: 0,
        awarenessLevel: null,
        awarenessReady: false,
      };
    }

    let greens = 0;
    let reds = 0;
    PSYCHOLOGICAL_QUESTION_IDS.forEach(id => {
      const question = questions.find(q => q.id === id);
      const outcome = deriveOutcomeForQuestion(question, answers[id]);
      if (outcome) {
        outcomes[id] = outcome;
        if (outcome === "GREEN") greens += 1;
        if (outcome === "RED") reds += 1;
      }
    });

    const level = computeRiskAwareness(greens, reds);

    return {
      questionOutcomes: outcomes,
      greenCount: greens,
      redCount: reds,
      awarenessLevel: level,
      awarenessReady: true,
    };
  }, [answers, questions]);

  const primaryRiskProfile = answers[9];
  const hasDiscrepancy = primaryRiskProfile === "Low risk-inclined" && awarenessLevel === RiskAwarenessLevel.HIGH_AWARENESS;

  // Special validation for the asset preference question
  const isValidAssetSelection = () => {
    if (currentQuestion.id === 10) {
      const selection = answers[currentQuestion.id];
      if (!selection || !Array.isArray(selection)) return false;
      return selection.length >= 1 && selection.length <= 8;
    }
    return hasAnsweredCurrent;
  };

  const isQuestionDisabled = (questionId) => {
    return false;
  };

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4 flex flex-col items-center justify-center mt-10">
      {awarenessReady && awarenessLevel && (
        <div className="w-full max-w-3xl mb-8 bg-card/80 border border-border rounded-xl p-4 shadow-sm">
          <div className="flex flex-col gap-2">
            {/* Informational-only awareness badge (computed from answers) */}
            <RiskAwarenessBadge level={awarenessLevel} greenCount={greenCount} redCount={redCount} />
            <p className="text-sm text-muted-foreground">
              Informational awareness only · Derived from your responses · Does not affect your selected risk profile
            </p>
            {hasDiscrepancy && (
              <div className="mt-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                There may be differences between your selected risk approach and some of your responses. This information is provided for awareness purposes only.
              </div>
            )}
          </div>
        </div>
      )}
      <div className="text-center mb-12 max-w-2xl">
        <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-clip-text text-primary">
          Investment Profile Assessment
        </h1>
        <p className="text-muted-foreground text-base md:text-lg mb-8 leading-relaxed">
          {isEditing 
            ? "Review and update your investment preferences to get personalized recommendations"
            : "Help us understand your investment style to provide personalized recommendations"
          }
        </p>
        {awarenessReady && awarenessLevel && (
          <div className="mb-6">
            {/* Informational-only awareness; does not alter primary risk profile */}
            <RiskAwarenessBadge level={awarenessLevel} greenCount={greenCount} redCount={redCount} />
          </div>
        )}
        {isEditing && (
          <div className="bg-gradient-to-br from-primary/10 to-purple-600/10 border border-primary/30 rounded-xl p-4 mb-8">
            <span className="text-primary font-semibold text-sm block">
              📝 Editing Mode - Your previous answers are loaded below
            </span>
            {currentQuestion.id === 10 && Array.isArray(answers[10]) && (
              <div className="bg-gradient-to-br from-green-500/10 to-emerald-600/10 border border-green-500/30 rounded-lg p-3 mt-3">
                <span className="text-green-500 font-semibold text-sm">
                  Selected {answers[10].length}/{currentQuestion.maxSelections || 8} assets —— Click any selected asset to deselect it
                </span>
              </div>
            )}
          </div>
        )}
        <div className="w-full h-2 bg-muted/30 rounded-full overflow-hidden mb-4">
          <div 
            className="h-full bg-gradient-to-r from-blue-900 to-blue-600 rounded-full transition-all duration-300 ease-out" 
            style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
          ></div>
        </div>
        <span className="text-primary text-sm font-medium">
          Question {currentQuestionIndex + 1} of {questions.length}
        </span>
      </div>

      <div className="w-full max-w-3xl mb-12">
        <div className="mb-4 text-center">
          <h2 className="text-lg font-semibold text-foreground">{sectionTitle}</h2>
          <p className="text-sm text-muted-foreground">
            {sectionHelper}
          </p>
        </div>
        <QuestionCard
          question={currentQuestion}
          onAnswer={handleAnswer}
          selectedAnswer={answers[currentQuestion.id]}
          disabled={isQuestionDisabled(currentQuestion.id)}
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-center items-center w-full max-w-md">
        <button
          className="w-full sm:w-auto min-w-[140px] px-6 py-3 bg-background/80 hover:bg-background text-muted-foreground hover:text-foreground border border-border rounded-xl font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handlePrevious}
          disabled={currentQuestionIndex === 0}
        >
          ← Previous
        </button>
        
        {isLastQuestion ? (
          <button
            className="w-full sm:w-auto min-w-[140px] px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:shadow-lg hover:shadow-green-500/30 text-white rounded-xl font-semibold transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
            onClick={handleSubmit}
            disabled={!isValidAssetSelection() || isSubmitting}
          >
            {isSubmitting ? 'Saving...' : (isEditing ? 'Update Preferences' : 'Complete Assessment')}
          </button>
        ) : (
          <button
            className="w-full sm:w-auto min-w-[140px] px-6 py-3 bg-primary hover:shadow-lg hover:shadow-primary/30 text-primary-foreground rounded-xl font-semibold transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
            onClick={handleNext}
            disabled={!isValidAssetSelection()}
          >
            Next →
          </button>
        )}
      </div>
    </div>
  );
};

export default Preferences;
