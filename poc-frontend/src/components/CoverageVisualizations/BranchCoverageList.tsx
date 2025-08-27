import React, { useState, useEffect } from 'react';
import { getBranchCoverage, scanMultipleBranches, getBranchList } from '@/services/api';
import { BranchCoverage, MultiBranchScanResult } from '@/types/coverage';
import { AlertCircle, Check, AlertTriangle, Clock } from 'lucide-react';
import ScanButton from '@/components/ui/UniversalButton';

interface BranchCoverageListProps {
  repository: string;
  onBranchSelect?: (branch1: string, branch2: string) => void;
}

interface Branch {
  name: string;
  commit_sha?: string;
  protected?: boolean;
  is_default?: boolean;
}

const BranchSkeleton = () => (
  <div className="animate-pulse space-y-4">
    <div className="flex flex-wrap gap-2 mb-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-10 w-32 bg-orange-100 rounded"></div>
      ))}
    </div>
  </div>
);

export const BranchCoverageList: React.FC<BranchCoverageListProps> = ({
  repository,
  onBranchSelect
}) => {
  const [branches, setBranches] = useState<BranchCoverage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanJobs, setScanJobs] = useState<{ branch: string; job_id: string }[] | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [availableBranches, setAvailableBranches] = useState<Branch[]>([]);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);

  useEffect(() => {
    if (!repository) return;
    
    const fetchData = async () => {
      try {
        setLoadingBranches(true);
        const [coverageResponse, branchesResponse] = await Promise.all([
          fetchBranchCoverage(),
          getBranchList(repository)
        ]);
        
        setAvailableBranches(branchesResponse.data.branches || []);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load repository data');
      } finally {
        setLoadingBranches(false);
      }
    };

    fetchData();
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
      setScanJobs(null);
      setScanMessage(null);
      const response = await scanMultipleBranches(repository, selectedBranches);
      setScanJobs(response.data.jobs || []);
      setScanMessage(response.data.message || 'Started coverage scans');
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
        {loadingBranches ? (
          <BranchSkeleton />
        ) : (
          <div className="flex flex-wrap gap-2 mb-4">
            {availableBranches.map(branch => (
              <label 
                key={`${branch.name}-${branch.commit_sha || ''}`} 
                className="flex items-center p-2 border border-orange-200 rounded cursor-pointer hover:bg-orange-100 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedBranches.includes(branch.name)}
                  onChange={() => toggleBranchSelection(branch.name)}
                  className="mr-2"
                />
                <span className="text-orange-700" title={branch.name}>
                  {formatBranchName(branch.name)}
                  {branch.is_default && (
                    <span className="ml-1 text-xs text-orange-400">(default)</span>
                  )}
                </span>
              </label>
            ))}
          </div>
        )}
        <ScanButton
          onClick={handleScanBranches}
          disabled={isScanning || selectedBranches.length === 0 || loadingBranches}
          loading={isScanning}
          text="Scan Selected Branches"
        />
        {scanJobs && scanMessage && (
          <div className="mt-4 bg-orange-50 border border-orange-200 p-4 rounded-md">
            <div className="text-orange-700 font-medium mb-2">{scanMessage}</div>
            <div className="text-sm text-orange-600">
              {scanJobs.map(job => (
                <div key={job.job_id} className="mb-1">
                  <span className="font-mono text-orange-900">{job.branch}</span>
                  <span className="mx-2 text-orange-400">→</span>
                  <span className="font-mono text-orange-500">Job ID: {job.job_id}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 text-xs text-orange-400">
              You can track the progress of each job in the <b>Active Jobs</b> tab.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BranchCoverageList;
