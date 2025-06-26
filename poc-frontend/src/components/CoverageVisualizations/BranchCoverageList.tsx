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
    <div className="bg-[#1F2B39] rounded-lg border border-gray-700 p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-300">Branch Coverage</h2>
        <div className="flex gap-2">
          <button
            onClick={fetchBranchCoverage}
            className="px-3 py-1 bg-[#263544] hover:bg-[#324559] text-gray-300 rounded text-sm transition-colors"
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded flex items-center">
          <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
          <span className="text-red-500">{error}</span>
        </div>
      )}

      <div className="mb-6 p-4 bg-[#263544] rounded-lg border border-gray-700">
        <h3 className="text-md font-medium mb-3 text-gray-300">Scan Branches</h3>
        
        <div className="flex flex-wrap gap-2 mb-4">
          {availableBranches.map(branch => (
            <label key={branch} className="flex items-center p-2 border border-gray-600 rounded cursor-pointer hover:bg-[#324559] transition-colors">
              <input
                type="checkbox"
                checked={selectedBranches.includes(branch)}
                onChange={() => toggleBranchSelection(branch)}
                className="mr-2"
              />
              <span className="text-gray-300" title={branch}>{formatBranchName(branch)}</span>
            </label>
          ))}
        </div>
        
        <button
          onClick={handleScanBranches}
          disabled={isScanning || selectedBranches.length === 0}
          className="px-4 py-2 bg-[#FF7D2D] text-white rounded hover:bg-[#e66f00] disabled:opacity-50 transition-colors"
        >
          {isScanning ? 'Scanning...' : 'Scan Selected Branches'}
        </button>
      </div>

      {scanResult && (
        <div className="mb-6 p-4 bg-[#263544] rounded-lg border border-gray-700">
          <h3 className="text-md font-medium mb-3 text-gray-300">Scan Results</h3>
          <div className="text-sm mb-2 text-gray-400">
            Successfully scanned {scanResult.successful} of {scanResult.total_scanned} branches
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full rounded-lg overflow-hidden">
              <thead className="bg-[#1F2B39]">
                <tr>
                  <th className="py-2 px-4 text-left text-sm font-medium text-gray-300">Branch</th>
                  <th className="py-2 px-4 text-left text-sm font-medium text-gray-300">Status</th>
                  <th className="py-2 px-4 text-right text-sm font-medium text-gray-300">Coverage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {scanResult.branches.map((branch, index) => (
                  <tr key={index} className="bg-[#1F2B39]/80 hover:bg-[#263544] transition-colors">
                    <td className="py-2 px-4 text-gray-300">
                      <span title={branch.branch}>{formatBranchName(branch.branch)}</span>
                    </td>
                    <td className={`py-2 px-4 flex items-center ${getStatusColor(branch.status)}`}>
                      {getStatusIcon(branch.status)}
                      <span className="ml-2">{branch.status}</span>
                      {branch.error && (
                        <span className="block text-xs text-gray-400 ml-5" title={branch.error}>
                          {branch.error.length > 30 ? branch.error.substring(0, 27) + '...' : branch.error}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-right text-[#FF7D2D] font-medium">
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
        <h3 className="text-md font-medium mb-3 text-gray-300">Coverage by Branch</h3>
        
        {loading ? (
          <div className="flex justify-center items-center h-24">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#FF7D2D]"></div>
          </div>
        ) : branches.length === 0 ? (
          <div className="text-center py-6 bg-[#263544]/50 rounded-lg border border-gray-700">
            <p className="text-gray-400">No branch coverage data available. Scan branches to generate coverage reports.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-700">
            <table className="min-w-full rounded-lg overflow-hidden">
              <thead className="bg-[#263544]">
                <tr>
                  <th className="py-2 px-4 text-left text-sm font-medium text-gray-300">Branch</th>
                  <th className="py-2 px-4 text-right text-sm font-medium text-gray-300">Coverage</th>
                  <th className="py-2 px-4 text-right text-sm font-medium text-gray-300">Last Scanned</th>
                  <th className="py-2 px-4 text-center text-sm font-medium text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {branches.map((branch, index) => (
                  <tr key={branch.id} className="bg-[#1F2B39]/80 hover:bg-[#263544] transition-colors">
                    <td className="py-2 px-4 text-gray-300">
                      <span title={branch.branch}>{formatBranchName(branch.branch)}</span>
                      {branch.commit_hash && (
                        <span className="block text-xs text-gray-500 font-mono">
                          {branch.commit_hash.substring(0, 7)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-right font-semibold text-[#FF7D2D]">
                      {branch.total_coverage.toFixed(1)}%
                    </td>
                    <td className="py-2 px-4 text-right text-sm text-gray-400">
                      {formatDate(branch.timestamp)}
                    </td>
                    <td className="py-2 px-4 text-center">
                      {onBranchSelect && branches.length > 1 && (
                        <div className="flex gap-2 justify-center">
                          <button
                            className="text-xs px-2 py-1 bg-[#324559] text-gray-300 rounded hover:bg-[#3A5269] transition-colors"
                            onClick={() => onBranchSelect('main', branch.branch)}
                          >
                            Compare with main
                          </button>
                          <button
                            className="text-xs px-2 py-1 bg-[#263544] text-gray-300 rounded hover:bg-[#324559] transition-colors"
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
