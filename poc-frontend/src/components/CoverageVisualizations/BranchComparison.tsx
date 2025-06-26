import React, { useState, useEffect } from 'react';
import { compareBranchCoverage } from '@/services/api';
import { BranchCompareResult, FileDiff } from '@/types/coverage';
import FileHeatmap from './FileHeatmap';
import { ArrowUp, ArrowDown, Minus, AlertCircle } from 'lucide-react';

interface BranchComparisonProps {
  repository: string;
  defaultBranch1?: string;
  defaultBranch2?: string;
}

export const BranchComparison: React.FC<BranchComparisonProps> = ({
  repository,
  defaultBranch1 = 'main',
  defaultBranch2 = 'develop',
}) => {
  const [branch1, setBranch1] = useState(defaultBranch1);
  const [branch2, setBranch2] = useState(defaultBranch2);
  const [compareResult, setCompareResult] = useState<BranchCompareResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableBranches, setAvailableBranches] = useState<string[]>([defaultBranch1, defaultBranch2]);

  useEffect(() => {
    const fetchBranches = async () => {
      try {
        setAvailableBranches(['main', 'develop', 'feature/coverage', 'bugfix/tests']);
      } catch (err) {
        console.error('Error fetching branches:', err);
      }
    };
    fetchBranches();
  }, [repository]);

  const handleCompare = async () => {
    if (branch1 === branch2) {
      setError('Please select two different branches to compare');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await compareBranchCoverage(repository, branch1, branch2);
      setCompareResult(response.data);
    } catch (err) {
      console.error('Error comparing branches:', err);
      setError('Failed to compare branches. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const getColorForDiff = (diff: number) => {
    if (diff > 5) return 'text-green-500';
    if (diff > 0) return 'text-green-400';
    if (diff < -5) return 'text-red-500';
    if (diff < 0) return 'text-red-400';
    return 'text-gray-500';
  };

  const getDiffIcon = (diff: number) => {
    if (diff > 0) return <ArrowUp size={14} className="inline text-green-500" />;
    if (diff < 0) return <ArrowDown size={14} className="inline text-red-500" />;
    return <Minus size={14} className="inline text-gray-500" />;
  };

  const renderFileDiffs = () => {
    if (!compareResult?.file_diffs?.length) return null;
    const sortedDiffs = [...compareResult.file_diffs].sort((a, b) => {
      return Math.abs(b.diff) - Math.abs(a.diff);
    });
    return (
      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-2">File Coverage Differences</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white rounded-lg overflow-hidden">
            <thead className="bg-gray-100">
              <tr>
                <th className="py-2 px-4 text-left">File</th>
                <th className="py-2 px-4 text-right">{branch1} (%)</th>
                <th className="py-2 px-4 text-right">{branch2} (%)</th>
                <th className="py-2 px-4 text-right">Difference</th>
              </tr>
            </thead>
            <tbody>
              {sortedDiffs.slice(0, 50).map((diff, index) => (
                <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                  <td className="py-2 px-4 text-sm font-mono truncate max-w-xs" title={diff.file}>
                    {diff.file}
                  </td>
                  <td className="py-2 px-4 text-right">
                    {diff.branch1.toFixed(1)}%
                  </td>
                  <td className="py-2 px-4 text-right">
                    {diff.branch2.toFixed(1)}%
                  </td>
                  <td className={`py-2 px-4 text-right font-medium ${getColorForDiff(diff.diff)}`}>
                    {diff.diff > 0 ? '+' : ''}{diff.diff.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {compareResult.file_diffs.length > 50 && (
          <div className="text-sm text-gray-500 mt-2">
            Showing 50 of {compareResult.file_diffs.length} files with the largest differences.
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-[#1F2B39] rounded-lg border border-gray-700 p-4">
      <h2 className="text-lg font-semibold mb-4 text-gray-300">Branch Coverage Comparison</h2>
      <div className="flex flex-col md:flex-row gap-4 mb-4">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-300 mb-1">Branch 1</label>
          <select
            value={branch1}
            onChange={(e) => setBranch1(e.target.value)}
            className="w-full p-2 bg-[#263544] text-gray-300 rounded border border-gray-700"
          >
            {availableBranches.map((branch) => (
              <option key={branch} value={branch}>{branch}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-300 mb-1">Branch 2</label>
          <select
            value={branch2}
            onChange={(e) => setBranch2(e.target.value)}
            className="w-full p-2 bg-[#263544] text-gray-300 rounded border border-gray-700"
          >
            {availableBranches.map((branch) => (
              <option key={branch} value={branch}>{branch}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={handleCompare}
            disabled={isLoading}
            className="px-4 py-2 bg-[#FF7D2D] text-white rounded hover:bg-[#e66f00] transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Comparing...' : 'Compare'}
          </button>
        </div>
      </div>
      {error && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded flex items-center">
          <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
          <span className="text-red-500">{error}</span>
        </div>
      )}
      {isLoading && (
        <div className="flex justify-center items-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#FF7D2D]"></div>
        </div>
      )}
      {compareResult && !isLoading && (
        <div className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#263544] p-4 rounded-lg border border-gray-700">
              <h3 className="text-md font-semibold mb-2 text-gray-300">Coverage Summary</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-400">Branch 1: {compareResult.branch1}</p>
                  <p className="text-2xl font-bold text-[#FF7D2D]">{compareResult.coverage1.toFixed(1)}%</p>
                  <p className="text-xs text-gray-500">
                    {new Date(compareResult.branch1_date).toLocaleDateString()}
                  </p>
                  {compareResult.branch1_commit && (
                    <p className="text-xs text-gray-500 font-mono">
                      {compareResult.branch1_commit.substring(0, 7)}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-sm text-gray-400">Branch 2: {compareResult.branch2}</p>
                  <p className="text-2xl font-bold text-[#FF7D2D]">{compareResult.coverage2.toFixed(1)}%</p>
                  <p className="text-xs text-gray-500">
                    {new Date(compareResult.branch2_date).toLocaleDateString()}
                  </p>
                  {compareResult.branch2_commit && (
                    <p className="text-xs text-gray-500 font-mono">
                      {compareResult.branch2_commit.substring(0, 7)}
                    </p>
                  )}
                </div>
              </div>
              <div
                className={`mt-4 p-3 rounded text-center font-semibold flex items-center justify-center text-lg ${
                  compareResult.diff_label === 'better' ? 'bg-green-900/20 border border-green-800 text-green-500' : 
                  compareResult.diff_label === 'worse' ? 'bg-red-900/20 border border-red-800 text-red-500' : 
                  'bg-gray-800 text-gray-400'
                }`}
              >
                {getDiffIcon(compareResult.coverage_diff)}
                <span className="ml-2">
                  {compareResult.coverage_diff > 0 && '+'}
                  {compareResult.coverage_diff.toFixed(1)}% 
                  {compareResult.diff_label === 'better' && ' improvement'}
                  {compareResult.diff_label === 'worse' && ' decline'}
                  {compareResult.diff_label === 'same' && ' no change'}
                </span>
              </div>
            </div>
            <div className="bg-[#263544] p-4 rounded-lg border border-gray-700">
              <h3 className="text-md font-semibold mb-2 text-gray-300">Coverage Distribution</h3>
              <FileHeatmap files={compareResult.file_diffs.map(f => ({ 
                file: f.file, 
                coverage: f.branch2 
              }))} />
            </div>
          </div>
          {renderFileDiffs()}
        </div>
      )}
    </div>
  );
};

export default BranchComparison;
