'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getUserScannedRepositories, runCoverageScan, getCoverageJobStatus, getCoverageById, getCoverageHistory, getCoverageTrends, getActiveJobs } from '@/services/api';
import { Loader2, BarChart2, AlertCircle, CheckCircle2, PlusCircle, GitBranch, History, Activity } from 'lucide-react';
import PageSkeleton from '@/components/PageSkeleton';
import { FileHeatmap, CoverageHistoryChart, CoverageHistoryList } from '@/components/CoverageVisualizations';
import ActiveJobsList from "@/components/ActiveJobsList";

const AdhocCoveragePage = () => {
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [scanLoading, setScanLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [coverageResult, setCoverageResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [scannedRepos, setScannedRepos] = useState<any[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [historyRepo, setHistoryRepo] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [coverageHistory, setCoverageHistory] = useState<any[]>([]);
  const [coverageTrends, setCoverageTrends] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'scanner' | 'history' | 'jobs'>('scanner');
  const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [scanSettings, setScanSettings] = useState({
    useAsync: true,
    cloneTimeout: 300,
  });
  const [fileSearchQuery, setFileSearchQuery] = useState('');
  const [filteredFiles, setFilteredFiles] = useState<any[]>([]);
  const [activeJobsCount, setActiveJobsCount] = useState(0);

  useEffect(() => {
    setLoadingRepos(true);
    getUserScannedRepositories()
      .then(res => setScannedRepos(res.data.repositories || []))
      .catch(() => setScannedRepos([]))
      .finally(() => setLoadingRepos(false));
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;
    if (jobId && jobStatus && jobStatus !== 'completed' && jobStatus !== 'failed') {
      interval = setInterval(async () => {
        try {
          const response = await getCoverageJobStatus(jobId);
          const status = response.data.status;
          setJobStatus(status);
          if (status === 'completed') {
            clearInterval(interval!);
            setSuccess('Coverage scan completed!');
            if (response.data.result_id) {
              const result = await getCoverageById(response.data.result_id);
              setCoverageResult(result.data);
            }
          } else if (status === 'failed') {
            clearInterval(interval!);
            setError('Coverage scan failed.');
          }
        } catch (e: any) {
          setError(e.message || 'Failed to get job status');
          clearInterval(interval!);
        }
      }, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [jobId, jobStatus]);

  useEffect(() => {
    if (coverageResult?.files) {
      setFilteredFiles(
        coverageResult.files.filter((file: any) =>
          file.file.toLowerCase().includes(fileSearchQuery.toLowerCase())
        )
      );
    }
  }, [fileSearchQuery, coverageResult]);

  // Add checkActiveJobs function
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

  // Add effect to poll active jobs
  useEffect(() => {
    checkActiveJobs();
    const interval = setInterval(checkActiveJobs, 30000);
    return () => clearInterval(interval);
  }, [checkActiveJobs]);

  const handleScan = async () => {
    setScanLoading(true);
    setError(null);
    setSuccess(null);
    setCoverageResult(null);
    setJobId(null);
    setJobStatus(null);
    try {
      const response = await runCoverageScan(repoUrl, branch || undefined, {
        async: scanSettings.useAsync,
        cloneTimeout: scanSettings.cloneTimeout
      });
      
      if (scanSettings.useAsync) {
        setJobId(response.data.job_id);
        setJobStatus('in_progress');
        localStorage.setItem(`job_${response.data.job_id}_polling`, 'true');
      } else {
        setCoverageResult(response.data);
        setSuccess('Coverage scan completed successfully!');
      }
      setShowModal(false);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to start coverage scan');
    } finally {
      setScanLoading(false);
    }
  };

  const handleViewHistory = async (repoUrl: string) => {
    setHistoryRepo(repoUrl);
    setHistoryLoading(true);
    setHistoryError(null);
    setCoverageHistory([]);
    setCoverageTrends([]);
    try {
      const [historyRes, trendsRes] = await Promise.all([
        getCoverageHistory(repoUrl),
        getCoverageTrends(repoUrl, timeframe === 'daily' ? 30 : timeframe === 'weekly' ? 90 : 365)
      ]);
      setCoverageHistory(historyRes.data);
      setCoverageTrends(trendsRes.data);
    } catch (e: any) {
      setHistoryError(e.response?.data?.error || 'Failed to fetch coverage history');
    } finally {
      setHistoryLoading(false);
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

  return (
    <PageSkeleton
      title="Ad-hoc Coverage Scan"
      subtitle="Enter any public repository URL to run a coverage scan. (Private repos require proper access.)"
    >
      <div className="max-w-6xl mx-auto mt-8">
        <div className="bg-white p-6 rounded-lg border border-orange-100 shadow hover:border-orange-400 transition-colors">
          {/* Tab controls */}
          <div className="flex space-x-4 mb-6 border-b border-orange-200">
            <button
              onClick={() => setActiveTab('scanner')}
              className={`flex-1 px-4 py-2 rounded-t-md font-medium transition-all flex items-center justify-center space-x-2 ${
                activeTab === 'scanner' 
                  ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white' 
                  : 'text-orange-500 hover:text-orange-700'
              }`}
            >
              <BarChart2 size={16} />
              <span>Coverage Scanner</span>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 px-4 py-2 rounded-t-md font-medium transition-all flex items-center justify-center space-x-2 ${
                activeTab === 'history'
                  ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white'
                  : 'text-orange-500 hover:text-orange-700'
              }`}
            >
              <History size={16} />
              <span>Scan History</span>
            </button>
            <button
              onClick={() => setActiveTab('jobs')}
              className={`flex-1 px-4 py-2 rounded-t-md font-medium transition-all flex items-center justify-center space-x-2 ${
                activeTab === 'jobs'
                  ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white'
                  : 'text-orange-500 hover:text-orange-700'
              }`}
            >
              <Activity size={16} />
              <span>Active Jobs</span>
              {activeJobsCount > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-orange-500 text-white rounded-full text-xs">
                  {activeJobsCount}
                </span>
              )}
            </button>
          </div>

          {activeTab === 'scanner' ? (
            <>
              <div className="flex justify-between mb-4">
                <h2 className="text-xl font-bold text-orange-600 flex items-center gap-2">
                  <BarChart2 size={22} /> Coverage Scanner
                </h2>
                <button
                  onClick={() => setShowModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 transition-colors"
                >
                  <PlusCircle size={18} /> New Scan
                </button>
              </div>

              {/* Status messages and results */}
              {error && (
                <div className="mt-4 bg-orange-50 border border-orange-200 p-4 rounded-md flex items-center gap-2 text-orange-700">
                  <AlertCircle size={18} className="text-orange-500" /> {error}
                </div>
              )}

              {success && (
                <div className="mt-4 bg-orange-50 border border-orange-200 p-4 rounded-md flex items-center gap-2 text-orange-700">
                  <CheckCircle2 size={18} className="text-orange-600" /> {success}
                </div>
              )}

              {/* Coverage results with heatmap */}
              {coverageResult && (
                <div className="mt-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-orange-50 p-4 rounded-md border border-orange-100">
                      <span className="block text-sm text-orange-400">Total Coverage</span>
                      <span className="text-2xl font-bold text-orange-600">
                        {coverageResult.total_coverage?.toFixed(2)}%
                      </span>
                    </div>
                    <div className="bg-orange-50 p-4 rounded-md border border-orange-100">
                      <span className="block text-sm text-orange-400">Files Scanned</span>
                      <span className="text-2xl font-bold text-orange-600">
                        {coverageResult.files?.length ?? 0}
                      </span>
                    </div>
                  </div>

                  {/* Add FileHeatmap component */}
                  {coverageResult.files && coverageResult.files.length > 0 && (
                    <FileHeatmap files={coverageResult.files} />
                  )}
                </div>
              )}
            </>
          ) : activeTab === 'history' ? (
            <div className="mt-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-orange-700">
                  <History size={18} className="inline mr-2" />
                  Previously Scanned Repositories
                </h3>
                <div className="flex items-center space-x-2">
                  <select
                    className="p-1 text-sm rounded-md border border-orange-200 bg-orange-50 hover:bg-orange-100 text-orange-700 transition-colors"
                    value={timeframe}
                    onChange={e => setTimeframe(e.target.value as 'daily' | 'weekly' | 'monthly')}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              </div>

              {/* Enhanced history table */}
              <div className="bg-white rounded-lg shadow border border-orange-100 p-4">
                {loadingRepos ? (
                  <div className="flex items-center gap-2 text-orange-500">
                    <Loader2 className="animate-spin" /> Loading...
                  </div>
                ) : scannedRepos.length === 0 ? (
                  <div className="text-orange-400">No repositories scanned yet.</div>
                ) : (
                  <>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-orange-700 border-b">
                          <th className="py-2 text-left">Repository</th>
                          <th className="py-2 text-left">Last Scanned</th>
                          <th className="py-2 text-left">Total Scans</th>
                          <th className="py-2 text-left">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scannedRepos.map((repo, i) => (
                          <tr key={repo.repository + i} className="border-b last:border-b-0">
                            <td className="py-2">{repo.repository}</td>
                            <td className="py-2">{repo.last_scanned ? new Date(repo.last_scanned).toLocaleString() : '-'}</td>
                            <td className="py-2">{repo.total_scans ?? '-'}</td>
                            <td className="py-2">
                              <button
                                className="text-orange-500 hover:underline text-xs"
                                onClick={() => handleViewHistory(repo.repository)}
                                disabled={historyLoading && historyRepo === repo.repository}
                              >
                                {historyLoading && historyRepo === repo.repository ? (
                                  <Loader2 size={14} className="inline animate-spin mr-1" />
                                ) : null}
                                View History
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Coverage history details */}
                    {historyRepo && (
                      <div className="mt-6">
                        <CoverageHistoryChart 
                          data={coverageTrends}
                          
                        />
                        <div className="mt-4">
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
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : (
            // Jobs tab content
            <ActiveJobsList 
              onRefresh={() => {
                checkActiveJobs();
                // Reset job ID and status if they were being tracked
                if (jobId && (jobStatus === 'completed' || jobStatus === 'failed')) {
                  setJobId(null);
                  setJobStatus(null);
                }
              }}
              onViewResults={handleViewJobResults}
            />
          )}
        </div>

        {/* Modal for new scan */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md relative">
              <button
                className="absolute top-2 right-2 text-orange-400 hover:text-orange-600"
                onClick={() => setShowModal(false)}
              >
                ×
              </button>
              <h3 className="text-lg font-bold mb-4 text-orange-600 flex items-center gap-2">
                <BarChart2 size={20} /> New Coverage Scan
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-orange-700 mb-1">Repository URL</label>
                  <input
                    type="text"
                    className="w-full p-2 bg-orange-50 text-orange-900 rounded-md border border-orange-200"
                    placeholder="https://github.com/owner/repo"
                    value={repoUrl}
                    onChange={e => setRepoUrl(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm text-orange-700 mb-1">Branch (optional)</label>
                  <input
                    type="text"
                    className="w-full p-2 bg-orange-50 text-orange-900 rounded-md border border-orange-200"
                    placeholder="e.g. main"
                    value={branch}
                    onChange={e => setBranch(e.target.value)}
                  />
                </div>

                {/* Advanced settings section */}
                <div className="mt-3">
                  <button 
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="text-sm text-orange-400 hover:text-orange-600 flex items-center"
                  >
                    <span className="mr-1">{showAdvanced ? 'Hide' : 'Show'} advanced settings</span>
                    <svg className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}>
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
                              type="checkbox"
                              checked={scanSettings.useAsync}
                              onChange={() => setScanSettings({...scanSettings, useAsync: !scanSettings.useAsync})}
                              className="sr-only"
                              id="async-toggle"
                            />
                            <div className={`w-10 h-5 rounded-full transition-colors ${
                              scanSettings.useAsync ? 'bg-[#FF7D2D]' : 'bg-gray-600'
                            }`}>
                              <div className={`transform transition-transform duration-200 h-4 w-4 bg-white rounded-full shadow-md mt-0.5 ${
                                scanSettings.useAsync ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'
                              }`} />
                            </div>
                          </div>
                          <label htmlFor="async-toggle" className="ml-3 text-sm text-gray-600">
                            Use asynchronous scan (recommended for large repositories)
                          </label>
                        </div>

                        <div>
                          <label className="block text-xs text-orange-400 mb-1">
                            Clone timeout (seconds)
                          </label>
                          <input
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
                    </div>
                  )}
                </div>

                <button
                  onClick={handleScan}
                  disabled={!repoUrl || scanLoading}
                  className="w-full px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-md hover:from-red-500 hover:to-orange-500 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  {scanLoading ? <Loader2 size={16} className="animate-spin" /> : <BarChart2 size={16} />}
                  <span>Run Coverage Scan</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageSkeleton>
  );
};

export default AdhocCoveragePage;
