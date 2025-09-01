'use client';

declare global {
  interface Window {
    echarts?: any;
  }
}

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Search, AlertCircle, Grid, List, BarChart3, TrendingUp, FileText, Zap, PieChart, Info } from 'lucide-react';
import {DEFAULT_MOCKFILE_COUNT} from "@/constants/values"

import SpotlightCard from '../SpotLightCard';
import AnimatedList from '../AnimatedList';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const generateMockFiles = (count: number) => {
  const extensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.go', '.rs'];
  const directories = ['src/components', 'src/utils', 'src/services', 'src/hooks', 'src/pages', 'tests', 'lib', 'config'];
  
  return Array.from({ length: count }, (_, i) => {
    const dir = directories[Math.floor(Math.random() * directories.length)];
    const ext = extensions[Math.floor(Math.random() * extensions.length)];
    const coverage = Math.random() * 100;
    const hasError = Math.random() < 0.05;
    
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

// ECharts Component
const EChartsComponent: React.FC<{ option: any; height?: number }> = ({ option, height = 400 }) => {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const chartInstance = useRef<any>(null);

  useEffect(() => {
    if (!window.echarts) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/echarts/5.4.3/echarts.min.js';
      script.onload = () => initChart();
      document.head.appendChild(script);
    } else {
      initChart();
    }

    function initChart() {
      if (chartRef.current && window.echarts) {
        chartInstance.current = window.echarts.init(chartRef.current);
        if (chartInstance.current) {
          chartInstance.current.setOption(option);
        }
      }
    }

    return () => {
      if (chartInstance.current) {
        chartInstance.current.dispose();
      }
    };
  }, [option]);

  useEffect(() => {
    if (chartInstance.current && option) {
      chartInstance.current.setOption(option, true);
    }
  }, [option]);

  useEffect(() => {
    const handleResize = () => {
      if (chartInstance.current) {
        chartInstance.current.resize();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return <div ref={chartRef} style={{ height: `${height}px`, width: '100%' }} />;
};

const FileHeatmap: React.FC<FileHeatmapProps> = ({ files: propFiles }) => {

  const files = propFiles && propFiles.length > 0 ? propFiles : generateMockFiles(DEFAULT_MOCKFILE_COUNT);

  const [searchQuery, setSearchQuery] = useState('');
  const [filteredFiles, setFilteredFiles] = useState<FileCoverage[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileCoverage | null>(null);
  const [showErrorModal, setShowErrorModal] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'analytics' | 'list'>('analytics');
  const [sortBy, setSortBy] = useState<'coverage' | 'name' | 'directory'>('coverage');
  const [currentPage, setCurrentPage] = useState(1);

  const [fileTypeFilter, setFileTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'error'>('all');
  const [coverageFilter, setCoverageFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const itemsPerPage = 10;
  
  const getHeatmapColor = (coverage: number): string => {
    if (coverage >= 80) return '#22c55e';
    if (coverage >= 60) return '#84cc16';
    if (coverage >= 40) return '#eab308';
    if (coverage >= 20) return '#f97316';
    return '#ef4444';
  };

  const getFileName = (filePath: string): string => {
    const parts = filePath.split('/');
    return parts[parts.length - 1];
  };

  const getDirectory = (filePath: string): string => {
    const parts = filePath.split('/');
    return parts.slice(0, -1).join('/') || '.';
  };

  const allExtensions = useMemo(() => {
    const exts = Array.from(new Set(files.map(f => f.file.split('.').pop() || 'unknown')));
    return exts.sort();
  }, [files]);

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

    if (fileTypeFilter !== 'all') {
      result = result.filter(file => (file.file.split('.').pop() || 'unknown') === fileTypeFilter);
    }

    if (statusFilter === 'error') {
      result = result.filter(file => file.error);
    } else if (statusFilter === 'success') {
      result = result.filter(file => !file.error);
    }

    if (coverageFilter !== 'all') {
      result = result.filter(file => {
        switch (coverageFilter) {
          case 'high':
            return file.coverage >= 80;
          case 'medium':
            return file.coverage >= 40 && file.coverage < 80;
          case 'low':
            return file.coverage < 40;
          default:
            return true;
        }
      });
    }
    
    result.sort((a, b) => {
      switch (sortBy) {
        case 'coverage':
          return b.coverage - a.coverage;
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
  }, [searchQuery, files, sortBy, fileTypeFilter, statusFilter, coverageFilter]);

  const paginatedFiles = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredFiles.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredFiles, currentPage]);

  const totalPages = Math.ceil(filteredFiles.length / itemsPerPage);

  const stats = useMemo(() => {
    if (!files) return { 
      total: 0, withErrors: 0, avgCoverage: 0, highCoverage: 0, lowCoverage: 0,
      coverageRanges: [], directoryStats: [], extensionStats: []
    };
    
    const withErrors = files.filter(f => f.error).length;
    const avgCoverage = files.reduce((sum, f) => sum + f.coverage, 0) / files.length;
    const highCoverage = files.filter(f => f.coverage >= 80).length;
    const lowCoverage = files.filter(f => f.coverage < 40).length;
    
    const coverageRanges = [
      { range: '≥80%', color: '#22c55e', count: files.filter(f => f.coverage >= 80).length },
      { range: '60-79%', color: '#84cc16', count: files.filter(f => f.coverage >= 60 && f.coverage < 80).length },
      { range: '40-59%', color: '#eab308', count: files.filter(f => f.coverage >= 40 && f.coverage < 60).length },
      { range: '20-39%', color: '#f97316', count: files.filter(f => f.coverage >= 20 && f.coverage < 40).length },
      { range: '<20%', color: '#ef4444', count: files.filter(f => f.coverage < 20).length },
    ];

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

  const pieChartOption = useMemo(() => ({
    title: {
      left: 'center',
      textStyle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#374151'
      }
    },
    tooltip: {
      trigger: 'item',
      formatter: '{a} <br/>{b}: {c} files ({d}%)'
    },
    legend: {
      orient: 'vertical',
      right: 10,
      top: 'center'
    },
    series: [{
      name: 'Coverage',
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['40%', '50%'],
      data: stats.coverageRanges.map(range => ({
        value: range.count,
        name: range.range,
        itemStyle: { color: range.color }
      })),
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowOffsetX: 0,
          shadowColor: 'rgba(0, 0, 0, 0.5)'
        }
      }
    }]
  }), [stats.coverageRanges]);

  const barChartOption = useMemo(() => ({
    title: {
      left: 'center',
      textStyle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#374151'
      }
    },
    tooltip: {
      trigger: 'axis',
      formatter: function(params: any) {
        const data = params[0];
        return `${data.name}<br/>Average Coverage: ${data.value.toFixed(1)}%<br/>Files: ${stats.directoryStats.find(d => d.directory === data.name)?.fileCount || 0}`;
      }
    },
    xAxis: {
      type: 'category',
      data: stats.directoryStats.map(d => d.directory),
      axisLabel: {
        rotate: 45,
        fontSize: 10
      }
    },
    yAxis: {
      type: 'value',
      name: 'Coverage %',
      max: 100
    },
    series: [{
      data: stats.directoryStats.map(d => ({
        value: d.avgCoverage,
        itemStyle: { color: getHeatmapColor(d.avgCoverage) }
      })),
      type: 'bar',
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowColor: 'rgba(0, 0, 0, 0.3)'
        }
      }
    }]
  }), [stats.directoryStats]);

  const showFileError = (file: FileCoverage) => {
    setSelectedFile(file);
    setShowErrorModal(true);
  };

  const handleErrorsClick = () => {
    setViewMode('list');
    setStatusFilter('error');
  };

  const topDirectoryItems = useMemo(() => {
    return stats.directoryStats.map((dir) => {
      return (
        <div className="flex items-center justify-between w-full">
          <div className="flex-1 min-w-0">
            <div className="font-mono text-sm text-orange-800 truncate" title={dir.directory}>
              {dir.directory}
            </div>
            <div className="text-xs text-orange-600">
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
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-6 gap-4">
        <div>
          <h3 className="text-xl font-semibold text-orange-700 flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            File Coverage Analysis
          </h3>
          <p className="text-sm text-orange-500 mt-1">
            {stats.total} files analyzed
            {stats.withErrors > 0 && (
              <button
                onClick={handleErrorsClick}
                className="ml-2 text-red-600 hover:text-red-800 hover:underline inline-flex items-center gap-1"
              >
                • {stats.withErrors} errors detected <TrendingUp className="w-3 h-3" />
              </button>
            )}
          </p>
        </div>
        
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

      {viewMode === 'list' && (
        <div className="mb-4 flex flex-wrap gap-4 p-4 bg-orange-50 rounded-lg">
          <div className="flex items-center gap-2">
            <label className="text-sm text-orange-700">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'success' | 'error')}
              className="rounded-md border border-orange-200 px-3 py-1 text-sm"
            >
              <option value="all">All</option>
              <option value="success">Success</option>
              <option value="error">Errors</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-orange-700">Coverage:</label>
            <select
              value={coverageFilter}
              onChange={(e) => setCoverageFilter(e.target.value as 'all' | 'high' | 'medium' | 'low')}
              className="rounded-md border border-orange-200 px-3 py-1 text-sm"
            >
              <option value="all">All</option>
              <option value="high">High (≥80%)</option>
              <option value="medium">Medium (40-79%)</option>
              <option value="low">Low (&lt;40%)</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-orange-700">File Type:</label>
            <select
              value={fileTypeFilter}
              onChange={(e) => setFileTypeFilter(e.target.value)}
              className="rounded-md border border-orange-200 px-3 py-1 text-sm"
            >
              <option value="all">All</option>
              {allExtensions.map(ext => (
                <option key={ext} value={ext}>{ext}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {viewMode === 'analytics' && (
        <div className="space-y-8">
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
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SpotlightCard className="bg-gradient-to-br from-orange-50 to-orange-100 p-6 rounded-xl border border-orange-200 hover:shadow-lg transition-all duration-300"
              spotlightColor='rgba(251, 146, 60, 0.44)'
            >
              <div className="flex items-center gap-2 mb-4">
                <h4 className="text-lg font-semibold text-orange-700 flex items-center gap-2">
                  <PieChart className="w-5 h-5" />
                  Coverage Distribution
                </h4>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4 text-orange-400 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        This pie chart shows how your files are distributed across different coverage ranges.
                        Each slice represents the percentage of files within a specific coverage range.
                        Hover over slices to see exact counts.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <EChartsComponent option={pieChartOption} height={350} />
            </SpotlightCard>
            
            <SpotlightCard className="bg-gradient-to-br from-orange-50 to-orange-100 p-6 rounded-xl border border-orange-200 hover:shadow-lg transition-all duration-300"
              spotlightColor='rgba(251, 146, 60, 0.44)'
            >
              <div className="flex items-center gap-2 mb-4">
                <h4 className="text-lg font-semibold text-orange-700 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Coverage by Directory
                </h4>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4 text-orange-400 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        This bar chart shows average coverage percentage by directory.
                        Bar height indicates coverage level, and colors indicate coverage quality.
                        Hover over bars to see file counts and exact coverage percentages.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <EChartsComponent option={barChartOption} height={350} />
            </SpotlightCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-6 rounded-xl border border-gray-200 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center gap-2 mb-4">
                <h4 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Coverage Distribution
                </h4>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4 text-gray-400 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        This chart shows the distribution of files across coverage ranges.
                        Each bar represents a coverage range, and its width shows the percentage of files.
                        Hover over bars to see exact file counts and percentages.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
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

            <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-6 rounded-xl border border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center gap-2 mb-4">
                <h4 className="text-lg font-semibold text-orange-700 flex items-center gap-2">
                  <Grid className="w-5 h-5" />
                  Top Directories
                </h4>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4 text-orange-400 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        This list shows your most active directories.
                        The colored dot indicates average coverage level for each directory.
                        File counts show the number of files in each directory.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <AnimatedList
                items={topDirectoryItems}
                showGradients={true}
                enableArrowNavigation={true}
                displayScrollbar={true}
                itemClassName="bg-white hover:bg-orange-50 border border-orange-100 "
                onItemSelect={undefined}
              />
            </div>
          </div>
          
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