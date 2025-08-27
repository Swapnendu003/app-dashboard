import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface Option {
  value: string;
  label: string;
  meta?: {
    isDefault?: boolean;
    protected?: boolean;
  };
}

interface MultiSelectDropdownProps {
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  label?: string;
  loading?: boolean;
  error?: string | null;
}

const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select options',
  label,
  loading = false,
  error = null,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const toggleOption = (optionValue: string) => {
    const newValue = value.includes(optionValue)
      ? value.filter(v => v !== optionValue)
      : [...value, optionValue];
    onChange(newValue);
  };

  const displayText = value.length > 0
    ? `${value.length} branch${value.length > 1 ? 'es' : ''} selected`
    : placeholder;

  return (
    <div className="relative" ref={dropdownRef}>
      {label && <div className="block text-sm text-orange-700 mb-1">{label}</div>}
      
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`flex justify-between items-center p-2 bg-orange-50 border ${error ? 'border-red-400' : 'border-orange-200'} text-orange-900 rounded-md cursor-pointer`}
      >
        <div className="truncate">{displayText}</div>
        <ChevronDown className={`h-4 w-4 ml-2 transition-transform ${isOpen ? 'transform rotate-180' : ''}`} />
      </div>
      
      {isOpen && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-orange-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {loading ? (
            <div className="py-4 flex justify-center items-center">
              <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-orange-500"></div>
              <span className="ml-2 text-sm text-orange-400">Loading...</span>
            </div>
          ) : options.length === 0 ? (
            <div className="p-2 text-center text-orange-300">No options available</div>
          ) : (
            <ul>
              {options.map(option => (
                <li 
                  key={option.value}
                  className="p-2 hover:bg-orange-50 cursor-pointer flex items-center gap-3"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleOption(option.value);
                  }}
                >
                  <div className={`flex-shrink-0 w-5 h-5 border-2 rounded flex items-center justify-center ${
                    value.includes(option.value) ? 'bg-orange-500 border-orange-500' : 'border-orange-300'
                  }`}>
                    {value.includes(option.value) && <Check className="h-4 w-4 text-white" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span 
                      className="text-orange-900 truncate block"
                      title={option.label}
                    >
                      {option.label}
                      {option.meta?.isDefault && (
                        <span className="ml-1 text-xs text-orange-400 whitespace-nowrap">(default)</span>
                      )}
                      {option.meta?.protected && (
                        <span className="ml-1 text-xs whitespace-nowrap">🔒</span>
                      )}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      
      {error && !isOpen && (
        <div className="mt-1 text-xs text-red-500">{error}</div>
      )}
    </div>
  );
};

export default MultiSelectDropdown;
