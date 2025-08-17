'use client';

import React, { useState, useEffect } from 'react';
import { CoverageHistory } from '@/types/coverage';
import { Search, GitBranch, Calendar, Code, Hash } from 'lucide-react';

interface CoverageHistoryListProps {
  coverageHistory: CoverageHistory[];
  onSelectHistory: (history: CoverageHistory) => void;
}

const CoverageHistoryList: React.FC<CoverageHistoryListProps> = ({ 
  coverageHistory, 
  onSelectHistory 
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredHistory, setFilteredHistory] = useState<CoverageHistory[]>(coverageHistory);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredHistory(coverageHistory);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = coverageHistory.filter(item =>
        (item.branch && item.branch.toLowerCase().includes(query)) ||
        (item.commit_hash && item.commit_hash.toLowerCase().includes(query))
      );
      setFilteredHistory(filtered);
    }
  }, [searchQuery, coverageHistory]);

  const formatDate = (dateString: string) => {
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
    <div className="bg-white rounded-lg border border-orange-100 p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-orange-700">Coverage History</h2>
        <div className="w-1/3">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-orange-300" />
            <input
              type="text"
              placeholder="Search by branch or commit..."
              className="w-full pl-8 pr-3 py-2 bg-orange-50 text-orange-900 rounded-md border border-orange-200 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>
      
      {filteredHistory.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-orange-400">
            {searchQuery ? 'No matching coverage history found' : 'No coverage history available'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full rounded-lg overflow-hidden border border-orange-100">
            <thead className="bg-orange-50">
              <tr>
                <th className="py-2 px-4 text-center text-sm font-medium text-orange-700">Branch</th>
                <th className="py-2 px-4 text-center text-sm font-medium text-orange-700">Commit</th>
                <th className="py-2 px-4 text-center text-sm font-medium text-orange-700">Coverage</th>
                <th className="py-2 px-4 text-center text-sm font-medium text-orange-700">Total Scans</th>
                <th className="py-2 px-4 text-center text-sm font-medium text-orange-700">Scanned</th>
                <th className="py-2 px-4 text-center text-sm font-medium text-orange-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-orange-100">
              {filteredHistory.map((history) => (
                <tr key={`${history.id}-${history.branch}`} className="bg-white hover:bg-orange-50 transition-colors">
                  <td className="py-2 px-4 text-center text-orange-900">
                    <div className="flex items-center justify-center">
                      <GitBranch size={14} className="mr-2 text-orange-300" />
                      <span>{history.branch || 'default'}</span>
                    </div>
                  </td>
                  <td className="py-2 px-4 text-center text-orange-400 font-mono text-xs">
                    {history.commit_hash ? (
                      <div className="flex items-center justify-center">
                        <Code size={14} className="mr-2 text-orange-300" />
                        {history.commit_hash.substring(0, 8)}
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className={`py-2 px-4 text-center font-semibold ${getCoverageColorClass(history.total_coverage)}`}>
                    {history.total_coverage.toFixed(1)}%
                  </td>
                  <td className="py-2 px-4 text-center text-sm text-orange-600">
                    <div className="flex items-center justify-center">
                      <Hash size={14} className="mr-2 text-orange-300" />
                      {history.branch_scans || 0}  
                    </div>
                  </td>
                  <td className="py-2 px-4 text-center text-sm text-orange-400">
                    <div className="flex items-center justify-center">
                      <Calendar size={14} className="mr-2 text-orange-300" />
                      {formatDate(history.timestamp)}
                    </div>
                  </td>
                  <td className="py-2 px-4 text-center">
                    <button
                      onClick={() => onSelectHistory(history)}
                      className="text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded hover:bg-orange-200 transition-colors"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      {searchQuery && filteredHistory.length > 0 && (
        <div className="mt-3 text-sm text-orange-400">
          Found {filteredHistory.length} {filteredHistory.length === 1 ? 'result' : 'results'}
        </div>
      )}
    </div>
  );
};

export default CoverageHistoryList;
