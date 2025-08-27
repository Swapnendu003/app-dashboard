"use client";

import React, { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  getUserScannedRepositories,
  runCoverageScan,
  getCoverageJobStatus,
  getCoverageById,
  getCoverageHistory,
  getCoverageTrends,
  getActiveJobs,
  getBranchList,
  getUserRepositories,
  scanMultipleBranches,
} from "@/services/api";
import {
  Loader2,
  BarChart2,
  AlertCircle,
  CheckCircle2,
  PlusCircle,
  GitBranch,
  History,
  Activity,
  RefreshCw,
  ScanLine,
} from "lucide-react";
import PageSkeleton from "@/components/PageSkeleton";
import {
  FileHeatmap,
  CoverageHistoryChart,
  CoverageHistoryList,
  BranchCoverageList,
  BranchComparison,
} from "@/components/CoverageVisualizations";
import ActiveJobsList from "@/components/ActiveJobsList";
import SearchableDropdown from "@/components/SearchableDropdown";
import { Repository } from "@/types/repository";
import ScanButton from "@/components/ui/UniversalButton";
import MultiSelectDropdown from "@/components/MultiSelectDropdown";

const TabInitializer = ({ onTabChange }: { onTabChange: (tab: "coverage" | "activity") => void }) => {
  const searchParams = useSearchParams();
  
  useEffect(() => {
    const tab = searchParams?.get("tab");
    onTabChange(tab === "activity" ? "activity" : "coverage");
  }, [searchParams, onTabChange]);

  return null;
};

const AdhocCoveragePage = () => {
  const [mainTab, setMainTab] = useState<"coverage" | "activity">("coverage");
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState<string | string[]>([]);
  const [branches, setBranches] = useState<
    { name: string; isDefault: boolean; protected: boolean }[]
  >([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [coverageResult, setCoverageResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [scannedRepos, setScannedRepos] = useState<any[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [historyRepo, setHistoryRepo] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [coverageHistory, setCoverageHistory] = useState<any[]>([]);
  const [coverageTrends, setCoverageTrends] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<
    "scanner" | "history" | "compare"
  >("scanner");
  const [timeframe, setTimeframe] = useState<"daily" | "weekly" | "monthly">(
    "weekly"
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<any>(null);
  const [scanSettings, setScanSettings] = useState({
    useAsync: true,
    cloneTimeout: 300,
  });
  const [fileSearchQuery, setFileSearchQuery] = useState("");
  const [filteredFiles, setFilteredFiles] = useState<any[]>([]);
  const [activeJobsCount, setActiveJobsCount] = useState(0);
  const [compareBranch1, setCompareBranch1] = useState<string>("main");
  const [compareBranch2, setCompareBranch2] = useState<string>("develop");
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [repoOptions, setRepoOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [repoInputMode, setRepoInputMode] = useState<"dropdown" | "manual">(
    "dropdown"
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingRepoDropdown, setLoadingRepoDropdown] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [skip] = useState<number>(0);
  const [limit] = useState<number>(50);
  const prevSearchQueryRef = useRef<string>("");
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setLoadingRepos(true);
    getUserScannedRepositories()
      .then((res) => {
        const repos = (res.data.repositories || [])
          .slice()
          .sort((a: any, b: any) => {
            const dateA = new Date(a.last_scanned).getTime();
            const dateB = new Date(b.last_scanned).getTime();
            return dateB - dateA;
          });
        setScannedRepos(repos);
      })
      .catch(() => setScannedRepos([]))
      .finally(() => setLoadingRepos(false));
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;
    if (
      jobId &&
      jobStatus &&
      jobStatus !== "completed" &&
      jobStatus !== "failed"
    ) {
      setSuccess(null);
      setError(null);

      interval = setInterval(async () => {
        try {
          const response = await getCoverageJobStatus(jobId);
          const status = response.data.status;

          setJobStatus(status);
          if (status === "completed") {
            clearInterval(interval!);
            setSuccess("Coverage scan completed!");
            if (response.data.result_id) {
              const result = await getCoverageById(response.data.result_id);
              setCoverageResult(result.data);
            }
          } else if (status === "failed") {
            clearInterval(interval!);
            setError("Coverage scan failed.");
          }
        } catch (e: any) {
          setError(e.message || "Failed to get job status");
          clearInterval(interval!);
        }
      }, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [jobId, jobStatus]);

  useEffect(() => {
    if (coverageResult?.files) {
      setFilteredFiles(
        coverageResult.files.filter((file: any) =>
          file.file.toLowerCase().includes(fileSearchQuery.toLowerCase())
        )
      );
    }
  }, [fileSearchQuery, coverageResult]);

  const checkActiveJobs = useCallback(() => {
    getActiveJobs()
      .then((response) => {
        const inProgressJobs = response.data.filter(
          (job: any) => job.status === "in_progress"
        ).length;
        setActiveJobsCount(inProgressJobs);
      })
      .catch((err) => {
        console.error("Failed to check active jobs:", err);
      });
  }, []);

  useEffect(() => {
    checkActiveJobs();
    const interval = setInterval(checkActiveJobs, 30000);
    return () => clearInterval(interval);
  }, [checkActiveJobs]);

  const fetchBranches = useCallback(
    async (url: string) => {
      if (!url) return;
      setLoadingBranches(true);
      setBranches([]);
      try {
        const response = await getBranchList(url);
        const branchList = response.data.branches.map((branch: any) => ({
          name: branch.name,
          isDefault: branch.is_default || false,
          protected: branch.protected || false,
        }));
        setBranches(branchList);
        const defaultBranch = branchList.find(
          (b: { name: string; isDefault: boolean; protected: boolean }) =>
            b.isDefault
        );
        if (defaultBranch && !branch) {
          setBranch(defaultBranch.name);
        }
      } catch (error) {
        console.error("Failed to fetch branches:", error);
      } finally {
        setLoadingBranches(false);
      }
    },
    [branch]
  );

  useEffect(() => {
    if (repoUrl) {
      fetchBranches(repoUrl);
    }
  }, [repoUrl, fetchBranches]);

  useEffect(() => {
    if (activeTab === "history" && repoUrl) {
      handleViewHistory(repoUrl);
    }
  }, [activeTab, repoUrl]);

  const handleScan = async () => {
    setScanLoading(true);
    setError(null);
    setSuccess(null);
    setCoverageResult(null);
    setJobId(null);
    setJobStatus(null);

    try {
      if (Array.isArray(branch) && branch.length > 1) {
        // Multi-branch scan
        const response = await scanMultipleBranches(repoUrl, branch);
        setSuccess(
          response.data.message || "Started coverage scans for multiple branches"
        );
        setShowModal(false);
      } else {
        // Single branch scan
        const response = await runCoverageScan(
          repoUrl,
          Array.isArray(branch) ? branch[0] : branch,
          {
            async: scanSettings.useAsync,
            cloneTimeout: scanSettings.cloneTimeout,
          }
        );

        if (scanSettings.useAsync) {
          setJobId(response.data.job_id);
          setJobStatus("in_progress");
          localStorage.setItem(`job_${response.data.job_id}_polling`, "true");
        } else {
          setCoverageResult(response.data);
          setSuccess("Coverage scan completed successfully!");
        }
        setShowModal(false);
      }
    } catch (e: any) {
      setError(e.response?.data?.error || "Failed to start coverage scan");
    } finally {
      setScanLoading(false);
    }
  };

  const handleViewHistory = async (repoUrl: string) => {
    setHistoryRepo(repoUrl);
    setHistoryLoading(true);
    setHistoryError(null);
    setCoverageHistory([]);
    setCoverageTrends([]);
    setSelectedHistoryItem(null);
    try {
      const [historyRes, trendsRes] = await Promise.all([
        getCoverageHistory(repoUrl),
        getCoverageTrends(
          repoUrl,
          timeframe === "daily" ? 30 : timeframe === "weekly" ? 90 : 365
        ),
      ]);
      setCoverageHistory(historyRes.data);
      setCoverageTrends(trendsRes.data);
    } catch (e: any) {
      setHistoryError(
        e.response?.data?.error || "Failed to fetch coverage history"
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleViewJobResults = (resultId: string) => {
    getCoverageById(resultId)
      .then((response) => {
        setCoverageResult(response.data);
        setActiveTab("scanner");
      })
      .catch((err) => {
        console.error("Failed to fetch job results:", err);
      });
  };

  useEffect(() => {
    setLoadingRepoDropdown(true);
    getUserRepositories(0, limit)
      .then((response) => {
        if (response.data && response.data.repositories) {
          const repos = response.data.repositories;
          setRepositories(repos);
          setRepoOptions(
            repos.map((repo: Repository) => ({
              value: repo.html_url,
              label: repo.name,
            }))
          );
        }
      })
      .catch((err) => {
        console.error("Error loading repositories:", err);
        setSearchError("Failed to load repositories");
      })
      .finally(() => setLoadingRepoDropdown(false));
  }, [limit]);

  const handleRepoSearch = useCallback(
    (query: string) => {
      if (query === prevSearchQueryRef.current) return;
      prevSearchQueryRef.current = query;
      setSearchQuery(query);
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      setLoadingRepoDropdown(true);
      setSearchError(null);

      if (!query.trim()) {
        setRepositories([]);
        setLoadingRepoDropdown(false);
        return;
      }

      if (query.trim().length < 3) {
        setLoadingRepoDropdown(false);
        return;
      }

      searchTimeoutRef.current = setTimeout(async () => {
        try {
          const response = await getUserRepositories(skip, limit, query);
          if (response.data && response.data.repositories) {
            const repos = response.data.repositories;
            setRepositories(repos);
            setRepoOptions(
              repos.map((repo: Repository) => ({
                value: repo.html_url,
                label: repo.name,
              }))
            );
          }
        } catch (err: any) {
          console.error("Error searching repositories:", err);
          setSearchError(err.message || "Failed to search repositories");
        } finally {
          setLoadingRepoDropdown(false);
        }
      }, 500);
    },
    [skip, limit]
  );

  const handleRepoDropdownChange = (repoUrl: string) => {
    setRepoUrl(repoUrl);
    setRepoInputMode("dropdown");
    setCoverageResult(null);
    setError(null);
    setBranch("");
    setBranches([]);

    if (repoUrl) {
      fetchBranches(repoUrl);
      if (activeTab === "history") {
        handleViewHistory(repoUrl);
      }
    }
  };

  const handleRepoInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newRepoUrl = e.target.value;
    setRepoUrl(newRepoUrl);
    setRepoInputMode("manual");
    setCoverageResult(null);
    setError(null);
    setBranch("");
    setBranches([]);

    if (newRepoUrl) {
      fetchBranches(newRepoUrl);
      if (activeTab === "history") {
        handleViewHistory(newRepoUrl);
      }
    }
  };

  const handleViewHistoryDetails = (history: any) => {
    setSelectedHistoryItem(history);
  };

  const renderHistoryTab = () => (
    <div className="mt-4">
      {repoUrl ? (
        <>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-orange-700">
              <History size={18} className="inline mr-2" />
              Coverage History for{" "}
              {repoInputMode === "dropdown"
                ? repoOptions.find((opt) => opt.value === repoUrl)?.label
                : repoUrl}
            </h3>
            <div className="flex items-center space-x-2">
              <select
                className="p-1 text-sm rounded-md border border-orange-200 bg-orange-50 hover:bg-orange-100 text-orange-700 transition-colors"
                value={timeframe}
                onChange={(e) =>
                  setTimeframe(e.target.value as "daily" | "weekly" | "monthly")
                }
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>
          {historyError ? (
            <div className="bg-orange-50 border border-orange-200 p-4 rounded-md">
              <div className="flex items-start space-x-3">
                <AlertCircle className="h-5 w-5 text-orange-500" />
                <span className="text-orange-700">{historyError}</span>
              </div>
            </div>
          ) : (
            <>
              <CoverageHistoryChart data={coverageTrends} />
              <div className="mt-8">
                <CoverageHistoryList
                  coverageHistory={coverageHistory}
                  onSelectHistory={handleViewHistoryDetails}
                  onViewDetails={handleViewHistoryDetails}
                />
              </div>

              {/* Add the heatmap below when a history item is selected */}
              {selectedHistoryItem && (
                <div className="mt-8 border-t border-orange-200 pt-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-orange-700">
                      <BarChart2 size={18} className="inline mr-2" />
                      Coverage Details
                    </h3>
                    <button
                      onClick={() => setSelectedHistoryItem(null)}
                      className="text-orange-500 hover:text-orange-700"
                      title="Close details"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="lucide lucide-x"
                      >
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-orange-50 p-4 rounded-md border border-orange-100">
                      <span className="block text-sm text-orange-400">
                        Total Coverage
                      </span>
                      <span className="text-2xl font-bold text-orange-600">
                        {selectedHistoryItem.total_coverage?.toFixed(2)}%
                      </span>
                    </div>
                    <div className="bg-orange-50 p-4 rounded-md border border-orange-100">
                      <span className="block text-sm text-orange-400">
                        Files Scanned
                      </span>
                      <span className="text-2xl font-bold text-orange-600">
                        {selectedHistoryItem.files?.length ?? 0}
                      </span>
                    </div>
                  </div>

                  {selectedHistoryItem.files &&
                    selectedHistoryItem.files.length > 0 && (
                      <FileHeatmap files={selectedHistoryItem.files} />
                    )}
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <div className="text-center py-12 bg-orange-50 rounded-lg border border-orange-200">
          <p className="text-orange-400">
            Select a repository or enter a URL to view its history
          </p>
        </div>
      )}
    </div>
  );

  return (
    <PageSkeleton
      title="Code Coverage Scanner"
      subtitle="Run coverage scans for any repository and track their history"
    >
      <Suspense fallback={null}>
        <TabInitializer onTabChange={setMainTab} />
      </Suspense>
      
      <div className="max-w-6xl mx-auto mt-8">
        {/* Main tab controls */}
        <div className="flex justify-between items-center mb-6">
          <div className="bg-orange-50 p-1 rounded-lg inline-flex space-x-2">
            <div className="border-r border-orange-200 pr-2">
              <button
                onClick={() => setMainTab("coverage")}
                className={`px-6 py-2 rounded-md font-medium transition-all ${
                  mainTab === "coverage"
                    ? "bg-white text-orange-600 shadow"
                    : "text-orange-500 hover:text-orange-700"
                }`}
              >
                Coverage
              </button>
            </div>

            <div>
              <button
                onClick={() => setMainTab("activity")}
                className={`px-6 py-2 rounded-md font-medium transition-all flex items-center gap-2 ${
                  mainTab === "activity"
                    ? "bg-white text-orange-600 shadow"
                    : "text-orange-500 hover:text-orange-700"
                }`}
              >
                <Activity size={16} />
                <span>Scanning Activities</span>
                {activeJobsCount > 0 && (
                  <span className="px-1.5 py-0.5 bg-orange-500 text-white rounded-full text-xs">
                    {activeJobsCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border border-orange-100 shadow hover:border-orange-400 transition-colors">
          {mainTab === "coverage" ? (
            <>
              <div className="flex space-x-4 mb-6 border-b border-orange-200">
                <button
                  onClick={() => setActiveTab("scanner")}
                  className={`flex-1 px-4 py-2 rounded-t-md font-medium transition-all flex items-center justify-center space-x-2 ${
                    activeTab === "scanner"
                      ? "text-orange-500 border-b-2 border-orange-600"
                      : "text-orange-500 hover:text-orange-700"
                  }`}
                >
                  <BarChart2 size={16} />
                  <span>Coverage Scanner</span>
                </button>
                <button
                  onClick={() => repoUrl && setActiveTab("history")}
                  disabled={!repoUrl}
                  className={`flex-1 px-4 py-2 rounded-t-md font-medium transition-all flex items-center justify-center space-x-2 ${
                    activeTab === "history"
                      ? "text-orange-500 border-b-2 border-orange-600"
                      : !repoUrl
                      ? "text-gray-400 cursor-not-allowed"
                      : "text-orange-500 hover:text-orange-700"
                  }`}
                >
                  <History size={16} />
                  <span>History</span>
                </button>
                <button
                  onClick={() => setActiveTab("compare")}
                  className={`flex-1 px-4 py-2 rounded-t-md font-medium transition-all flex items-center justify-center space-x-2 ${
                    activeTab === "compare"
                      ? "text-orange-500 border-b-2 border-orange-600"
                      : "text-orange-500 hover:text-orange-700"
                  }`}
                >
                  <GitBranch size={16} />
                  <span>Compare</span>
                </button>
              </div>

              {activeTab === "scanner" ? (
                <>
                  <div className="flex justify-between mb-4">
                    <h2 className="text-xl font-bold text-orange-600 flex items-center gap-2">
                      Coverage Scanner
                    </h2>
                  </div>

                  {jobId &&
                    jobStatus &&
                    jobStatus !== "completed" &&
                    jobStatus !== "failed" && (
                      <div className="mt-4 bg-orange-50 border border-orange-200 p-4 rounded-md">
                        <div className="flex items-start space-x-3">
                          <Loader2 className="h-5 w-5 text-orange-500 animate-spin mt-0.5" />
                          <div>
                            <p className="text-orange-700 font-medium">
                              Coverage scan in progress
                            </p>
                            <div className="mt-2 text-xs text-orange-400">
                              Job ID: {jobId} | Status: {jobStatus}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                  {error && (
                    <div className="mt-4 bg-orange-50 border border-orange-200 p-4 rounded-md flex items-center gap-2 text-orange-700">
                      <AlertCircle size={18} className="text-orange-500" />{" "}
                      {error}
                    </div>
                  )}

                  {success && (
                    <div className="mt-4 bg-orange-50 border border-orange-200 p-4 rounded-md flex items-center gap-2 text-orange-700">
                      <CheckCircle2 size={18} className="text-orange-600" />{" "}
                      {success}
                    </div>
                  )}

                  {coverageResult && (
                    <div className="mt-6 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-orange-50 p-4 rounded-md border border-orange-100">
                          <span className="block text-sm text-orange-400">
                            Total Coverage
                          </span>
                          <span className="text-2xl font-bold text-orange-600">
                            {coverageResult.total_coverage?.toFixed(2)}%
                          </span>
                        </div>
                        <div className="bg-orange-50 p-4 rounded-md border border-orange-100">
                          <span className="block text-sm text-orange-400">
                            Files Scanned
                          </span>
                          <span className="text-2xl font-bold text-orange-600">
                            {coverageResult.files?.length ?? 0}
                          </span>
                        </div>
                      </div>

                      {coverageResult.files &&
                        coverageResult.files.length > 0 && (
                          <FileHeatmap files={coverageResult.files} />
                        )}
                    </div>
                  )}
                  <div className="flex flex-col md:flex-row md:items-end md:space-x-4">
                    <div className="flex flex-1 items-end space-x-2">
                      {/* Dropdown */}
                      <div className="w-1/2">
                        <label className="block text-sm text-orange-700 mb-1">
                          Repository
                        </label>
                        <SearchableDropdown
                          label=""
                          options={repoOptions}
                          value={repoInputMode === "dropdown" ? repoUrl : ""}
                          onChange={handleRepoDropdownChange}
                          onSearch={handleRepoSearch}
                          placeholder="Select a repository"
                          searchPlaceholder="Search repositories..."
                          loading={loadingRepoDropdown}
                          error={searchError}
                        />
                      </div>
                      {/* OR separator */}
                      <div className="flex items-center h-full pb-2">
                        <span className="mx-2 text-orange-400 font-bold">
                          OR
                        </span>
                      </div>
                      {/* Manual input */}
                      <div className="w-1/2">
                        <label className="block text-sm text-orange-700 mb-1">
                          Enter Repository URL
                        </label>
                        <input
                          type="text"
                          className="w-full p-2 bg-orange-50 text-orange-900 rounded-md border border-orange-200"
                          placeholder="https://github.com/owner/repo"
                          value={repoInputMode === "manual" ? repoUrl : ""}
                          onChange={handleRepoInputChange}
                        />
                      </div>
                      {/* Branch selector */}
                      <div className="w-1/3 ml-2">
                        <label className="block text-sm text-orange-700 mb-1">
                          Branch(es)
                        </label>
                        <MultiSelectDropdown
                          options={branches.map((b) => ({
                            value: b.name,
                            label: b.name,
                            meta: {
                              isDefault: b.isDefault,
                              protected: b.protected,
                            },
                          }))}
                          value={
                            Array.isArray(branch)
                              ? branch
                              : branch
                              ? [branch]
                              : []
                          }
                          onChange={(values) => setBranch(values)}
                          placeholder="Select branches"
                          loading={loadingBranches}
                        />
                      </div>
                      {/* Scan button */}
                      <ScanButton
                        onClick={handleScan}
                        disabled={!repoUrl || scanLoading}
                        loading={scanLoading}
                      />
                    </div>
                  </div>
                </>
              ) : activeTab === "compare" ? (
                <div className="mt-4">
                  {repoUrl ? (
                    <BranchComparison
                      repository={repoUrl}
                      defaultBranch1={compareBranch1}
                      defaultBranch2={compareBranch2}
                    />
                  ) : (
                    <div className="text-center py-12 bg-orange-50 rounded-lg border border-orange-200">
                      <p className="text-orange-400">
                        Select a repository from the dropdown or enter a
                        repository URL to compare branches
                      </p>
                    </div>
                  )}
                </div>
              ) : activeTab === "history" ? (
                renderHistoryTab()
              ) : (
                <div className="mt-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-orange-700">
                      <History size={18} className="inline mr-2" />
                      Previously Scanned Repositories
                    </h3>
                    <div className="flex items-center space-x-4">
                      <select
                        className="p-1 text-sm rounded-md border border-orange-200 bg-orange-50 hover:bg-orange-100 text-orange-700 transition-colors"
                        value={timeframe}
                        onChange={(e) =>
                          setTimeframe(
                            e.target.value as "daily" | "weekly" | "monthly"
                          )
                        }
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                      <button
                        onClick={() => {
                          setLoadingRepos(true);
                          getUserScannedRepositories()
                            .then((res) => {
                              const repos = (res.data.repositories || [])
                                .slice()
                                .sort((a: any, b: any) => {
                                  const dateA = new Date(
                                    a.last_scanned
                                  ).getTime();
                                  const dateB = new Date(
                                    b.last_scanned
                                  ).getTime();
                                  return dateB - dateA;
                                });
                              setScannedRepos(repos);
                            })
                            .catch(() => setScannedRepos([]))
                            .finally(() => setLoadingRepos(false));
                        }}
                        className="p-2 text-orange-500 hover:text-orange-600 rounded-md"
                        title="Refresh scan history"
                      >
                        <RefreshCw
                          size={16}
                          className={loadingRepos ? "animate-spin" : ""}
                        />
                      </button>
                    </div>
                  </div>
                  <div className="bg-white rounded-lg shadow border border-orange-100 divide-y divide-orange-100">
                    {loadingRepos ? (
                      <div className="p-4 text-center">
                        <Loader2 className="w-6 h-6 text-orange-500 animate-spin mx-auto" />
                        <p className="mt-2 text-sm text-orange-600">
                          Loading scan history...
                        </p>
                      </div>
                    ) : scannedRepos.length === 0 ? (
                      <div className="p-8 text-center">
                        <History className="w-8 h-8 text-orange-400 mx-auto mb-2" />
                        <p className="text-orange-600 font-medium">
                          No scan history available
                        </p>
                        <p className="text-orange-400 text-sm mt-1">
                          Run a coverage scan to see history
                        </p>
                      </div>
                    ) : (
                      <>
                        <table className="min-w-full divide-y divide-orange-100">
                          <thead>
                            <tr className="bg-orange-50">
                              <th className="px-6 py-3 text-left text-xs font-medium text-orange-700 uppercase tracking-wider">
                                Repository
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-orange-700 uppercase tracking-wider">
                                Last Scanned
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-orange-700 uppercase tracking-wider">
                                Total Scans
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-orange-700 uppercase tracking-wider">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-orange-100">
                            {scannedRepos.map((repo, i) => (
                              <tr
                                key={repo.repository + i}
                                className="hover:bg-orange-50"
                              >
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-orange-900">
                                  {repo.repository}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-orange-600">
                                  {repo.last_scanned
                                    ? new Date(
                                        repo.last_scanned
                                      ).toLocaleString()
                                    : "-"}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-orange-600">
                                  {repo.total_scans ?? "-"}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-orange-500">
                                  <button
                                    className="hover:text-orange-600 font-medium"
                                    onClick={() =>
                                      handleViewHistory(repo.repository)
                                    }
                                    disabled={
                                      historyLoading &&
                                      historyRepo === repo.repository
                                    }
                                  >
                                    {historyLoading &&
                                    historyRepo === repo.repository ? (
                                      <Loader2
                                        size={14}
                                        className="inline animate-spin mr-1"
                                      />
                                    ) : null}
                                    View History
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}
                  </div>

                  {/* Display history data and visualization when available */}
                  {historyRepo &&
                    coverageHistory.length > 0 &&
                    !historyLoading &&
                    !historyError && (
                      <div className="mt-8 border-t border-orange-200 pt-4">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-lg font-semibold text-orange-700">
                            <History size={18} className="inline mr-2" />
                            Coverage History for {historyRepo}
                          </h3>
                          <button
                            onClick={() => {
                              setHistoryRepo(null);
                              setCoverageHistory([]);
                              setCoverageTrends([]);
                              setSelectedHistoryItem(null);
                            }}
                            className="text-orange-500 hover:text-orange-700"
                            title="Close history"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="24"
                              height="24"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="lucide lucide-x"
                            >
                              <path d="M18 6 6 18" />
                              <path d="m6 6 12 12" />
                            </svg>
                          </button>
                        </div>

                        <CoverageHistoryChart data={coverageTrends} />

                        <div className="mt-6">
                          <CoverageHistoryList
                            coverageHistory={coverageHistory}
                            onSelectHistory={handleViewHistoryDetails}
                            onViewDetails={handleViewHistoryDetails}
                          />
                        </div>
                      </div>
                    )}

                  {/* Display selected history details */}
                  {selectedHistoryItem && (
                    <div className="mt-8 border-t border-orange-200 pt-4">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-semibold text-orange-700">
                          <BarChart2 size={18} className="inline mr-2" />
                          Coverage Details
                        </h3>
                        <button
                          onClick={() => setSelectedHistoryItem(null)}
                          className="text-orange-500 hover:text-orange-700"
                          title="Close details"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="lucide lucide-x"
                          >
                            <path d="M18 6 6 18" />
                            <path d="m6 6 12 12" />
                          </svg>
                        </button>
                      </div>

                      <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-orange-50 p-4 rounded-md border border-orange-100">
                          <span className="block text-sm text-orange-400">
                            Total Coverage
                          </span>
                          <span className="text-2xl font-bold text-orange-600">
                            {selectedHistoryItem.total_coverage?.toFixed(2)}%
                          </span>
                        </div>
                        <div className="bg-orange-50 p-4 rounded-md border border-orange-100">
                          <span className="block text-sm text-orange-400">
                            Files Scanned
                          </span>
                          <span className="text-2xl font-bold text-orange-600">
                            {selectedHistoryItem.files?.length ?? 0}
                          </span>
                        </div>
                      </div>

                      {selectedHistoryItem.files &&
                        selectedHistoryItem.files.length > 0 && (
                          <FileHeatmap files={selectedHistoryItem.files} />
                        )}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : mainTab === "activity" ? (
            <ActiveJobsList
              onRefresh={() => {
                checkActiveJobs();
                if (
                  jobId &&
                  (jobStatus === "completed" || jobStatus === "failed")
                ) {
                  setJobId(null);
                  setJobStatus(null);
                }
              }}
              onViewDetails={(history) => {
                setCoverageResult({
                  total_coverage: history.total_coverage,
                  files: history.files,
                });
                setMainTab("coverage");
                setActiveTab("scanner");
              }}
            />
          ) : (
            <div className="mt-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-orange-700">
                  Previously Scanned Repositories
                </h3>
                <div className="flex items-center space-x-4">
                  <select
                    className="p-1 text-sm rounded-md border border-orange-200 bg-orange-50 hover:bg-orange-100 text-orange-700 transition-colors"
                    value={timeframe}
                    onChange={(e) =>
                      setTimeframe(
                        e.target.value as "daily" | "weekly" | "monthly"
                      )
                    }
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                  <button
                    onClick={() => {
                      setLoadingRepos(true);
                      getUserScannedRepositories()
                        .then((res) => {
                          const repos = (res.data.repositories || [])
                            .slice()
                            .sort((a: any, b: any) => {
                              const dateA = new Date(a.last_scanned).getTime();
                              const dateB = new Date(b.last_scanned).getTime();
                              return dateB - dateA;
                            });
                          setScannedRepos(repos);
                        })
                        .catch(() => setScannedRepos([]))
                        .finally(() => setLoadingRepos(false));
                    }}
                    className="p-2 text-orange-500 hover:text-orange-600 rounded-md"
                    title="Refresh scan history"
                  >
                    <RefreshCw
                      size={16}
                      className={loadingRepos ? "animate-spin" : ""}
                    />
                  </button>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow border border-orange-100 divide-y divide-orange-100">
                {loadingRepos ? (
                  <div className="p-4 text-center">
                    <Loader2 className="w-6 h-6 text-orange-500 animate-spin mx-auto" />
                    <p className="mt-2 text-sm text-orange-600">
                      Loading scan history...
                    </p>
                  </div>
                ) : scannedRepos.length === 0 ? (
                  <div className="p-8 text-center">
                    <History className="w-8 h-8 text-orange-400 mx-auto mb-2" />
                    <p className="text-orange-600 font-medium">
                      No scan history available
                    </p>
                    <p className="text-orange-400 text-sm mt-1">
                      Run a coverage scan to see history
                    </p>
                  </div>
                ) : (
                  <>
                    <table className="min-w-full divide-y divide-orange-100">
                      <thead>
                        <tr className="bg-orange-50">
                          <th className="px-6 py-3 text-left text-xs font-medium text-orange-700 uppercase tracking-wider">
                            Repository
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-orange-700 uppercase tracking-wider">
                            Last Scanned
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-orange-700 uppercase tracking-wider">
                            Total Scans
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-orange-700 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-orange-100">
                        {scannedRepos.map((repo, i) => (
                          <tr
                            key={repo.repository + i}
                            className="hover:bg-orange-50"
                          >
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-orange-900">
                              {repo.repository}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-orange-600">
                              {repo.last_scanned
                                ? new Date(repo.last_scanned).toLocaleString()
                                : "-"}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-orange-600">
                              {repo.total_scans ?? "-"}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-orange-500">
                              <button
                                className="hover:text-orange-600 font-medium"
                                onClick={() =>
                                  handleViewHistory(repo.repository)
                                }
                                disabled={
                                  historyLoading &&
                                  historyRepo === repo.repository
                                }
                              >
                                {historyLoading &&
                                historyRepo === repo.repository ? (
                                  <Loader2
                                    size={14}
                                    className="inline animate-spin mr-1"
                                  />
                                ) : null}
                                View History
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>

              {/* Display history data and visualization when available */}
              {historyRepo &&
                coverageHistory.length > 0 &&
                !historyLoading &&
                !historyError && (
                  <div className="mt-8 border-t border-orange-200 pt-4">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold text-orange-700">
                        <History size={18} className="inline mr-2" />
                        Coverage History for {historyRepo}
                      </h3>
                      <button
                        onClick={() => {
                          setHistoryRepo(null);
                          setCoverageHistory([]);
                          setCoverageTrends([]);
                          setSelectedHistoryItem(null);
                        }}
                        className="text-orange-500 hover:text-orange-700"
                        title="Close history"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="lucide lucide-x"
                        >
                          <path d="M18 6 6 18" />
                          <path d="m6 6 12 12" />
                        </svg>
                      </button>
                    </div>

                    <CoverageHistoryChart data={coverageTrends} />

                    <div className="mt-6">
                      <CoverageHistoryList
                        coverageHistory={coverageHistory}
                        onSelectHistory={handleViewHistoryDetails}
                        onViewDetails={handleViewHistoryDetails}
                      />
                    </div>
                  </div>
                )}

              {/* Display selected history details */}
              {selectedHistoryItem && (
                <div className="mt-8 border-t border-orange-200 pt-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-orange-700">
                      <BarChart2 size={18} className="inline mr-2" />
                      Coverage Details
                    </h3>
                    <button
                      onClick={() => setSelectedHistoryItem(null)}
                      className="text-orange-500 hover:text-orange-700"
                      title="Close details"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="lucide lucide-x"
                      >
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-orange-50 p-4 rounded-md border border-orange-100">
                      <span className="block text-sm text-orange-400">
                        Total Coverage
                      </span>
                      <span className="text-2xl font-bold text-orange-600">
                        {selectedHistoryItem.total_coverage?.toFixed(2)}%
                      </span>
                    </div>
                    <div className="bg-orange-50 p-4 rounded-md border border-orange-100">
                      <span className="block text-sm text-orange-400">
                        Files Scanned
                      </span>
                      <span className="text-2xl font-bold text-orange-600">
                        {selectedHistoryItem.files?.length ?? 0}
                      </span>
                    </div>
                  </div>

                  {selectedHistoryItem.files &&
                    selectedHistoryItem.files.length > 0 && (
                      <FileHeatmap files={selectedHistoryItem.files} />
                    )}
                </div>
              )}
            </div>
          )}
        </div>

        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md relative">
              <button
                className="absolute top-2 right-2 text-orange-400 hover:text-orange-600"
                onClick={() => setShowModal(false)}
              >
                ×
              </button>
              <h3 className="text-lg font-bold mb-4 text-orange-600 flex items-center gap-2">
                <BarChart2 size={20} /> New Coverage Scan
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-orange-700 mb-1">
                    Repository URL
                  </label>
                  <input
                    type="text"
                    className="w-full p-2 bg-orange-50 text-orange-900 rounded-md border border-orange-200"
                    placeholder="https://github.com/owner/repo"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                  />
                </div>
                <div className="mt-3">
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="text-sm text-orange-400 hover:text-orange-600 flex items-center"
                  >
                    <span className="mr-1">
                      {showAdvanced ? "Hide" : "Show"} advanced settings
                    </span>
                    <svg
                      className={`w-4 h-4 transition-transform ${
                        showAdvanced ? "rotate-180" : ""
                      }`}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>

                  {showAdvanced && (
                    <div className="mt-3 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                      <h4 className="text-sm font-medium text-orange-700 mb-3">
                        Scan Settings
                      </h4>
                      <div className="space-y-3">
                        <div className="flex items-center">
                          <div className="relative flex items-center">
                            <input
                              type="checkbox"
                              checked={scanSettings.useAsync}
                              onChange={() =>
                                setScanSettings({
                                  ...scanSettings,
                                  useAsync: !scanSettings.useAsync,
                                })
                              }
                              className="sr-only"
                              id="async-toggle"
                            />
                            <div
                              className={`w-10 h-5 rounded-full transition-colors ${
                                scanSettings.useAsync
                                  ? "bg-[#FF7D2D]"
                                  : "bg-gray-600"
                              }`}
                            >
                              <div
                                className={`transform transition-transform duration-200 h-4 w-4 bg-white rounded-full shadow-md mt-0.5 ${
                                  scanSettings.useAsync
                                    ? "translate-x-5 ml-0.5"
                                    : "translate-x-0.5"
                                }`}
                              />
                            </div>
                          </div>
                          <label
                            htmlFor="async-toggle"
                            className="ml-3 text-sm text-gray-600"
                          >
                            Use asynchronous scan (recommended for large
                            repositories)
                          </label>
                        </div>

                        <div>
                          <label className="block text-xs text-orange-400 mb-1">
                            Clone timeout (seconds)
                          </label>
                          <input
                            type="number"
                            min={60}
                            max={1200}
                            value={scanSettings.cloneTimeout}
                            onChange={(e) =>
                              setScanSettings({
                                ...scanSettings,
                                cloneTimeout:
                                  parseInt(e.target.value) || 300,
                              })
                            }
                            className="w-full max-w-xs p-2 bg-orange-50 text-orange-900 rounded-md border border-orange-200"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleScan}
                  disabled={!repoUrl || scanLoading}
                  className="w-full px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-md hover:from-red-500 hover:to-orange-500 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  {scanLoading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <BarChart2 size={16} />
                  )}
                  <span>Run Coverage Scan</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageSkeleton>
  );
};

export default AdhocCoveragePage;
