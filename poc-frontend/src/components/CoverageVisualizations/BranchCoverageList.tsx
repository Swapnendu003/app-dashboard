import React, { useState, useEffect } from 'react';
import { getBranchCoverage, scanMultipleBranches } from '@/services/api';
import { BranchCoverage, MultiBranchScanResult } from '@/types/coverage';
import { AlertCircle, Check, AlertTriangle, Clock } from 'lucide-react';

interface BranchCoverageListProps {
  repository: string;
  onBranchSelect?: (branch1: string, branch2: string) => void;
}

export const BranchCoverageList: React.FC<BranchCoverageListProps> = ({
  repository,
  onBranchSelect
}) => {
  const [branches, setBranches] = useState<BranchCoverage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<MultiBranchScanResult | null>(null);
  const [availableBranches, setAvailableBranches] = useState<string[]>([]);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);

  useEffect(() => {
    if (!repository) return;
    
    fetchBranchCoverage();
    setAvailableBranches(['main', 'develop', 'feature/coverage', 'bugfix/tests']);
  }, [repository]);

  const fetchBranchCoverage = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getBranchCoverage(repository);
      setBranches(response.data);
    } catch (err) {
      console.error('Error fetching branch coverage:', err);
      setError('Failed to load branch coverage data');
    } finally {
      setLoading(false);
    }
  };

  const handleScanBranches = async () => {
    if (selectedBranches.length === 0) {
      setError('Please select at least one branch to scan');
      return;
    }

    try {
      setIsScanning(true);
      setError(null);
      const response = await scanMultipleBranches(repository, selectedBranches);
      setScanResult(response.data);
      
      await fetchBranchCoverage();
    } catch (err) {
      console.error('Error scanning branches:', err);
      setError('Failed to scan branches');
    } finally {
      setIsScanning(false);
    }
  };

  const toggleBranchSelection = (branch: string) => {
    if (selectedBranches.includes(branch)) {
      setSelectedBranches(selectedBranches.filter(b => b !== branch));
    } else {
      setSelectedBranches([...selectedBranches, branch]);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-green-500';
      case 'failed': return 'text-red-500';
      case 'pending': return 'text-yellow-500';
      case 'timeout': return 'text-orange-500';
      default: return 'text-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <Check size={14} className="text-green-500" />;
      case 'failed': return <AlertCircle size={14} className="text-red-500" />;
      case 'pending': return <Clock size={14} className="text-yellow-500" />;
      case 'timeout': return <AlertTriangle size={14} className="text-orange-500" />;
      default: return null;
    }
  };

  const formatDate = (isoDate: string) => {
    try {
      return new Date(isoDate).toLocaleString();
    } catch (e) {
      return isoDate;
    }
  };

  const formatBranchName = (branch: string) => {
    if (branch.length > 30) {
      return branch.substring(0, 27) + '...';
    }
    return branch;
  };

  return (
    <div className="bg-white rounded-lg border border-orange-100 p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-orange-700">Branch Coverage</h2>
        <div className="flex gap-2">
          <button
            onClick={fetchBranchCoverage}
            className="px-3 py-1 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded text-sm border border-orange-200 transition-colors"
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded flex items-center">
          <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      <div className="mb-6 p-4 bg-orange-50 rounded-lg border border-orange-100">
        <h3 className="text-md font-medium mb-3 text-orange-700">Scan Branches</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {availableBranches.map(branch => (
            <label key={branch} className="flex items-center p-2 border border-orange-200 rounded cursor-pointer hover:bg-orange-100 transition-colors">
              <input
                type="checkbox"
                checked={selectedBranches.includes(branch)}
                onChange={() => toggleBranchSelection(branch)}
                className="mr-2"
              />
              <span className="text-orange-700" title={branch}>{formatBranchName(branch)}</span>
            </label>
          ))}
        </div>
        <button
          onClick={handleScanBranches}
          disabled={isScanning || selectedBranches.length === 0}
          className="px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded hover:from-red-500 hover:to-orange-500 disabled:opacity-50 transition-colors"
        >
          {isScanning ? 'Scanning...' : 'Scan Selected Branches'}
        </button>
      </div>

      {scanResult && (
        <div className="mb-6 p-4 bg-orange-50 rounded-lg border border-orange-100">
          <h3 className="text-md font-medium mb-3 text-orange-700">Scan Results</h3>
          <div className="text-sm mb-2 text-orange-400">
            Successfully scanned {scanResult.successful} of {scanResult.total_scanned} branches
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full rounded-lg overflow-hidden border border-orange-100">
              <thead className="bg-orange-50">
                <tr>
                  <th className="py-2 px-4 text-left text-sm font-medium text-orange-700">Branch</th>
                  <th className="py-2 px-4 text-left text-sm font-medium text-orange-700">Status</th>
                  <th className="py-2 px-4 text-right text-sm font-medium text-orange-700">Coverage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-orange-100">
                {scanResult.branches.map((branch, index) => (
                  <tr key={index} className="bg-white hover:bg-orange-50 transition-colors">
                    <td className="py-2 px-4 text-orange-900">
                      <span title={branch.branch}>{formatBranchName(branch.branch)}</span>
                    </td>
                    <td className={`py-2 px-4 flex items-center ${getStatusColor(branch.status)}`}>
                      {getStatusIcon(branch.status)}
                      <span className="ml-2">{branch.status}</span>
                      {branch.error && (
                        <span className="block text-xs text-orange-400 ml-5" title={branch.error}>
                          {branch.error.length > 30 ? branch.error.substring(0, 27) + '...' : branch.error}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-right text-orange-600 font-medium">
                      {branch.coverage !== undefined ? `${branch.coverage.toFixed(1)}%` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <h3 className="text-md font-medium mb-3 text-orange-700">Coverage by Branch</h3>
        {loading ? (
          <div className="flex justify-center items-center h-24">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500"></div>
          </div>
        ) : branches.length === 0 ? (
          <div className="text-center py-6 bg-orange-50 rounded-lg border border-orange-100">
            <p className="text-orange-400">No branch coverage data available. Scan branches to generate coverage reports.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-orange-100">
            <table className="min-w-full rounded-lg overflow-hidden">
              <thead className="bg-orange-50">
                <tr>
                  <th className="py-2 px-4 text-left text-sm font-medium text-orange-700">Branch</th>
                  <th className="py-2 px-4 text-right text-sm font-medium text-orange-700">Coverage</th>
                  <th className="py-2 px-4 text-right text-sm font-medium text-orange-700">Last Scanned</th>
                  <th className="py-2 px-4 text-center text-sm font-medium text-orange-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-orange-100">
                {branches.map((branch, index) => (
                  <tr key={branch.id} className="bg-white hover:bg-orange-50 transition-colors">
                    <td className="py-2 px-4 text-orange-900">
                      <span title={branch.branch}>{formatBranchName(branch.branch)}</span>
                      {branch.commit_hash && (
                        <span className="block text-xs text-orange-300 font-mono">
                          {branch.commit_hash.substring(0, 7)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-right font-semibold text-orange-600">
                      {branch.total_coverage.toFixed(1)}%
                    </td>
                    <td className="py-2 px-4 text-right text-sm text-orange-400">
                      {formatDate(branch.timestamp)}
                    </td>
                    <td className="py-2 px-4 text-center">
                      {onBranchSelect && branches.length > 1 && (
                        <div className="flex gap-2 justify-center">
                          <button
                            className="text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded hover:bg-orange-200 transition-colors"
                            onClick={() => onBranchSelect('main', branch.branch)}
                          >
                            Compare with main
                          </button>
                          <button
                            className="text-xs px-2 py-1 bg-orange-50 text-orange-700 rounded hover:bg-orange-100 transition-colors"
                            onClick={() => window.location.href = `/coverage/${branch.id}`}
                          >
                            View Details
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default BranchCoverageList;
