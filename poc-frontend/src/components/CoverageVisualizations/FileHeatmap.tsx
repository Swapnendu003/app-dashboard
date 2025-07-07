'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { FileCoverage } from '@/types/coverage';
import { Search, AlertCircle } from 'lucide-react';

interface FileHeatmapProps {
  files: FileCoverage[];
}

const FileHeatmap: React.FC<FileHeatmapProps> = ({ files }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredFiles, setFilteredFiles] = useState<FileCoverage[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileCoverage | null>(null);
  const [showErrorModal, setShowErrorModal] = useState<boolean>(false);
  
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

  // Show error modal for a file
  const showFileError = (file: FileCoverage) => {
    setSelectedFile(file);
    setShowErrorModal(true);
  };

  // Count files with errors
  const filesWithErrors = useMemo(() => {
    if (!files) return 0;
    return files.filter(file => file.error && file.error.trim() !== '').length;
  }, [files]);

  if (!files || files.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-orange-100 p-4 my-4">
        <h3 className="text-lg font-medium text-orange-700 mb-4">File Coverage Heatmap</h3>
        <p className="text-orange-400 text-center py-8">No file coverage data available</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-orange-100 p-4 my-4">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center">
          <h3 className="text-lg font-medium text-orange-700">File Coverage Heatmap</h3>
          {filesWithErrors > 0 && (
            <span className="ml-3 bg-red-100 text-red-700 text-xs font-medium px-2 py-1 rounded-full flex items-center">
              <AlertCircle size={12} className="mr-1" />
              {filesWithErrors} file{filesWithErrors !== 1 ? 's' : ''} with errors
            </span>
          )}
        </div>
        <div className="w-1/3">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-orange-300" />
            <input
              type="text"
              placeholder="Search files..."
              className="w-full pl-8 pr-3 py-2 bg-orange-50 text-orange-900 rounded-md border border-orange-200 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>
      
      {filteredFiles.length === 0 ? (
        <p className="text-orange-400 text-center py-8">
          {searchQuery ? 'No matching files found' : 'No files to display'}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredFiles.map((file) => (
              <div 
                key={file.file} 
                className={`flex flex-col border rounded-md overflow-hidden transition-colors ${
                  file.error ? 'border-red-300 bg-orange-50 hover:border-red-500' : 'border-orange-100 bg-orange-50'
                }`}
              >
                <div className={`w-full h-2 ${getHeatmapColor(file.coverage)}`} />
                <div className="p-3">
                  <div className="flex justify-between items-center">
                    <div className="font-mono text-sm text-orange-900 truncate" title={file.file}>
                      {getFileName(file.file)}
                      {file.error && (
                        <AlertCircle size={14} className="inline ml-1 text-red-500" />
                      )}
                    </div>
                    <div className="text-sm font-medium text-orange-600">
                      {file.coverage.toFixed(1)}%
                    </div>
                  </div>
                  <div className="text-xs text-orange-300 truncate mt-1" title={file.file}>
                    {file.file}
                  </div>
                  {file.error && (
                    <button
                      onClick={() => showFileError(file)}
                      className="mt-2 text-xs text-red-500 hover:text-red-700 flex items-center"
                    >
                      <AlertCircle size={12} className="mr-1" />
                      View error details
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {searchQuery && (
            <div className="mt-3 text-sm text-orange-400">
              Showing {filteredFiles.length} of {files.length} files
            </div>
          )}
        </>
      )}

      {/* Error Modal */}
      {showErrorModal && selectedFile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-semibold text-red-600 flex items-center">
                <AlertCircle size={20} className="mr-2" />
                Error in file
              </h3>
              <button 
                onClick={() => setShowErrorModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            <div className="mb-4">
              <p className="font-mono text-sm text-gray-800 mb-1">{selectedFile.file}</p>
              <div className="flex items-center">
                <span className="text-sm text-gray-600 mr-2">Coverage:</span>
                <span className={`text-sm font-medium ${
                  selectedFile.coverage >= 60 ? 'text-green-600' : 
                  selectedFile.coverage >= 30 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {selectedFile.coverage.toFixed(1)}%
                </span>
              </div>
            </div>
            
            <div className="bg-red-50 border border-red-200 rounded p-4 mb-4">
              <h4 className="text-sm font-medium text-red-800 mb-2">Error Details:</h4>
              <pre className="whitespace-pre-wrap text-sm font-mono text-red-700 overflow-auto max-h-60">
                {selectedFile.error}
              </pre>
            </div>
            
            <div className="flex justify-end">
              <button
                onClick={() => setShowErrorModal(false)}
                className="bg-orange-100 hover:bg-orange-200 text-orange-700 font-medium py-2 px-4 rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileHeatmap;
