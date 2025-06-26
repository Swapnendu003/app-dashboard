import React, { useState } from 'react';
import { DashboardComponent } from '@/types/dashboardTypes';

interface ComponentLibraryProps {
  components: DashboardComponent[];
  onSelect: (component: DashboardComponent) => void;
  onClose: () => void;
}

const ComponentLibrary: React.FC<ComponentLibraryProps> = ({ components, onSelect, onClose }) => {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const filteredComponents = components.filter(comp => {
    const matchesSearch = comp.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          comp.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !activeCategory || comp.type === activeCategory;
    
    return matchesSearch && matchesCategory;
  });
  
  const categories = Array.from(new Set(components.map(comp => comp.type)));
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 transition-all duration-300 hover:backdrop-blur-sm">
      <div className={` 'bg-white text-black'} rounded-lg shadow-lg max-w-4xl w-full border border-gray-700 max-h-[80vh] flex flex-col`}>
        <div className="p-4 border-b border-gray-700">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-base font-bold text-white">Component Library</h3>
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors duration-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="mb-3 relative">
            <input 
              type="text"
              placeholder="Search components..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-2 pl-8 border border-gray-600 rounded bg-gray-700 text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#f97316] focus:border-[#f97316]"
            />
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute left-2.5 top-2.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <div className="flex space-x-2 overflow-x-auto pb-2">
            <button 
              onClick={() => setActiveCategory(null)}
              className={`px-3 py-1 rounded text-xs transition-all duration-200 whitespace-nowrap ${
                !activeCategory 
                  ? 'bg-[#f97316] text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              All
            </button>
            {categories.map((category, index) => (
              <button 
                key={index}
                onClick={() => setActiveCategory(category === activeCategory ? null : category)}
                className={`px-3 py-1 rounded text-xs transition-all duration-200 whitespace-nowrap ${
                  category === activeCategory 
                    ? 'bg-[#f97316] text-white' 
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </button>
            ))}
          </div>
        </div>
        
        <div className="p-4 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredComponents.map((component, index) => (
              <div 
                key={index}
                className="bg-gray-700 rounded-lg p-3 border border-gray-600 hover:border-[#f97316] cursor-pointer transition-all duration-200 hover:shadow-md"
                onClick={() => onSelect(component)}
              >
                <div className="flex justify-between items-start mb-2">
                  <h4 className="text-sm font-medium text-white">{component.name}</h4>
                  <span className="px-2 py-1 bg-gray-800 rounded-full text-xs text-gray-300">
                    {component.type}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mb-3">{component.description}</p>
                <div className="flex justify-end">
                  <button className="bg-gray-800 hover:bg-gray-600 text-white text-xs px-3 py-1 rounded transition-transform duration-200 transform hover:scale-105">
                    Add to Dashboard
                  </button>
                </div>
              </div>
            ))}
            
            {filteredComponents.length === 0 && (
              <div className="col-span-full text-center py-8">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto text-gray-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-gray-400">No components found matching your search</p>
              </div>
            )}
          </div>
        </div>
        
        <div className="p-4 border-t border-gray-700 flex justify-end">
          <button 
            onClick={onClose}
            className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-4 py-2 rounded text-sm transition-all duration-300 mr-2"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default ComponentLibrary;
