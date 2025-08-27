import React, { useState, useEffect } from 'react';
import { compareBranchCoverage, getBranchesWithHistory } from '@/services/api';
import { BranchCompareResult, FileDiff } from '@/types/coverage';
import FileHeatmap from './FileHeatmap';
import { ArrowUp, ArrowDown, Minus, AlertCircle } from 'lucide-react';
import BranchCompareCharts from './BranchCompareCharts';
import FileCoverageAnalytics from './FileCoverageAnalytics';
import ScanButton from '@/components/ui/UniversalButton';

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
  const [availableBranches, setAvailableBranches] = useState<{ name: string }[]>([{ name: defaultBranch1 }, { name: defaultBranch2 }]);

  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const response = await getBranchesWithHistory(repository);
        const branches = response.data.branches || [];
        const branchObjs = branches.map((name: string) => ({ name }));
        setAvailableBranches(branchObjs);

        if (branchObjs.length > 0) {
          const mainBranch = branchObjs.find((b: { name: string }) => ['main', 'master'].includes(b.name.toLowerCase())) || branchObjs[0];
          const developBranch = branchObjs.find((b: { name: string }) => b.name.toLowerCase() === 'develop') || branchObjs[1];

          setBranch1(mainBranch.name);
          if (developBranch && developBranch.name !== mainBranch.name) {
            setBranch2(developBranch.name);
          } else if (branchObjs.length > 1) {
            setBranch2(branchObjs[1].name);
          } else {
            setBranch2(branchObjs[0].name);
          }
        }
      } catch (err) {
        console.error('Error fetching branches:', err);
        setError('Failed to fetch repository branches');

        setAvailableBranches([{ name: defaultBranch1 }, { name: defaultBranch2 }]);
      }
    };

    if (repository) {
      fetchBranches();
    }
  }, [repository, defaultBranch1, defaultBranch2]);

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
        <h3 className="text-lg font-semibold mb-2 text-orange-700">File Coverage Differences</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white rounded-lg overflow-hidden border border-orange-100">
            <thead className="bg-orange-50">
              <tr>
                <th className="py-2 px-4 text-left text-orange-700">File</th>
                <th className="py-2 px-4 text-right text-orange-700">{branch1} (%)</th>
                <th className="py-2 px-4 text-right text-orange-700">{branch2} (%)</th>
                <th className="py-2 px-4 text-right text-orange-700">Difference</th>
              </tr>
            </thead>
            <tbody>
              {sortedDiffs.slice(0, 50).map((diff, index) => (
                <tr key={index} className={index % 2 === 0 ? 'bg-orange-50' : ''}>
                  <td className="py-2 px-4 text-sm font-mono truncate max-w-xs text-orange-900" title={diff.file}>
                    {diff.file}
                  </td>
                  <td className="py-2 px-4 text-right text-orange-600">
                    {diff.branch1.toFixed(1)}%
                  </td>
                  <td className="py-2 px-4 text-right text-orange-600">
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
          <div className="text-sm text-orange-400 mt-2">
            Showing 50 of {compareResult.file_diffs.length} files with the largest differences.
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg border border-orange-100 p-4">
      <h2 className="text-lg font-semibold mb-4 text-orange-700">Branch Coverage Comparison</h2>
      <div className="flex flex-col md:flex-row gap-4 mb-4">
        <div className="flex-1">
          <label className="block text-sm font-medium text-orange-700 mb-1">Branch 1</label>
          <select
            value={branch1}
            onChange={(e) => setBranch1(e.target.value)}
            className="w-full p-2 bg-orange-50 text-orange-900 rounded border border-orange-200"
          >
            {availableBranches.map((branch) => (
              <option key={branch.name} value={branch.name}>{branch.name}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-orange-700 mb-1">Branch 2</label>
          <select
            value={branch2}
            onChange={(e) => setBranch2(e.target.value)}
            className="w-full p-2 bg-orange-50 text-orange-900 rounded border border-orange-200"
          >
            {availableBranches.map((branch) => (
              <option key={branch.name} value={branch.name}>{branch.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <ScanButton
            onClick={handleCompare}
            disabled={isLoading}
            loading={isLoading}
            text="Compare"
          />
        </div>
      </div>
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded flex items-center">
          <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
          <span className="text-red-700">{error}</span>
        </div>
      )}
      {isLoading && (
        <div className="flex justify-center items-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500"></div>
        </div>
      )}
      {compareResult && !isLoading && (
        <div className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-orange-50 p-4 rounded-lg border border-orange-100">
              <h3 className="text-md font-semibold mb-2 text-orange-700">Coverage Summary</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-orange-400">Branch 1: {compareResult.branch1}</p>
                  <p className="text-2xl font-bold text-orange-600">{compareResult.coverage1.toFixed(1)}%</p>
                  <p className="text-xs text-orange-300">
                    {new Date(compareResult.branch1_date).toLocaleDateString()}
                  </p>
                  {compareResult.branch1_commit && (
                    <p className="text-xs text-orange-300 font-mono">
                      {compareResult.branch1_commit.substring(0, 7)}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-sm text-orange-400">Branch 2: {compareResult.branch2}</p>
                  <p className="text-2xl font-bold text-orange-600">{compareResult.coverage2.toFixed(1)}%</p>
                  <p className="text-xs text-orange-300">
                    {new Date(compareResult.branch2_date).toLocaleDateString()}
                  </p>
                  {compareResult.branch2_commit && (
                    <p className="text-xs text-orange-300 font-mono">
                      {compareResult.branch2_commit.substring(0, 7)}
                    </p>
                  )}
                </div>
              </div>
              <div className={`mt-4 p-3 rounded text-center font-semibold ${
                compareResult.diff_label === 'better' ? 'bg-green-100 text-green-600' : 
                compareResult.diff_label === 'worse' ? 'bg-red-100 text-red-600' : 
                'bg-orange-100 text-orange-600'
              }`}>
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
            <div className="bg-orange-50 p-4 rounded-lg border border-orange-100">
              <h3 className="text-md font-semibold mb-2 text-orange-700">Coverage Statistics</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-white rounded-lg">
                  <p className="text-sm text-orange-400">Total Files</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {compareResult.file_diffs.length}
                  </p>
                </div>
                <div className="text-center p-3 bg-white rounded-lg">
                  <p className="text-sm text-orange-400">Average Change</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {(compareResult.file_diffs.reduce((acc, curr) => acc + Math.abs(curr.diff), 0) / compareResult.file_diffs.length).toFixed(1)}%
                  </p>
                </div>
                <div className="text-center p-3 bg-white rounded-lg">
                  <p className="text-sm text-orange-400">Improved Files</p>
                  <p className="text-2xl font-bold text-green-600">
                    {compareResult.file_diffs.filter(d => d.diff > 0).length}
                  </p>
                </div>
                <div className="text-center p-3 bg-white rounded-lg">
                  <p className="text-sm text-orange-400">Declined Files</p>
                  <p className="text-2xl font-bold text-red-600">
                    {compareResult.file_diffs.filter(d => d.diff < 0).length}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <FileCoverageAnalytics
            fileDiffs={compareResult.file_diffs}
            branch1={compareResult.branch1}
            branch2={compareResult.branch2}
          />

          {renderFileDiffs()}
        </div>
      )}
    </div>
  );
};

export default BranchComparison;
