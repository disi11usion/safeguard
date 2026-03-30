import React, { useState, useEffect } from 'react';

const QuestionCard = ({ question, onAnswer, selectedAnswer, disabled = false }) => {
  const [selectedOptions, setSelectedOptions] = useState(
    selectedAnswer ? (Array.isArray(selectedAnswer) ? selectedAnswer : [selectedAnswer]) : []
  );

  // Reset selectedOptions when question changes
  useEffect(() => {
    if (selectedAnswer) {
      setSelectedOptions(Array.isArray(selectedAnswer) ? selectedAnswer : [selectedAnswer]);
    } else {
      setSelectedOptions([]);
    }
  }, [question.id, selectedAnswer]);

  const handleOptionClick = (option) => {
    // Don't allow changes if question is disabled
    if (disabled) {
      return;
    }

    if (question.multiple) {
      let newSelection;
      
      if (selectedOptions.includes(option)) {
        // Remove option if already selected (allow deselection)
        newSelection = selectedOptions.filter(item => item !== option);
      } else {
        // Add option if not already selected
        if (question.maxSelections && selectedOptions.length >= question.maxSelections) {
          // If max selections reached, don't add more
          return;
        }
        newSelection = [...selectedOptions, option];
      }
      
      setSelectedOptions(newSelection);
      onAnswer(question.id, newSelection);
    } else {
      // Single selection mode
      setSelectedOptions([option]);
      onAnswer(question.id, option);
    }
  };

  const isOptionSelected = (option) => {
    return selectedOptions.includes(option);
  };

  const isOptionDisabled = (option) => {
    if (disabled) return true;
    if (!question.multiple || !question.maxSelections) return false;
    
    // Only disable unselected options when max selections reached
    return !isOptionSelected(option) && selectedOptions.length >= question.maxSelections;
  };

  const getMultipleHint = () => {
    if (question.maxSelections && question.minSelections) {
      if (question.maxSelections === question.minSelections) {
        return `Select exactly ${question.maxSelections}`;
      } else {
        return `Select ${question.minSelections} to ${question.maxSelections}`;
      }
    } else if (question.maxSelections) {
      return `Select up to ${question.maxSelections}`;
    } else if (question.minSelections) {
      return `Select at least ${question.minSelections}`;
    }
    return "Select all that apply";
  };

  const getSelectionStatus = () => {
    // Only show selection status for question 10 (crypto preference)
    if (!question.multiple || question.id !== 10) return null;
    
    const current = selectedOptions.length;
    const min = question.minSelections || 0;
    const max = question.maxSelections || Infinity;
    
    if (current < min) {
      return <span className="inline-block text-xs font-medium px-2 py-1 rounded bg-orange-500/10 border border-orange-500/30 text-orange-500 mt-2">Please select at least {min}</span>;
    } else if (current > max) {
      return <span className="inline-block text-xs font-medium px-2 py-1 rounded bg-destructive/10 border border-destructive/30 text-destructive mt-2">Please select no more than {max}</span>;
    } else {
      return <span className="inline-block text-xs font-medium px-2 py-1 rounded bg-green-500/10 border border-green-500/30 text-green-500 mt-2">Selected {current} of {max}</span>;
    }
  };

  return (
    <div className={`bg-card/50 backdrop-blur-md border border-border rounded-2xl p-6 shadow-xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-2xl ${disabled ? 'opacity-80 pointer-events-none' : ''}`}>
      <div className="mb-6">
        <h2 className="text-foreground text-lg font-semibold leading-relaxed mb-2">{question.question}</h2>
        {question.multiple && (
          <p className="text-primary text-sm font-medium mb-2">{getMultipleHint()}</p>
        )}
        {getSelectionStatus()}
      </div>
      
      <div className={`${question.id === 10 ? 'flex flex-wrap gap-2 justify-start items-start' : 'flex flex-col gap-3'} ${disabled ? 'pointer-events-none' : ''}`}>
        {question.options.map((option, index) => (
          <div
            key={index}
            className={`
              ${question.id === 10 
                ? `inline-block relative px-6 py-2.5 rounded-full text-center whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer transition-all duration-200 border ${
                    isOptionSelected(option)
                      ? 'bg-primary/20 shadow-primary text-foreground font-medium'
                      : 'bg-background/80 border-transparent hover:bg-background text-foreground'
                  } ${isOptionDisabled(option) ? 'opacity-50 cursor-not-allowed' : ''}`
                : `flex items-center px-5 py-3.5 rounded-xl cursor-pointer transition-all duration-300 border relative overflow-hidden ${
                    isOptionSelected(option)
                      ? 'bg-primary/15 border-primary shadow-lg shadow-primary/20'
                      : 'bg-background/30 border-border hover:bg-background/80 hover:border-primary/30 hover:translate-x-1'
                  } ${isOptionDisabled(option) ? 'opacity-50 cursor-not-allowed bg-background/20' : ''}`
              }
            `}
            onClick={() => !isOptionDisabled(option) && handleOptionClick(option)}
          >
            {question.id === 10 ? (
              <>
                {isOptionSelected(option) && (
                  <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full bg-background/90 border-2 border-green-500 text-green-500 font-bold text-sm z-10 opacity-70">
                    ✓
                  </span>
                )}
                <span className="block text-sm">{option}</span>
              </>
            ) : (
              <>
                <div className="mr-3.5 flex-shrink-0">
                  {question.multiple ? (
                    <div className={`w-[18px] h-[18px] border-2 rounded flex items-center justify-center transition-all duration-300 ${
                      isOptionSelected(option)
                        ? 'bg-primary border-primary'
                        : isOptionDisabled(option)
                          ? 'border-border/50 bg-background/50'
                          : 'border-muted-foreground/30'
                    }`}>
                      {isOptionSelected(option) && (
                        <span className="text-primary-foreground text-xs font-bold animate-[checkmarkAppear_0.3s_ease]">✓</span>
                      )}
                    </div>
                  ) : (
                    <div className={`w-[18px] h-[18px] border-2 rounded-full flex items-center justify-center transition-all duration-300 ${
                      isOptionSelected(option) ? 'border-primary' : 'border-muted-foreground/30'
                    }`}>
                      {isOptionSelected(option) && (
                        <div className="w-2 h-2 bg-primary rounded-full animate-[radioDotAppear_0.3s_ease]"></div>
                      )}
                    </div>
                  )}
                </div>
                <span className={`text-sm leading-snug flex-1 ${
                  isOptionSelected(option) ? 'text-foreground font-medium' : isOptionDisabled(option) ? 'text-muted-foreground' : 'text-foreground'
                }`}>
                  {option}
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default QuestionCard;