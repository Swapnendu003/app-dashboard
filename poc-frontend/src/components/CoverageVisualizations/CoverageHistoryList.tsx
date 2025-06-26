'use client';

import React, { useState, useEffect } from 'react';
import { CoverageHistory } from '@/types/coverage';
import { Search, GitBranch, Calendar, Code } from 'lucide-react';

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

  // Calculate coverage color class
  const getCoverageColorClass = (coverage: number): string => {
    if (coverage >= 80) return 'text-green-500';
    if (coverage >= 60) return 'text-green-600';
    if (coverage >= 40) return 'text-yellow-500';
    if (coverage >= 20) return 'text-orange-500';
    return 'text-red-500';
  };

  return (
    <div className="bg-[#1F2B39] rounded-lg border border-gray-700 p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-300">Coverage History</h2>
        <div className="w-1/3">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by branch or commit..."
              className="w-full pl-8 pr-3 py-2 bg-[#263544] text-white rounded-md border border-gray-700 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>
      
      {filteredHistory.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-gray-400">
            {searchQuery ? 'No matching coverage history found' : 'No coverage history available'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full rounded-lg overflow-hidden">
            <thead className="bg-[#263544]">
              <tr>
                <th className="py-2 px-4 text-left text-sm font-medium text-gray-300">Branch</th>
                <th className="py-2 px-4 text-left text-sm font-medium text-gray-300">Commit</th>
                <th className="py-2 px-4 text-right text-sm font-medium text-gray-300">Coverage</th>
                <th className="py-2 px-4 text-right text-sm font-medium text-gray-300">Scanned</th>
                <th className="py-2 px-4 text-center text-sm font-medium text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {filteredHistory.map((history, index) => (
                <tr key={history.id} className="bg-[#1F2B39]/80 hover:bg-[#263544] transition-colors">
                  <td className="py-2 px-4 text-gray-300">
                    <div className="flex items-center">
                      <GitBranch size={14} className="mr-2 text-gray-400" />
                      <span>{history.branch || 'default'}</span>
                    </div>
                  </td>
                  <td className="py-2 px-4 text-gray-400 font-mono text-xs">
                    {history.commit_hash ? (
                      <div className="flex items-center">
                        <Code size={14} className="mr-2 text-gray-400" />
                        {history.commit_hash.substring(0, 8)}
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className={`py-2 px-4 text-right font-semibold ${getCoverageColorClass(history.total_coverage)}`}>
                    {history.total_coverage.toFixed(1)}%
                  </td>
                  <td className="py-2 px-4 text-right text-sm text-gray-400">
                    <div className="flex items-center justify-end">
                      <Calendar size={14} className="mr-2 text-gray-400" />
                      {formatDate(history.timestamp)}
                    </div>
                  </td>
                  <td className="py-2 px-4 text-center">
                    <button
                      onClick={() => onSelectHistory(history)}
                      className="text-xs px-2 py-1 bg-[#324559] text-gray-300 rounded hover:bg-[#3A5269] transition-colors"
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
        <div className="mt-3 text-sm text-gray-400">
          Found {filteredHistory.length} {filteredHistory.length === 1 ? 'result' : 'results'}
        </div>
      )}
    </div>
  );
};

export default CoverageHistoryList;
