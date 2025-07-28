'use client';

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Repository } from '@/types/repository';
import { runCoverageScan, getCoverageJobStatus, getCoverageHistory, getCoverageTrends, getUserRepositories, getCoverageById, getActiveJobs } from "@/services/api";
import { AlertCircle, BarChart2, History, RefreshCw, GitBranch, GitMerge, GitCompare, Search, Loader2, CheckCircle2, Activity } from 'lucide-react';
import { CoverageResponse, CoverageHistory, CoverageTrend } from '@/types/coverage';
import { 
  FileHeatmap, 
  CoverageHistoryChart, 
  CoverageHistoryList, 
  BranchComparison,
  BranchCoverageList
} from '@/components/CoverageVisualizations';
import SearchableDropdown from "@/components/SearchableDropdown";
import ActiveJobsList from "@/components/ActiveJobsList";

interface CoverageTabProps {
  repositories: Repository[];
  onRefreshRepositories?: () => Promise<void>;
  isRefreshing?: boolean;
}

const CoverageTab: React.FC<CoverageTabProps> = ({ 
  repositories, 
  onRefreshRepositories,
  isRefreshing = false
}) => {

  const [selectedRepo, setSelectedRepo] = useState<string>('');
  const [scanBranch, setScanBranch] = useState<string>('');
  const [coverageResult, setCoverageResult] = useState<CoverageResponse | null>(null);
  const [coverageError, setCoverageError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<'pending' | 'in_progress' | 'completed' | 'failed' | null>(null);

  const [coverageHistory, setCoverageHistory] = useState<CoverageHistory[]>([]);
  const [coverageTrends, setCoverageTrends] = useState<CoverageTrend[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('weekly');

  const [activeTab, setActiveTab] = useState<'scanner' | 'history' | 'branches' | 'compare' | 'jobs'>('scanner');
  const [compareBranch1, setCompareBranch1] = useState<string>('main');
  const [compareBranch2, setCompareBranch2] = useState<string>('develop');
  
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Repository[]>(repositories);
  const [loadingRepos, setLoadingRepos] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [repoOptions, setRepoOptions] = useState<{ value: string; label: string }[]>([]);
  const [skip, setSkip] = useState<number>(0);
  const [limit] = useState<number>(50);

  const [scanSettings, setScanSettings] = useState<{
    useAsync: boolean;
    cloneTimeout: number;
  }>({
    useAsync: false,
    cloneTimeout: 300,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);

  const prevSearchQueryRef = useRef<string>('');
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [activeJobsCount, setActiveJobsCount] = useState(0);

  // Add a concurrency map to track loading state per repo
  const [scanLoadingMap, setScanLoadingMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const options = searchResults.map(repo => ({
      value: repo.html_url,
      label: repo.name
    }));
    setRepoOptions(options);
  }, [searchResults]);

  useEffect(() => {
    if (repositories.length > 0) {
      setSearchResults(repositories);
    }
  }, [repositories]);

  useEffect(() => {
    let statusInterval: NodeJS.Timeout | undefined;
    
    if (jobId && jobStatus && jobStatus !== 'completed' && jobStatus !== 'failed') {
      const isPolling = localStorage.getItem(`job_${jobId}_polling`);
      
      statusInterval = setInterval(async () => {
        try {
          const response = await getCoverageJobStatus(jobId);
          const status = response.data.status;
          
          if (status === 'completed') {
            if (statusInterval) {
              clearInterval(statusInterval);
              statusInterval = undefined;
            }
            setJobStatus(status);
            setSuccess('Coverage scan completed successfully!');
            setScanLoadingMap(prev => ({ ...prev, [selectedRepo]: false }));
            localStorage.removeItem(`job_${jobId}_polling`);
            if (response.data.result_id) {
              try {
                const resultResponse = await getCoverageById(response.data.result_id);
                setCoverageResult(resultResponse.data);
              } catch (resultErr) {
                console.error('Failed to fetch coverage result:', resultErr);
              }
            }
            if (selectedRepo) {
              fetchCoverageHistory(selectedRepo);
            }
            setTimeout(() => {
              setSuccess(null);
              setJobId(null);
              setJobStatus(null);
            }, 5000);
          } else if (status === 'failed') {
            if (statusInterval) {
              clearInterval(statusInterval);
              statusInterval = undefined;
            }
            setJobStatus(status);
            setCoverageError(`Coverage scan failed: ${response.data.error || 'Unknown error'}`);
            setScanLoadingMap(prev => ({ ...prev, [selectedRepo]: false }));
            localStorage.removeItem(`job_${jobId}_polling`);
            setTimeout(() => {
              setCoverageError(null);
              setJobId(null);
              setJobStatus(null);
            }, 5000);
          } else {
            setJobStatus(status);
          }
        } catch (err) {
          console.error('Failed to get job status:', err);
          const now = new Date().getTime();
          const jobStartTime = parseInt(localStorage.getItem(`job_${jobId}_start_time`) || '0');
          if (now - jobStartTime > 5 * 60 * 1000) {
            console.warn('Job polling timeout reached. Stopping status checks.');
            if (statusInterval) {
              clearInterval(statusInterval);
              statusInterval = undefined;
            }
            setJobStatus('failed');
            setCoverageError('Coverage scan timed out. Please try again.');
            setScanLoadingMap(prev => ({ ...prev, [selectedRepo]: false }));
            localStorage.removeItem(`job_${jobId}_polling`);
            setTimeout(() => {
              setJobId(null);
              setJobStatus(null);
              setCoverageError(null);
            }, 5000);
          }
        }
      }, 3000);
      if (!isPolling) {
        localStorage.setItem(`job_${jobId}_start_time`, new Date().getTime().toString());
      }
    }
    return () => {
      if (statusInterval) {
        clearInterval(statusInterval);
      }
    };
  }, [jobId, jobStatus, selectedRepo]);
  
  useEffect(() => {
    return () => {
      if (jobId) {
        localStorage.removeItem(`job_${jobId}_polling`);
      }
    };
  }, [jobId]);

  useEffect(() => {
    if (selectedRepo) {
      const repoUrl = selectedRepo.toLowerCase();
      const isLargeRepo = repoUrl.includes('kubernetes') || 
                         repoUrl.includes('k8s');
      if (isLargeRepo && !scanSettings.useAsync) {
        setScanSettings(prev => ({
          ...prev,
          useAsync: true,
          cloneTimeout: 600, 
        }));
        setShowAdvanced(true); 
      }
    }
  }, [selectedRepo]);

  useEffect(() => {
    if (selectedRepo) {
      fetchCoverageHistory(selectedRepo);
    }
  }, [timeframe, selectedRepo]);
  
  const fetchCoverageHistory = async (repoUrl: string) => {
    if (!repoUrl) return;
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const response = await getCoverageHistory(repoUrl);
      setCoverageHistory(response.data);
      const trendsResponse = await getCoverageTrends(repoUrl, 
        timeframe === 'daily' ? 30 : timeframe === 'weekly' ? 90 : 365);
      setCoverageTrends(trendsResponse.data);
    } catch (err: any) {
      setHistoryError(err.response?.data?.error || 'Failed to fetch coverage history');
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleRepoSearch = useCallback((query: string) => {
    if (query === prevSearchQueryRef.current) {
      return;
    }
    prevSearchQueryRef.current = query;
    setSearchQuery(query);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    setLoadingRepos(true);
    setSearchError(null);
    if (!query.trim() && repositories.length > 0) {
      setSearchResults(repositories);
      setLoadingRepos(false);
      return;
    }
    if (query.trim().length < 3 && repositories.length > 0) {
      const filtered = repositories.filter(repo => 
        repo.name.toLowerCase().includes(query.toLowerCase())
      );
      setSearchResults(filtered);
      setLoadingRepos(false);
      return;
    }
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await getUserRepositories(0, limit, query);
        if (response.data && response.data.repositories) {
          setSearchResults(response.data.repositories);
        } else {
          setSearchResults([]);
        }
      } catch (err: any) {
        console.error('Error searching repositories:', err);
        setSearchError(err.message || 'Failed to search repositories');
      } finally {
        setLoadingRepos(false);
      }
    }, 500);
  }, [repositories, limit]);

  const handleCoverageScan = async () => {
    if (!selectedRepo) return;
    // Use map instead of single loadingCoverage state
    setScanLoadingMap(prev => ({ ...prev, [selectedRepo]: true }));
    setCoverageError(null);
    setSuccess(null);
    setJobId(null);
    setJobStatus(null);
    try {
      const response = await runCoverageScan(
        selectedRepo,
        scanBranch || undefined,
        {
          async: scanSettings.useAsync,
          cloneTimeout: scanSettings.cloneTimeout
        }
      );
      if (scanSettings.useAsync) {
        setJobId(response.data.job_id);
        setJobStatus('in_progress');
        localStorage.setItem(`job_${response.data.job_id}_polling`, 'true');
      } else {
        setSuccess('Coverage scan completed successfully!');
        // Immediately mark scanning done for that repo
        setScanLoadingMap(prev => ({ ...prev, [selectedRepo]: false }));
        setTimeout(() => setSuccess(null), 5000);
      }
    } catch (err: any) {
      console.error('Error scanning coverage:', err);
      setCoverageError(err.response?.data?.error || 'Failed to scan coverage. Please try again.');
      setScanLoadingMap(prev => ({ ...prev, [selectedRepo]: false }));
    }
  };

  const handleRepoChange = (repoUrl: string) => {
    setSelectedRepo(repoUrl);
    setCoverageResult(null);
    setCoverageError(null);
    if (repoUrl) {
      fetchCoverageHistory(repoUrl);
    } else {
      setCoverageHistory([]);
      setCoverageTrends([]);
    }
  };

  const handleActiveJobsRefresh = () => {
    // Reset job ID and status if they were being tracked
    if (jobId && (jobStatus === 'completed' || jobStatus === 'failed')) {
      setJobId(null);
      setJobStatus(null);
    }
  };

  const handleViewJobResults = (resultId: string) => {
    getCoverageById(resultId)
      .then(response => {
        setCoverageResult(response.data);
        setActiveTab('scanner');
      })
      .catch(err => {
        console.error('Failed to fetch job results:', err);
      });
  };

  const checkActiveJobs = useCallback(() => {
    getActiveJobs()
      .then(response => {
        const inProgressJobs = response.data.filter((job: any) => job.status === 'in_progress').length;
        setActiveJobsCount(inProgressJobs);
      })
      .catch(err => {
        console.error('Failed to check active jobs:', err);
      });
  }, []);

  useEffect(() => {
    // Initial check for active jobs
    checkActiveJobs();
    
    // Poll for active jobs periodically
    const interval = setInterval(checkActiveJobs, 30000);
    return () => clearInterval(interval);
  }, [checkActiveJobs]);

  const renderRepositoryDropdown = () => {
    return (
      <div className="flex-1">
        <SearchableDropdown
          label="Repository"
          options={repoOptions}
          value={selectedRepo}
          onChange={handleRepoChange}
          onSearch={handleRepoSearch}
          placeholder="Select a repository"
          searchPlaceholder="Search repositories..."
          loading={loadingRepos}
          error={searchError}
        />
        {searchError && (
          <div className="mt-1 text-xs text-red-400">
            Error: {searchError}. Try using the listed repositories instead.
          </div>
        )}
      </div>
    );
  };
  
  return (
    // Light theme: orange gradient background, light text
    <div className="mt-8 space-y-4 bg-gradient-to-br from-orange-50 via-orange-100 to-white text-gray-900 p-4 rounded-lg">
      {repositories.length === 0 ? (
        <div className="text-center py-12 bg-orange-100/50 rounded-lg border border-orange-200 p-8">
          <BarChart2 className="mx-auto h-12 w-12 text-orange-400" />
          <h3 className="mt-2 text-xl font-medium text-orange-700">No repositories available</h3>
          <p className="mt-1 text-orange-500">
            Connect repositories to see your repositories or refresh from GitHub
          </p>
          {onRefreshRepositories && (
            <button
              onClick={onRefreshRepositories}
              disabled={isRefreshing}
              className="mt-4 px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-md hover:from-red-500 hover:to-orange-500 flex items-center gap-2 transition-colors mx-auto"
            >
              <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
              <span>Refresh from GitHub</span>
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white p-6 rounded-lg border border-orange-100 shadow hover:border-orange-400 transition-colors">
          {onRefreshRepositories && (
            <div className="mb-4 flex justify-end">
              <button
                onClick={onRefreshRepositories}
                disabled={isRefreshing}
                className="px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-md hover:from-red-500 hover:to-orange-500 flex items-center gap-2 transition-colors"
              >
                <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
                <span>Refresh repos</span>
              </button>
            </div>
          )}
          <div className="flex border-b border-orange-200 mb-6">
            <button
              onClick={() => setActiveTab('scanner')}
              className={`px-4 py-2 flex items-center ${
                activeTab === 'scanner'
                  ? 'border-b-2 border-orange-500 text-orange-600'
                  : 'text-orange-400 hover:text-orange-600'
              }`}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Coverage Scanner
            </button>
            <button
              onClick={() => selectedRepo && setActiveTab('history')}
              disabled={!selectedRepo}
              className={`px-4 py-2 flex items-center ${
                activeTab === 'history'
                  ? 'border-b-2 border-orange-500 text-orange-600'
                  : !selectedRepo 
                    ? 'text-gray-600 cursor-not-allowed' 
                    : 'text-orange-400 hover:text-orange-600'
              }`}
            >
              <History className="w-4 h-4 mr-2" />
              History
            </button>
            <button
              onClick={() => selectedRepo && setActiveTab('branches')}
              disabled={!selectedRepo}
              className={`px-4 py-2 flex items-center ${
                activeTab === 'branches'
                  ? 'border-b-2 border-orange-500 text-orange-600'
                  : !selectedRepo 
                    ? 'text-gray-600 cursor-not-allowed' 
                    : 'text-orange-400 hover:text-orange-600'
              }`}
            >
              <GitBranch className="w-4 h-4 mr-2" />
              Branches
            </button>
            <button
              onClick={() => selectedRepo && setActiveTab('compare')}
              disabled={!selectedRepo}
              className={`px-4 py-2 flex items-center ${
                activeTab === 'compare'
                  ? 'border-b-2 border-orange-500 text-orange-600'
                  : !selectedRepo 
                    ? 'text-gray-600 cursor-not-allowed' 
                    : 'text-orange-400 hover:text-orange-600'
              }`}
            >
              <GitCompare className="w-4 h-4 mr-2" />
              Compare
            </button>
            <button
              onClick={() => setActiveTab('jobs')}
              className={`px-4 py-2 flex items-center ${
                activeTab === 'jobs'
                  ? 'border-b-2 border-orange-500 text-orange-600'
                  : 'text-orange-400 hover:text-orange-600'
              }`}
            >
              <Activity className="w-4 h-4 mr-2" />
              Active Jobs
              {activeJobsCount > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-orange-500 text-white rounded-full text-xs">
                  {activeJobsCount}
                </span>
              )}
            </button>
          </div>
          {activeTab === 'scanner' && (
            <div>
              <div className="flex flex-col md:flex-row md:items-end md:space-x-4">
                {renderRepositoryDropdown()}
                <div className="flex-1">
                  <label className="block text-sm text-orange-700 mb-1">Branch (optional)</label>
                  <input
                    type="text"
                    className="w-full p-2 bg-orange-50 text-orange-900 rounded-md border border-orange-200"
                    placeholder="e.g. main"
                    value={scanBranch}
                    onChange={e => setScanBranch(e.target.value)}
                  />
                </div>
                <button
                  onClick={handleCoverageScan}
                  disabled={!selectedRepo || scanLoadingMap[selectedRepo]}
                  className="mt-4 md:mt-0 px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-md hover:from-red-500 hover:to-orange-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {scanLoadingMap[selectedRepo] ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Scan Coverage</span>
                    </>
                  ) : (
                    <>
                      <BarChart2 size={16} />
                      <span>Scan Coverage</span>
                    </>
                  )}
                </button>
              </div>
              <div className="mt-3">
                <button 
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-sm text-orange-400 hover:text-orange-600 flex items-center"
                >
                  <span className="mr-1">{showAdvanced ? 'Hide' : 'Show'} advanced settings</span>
                  <svg 
                    className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showAdvanced && (
                  <div className="mt-3 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                    <h4 className="text-sm font-medium text-orange-700 mb-3">Scan Settings</h4>
                    <div className="space-y-3">
                      <div className="flex items-center">
                        <div className="relative flex items-center">
                          <input
                            id="async-toggle"
                            type="checkbox"
                            checked={scanSettings.useAsync}
                            onChange={() => setScanSettings({...scanSettings, useAsync: !scanSettings.useAsync})}
                            className="sr-only"
                          />
                          <div 
                            className={`w-10 h-5 rounded-full transition-colors ${scanSettings.useAsync ? 'bg-[#FF7D2D]' : 'bg-gray-600'}`}
                            onClick={() => setScanSettings({...scanSettings, useAsync: !scanSettings.useAsync})}
                          >
                            <div 
                              className={`transform transition-transform duration-200 h-4 w-4 bg-white rounded-full shadow-md mt-0.5 ${scanSettings.useAsync ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'}`} 
                            />
                          </div>
                        </div>
                        <label htmlFor="async-toggle" className="ml-3 text-sm text-gray-600 cursor-pointer" onClick={() => setScanSettings({...scanSettings, useAsync: !scanSettings.useAsync})}>
                          Use asynchronous scan (recommended for large repositories)
                        </label>
                      </div>
                      <div className="flex items-center">
                        <div className="relative flex items-center">
                          <input
                            id="small-repo-toggle"
                            type="checkbox"
                            checked={scanSettings.useAsync === false}
                            onChange={() => setScanSettings({...scanSettings, useAsync: false})}
                            className="sr-only"
                          />
                          <div 
                            className={`w-10 h-5 rounded-full transition-colors ${!scanSettings.useAsync ? 'bg-[#FF7D2D]' : 'bg-gray-600'}`}
                            onClick={() => setScanSettings({...scanSettings, useAsync: false})}
                          >
                            <div 
                              className={`transform transition-transform duration-200 h-4 w-4 bg-white rounded-full shadow-md mt-0.5 ${!scanSettings.useAsync ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'}`} 
                            />
                          </div>
                        </div>
                        <label htmlFor="small-repo-toggle" className="ml-3 text-sm text-gray-600 cursor-pointer" onClick={() => setScanSettings({...scanSettings, useAsync: false})}>
                          Optimize for small repositories (faster results)
                        </label>
                      </div>
                      <div>
                        <label htmlFor="timeout" className="block text-xs text-orange-400 mb-1">
                          Clone timeout (seconds)
                        </label>
                        <input
                          id="timeout"
                          type="number"
                          min={60}
                          max={1200}
                          value={scanSettings.cloneTimeout}
                          onChange={(e) => setScanSettings({
                            ...scanSettings, 
                            cloneTimeout: parseInt(e.target.value) || 300
                          })}
                          className="w-full max-w-xs p-2 bg-orange-50 text-orange-900 rounded-md border border-orange-200"
                        />
                      </div>
                    </div>
                    {selectedRepo && selectedRepo.toLowerCase().includes('kubernetes') && (
                      <div className="mt-3 bg-blue-900/20 border border-blue-800 p-3 rounded-md">
                        <div className="flex items-start space-x-2">
                          <svg className="h-5 w-5 text-blue-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <div>
                            <p className="text-sm text-blue-400">Large repository detected</p>
                            <p className="text-xs text-gray-400 mt-1">
                              This appears to be a large repository. We recommend using asynchronous mode for better performance.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {!selectedRepo && (
                <div className="mt-6 text-center p-6 bg-orange-50 border border-orange-200 rounded-lg">
                  <BarChart2 className="mx-auto h-8 w-8 text-orange-300 mb-2" />
                  <p className="text-orange-400">Please select a repository to run a coverage scan</p>
                </div>
              )}
              {coverageError && (
                <div className="mt-4 bg-orange-50 border border-orange-200 p-4 rounded-md">
                  <div className="flex items-start space-x-3">
                    <AlertCircle className="h-5 w-5 text-orange-500 mt-0.5" />
                    <div>
                      <p className="text-orange-700 font-medium">Scan Failed</p>
                      <p className="text-sm text-orange-500 mt-1">{coverageError}</p>
                    </div>
                  </div>
                </div>
              )}
              {success && (
                <div className="mt-4 bg-orange-50 border border-orange-200 p-4 rounded-md">
                  <div className="flex items-start space-x-3">
                    <CheckCircle2 className="h-5 w-5 text-orange-600 mt-0.5" />
                    <div>
                      <p className="text-orange-700 font-medium">Success!</p>
                      <p className="text-sm text-orange-600 mt-1">{success}</p>
                    </div>
                  </div>
                </div>
              )}
              {jobId && jobStatus && jobStatus !== 'completed' && jobStatus !== 'failed' && (
                <div className="mt-4 bg-orange-50 border border-orange-200 p-4 rounded-md">
                  <div className="flex items-start space-x-3">
                    <Loader2 className="h-5 w-5 text-orange-500 animate-spin mt-0.5" />
                    <div>
                      <p className="text-orange-700 font-medium">Coverage scan in progress</p>
                      <div className="mt-2 text-xs text-orange-400">
                        Job ID: {jobId} | Status: {jobStatus}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {coverageResult && (
                <div className="mt-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-orange-50 p-4 rounded-md border border-orange-100">
                      <span className="block text-sm text-orange-400">Total Coverage</span>
                      <span className="text-2xl font-bold text-orange-600">{coverageResult.total_coverage.toFixed(2)}%</span>
                    </div>
                    <div className="bg-orange-50 p-4 rounded-md border border-orange-100">
                      <span className="block text-sm text-orange-400">Files Scanned</span>
                      <span className="text-2xl font-bold text-orange-600">{coverageResult.files?.length ?? 0}</span>
                      {coverageResult.files && coverageResult.files.filter(f => f.error).length > 0 && (
                        <div className="mt-1 text-xs text-red-500 flex items-center">
                          <AlertCircle size={12} className="mr-1" />
                          {coverageResult.files.filter(f => f.error).length} file(s) with errors
                        </div>
                      )}
                    </div>
                  </div>
                  {coverageResult.files && coverageResult.files.length > 0 && (
                    <FileHeatmap files={coverageResult.files} />
                  )}
                    <div className="mt-2">
                    <div className="mb-2 flex items-center bg-orange-50 border border-orange-200 rounded-md">
                      <Search className="ml-3 h-4 w-4 text-orange-400" />
                      <input
                      type="text"
                      placeholder="Search files..."
                      className="w-full bg-transparent p-2 text-sm text-orange-900 focus:outline-none"
                      onChange={(e) => {
                        const fileQuery = e.target.value.toLowerCase();
                      }}
                      />
                    </div>
                    <div className="max-h-64 overflow-y-auto rounded-md border border-orange-200">
                      <table className="w-full table-auto">
                      <thead className="bg-orange-100">
                        <tr>
                        <th className="px-3 py-2 text-left text-sm text-orange-700">File</th>
                        <th className="px-3 py-2 text-right text-sm text-orange-700">Coverage</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-orange-100 bg-white">
                        {(coverageResult.files ?? []).map(f => (
                        <tr key={f.file} className="hover:bg-orange-50 transition-colors">
                          <td className="px-3 py-1 text-sm text-orange-900 truncate">{f.file}</td>
                          <td className="px-3 py-1 text-sm text-right text-orange-600">
                          {f.coverage.toFixed(1)}%
                          </td>
                        </tr>
                        ))}
                      </tbody>
                      </table>
                    </div>
                    </div>
                  <button
                    onClick={() => setCoverageResult(null)}
                    className="mt-4 text-sm text-orange-400 hover:text-orange-600"
                  >Hide Results</button>
                </div>
              )}
              {loadingHistory && !coverageResult && (
                <div className="flex justify-center items-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500"></div>
                </div>
              )}
            </div>
          )}
          {activeTab === 'history' && (
            <div className="mt-4">
              {selectedRepo ? (
                <>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-orange-700">
                      <History size={18} className="inline mr-2" />
                      Coverage History
                    </h3>
                    <div className="flex items-center space-x-2">
                      <select
                        className="p-1 text-sm rounded-md border border-gray-700  bg-orange-50 hover:bg-orange-100 text-orange-700 rounded text-sm border border-orange-200 transition-colors"
                        value={timeframe}
                        onChange={e => setTimeframe(e.target.value as 'daily' | 'weekly' | 'monthly')}
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                      <button
                        onClick={() => selectedRepo && fetchCoverageHistory(selectedRepo)}
                        disabled={loadingHistory || !selectedRepo}
                        className="p-1 text-gray-400 hover:text-[#FF7D2D] disabled:opacity-50"
                        title="Refresh history"
                      >
                        <RefreshCw size={16} className={loadingHistory ? 'animate-spin' : ''} />
                      </button>
                    </div>
                  </div>
                  {historyError ? (
                    <div className="bg-red-900/20 border border-red-800 p-4 rounded-md flex items-start space-x-3">
                      <AlertCircle className="h-5 w-5 text-red-500" />
                      <span className="text-red-500">{historyError}</span>
                    </div>
                  ) : (
                    <>
                      <CoverageHistoryChart data={coverageTrends} />
                      <div className="mt-8">
                        <CoverageHistoryList 
                          coverageHistory={coverageHistory} 
                          onSelectHistory={(history) => {
                            setCoverageResult({
                              total_coverage: history.total_coverage,
                              files: history.files
                            });
                            setActiveTab('scanner');
                          }}
                        />
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="text-center py-12 bg-[#1F2B39]/50 rounded-lg border border-gray-700">
                  <p className="text-gray-400">Select a repository to view coverage history</p>
                </div>
              )}
            </div>
          )}
          {activeTab === 'branches' && (
            <div className="mt-4">
              {selectedRepo ? (
                <BranchCoverageList
                  repository={selectedRepo}
                  onBranchSelect={(b1, b2) => {
                    setCompareBranch1(b1);
                    setCompareBranch2(b2);
                    setActiveTab('compare');
                  }}
                />
              ) : (
                <div className="text-center py-12 bg-[#1F2B39]/50 rounded-lg border border-gray-700">
                  <p className="text-gray-400">Select a repository to view branch coverage</p>
                </div>
              )}
            </div>
          )} 
          {activeTab === 'compare' && (
            <div className="mt-4">
              {selectedRepo ? (
                <BranchComparison
                  repository={selectedRepo}
                  defaultBranch1={compareBranch1}
                  defaultBranch2={compareBranch2}
                />
              ) : (
                <div className="text-center py-12 bg-[#1F2B39]/50 rounded-lg border border-gray-700">
                  <p className="text-gray-400">Select a repository to compare branches</p>
                </div>
              )}
            </div>
          )} 
          {activeTab === 'jobs' && (
            <ActiveJobsList 
              onRefresh={handleActiveJobsRefresh}
              onViewResults={handleViewJobResults}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default CoverageTab;
