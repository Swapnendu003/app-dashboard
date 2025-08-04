'use client';

import React, { useState, useEffect } from 'react';
import { getUserScannedRepositories, runCoverageScan, getCoverageJobStatus, getCoverageById, getCoverageHistory } from '@/services/api';
import { Loader2, BarChart2, AlertCircle, CheckCircle2, PlusCircle } from 'lucide-react';
import PageSkeleton from '@/components/PageSkeleton';

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

  useEffect(() => {
    // Fetch previously scanned repos on mount
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

  const handleScan = async () => {
    setScanLoading(true);
    setError(null);
    setSuccess(null);
    setCoverageResult(null);
    setJobId(null);
    setJobStatus(null);
    try {
      const response = await runCoverageScan(repoUrl, branch || undefined, { async: true });
      setJobId(response.data.job_id);
      setJobStatus('in_progress');
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
    try {
      const res = await getCoverageHistory(repoUrl);
      setCoverageHistory(res.data);
    } catch (e: any) {
      setHistoryError(e.response?.data?.error || 'Failed to fetch coverage history');
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <PageSkeleton
      title="Ad-hoc Coverage Scan"
      subtitle="Enter any public repository URL to run a coverage scan. (Private repos require proper access.)"
    >
      <div className="max-w-2xl mx-auto mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-orange-600 flex items-center gap-2">
            <BarChart2 size={22} /> Previously Scanned Repositories
          </h2>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 transition-colors"
          >
            <PlusCircle size={18} /> New Scan
          </button>
        </div>
        <div className="bg-white rounded-lg shadow border border-orange-100 p-4">
          {loadingRepos ? (
            <div className="flex items-center gap-2 text-orange-500"><Loader2 className="animate-spin" /> Loading...</div>
          ) : scannedRepos.length === 0 ? (
            <div className="text-orange-400">No repositories scanned yet.</div>
          ) : (
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
          )}
        </div>
        {/* Coverage history display */}
        {historyRepo && (
          <div className="mt-6 bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <BarChart2 size={18} className="text-orange-400 mr-2" />
              <span className="font-semibold text-orange-700">Coverage History for</span>
              <span className="ml-2 text-orange-600">{historyRepo}</span>
              <button
                className="ml-auto text-xs text-orange-400 hover:text-orange-600"
                onClick={() => { setHistoryRepo(null); setCoverageHistory([]); setHistoryError(null); }}
              >
                Close
              </button>
            </div>
            {historyLoading ? (
              <div className="flex items-center gap-2 text-orange-500"><Loader2 className="animate-spin" /> Loading history...</div>
            ) : historyError ? (
              <div className="text-red-500">{historyError}</div>
            ) : coverageHistory.length === 0 ? (
              <div className="text-orange-400">No coverage history found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs mt-2">
                  <thead>
                    <tr className="text-orange-700 border-b">
                      <th className="py-1 text-left">Date</th>
                      <th className="py-1 text-left">Coverage (%)</th>
                      <th className="py-1 text-left">Files</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coverageHistory.map((h, idx) => (
                      <tr key={idx} className="border-b last:border-b-0">
                        <td className="py-1">{h.timestamp ? new Date(h.timestamp).toLocaleString() : '-'}</td>
                        <td className="py-1">{h.total_coverage?.toFixed(2) ?? '-'}</td>
                        <td className="py-1">{h.files?.length ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
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
              <button
                onClick={handleScan}
                disabled={!repoUrl || scanLoading}
                className="w-full px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-md hover:from-red-500 hover:to-orange-500 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                {scanLoading ? <Loader2 size={16} className="animate-spin" /> : <BarChart2 size={16} />}
                <span>Run Coverage Scan</span>
              </button>
            </div>
            {error && (
              <div className="mt-4 bg-orange-50 border border-orange-200 p-4 rounded-md flex items-center gap-2 text-orange-700">
                <AlertCircle size={18} className="text-orange-500" /> {error}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scan result and job status UI (unchanged) */}
      <div className="max-w-xl mx-auto mt-8 bg-white p-8 rounded-lg shadow border border-orange-100">
        {success && (
          <div className="mt-4 bg-orange-50 border border-orange-200 p-4 rounded-md flex items-center gap-2 text-orange-700">
            <CheckCircle2 size={18} className="text-orange-600" /> {success}
          </div>
        )}
        {jobId && jobStatus && jobStatus !== 'completed' && jobStatus !== 'failed' && (
          <div className="mt-4 bg-orange-50 border border-orange-200 p-4 rounded-md flex items-center gap-2">
            <Loader2 size={18} className="text-orange-500 animate-spin" />
            <span className="text-orange-700">Scan in progress... (Job ID: {jobId}, Status: {jobStatus})</span>
          </div>
        )}
        {coverageResult && (
          <div className="mt-6 space-y-2">
            <div className="bg-orange-50 p-4 rounded-md border border-orange-100">
              <span className="block text-sm text-orange-400">Total Coverage</span>
              <span className="text-2xl font-bold text-orange-600">{coverageResult.total_coverage?.toFixed(2) ?? '-'}</span>
            </div>
            <div className="bg-orange-50 p-4 rounded-md border border-orange-100">
              <span className="block text-sm text-orange-400">Files Scanned</span>
              <span className="text-2xl font-bold text-orange-600">{coverageResult.files?.length ?? 0}</span>
            </div>
          </div>
        )}
      </div>
    </PageSkeleton>
  );
};

export default AdhocCoveragePage;
