'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { FileCoverage } from '@/types/coverage';
import { Search } from 'lucide-react';

interface FileHeatmapProps {
  files: FileCoverage[];
}

const FileHeatmap: React.FC<FileHeatmapProps> = ({ files }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredFiles, setFilteredFiles] = useState<FileCoverage[]>([]);
  
  // Generate color based on coverage percentage
  const getHeatmapColor = (coverage: number): string => {
    if (coverage >= 80) return 'bg-green-500';
    if (coverage >= 60) return 'bg-green-600';
    if (coverage >= 40) return 'bg-yellow-500';
    if (coverage >= 20) return 'bg-orange-500';
    return 'bg-red-500';
  };

  // Get file basename from path
  const getFileName = (filePath: string): string => {
    const parts = filePath.split('/');
    return parts[parts.length - 1];
  };

  // Sort and filter files based on search query
  useEffect(() => {
    if (!files) {
      setFilteredFiles([]);
      return;
    }
    
    let result = [...files];
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(file => 
        file.file.toLowerCase().includes(query)
      );
    }
    result.sort((a, b) => a.coverage - b.coverage);
    setFilteredFiles(result);
  }, [searchQuery, files]);

  if (!files || files.length === 0) {
    return (
      <div className="bg-[#1F2B39] rounded-lg border border-gray-700 p-4 my-4">
        <h3 className="text-lg font-medium text-gray-300 mb-4">File Coverage Heatmap</h3>
        <p className="text-gray-400 text-center py-8">No file coverage data available</p>
      </div>
    );
  }

  return (
    <div className="bg-[#1F2B39] rounded-lg border border-gray-700 p-4 my-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-gray-300">File Coverage Heatmap</h3>
        <div className="w-1/3">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search files..."
              className="w-full pl-8 pr-3 py-2 bg-[#263544] text-white rounded-md border border-gray-700 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>
      
      {filteredFiles.length === 0 ? (
        <p className="text-gray-400 text-center py-8">
          {searchQuery ? 'No matching files found' : 'No files to display'}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredFiles.map((file) => (
              <div 
                key={file.file} 
                className="flex flex-col border border-gray-700 rounded-md overflow-hidden bg-[#263544]"
              >
                <div className={`w-full h-2 ${getHeatmapColor(file.coverage)}`} />
                <div className="p-3">
                  <div className="flex justify-between items-center">
                    <div className="font-mono text-sm text-gray-300 truncate" title={file.file}>
                      {getFileName(file.file)}
                    </div>
                    <div className="text-sm font-medium text-[#FF7D2D]">
                      {file.coverage.toFixed(1)}%
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 truncate mt-1" title={file.file}>
                    {file.file}
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {searchQuery && (
            <div className="mt-3 text-sm text-gray-400">
              Showing {filteredFiles.length} of {files.length} files
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default FileHeatmap;
