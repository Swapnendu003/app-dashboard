// File: src/types/coverage.ts
export interface FileCoverage {
  file: string;
  coverage: number;
}

export interface CoverageResponse {
  total_coverage: number;
  files: FileCoverage[];
  id?: string;
  repository?: string;
  branch?: string;
  timestamp?: string;
  commit_hash?: string;
}

export interface CoverageHistory {
  id: string;
  repository: string;
  branch: string;
  total_coverage: number;
  files: FileCoverage[];
  timestamp: string;
  commit_hash?: string;
}

export interface CoverageTrend {
  date: string;
  coverage: number;
  commit_hash?: string;
}

export interface BranchCoverage {
  id: string;
  branch: string;
  total_coverage: number;
  timestamp: string;
  commit_hash?: string;
}

export interface FileDiff {
  file: string;
  branch1: number;
  branch2: number;
  diff: number;
  diff_label: 'better' | 'worse' | 'same' | 'new' | 'removed';
}

export interface BranchCompareResult {
  repository: string;
  branch1: string;
  branch2: string;
  coverage1: number;
  coverage2: number;
  coverage_diff: number;
  diff_label: 'better' | 'worse' | 'same';
  file_diffs: FileDiff[];
  branch1_date: string;
  branch2_date: string;
  branch1_commit?: string;
  branch2_commit?: string;
}

export interface MultiBranchScanResult {
  repo_url: string;
  total_scanned: number;
  successful: number;
  failed: number;
  branches: Array<{
    branch: string;
    status: string;
    coverage?: number;
    error?: string;
  }>;
}
