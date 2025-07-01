'use client';

import React from 'react';
import { CoverageHistory } from '@/types/coverage';
import { CalendarDays, GitBranch, ArrowRight } from 'lucide-react';

interface CoverageCardProps {
  coverageData: CoverageHistory;
  onClick?: () => void;
}

const CoverageCard: React.FC<CoverageCardProps> = ({ coverageData, onClick }) => {
  const formatRepoName = (repoUrl: string): string => {
    if (!repoUrl) return 'Unknown Repository';
    const parts = repoUrl.split('/');
    return parts[parts.length - 1].replace('.git', '');
  };

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return dateString;
    }
  };

  const getCoverageColorClass = (coverage: number): string => {
    if (coverage >= 80) return 'text-green-500';
    if (coverage >= 60) return 'text-green-600';
    if (coverage >= 40) return 'text-yellow-500';
    if (coverage >= 20) return 'text-orange-500';
    return 'text-red-500';
  };

  return (
    <div 
      className="bg-white rounded-lg border border-orange-100 hover:border-orange-400 transition-all p-4 cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-2">
        <h4 className="text-lg font-medium text-orange-700 truncate" title={formatRepoName(coverageData.repository)}>
          {formatRepoName(coverageData.repository)}
        </h4>
        <span className={`font-bold text-lg ${getCoverageColorClass(coverageData.total_coverage)}`}>
          {coverageData.total_coverage.toFixed(1)}%
        </span>
      </div>
      
      <div className="space-y-2 text-sm">
        <div className="flex items-center text-orange-400">
          <GitBranch size={14} className="mr-2" />
          <span className="truncate">{coverageData.branch || 'default'}</span>
        </div>
        <div className="flex items-center text-orange-400">
          <CalendarDays size={14} className="mr-2" />
          <span>{formatDate(coverageData.timestamp)}</span>
        </div>
      </div>
      
      <div className="mt-4 flex items-center justify-end text-xs text-orange-500 hover:text-orange-700">
        View Details <ArrowRight size={12} className="ml-1" />
      </div>
    </div>
  );
};

export default CoverageCard;
