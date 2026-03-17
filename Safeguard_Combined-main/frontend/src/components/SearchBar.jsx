import React from 'react';

const SearchBar = ({
  value,
  onValueChange,
  onSearch,
  placeholder = 'Search...',
  className = '',
  buttonClassName = '',
}) => (
  <div className={`flex items-center gap-2 ${className}`}>
    <input
      className="px-3 py-2 border border-border rounded-md bg-background text-sm w-full md:w-64"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    />
    <button
      className={`px-3 py-2 text-sm border border-border rounded-md bg-background hover:bg-muted transition ${buttonClassName}`}
      onClick={onSearch}
      type="button"
    >
      Search
    </button>
  </div>
);

export default SearchBar;
