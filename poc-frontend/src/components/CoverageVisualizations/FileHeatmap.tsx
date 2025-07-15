'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Search, AlertCircle, Grid, List, BarChart3, TrendingUp, FileText, Zap } from 'lucide-react';
import SpotlightCard from '@/components/SpotLightCard'; // <-- Updated import path
import AnimatedList from '@/components/AnimatedList';

// Mock data for demonstration
const generateMockFiles = (count: number) => {
  const extensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.go', '.rs'];
  const directories = ['src/components', 'src/utils', 'src/services', 'src/hooks', 'src/pages', 'tests', 'lib', 'config'];
  
  return Array.from({ length: count }, (_, i) => {
    const dir = directories[Math.floor(Math.random() * directories.length)];
    const ext = extensions[Math.floor(Math.random() * extensions.length)];
    const coverage = Math.random() * 100;
    const hasError = Math.random() < 0.05; // 5% chance of error
    
    return {
      file: `${dir}/component${i}${ext}`,
      coverage: coverage,
      error: hasError ? `Error parsing file: unexpected token at line ${Math.floor(Math.random() * 100)}` : undefined,
      status: hasError ? "Failure" : "Success"
    };
  });
};

interface FileCoverage {
  file: string;
  coverage: number;
  error?: string;
  status?: string;
}

interface FileHeatmapProps {
  files: FileCoverage[];
}

const FileHeatmap: React.FC<FileHeatmapProps> = ({ files: propFiles }) => {
 
  const files = propFiles && propFiles.length > 0 ? propFiles : generateMockFiles(1247);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredFiles, setFilteredFiles] = useState<FileCoverage[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileCoverage | null>(null);
  const [showErrorModal, setShowErrorModal] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'analytics' | 'heatmap' | 'list'>('analytics');
  const [sortBy, setSortBy] = useState<'coverage' | 'name' | 'directory'>('coverage');
  const [currentPage, setCurrentPage] = useState(1);
  const [hoveredSquare, setHoveredSquare] = useState<string | null>(null);

  const [fileTypeFilter, setFileTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const itemsPerPage = 10;
  
  // Generate color based on coverage percentage
  const getHeatmapColor = (coverage: number): string => {
    if (coverage >= 80) return '#22c55e'; // green-500
    if (coverage >= 60) return '#84cc16'; // lime-500
    if (coverage >= 40) return '#eab308'; // yellow-500
    if (coverage >= 20) return '#f97316'; // orange-500
    return '#ef4444'; // red-500
  };

  // Get file basename from path
  const getFileName = (filePath: string): string => {
    const parts = filePath.split('/');
    return parts[parts.length - 1];
  };

  const getDirectory = (filePath: string): string => {
    const parts = filePath.split('/');
    return parts.slice(0, -1).join('/') || '.';
  };

  // Get all unique file extensions for filter dropdown
  const allExtensions = useMemo(() => {
    const exts = Array.from(new Set(files.map(f => f.file.split('.').pop() || 'unknown')));
    return exts.sort();
  }, [files]);

  // Sort and filter files
  useEffect(() => {
    if (!files) {
      setFilteredFiles([]);
      return;
    }
    
    let result = [...files];
    
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(file => 
        file.file.toLowerCase().includes(query)
      );
    }

    // Filter by file type (extension)
    if (fileTypeFilter !== 'all') {
      result = result.filter(file => (file.file.split('.').pop() || 'unknown') === fileTypeFilter);
    }
    // Filter by status
    if (statusFilter !== 'all') {
      result = result.filter(file => file.status === statusFilter);
    }
    
    // Sort files
    result.sort((a, b) => {
      switch (sortBy) {
        case 'coverage':
          return b.coverage - a.coverage; // high to low
        case 'name':
          return getFileName(a.file).localeCompare(getFileName(b.file));
        case 'directory':
          return getDirectory(a.file).localeCompare(getDirectory(b.file));
        default:
          return 0;
      }
    });
    
    setFilteredFiles(result);
    setCurrentPage(1);
  }, [searchQuery, files, sortBy, fileTypeFilter, statusFilter]);

  // Pagination
  const paginatedFiles = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredFiles.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredFiles, currentPage]);

  const totalPages = Math.ceil(filteredFiles.length / itemsPerPage);

  // Statistics and chart data
  const stats = useMemo(() => {
    if (!files) return { 
      total: 0, withErrors: 0, avgCoverage: 0, highCoverage: 0, lowCoverage: 0,
      coverageRanges: [], directoryStats: [], extensionStats: []
    };
    
    const withErrors = files.filter(f => f.error).length;
    const avgCoverage = files.reduce((sum, f) => sum + f.coverage, 0) / files.length;
    const highCoverage = files.filter(f => f.coverage >= 80).length;
    const lowCoverage = files.filter(f => f.coverage < 40).length;
    
    // Coverage ranges for charts
    const coverageRanges = [
      { range: '≥80%', color: '#22c55e', count: files.filter(f => f.coverage >= 80).length },
      { range: '60-79%', color: '#84cc16', count: files.filter(f => f.coverage >= 60 && f.coverage < 80).length },
      { range: '40-59%', color: '#eab308', count: files.filter(f => f.coverage >= 40 && f.coverage < 60).length },
      { range: '20-39%', color: '#f97316', count: files.filter(f => f.coverage >= 20 && f.coverage < 40).length },
      { range: '<20%', color: '#ef4444', count: files.filter(f => f.coverage < 20).length },
    ];

    // Directory statistics
    const dirMap = new Map<string, { count: number; totalCoverage: number }>();
    files.forEach(file => {
      const dir = getDirectory(file.file);
      const existing = dirMap.get(dir) || { count: 0, totalCoverage: 0 };
      dirMap.set(dir, {
        count: existing.count + 1,
        totalCoverage: existing.totalCoverage + file.coverage
      });
    });
    
    const directoryStats = Array.from(dirMap.entries())
      .map(([dir, stats]) => ({
        directory: dir,
        fileCount: stats.count,
        avgCoverage: stats.totalCoverage / stats.count
      }))
      .sort((a, b) => b.fileCount - a.fileCount)
      .slice(0, 10);

    // Extension statistics
    const extMap = new Map<string, { count: number; totalCoverage: number }>();
    files.forEach(file => {
      const ext = file.file.split('.').pop() || 'unknown';
      const existing = extMap.get(ext) || { count: 0, totalCoverage: 0 };
      extMap.set(ext, {
        count: existing.count + 1,
        totalCoverage: existing.totalCoverage + file.coverage
      });
    });
    
    const extensionStats = Array.from(extMap.entries())
      .map(([ext, stats]) => ({
        extension: ext,
        fileCount: stats.count,
        avgCoverage: stats.totalCoverage / stats.count
      }))
      .sort((a, b) => b.fileCount - a.fileCount);
    
    return { 
      total: files.length, 
      withErrors, 
      avgCoverage, 
      highCoverage, 
      lowCoverage,
      coverageRanges,
      directoryStats,
      extensionStats
    };
  }, [files]);

  const showFileError = (file: FileCoverage) => {
    setSelectedFile(file);
    setShowErrorModal(true);
  };

  // Prepare top directories for AnimatedList
  const topDirectoryItems = useMemo(() => {
    return stats.directoryStats.map((dir) => {
      return (
        <div className="flex items-center justify-between w-full">
          <div className="flex-1 min-w-0">
            <div className="font-mono text-sm text-purple-800 truncate" title={dir.directory}>
              {dir.directory}
            </div>
            <div className="text-xs text-purple-600">
              {dir.fileCount} files
            </div>
          </div>
          <div className="ml-3 flex items-center">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: getHeatmapColor(dir.avgCoverage) }}
            />
          </div>
        </div>
      );
    });
  }, [stats.directoryStats]);

  if (!files || files.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-orange-100 p-4 my-4">
        <h3 className="text-lg font-medium text-orange-700 mb-4">File Coverage Analysis</h3>
        <p className="text-orange-400 text-center py-8">No file coverage data available</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-orange-100 p-6 my-4 shadow-sm">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-6 gap-4">
        <div>
          <h3 className="text-xl font-semibold text-orange-700 flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            File Coverage Analysis
          </h3>
          <p className="text-sm text-orange-500 mt-1">
            {stats.total} files analyzed
            {stats.withErrors > 0 && (
              <span className="ml-2 text-red-600">• {stats.withErrors} errors detected</span>
            )}
          </p>
        </div>
        
        {/* View Mode Toggles */}
        <div className="flex items-center gap-1 bg-orange-50 p-1 rounded-lg">
          <button
            onClick={() => setViewMode('analytics')}
            className={`px-3 py-2 rounded-md transition-all duration-200 flex items-center gap-2 ${
              viewMode === 'analytics' 
                ? 'bg-orange-500 text-white shadow-md transform scale-105' 
                : 'text-orange-600 hover:bg-orange-100 hover:scale-105'
            }`}
            title="Analytics view"
          >
            <TrendingUp size={16} />
            <span className="text-sm font-medium">Analytics</span>
          </button>
          <button
            onClick={() => setViewMode('heatmap')}
            className={`px-3 py-2 rounded-md transition-all duration-200 flex items-center gap-2 ${
              viewMode === 'heatmap' 
                ? 'bg-orange-500 text-white shadow-md transform scale-105' 
                : 'text-orange-600 hover:bg-orange-100 hover:scale-105'
            }`}
            title="Heatmap view"
          >
            <Grid size={16} />
            <span className="text-sm font-medium">Heatmap</span>
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-2 rounded-md transition-all duration-200 flex items-center gap-2 ${
              viewMode === 'list' 
                ? 'bg-orange-500 text-white shadow-md transform scale-105' 
                : 'text-orange-600 hover:bg-orange-100 hover:scale-105'
            }`}
            title="List view"
          >
            <List size={16} />
            <span className="text-sm font-medium">List</span>
          </button>
        </div>
      </div>

      {/* Analytics View (Default) */}
      {viewMode === 'analytics' && (
        <div className="space-y-8">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SpotlightCard
              className="custom-spotlight-card bg-gradient-to-br from-blue-100 to-blue-50 border border-blue-200"
              spotlightColor="rgba(59, 131, 246, 0.44)"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold text-blue-700">{stats.total}</div>
                  <div className="text-sm text-blue-600 font-medium">Total Files</div>
                </div>
                <FileText className="w-8 h-8 text-blue-500" />
              </div>
            </SpotlightCard>
            <SpotlightCard
              className="custom-spotlight-card bg-gradient-to-br from-green-100 to-green-50 border border-green-200"
              spotlightColor="rgba(34, 197, 94, 0.4)"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold text-green-700">{stats.highCoverage}</div>
                  <div className="text-sm text-green-600 font-medium">High Coverage (≥80%)</div>
                </div>
                <Zap className="w-8 h-8 text-green-500" />
              </div>
            </SpotlightCard>
            <SpotlightCard
              className="custom-spotlight-card bg-gradient-to-br from-red-100 to-red-50 border border-red-200"
              spotlightColor="rgba(239, 68, 68, 0.42)"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold text-red-700">{stats.lowCoverage}</div>
                  <div className="text-sm text-red-600 font-medium">Low Coverage (&lt;40%)</div>
                </div>
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
            </SpotlightCard>
            <SpotlightCard
              className="custom-spotlight-card bg-gradient-to-br from-orange-100 to-orange-50 border border-orange-200"
              spotlightColor="rgba(251, 146, 60, 0.46)"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold text-orange-700">{((stats.highCoverage / stats.total) * 100).toFixed(1)}%</div>
                  <div className="text-sm text-orange-600 font-medium">Files with Good Coverage</div>
                </div>
                <BarChart3 className="w-8 h-8 text-orange-500" />
              </div>
            </SpotlightCard>
          </div>
          
          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Coverage Distribution Chart */}
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-6 rounded-xl border border-gray-200 hover:shadow-lg transition-all duration-300">
              <h4 className="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Coverage Distribution
              </h4>
              <div className="space-y-3">
                {stats.coverageRanges.map(({ range, color, count }) => {
                  const percentage = (count / files.length) * 100;
                  return (
                    <div key={range} className="group hover:bg-white hover:p-2 hover:rounded-lg transition-all duration-200">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700">{range}</span>
                        <span className="text-sm text-gray-600">{count} files ({percentage.toFixed(1)}%)</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                        <div 
                          className="h-3 rounded-full transition-all duration-500 hover:brightness-110"
                          style={{ 
                            backgroundColor: color,
                            width: `${percentage}%`,
                            boxShadow: `0 0 10px ${color}40`
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Directory Statistics */}
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-xl border border-purple-200 hover:shadow-lg transition-all duration-300">
              <h4 className="text-lg font-semibold text-purple-700 mb-4 flex items-center gap-2">
                <Grid className="w-5 h-5" />
                Top Directories
              </h4>
              <AnimatedList
                items={topDirectoryItems}
                showGradients={true}
                enableArrowNavigation={true}
                displayScrollbar={true}
                itemClassName="bg-white hover:bg-purple-50 border border-purple-100 text-purple-900"
                onItemSelect={undefined}
              />
            </div>
          </div>

          {/* File Extension Analysis */}
          <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 p-6 rounded-xl border border-indigo-200 hover:shadow-lg transition-all duration-300">
            <h4 className="text-lg font-semibold text-indigo-700 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              File Extension Analysis
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {stats.extensionStats.slice(0, 8).map((ext) => (
                <div key={ext.extension} className="bg-white p-4 rounded-lg border border-indigo-100 hover:shadow-md hover:scale-105 transition-all duration-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-sm font-semibold text-indigo-800">.{ext.extension}</span>
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: getHeatmapColor(ext.avgCoverage) }}
                      title={`${ext.avgCoverage.toFixed(1)}% average coverage`}
                    />
                  </div>
                  <div className="text-xs text-indigo-600">
                    {ext.fileCount} files
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Controls for Heatmap and List views */}
      {(viewMode === 'heatmap' || viewMode === 'list') && (
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-orange-300" />
              <input
                type="text"
                placeholder="Search files..."
                className="w-full pl-10 pr-3 py-3 bg-orange-50 text-orange-900 rounded-lg border border-orange-200 text-sm focus:ring-2 focus:ring-orange-300 focus:border-orange-400 transition-all duration-200"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          
          <select
            className="px-4 py-3 bg-orange-50 text-orange-700 rounded-lg border border-orange-200 text-sm focus:ring-2 focus:ring-orange-300 focus:border-orange-400 transition-all duration-200"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'coverage' | 'name' | 'directory')}
          >
            <option value="coverage">Sort by Coverage</option>
            <option value="name">Sort by Name</option>
            <option value="directory">Sort by Directory</option>
          </select>

          {/* File type and status filter in List view */}
          {viewMode === 'list' && (
            <div className="flex gap-2">
              <select
                className="px-4 py-3 bg-orange-50 text-orange-700 rounded-lg border border-orange-200 text-sm focus:ring-2 focus:ring-orange-300 focus:border-orange-400 transition-all duration-200"
                value={fileTypeFilter}
                onChange={e => setFileTypeFilter(e.target.value)}
              >
                <option value="all">All Types</option>
                {allExtensions.map(ext => (
                  <option key={ext} value={ext}>
                    .{ext}
                  </option>
                ))}
              </select>
              <select
                className="px-4 py-3 bg-orange-50 text-orange-700 rounded-lg border border-orange-200 text-sm focus:ring-2 focus:ring-orange-300 focus:border-orange-400 transition-all duration-200"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="Success">Success</option>
                <option value="Failure">Failure</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* Enhanced Heatmap View */}
      {viewMode === 'heatmap' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-6 rounded-xl border border-gray-200">
            {/* File grid with better visualization */}
            <div className="grid gap-2" style={{ 
              gridTemplateColumns: 'repeat(auto-fill, minmax(24px, 1fr))',
              maxWidth: '100%'
            }}>
              {filteredFiles.map((file, index) => (
                <div
                  key={file.file}
                  className="group relative aspect-square rounded-md cursor-pointer transition-all duration-200 hover:scale-150 hover:z-10 hover:shadow-lg"
                  style={{ backgroundColor: getHeatmapColor(file.coverage) }}
                  onClick={() => file.error && showFileError(file)}
                  onMouseEnter={() => setHoveredSquare(file.file)}
                  onMouseLeave={() => setHoveredSquare(null)}
                >
                  {file.error && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <AlertCircle size={12} className="text-white" />
                    </div>
                  )}
                  
                  {/* Enhanced tooltip */}
                  {hoveredSquare === file.file && (
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-50">
                      <div className="bg-black text-white text-xs rounded-lg p-3 shadow-lg min-w-max">
                        <div className="font-semibold">{getFileName(file.file)}</div>
                        <div className="text-gray-300">{getDirectory(file.file)}</div>
                        <div className="font-bold mt-1">{file.coverage.toFixed(1)}% coverage</div>
                        {file.error && (
                          <div className="text-red-300 mt-1">⚠ Has error</div>
                        )}
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-black"></div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          
          {/* Enhanced Legend */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
            {[
              { range: '0-20%', color: '#ef4444', label: 'Critical' },
              { range: '20-40%', color: '#f97316', label: 'Low' },
              { range: '40-60%', color: '#eab308', label: 'Medium' },
              { range: '60-80%', color: '#84cc16', label: 'Good' },
              { range: '80-100%', color: '#22c55e', label: 'Excellent' }
            ].map(({ range, color, label }) => (
              <div key={range} className="flex items-center gap-2 hover:scale-110 transition-transform duration-200">
                <div 
                  className="w-4 h-4 rounded-md shadow-sm"
                  style={{ backgroundColor: color }}
                />
                <span className="font-medium text-gray-700">{label}</span>
                <span className="text-gray-500">({range})</span>
              </div>
            ))}
          </div>
          
          <div className="text-center text-sm text-gray-500 bg-gray-50 py-3 rounded-lg">
            <strong>Showing {filteredFiles.length}</strong> of <strong>{files.length}</strong> files
            {searchQuery && ` matching "${searchQuery}"`}
            <br />
            <span className="text-xs">Hover over squares for details • Click error icons for details</span>
          </div>
        </div>
      )}

      {/* Enhanced List View */}
      {viewMode === 'list' && (
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-orange-100 to-orange-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-orange-700">File</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-orange-700">Directory</th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-orange-700">Coverage</th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-orange-700">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-orange-100 bg-white">
                  {paginatedFiles.map((file, index) => (
                    <tr 
                      key={file.file} 
                      className="hover:bg-gradient-to-r hover:from-orange-50 hover:to-orange-100 transition-all duration-200 hover:scale-[1.02] hover:shadow-md"
                    >
                      <td className="px-6 py-4">
                        <div className="font-mono text-sm font-semibold text-gray-900 hover:text-orange-700 transition-colors">
                          {getFileName(file.file)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-600 truncate max-w-xs hover:text-gray-800 transition-colors" title={getDirectory(file.file)}>
                          {getDirectory(file.file)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <span className={`text-sm font-bold ${
                            file.coverage >= 80 ? 'text-green-600' :
                            file.coverage >= 60 ? 'text-lime-600' :
                            file.coverage >= 40 ? 'text-yellow-600' :
                            file.coverage >= 20 ? 'text-orange-600' : 'text-red-600'
                          }`}>
                            {file.coverage.toFixed(1)}%
                          </span>
                          <div 
                            className="w-4 h-4 rounded-full shadow-sm hover:scale-125 transition-transform duration-200"
                            style={{ backgroundColor: getHeatmapColor(file.coverage) }}
                          />
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {file.status === "Failure" ? (
                          <>
                            <span className="text-red-500 text-lg mr-2">✗</span>
                            {file.error && (
                              <button
                                onClick={() => showFileError(file)}
                                className="text-red-500 hover:text-red-700 hover:scale-125 transition-all duration-200"
                              >
                                <AlertCircle size={18} />
                              </button>
                            )}
                          </>
                        ) : (
                          <span className="text-green-500 text-lg hover:scale-125 transition-transform duration-200">✓</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Enhanced Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600">
                Showing <strong>{((currentPage - 1) * itemsPerPage) + 1}</strong> to <strong>{Math.min(currentPage * itemsPerPage, filteredFiles.length)}</strong> of <strong>{filteredFiles.length}</strong> files
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 text-sm border border-orange-200 rounded-lg hover:bg-orange-50 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all duration-200"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600 font-medium">
                  Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 text-sm border border-orange-200 rounded-lg hover:bg-orange-50 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all duration-200"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Enhanced Error Modal */}
      {showErrorModal && selectedFile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 shadow-2xl">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-semibold text-red-600 flex items-center">
                <AlertCircle size={20} className="mr-2" />
                Error in file
              </h3>
              <button 
                onClick={() => setShowErrorModal(false)}
                className="text-gray-500 hover:text-gray-700 hover:scale-110 transition-all duration-200"
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
                className="bg-orange-100 hover:bg-orange-200 text-orange-700 font-medium py-2 px-4 rounded-lg hover:scale-105 transition-all duration-200"
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