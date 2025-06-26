'use client';
import React from 'react';
import { GitCommit, CheckCircle, GitPullRequest, Clock } from 'lucide-react';

interface Activity {
  id: string;
  type: string;
  repoName: string;
  message: string;
  timestamp: string | Date;
}

interface ActivityListProps {
  activities: Activity[];
}

const ActivityList: React.FC<ActivityListProps> = ({ activities }) => {
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

  return (
    <div className="bg-[#1F2B39] rounded-lg shadow-lg p-6 border border-gray-700">
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ActivityList;
