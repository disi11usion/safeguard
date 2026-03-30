import { useState } from 'react';

const RangeSelector = ({ question, min = 0, max = 100, step = 25, labels, onChange }) => {
    const [value, setValue] = useState(50);

    const handleChange = (e) => {
        const newValue = e.target.value;
        setValue(newValue);
        if (onChange) {
            onChange(newValue);
        }
    };

    // Generate tick marks based on step
    const ticks = [];
    for (let i = min; i <= max; i += step) {
        ticks.push(i);
    }

    // Use custom labels or generate default ones
    const displayLabels = labels || ticks.map((_, index) => index + 1);

    return (
        <div className="w-full rounded-lg shadow-md p-6 range-info">
            <span className="block mb-4 text-1xl font-medium h-12 flex items-center text-white">{question}</span>
            <input 
                type="range" 
                min={min} 
                max={max} 
                value={value} 
                onChange={handleChange}
                className="range w-full range-info" 
                step={step} 
            />
            <div className="flex justify-between px-2.5 mt-2 text-xs">
                {ticks.map((_, index) => (
                    <span key={index}>|</span>
                ))}
            </div>
            <div className="flex justify-between px-2.5 mt-2 text-xs">
                {displayLabels.map((label, index) => (
                    <span key={index}>{label}</span>
                ))}
            </div>
        </div>
    );
};

export default RangeSelector;
