'use client';
import React, { useState } from 'react';
import { GitCommit, CheckCircle, GitPullRequest, Clock, AlertCircle, XCircle, HelpCircle } from 'lucide-react';
import { getJobErrorAnalysis } from '@/services/api';

interface Activity {
  id: string;
  type: string;
  repoName: string;
  message: string;
  timestamp: string | Date;
  jobId?: string;
  error?: string;
}

interface ErrorAnalysis {
  error: string;
  analysis: string;
  recommendation: string;
}

interface ActivityListProps {
  activities: Activity[];
}

const ActivityList: React.FC<ActivityListProps> = ({ activities }) => {
  const [selectedError, setSelectedError] = useState<string | null>(null);
  const [errorAnalysis, setErrorAnalysis] = useState<ErrorAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'commit':
        return <GitCommit className="h-4 w-4 text-[#FF7D2D]" />;
      case 'test':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'pull_request':
        return <GitPullRequest className="h-4 w-4 text-purple-500" />;
      default:
        return <GitCommit className="h-4 w-4 text-[#FF7D2D]" />;
    }
  };

  const formatDate = (timestamp: string | Date): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffHours < 1) {
      return 'Just now';
    } else if (diffHours < 24) {
      return `${diffHours} hours ago`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else {
      return `${diffDays} days ago`;
    }
  };

  const handleShowError = async (activity: Activity) => {
    if (!activity.jobId || !activity.error) return;
    
    try {
      setIsLoading(true);
      setSelectedError(activity.error);
      const analysis = await getJobErrorAnalysis(activity.jobId);
      setErrorAnalysis(analysis);
    } catch (err) {
      console.error('Failed to fetch error analysis:', err);
      setErrorAnalysis({
        error: activity.error,
        analysis: 'Failed to analyze error',
        recommendation: 'Please try again later or contact support.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-[#1F2B39] rounded-lg shadow-lg p-6 border border-gray-700 relative">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-gray-200 flex items-center">
          <Clock className="h-5 w-5 mr-2 text-[#FF7D2D]" />
          Recent Activity
        </h3>
      </div>
      
      {activities.length === 0 ? (
        <div className="text-center py-6 text-gray-500">
          No recent activities found
        </div>
      ) : (
        <div className="space-y-4">
          {activities.map((activity) => (
            <div 
              key={activity.id} 
              className="flex space-x-3 p-3 rounded-md hover:bg-[#263544]/50 transition-colors border border-gray-700/50"
            >
              <div className="mt-0.5">{getActivityIcon(activity.type)}</div>
              <div className="flex-1">
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-[#FF7D2D]">{activity.repoName}</span>
                  <span className="text-xs text-gray-500">{formatDate(activity.timestamp)}</span>
                </div>
                <p className="text-sm text-gray-400 mt-1">{activity.message}</p>
                {activity.error && (
                  <button
                    onClick={() => handleShowError(activity)}
                    className="mt-2 text-red-400 hover:text-red-300 text-xs flex items-center gap-1.5"
                  >
                    <AlertCircle className="w-3.5 h-3.5" />
                    Show Error Analysis
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedError && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#1F2B39] rounded-lg p-6 max-w-2xl w-full mx-4 border border-gray-700 relative">
            <button 
              onClick={() => {
                setSelectedError(null);
                setErrorAnalysis(null);
              }}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-300"
            >
              <XCircle className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-medium text-gray-200 flex items-center gap-2 mb-4">
              <AlertCircle className="w-5 h-5 text-red-400" />
              Error Analysis
            </h3>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF7D2D]"></div>
              </div>
            ) : errorAnalysis ? (
              <div className="space-y-4">
                <div className="bg-red-900/20 border border-red-700/30 rounded-md p-4">
                  <h4 className="text-sm font-medium text-red-400 mb-2">Error Message:</h4>
                  <p className="text-sm text-red-300 font-mono">{errorAnalysis.error}</p>
                </div>

                <div className="bg-[#263544] border border-gray-700/50 rounded-md p-4">
                  <h4 className="text-sm font-medium text-[#FF7D2D] mb-2">Analysis:</h4>
                  <p className="text-sm text-gray-300">{errorAnalysis.analysis}</p>
                </div>

                <div className="bg-green-900/20 border border-green-700/30 rounded-md p-4">
                  <h4 className="text-sm font-medium text-green-400 flex items-center gap-2 mb-2">
                    <HelpCircle className="w-4 h-4" />
                    Recommended Solution:
                  </h4>
                  <p className="text-sm text-gray-300">{errorAnalysis.recommendation}</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">
                Failed to load error analysis
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityList;
