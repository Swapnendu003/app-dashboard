import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Search, X, AlertCircle } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}

interface SearchableDropdownProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  onSearch: (query: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  label?: string;
  loading?: boolean;
  error?: string | null;
}

const SearchableDropdown: React.FC<SearchableDropdownProps> = ({
  options,
  value,
  onChange,
  onSearch,
  placeholder = 'Select an option',
  searchPlaceholder = 'Search...',
  label,
  loading = false,
  error = null,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Handle click outside of dropdown
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

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      searchInputRef.current?.focus();
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchText);
      if (searchText.trim()) {
        onSearch(searchText);
      }
    }, 300); 
    
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchText, onSearch]);

  const selectedOption = options.find(option => option.value === value);
  const displayText = selectedOption ? selectedOption.label : placeholder;

  return (
    <div className="relative" ref={dropdownRef}>
      {label && <div className="block text-sm text-gray-700 mb-1">{label}</div>}
      
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`flex justify-between items-center p-2 bg-orange-50 border ${error ? 'border-red-400' : 'border-orange-200'} text-gray-900 rounded-md cursor-pointer`}
      >
        <div className="truncate">{displayText}</div>
        <ChevronDown className={`h-4 w-4 ml-2 transition-transform ${isOpen ? 'transform rotate-180' : ''}`} />
      </div>
      
      {isOpen && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-orange-200 rounded-md shadow-lg">
          <div className="p-2 border-b border-orange-100 flex items-center">
            <Search className="h-4 w-4 text-gray-300 mr-2" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder={searchPlaceholder}
              className="bg-transparent text-gray-900 w-full focus:outline-none"
            />
            {searchText && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setSearchText('');
                }} 
                className="text-gray-300 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          
          {error && (
            <div className="px-3 py-2 text-xs text-red-500 flex items-center border-b border-orange-100">
              <AlertCircle className="h-3 w-3 mr-1 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          
          {loading ? (
            <div className="py-4 flex justify-center items-center">
              <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-orange-500"></div>
              <span className="ml-2 text-sm text-gray-400">Searching...</span>
            </div>
          ) : options.length === 0 ? (
            <div className="p-2 text-center text-gray-300">No options available</div>
          ) : (
            <ul className="max-h-60 overflow-y-auto">
              {options.map(option => (
                <li 
                  key={option.value}
                  className={`p-2 hover:bg-orange-100 cursor-pointer ${option.value === value ? 'bg-orange-100 text-gray-700' : 'text-gray-900'}`}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                >
                  {option.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      
      {error && !isOpen && (
        <div className="mt-1 text-xs text-red-500 flex items-center">
          <AlertCircle className="h-3 w-3 mr-1 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

export default SearchableDropdown;
