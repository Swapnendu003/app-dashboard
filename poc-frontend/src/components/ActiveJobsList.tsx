'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getActiveJobs, cancelJob, getCoverageById, getJobErrorAnalysis } from '@/services/api';
import { JobStatus } from '@/types/job';
import { AlertCircle, RefreshCw, XCircle, Clock, CheckCircle2, Loader2, BarChart2, HelpCircle, Proportions } from 'lucide-react';

interface ActiveJobsListProps {
  onRefresh?: () => void;
  onViewResults?: (resultId: string) => void;
  onViewDetails?: (history: any) => void;
}

interface ErrorAnalysis {
  error: string;
  analysis: string;
  recommendation: string;
}

const ActiveJobsList: React.FC<ActiveJobsListProps> = ({ onRefresh, onViewResults, onViewDetails }) => {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobStatus[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingJobs, setCancellingJobs] = useState<{[key: string]: boolean}>({});
  const [errorAnalysis, setErrorAnalysis] = useState<ErrorAnalysis | null>(null);
  const [analyzingError, setAnalyzingError] = useState<boolean>(false);
  const [showErrorModal, setShowErrorModal] = useState<boolean>(false);

  const fetchJobs = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getActiveJobs();
      setJobs(response.data);
    } catch (err: any) {
      console.error('Error fetching active jobs:', err);
      setError('Failed to fetch active jobs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    
    // Poll for updates
    const intervalId = setInterval(() => {
      fetchJobs();
    }, 10000); // Refresh every 10 seconds
    
    return () => clearInterval(intervalId);
  }, []);

  const handleCancelJob = async (jobId: string) => {
    setCancellingJobs(prev => ({ ...prev, [jobId]: true }));
    try {
      await cancelJob(jobId);
      // Update the job in the list
      setJobs(jobs.map(job => 
        job.id === jobId 
          ? { ...job, status: 'failed', error: 'Job cancelled by user', progress: 100 } 
          : job
      ));
    } catch (err: any) {
      console.error(`Error cancelling job ${jobId}:`, err);
    } finally {
      setCancellingJobs(prev => ({ ...prev, [jobId]: false }));
    }
  };

  const handleViewResults = async (job: JobStatus) => {
    if (job.result_id) {
      try {
        const response = await getCoverageById(job.result_id);
        if (onViewDetails) {
          onViewDetails({
            total_coverage: response.data.total_coverage,
            files: response.data.files
          });
        }
      } catch (err) {
        console.error('Error fetching coverage details:', err);
      }
    }
  };

  const handleShowError = async (jobId: string, error: string) => {
    setShowErrorModal(true);
    try {
      setAnalyzingError(true);
      const analysis = await getJobErrorAnalysis(jobId);
      setErrorAnalysis(analysis);
    } catch (err) {
      console.error('Failed to get error analysis:', err);
      setErrorAnalysis({
        error: error,
        analysis: 'Failed to analyze error',
        recommendation: 'Please try again later or contact support.'
      });
    } finally {
      setAnalyzingError(false);
    }
  };

  const handleViewReport = (job: JobStatus) => {
    if (job.repository) {
      router.push(`/history/report?repo=${encodeURIComponent(job.repository)}`);
    }
  };

  const formatTime = (timeString: string) => {
    const date = new Date(timeString);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  };

  const calculateElapsedTime = (startTime: string, endTime?: string) => {
    const start = new Date(startTime).getTime();
    const end = endTime ? new Date(endTime).getTime() : Date.now();
    const elapsed = Math.floor((end - start) / 1000); // seconds
    
    if (elapsed < 60) {
      return `${elapsed} seconds`;
    } else if (elapsed < 3600) {
      return `${Math.floor(elapsed / 60)} minutes ${elapsed % 60} seconds`;
    } else {
      return `${Math.floor(elapsed / 3600)} hours ${Math.floor((elapsed % 3600) / 60)} minutes`;
    }
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'pending':
        return <span className="px-2 py-1 bg-orange-100 text-orange-500 rounded-full text-xs">Pending</span>;
      case 'in_progress':
        return <span className="px-2 py-1 bg-orange-200 text-orange-600 rounded-full text-xs flex items-center">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />In Progress
        </span>;
      case 'completed':
        return <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs flex items-center">
          <CheckCircle2 className="w-3 h-3 mr-1" />Completed
        </span>;
      case 'failed':
        return <span className="px-2 py-1 bg-orange-50 text-orange-400 rounded-full text-xs flex items-center">
          <XCircle className="w-3 h-3 mr-1" />Failed
        </span>;
      default:
        return <span className="px-2 py-1 bg-orange-50 text-orange-400 rounded-full text-xs">{status}</span>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-orange-700">Active Coverage Jobs</h3>
        <button
          onClick={() => {
            fetchJobs();
            if (onRefresh) onRefresh();
          }}
          className="p-2 text-orange-400 hover:text-orange-600 bg-orange-50 rounded-md border border-orange-200"
          title="Refresh jobs"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      
      {error && (
        <div className="bg-orange-100 border border-orange-300 p-4 rounded-md flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-orange-500" />
          <span className="text-orange-700">{error}</span>
        </div>
      )}
      
      {loading && jobs.length === 0 ? (
        <div className="flex justify-center items-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500"></div>
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-8 bg-orange-50 rounded-lg border border-orange-200">
          <Clock className="mx-auto h-8 w-8 text-orange-300" />
          <p className="mt-2 text-orange-500">No active jobs found</p>
        </div>
      ) : (
        <div className="bg-white border border-orange-100 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-orange-200">
              <thead className="bg-orange-50">
                <tr>
                  <th className="px-4 py-3 text-center text-xs font-medium text-orange-700 uppercase tracking-wider">Repository</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-orange-700 uppercase tracking-wider">Branch</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-orange-700 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-orange-700 uppercase tracking-wider">Progress</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-orange-700 uppercase tracking-wider">Started</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-orange-700 uppercase tracking-wider">Duration</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-orange-700 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-orange-100">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-orange-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-orange-900 text-center">
                      {job.repository ? (
                        <span className="truncate block max-w-xs mx-auto" title={job.repository}>
                          {job.repository.split('/').pop()}
                        </span>
                      ) : (
                        <span className="text-orange-400">Unknown</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-orange-900 text-center">
                      {job.branch || <span className="text-orange-400">default</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      {getStatusBadge(job.status)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      <div className="w-full bg-orange-100 rounded-full h-2.5">
                        <div 
                          className={`h-2.5 rounded-full ${
                            job.status === 'completed' ? 'bg-green-500' : 
                            job.status === 'failed' ? 'bg-red-500' : 
                            'bg-orange-500'
                          }`}
                          style={{ width: `${job.progress}%` }}
                        ></div>
                      </div>
                      <span className="text-xs text-orange-700">{job.progress}%</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-orange-900 text-center">
                      {formatTime(job.start_time)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-orange-900 text-center">
                      {calculateElapsedTime(job.start_time, job.end_time)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium text-center">
                      <div className="flex justify-center space-x-2">
                        {job.status === 'in_progress' && (
                          <button
                            onClick={() => handleCancelJob(job.id)}
                            disabled={cancellingJobs[job.id]}
                            className="text-red-400 hover:text-red-600 focus:outline-none"
                            title="Cancel job"
                          >
                            {cancellingJobs[job.id] ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <XCircle className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        {job.status === 'completed' && (
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleViewReport(job)}
                              className="text-orange-500 hover:text-orange-700 focus:outline-none text-xs flex items-center gap-1"
                              title="View full report"
                            >
                              <Proportions className="w-4 h-4" />
                              View Report
                            </button>
                          </div>
                        )}
                        {job.status === 'failed' && (
                          <button
                            onClick={() => handleShowError(job.id, job.error || 'Unknown error')}
                            className="text-red-500 hover:text-red-700 focus:outline-none text-xs flex items-center gap-1"
                            title={job.error || 'Unknown error'}
                          >
                            <AlertCircle className="w-4 h-4" />
                            Show Error Analysis
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Error Analysis Modal */}
      {showErrorModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 border border-orange-200 relative">
            <button 
              onClick={() => setShowErrorModal(false)}
              className="absolute top-4 right-4 text-orange-400 hover:text-orange-600"
            >
              <XCircle className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-medium text-orange-700 flex items-center gap-2 mb-4">
              <AlertCircle className="w-5 h-5 text-red-400" />
              Error Analysis
            </h3>

            {analyzingError ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
                <p className="text-orange-600">Analyzing error...</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-red-50 border border-red-200 rounded-md p-4">
                  <h4 className="text-sm font-medium text-red-600 mb-2">Error Message:</h4>
                  <p className="text-sm text-red-500 font-mono">{errorAnalysis?.error}</p>
                </div>

                <div className="bg-orange-50 border border-orange-200 rounded-md p-4">
                  <h4 className="text-sm font-medium text-orange-600 mb-2">Analysis:</h4>
                  <p className="text-sm text-orange-700">{errorAnalysis?.analysis}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ActiveJobsList;
