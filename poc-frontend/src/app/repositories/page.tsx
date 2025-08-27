"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Repository } from "@/types/repository";
import PageSkeleton from "@/components/PageSkeleton";
import withAuth from "@/components/withAuth";
import { getUserRepositories, refreshRepositories, runCoverageScan } from "@/services/api";
import {
  AlertCircle,
  Folder,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  LayoutList,
  ChevronDown,
  RefreshCw,
  BarChart2,
  Loader2,
  Proportions,
  Repeat2,
  ScanLine
} from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import ScanButton from "@/components/ui/UniversalButton";
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbPage } from "@/components/ui/breadcrumb";

const getLanguageColor = (language: string): string => {
  const colors: Record<string, string> = {
    JavaScript: "#f1e05a",
    TypeScript: "#2b7489",
    Python: "#3572A5",
    Java: "#b07219",
    HTML: "#e34c26",
    CSS: "#563d7c",
    PHP: "#4F5D95",
    Ruby: "#701516",
    Go: "#00ADD8",
    C: "#555555",
    "C++": "#f34b7d",
    "C#": "#178600",
    Swift: "#ffac45",
    Kotlin: "#F18E33",
    Rust: "#dea584",
    Dart: "#00B4AB",
    Shell: "#89e051",
    Scala: "#c22d40",
    Solidity: "#AA6746",
    Move: "#4bc1d2",
    default: "#8f8f8f",
  };
  return colors[language] || colors.default;
};

interface LanguageBarProps {
  languages?: Record<string, number>;
}

const LanguageBar: React.FC<LanguageBarProps> = ({ languages }) => {
  if (!languages || Object.keys(languages).length === 0) return null;

  const sortedLanguages = Object.entries(languages)
    .sort(([, percentA], [, percentB]) => Number(percentB) - Number(percentA))
    .slice(0, 4);

  return (
    <div className="mt-3">
      <div className="text-xs text-orange-400 mb-1">Languages</div>
      <div className="w-full h-2 bg-orange-100 rounded-full overflow-hidden flex">
        {sortedLanguages.map(([lang, percent]) => (
          <div
            key={lang}
            className="h-full"
            style={{
              width: `${percent}%`,
              backgroundColor: getLanguageColor(lang),
              minWidth: "3px",
            }}
            title={`${lang}: ${percent.toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="flex flex-wrap mt-2 gap-x-2">
        {sortedLanguages.map(([lang, percent]) => (
          <div key={lang} className="flex items-center text-xs mb-1">
            <div
              className="w-2 h-2 rounded-full mr-1"
              style={{ backgroundColor: getLanguageColor(lang) }}
            />
            <span className="text-orange-400">
              {lang} <span className="opacity-75">{percent.toFixed(1)}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const RepositoriesPage = () => {
  const router = useRouter();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const hasFetchedRef = useRef(false);

  const [pagination, setPagination] = useState({
    skip: 0,
    limit: 10,
    totalCount: 0,
    currentPage: 1,
    pageSize: 9,
  });

  const prevSearchRef = useRef<string>("");
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isLoadingRef = useRef<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [dataSource, setDataSource] = useState<"database" | "github">(
    "database"
  );
  const searchParams = useSearchParams();
  const [isScanning, setIsScanning] = useState<Record<string, boolean>>({});

  const fetchRepositories = async (
    skip = 0,
    limit = pagination.pageSize,
    append = false,
    search = ""
  ) => {
    if (isLoadingRef.current) {
      return;
    }

    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      isLoadingRef.current = true;

      const response = await getUserRepositories(skip, limit, search);
      const { repositories: fetchedRepos, totalCount, source } = response.data;

      if (append) {
        setRepositories((prev) => [...prev, ...fetchedRepos]);
      } else {
        setRepositories(fetchedRepos);
      }

      setPagination((prev) => ({
        ...prev,
        skip,
        limit,
        totalCount,
        currentPage: Math.floor(skip / limit) + 1,
      }));

      setDataSource(source || "database");
      setError(null);
    } catch (err: any) {
      console.error("Error fetching repositories:", err);
      setError(
        err.response?.data?.error ||
          "Failed to fetch repositories. Please ensure your GitHub connection is working."
      );
    } finally {
      setLoading(false);
      setLoadingMore(false);
      isLoadingRef.current = false;
    }
  };

  const handleCompleteRefresh = async () => {
    if (isRefreshing) return;

    try {
      setIsRefreshing(true);
      setError(null);
      console.log("Starting complete repository refresh...");

      const response = await refreshRepositories(0, 100, prevSearchRef.current);
      console.log("Repository refresh response:", response.data);

      const { repositories: fetchedRepos, totalCount, source } = response.data;
      console.log(
        `Received ${
          fetchedRepos?.length || 0
        } repositories from ${source}, total count: ${totalCount}`
      );

      if (fetchedRepos && fetchedRepos.length > 0) {
        setRepositories(fetchedRepos);
        setPagination((prev) => ({
          ...prev,
          skip: 0,
          totalCount: totalCount || fetchedRepos.length,
          currentPage: 1,
        }));

        setDataSource(source || "github");
      } else {
        console.log(
          "No repositories returned from refresh, will retry normal fetch"
        );
        await fetchRepositories(0, pagination.pageSize);
      }
    } catch (err: any) {
      console.error("Error refreshing repositories:", err);
      setError(
        err.response?.data?.error ||
          "Failed to refresh repositories from GitHub. Please try again later."
      );
    } finally {
      setIsRefreshing(false);
      console.log("Repository refresh process completed");
    }
  };

  const handleRefreshRepositories = async () => {
    if (pagination.totalCount > 90) {
      await handleCompleteRefresh();
      return;
    }

    if (isRefreshing) return;

    try {
      setIsRefreshing(true);
      console.log("Starting repository refresh...");

      const response = await refreshRepositories(
        0,
        pagination.pageSize,
        prevSearchRef.current
      );
      console.log("Repository refresh response:", response.data);

      const { repositories: fetchedRepos, totalCount, source } = response.data;
      console.log(
        `Received ${
          fetchedRepos?.length || 0
        } repositories from ${source}, total count: ${totalCount}`
      );

      setRepositories(fetchedRepos || []);
      setPagination((prev) => ({
        ...prev,
        skip: 0,
        totalCount: totalCount || 0,
        currentPage: 1,
      }));

      setDataSource(source || "github");
      setError(null);
    } catch (err: any) {
      console.error("Error refreshing repositories:", err);
      setError(
        err.response?.data?.error ||
          "Failed to refresh repositories from GitHub. GitHub API rate limit might be exceeded."
      );
    } finally {
      setIsRefreshing(false);
      console.log("Repository refresh process completed");
    }
  };

  const handleSearch = useCallback(
    (query: string) => {
      if (query === prevSearchRef.current) {
        return;
      }

      prevSearchRef.current = query;

      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      if (query.trim().length >= 3) {
        setLoading(true);
      }

      searchTimeoutRef.current = setTimeout(() => {
        if (query.trim().length < 3 && repositories.length > 0) {
          const filtered = repositories.filter((repo) =>
            repo.name.toLowerCase().includes(query.toLowerCase())
          );
          setRepositories(filtered);
          setLoading(false);
        } else {
          fetchRepositories(0, pagination.pageSize, false, query);
        }
      }, 500);
    },
    [repositories, pagination.pageSize]
  );

  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchRepositories(0, pagination.pageSize);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const handleLoadMore = async () => {
    const newSkip = pagination.skip + pagination.limit;
    if (newSkip < pagination.totalCount) {
      await fetchRepositories(
        newSkip,
        pagination.pageSize,
        true,
        prevSearchRef.current
      );
    }
  };

  const handlePageChange = async (newPage: number) => {
    const newSkip = (newPage - 1) * pagination.pageSize;
    await fetchRepositories(
      newSkip,
      pagination.pageSize,
      false,
      prevSearchRef.current
    );
  };

  const handleCoverageScan = async (repo: Repository) => {
    if (isScanning[repo.id]) return;

    try {
      setIsScanning(prev => ({ ...prev, [repo.id]: true }));
      const response = await runCoverageScan(repo.html_url, undefined, {
        async: true,
        cloneTimeout: 300
      });
      
      toast.success(`Coverage scan initiated for ${repo.name} (Job ID: ${response.data.job_id})`, {
        onClose: () => {
          router.push('/adhoc-coverage?tab=activity');
        }
      });
      localStorage.setItem(`job_${response.data.job_id}_polling`, "true");
      
    } catch (err: any) {
      toast.error(err.response?.data?.error || `Failed to start coverage scan for ${repo.name}`);
    } finally {
      setIsScanning(prev => ({ ...prev, [repo.id]: false }));
    }
  };

  const totalPages = Math.ceil(pagination.totalCount / pagination.pageSize);

  const PaginationControls = () => {
    const pages = [];
    const maxPagesToShow = 5;

    let startPage = Math.max(
      1,
      pagination.currentPage - Math.floor(maxPagesToShow / 2)
    );
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return (
      <div className="flex justify-center mt-6 items-center space-x-2">
        <button
          onClick={() => handlePageChange(1)}
          disabled={pagination.currentPage === 1}
          className={`px-3 py-1 rounded-md border ${
            pagination.currentPage === 1
              ? "bg-orange-100 text-orange-300 cursor-not-allowed border-orange-100"
              : "bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-200"
          }`}
        >
          First
        </button>

        <button
          onClick={() => handlePageChange(pagination.currentPage - 1)}
          disabled={pagination.currentPage === 1}
          className={`p-1 rounded-md border ${
            pagination.currentPage === 1
              ? "bg-orange-100 text-orange-300 cursor-not-allowed border-orange-100"
              : "bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-200"
          }`}
        >
          <ChevronLeft size={16} />
        </button>

        {pages.map((page) => (
          <button
            key={page}
            onClick={() => handlePageChange(page)}
            className={`px-3 py-1 rounded-md border ${
              pagination.currentPage === page
                ? "bg-gradient-to-r from-orange-500 to-red-500 text-white border-orange-400"
                : "bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-200"
            }`}
          >
            {page}
          </button>
        ))}

        <button
          onClick={() => handlePageChange(pagination.currentPage + 1)}
          disabled={pagination.currentPage === totalPages}
          className={`p-1 rounded-md border ${
            pagination.currentPage === totalPages
              ? "bg-orange-100 text-orange-300 cursor-not-allowed border-orange-100"
              : "bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-200"
          }`}
        >
          <ChevronRight size={16} />
        </button>

        <button
          onClick={() => handlePageChange(totalPages)}
          disabled={pagination.currentPage === totalPages}
          className={`px-3 py-1 rounded-md border ${
            pagination.currentPage === totalPages
              ? "bg-orange-100 text-orange-300 cursor-not-allowed border-orange-100"
              : "bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-200"
          }`}
        >
          Last
        </button>

        <span className="text-sm text-orange-400 ml-2">
          Page {pagination.currentPage} of {totalPages} ({pagination.totalCount}{" "}
          repositories)
        </span>
      </div>
    );
  };

  return (
    <PageSkeleton
      title="Repositories"
      subtitle="Manage your GitHub repositories"
    >
      <ToastContainer
        position="top-center"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={true}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
      />
      <div className="min-h-full">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage className="text-orange-400">Repositories</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="bg-white text-gray-900 p-4 rounded-lg border border-orange-100 shadow hover:border-orange-400 transition-colors mt-4">
          <div className="flex flex-col md:flex-row md:items-center mb-4 gap-4">
            <div className="flex-1 flex items-center gap-2">
              <input
                type="text"
                placeholder="Search repositories..."
                className="w-full p-2 bg-orange-50 text-orange-900 rounded-md border border-orange-200"
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>
            <button
              onClick={handleRefreshRepositories}
              disabled={isRefreshing}
              className={`px-4 py-2 rounded-md border border-orange-200 bg-white text-orange-700 hover:bg-orange-50 flex items-center gap-2 transition-colors ${
                isRefreshing ? "opacity-50 cursor-not-allowed" : ""
              }`}
              title="Refresh repositories from GitHub"
            >
              <RefreshCw
                size={16}
                className={isRefreshing ? "animate-spin" : ""}
              />
              <span>Refresh from GitHub</span>
            </button>
            <div className="bg-orange-50 rounded-md p-1 flex border border-orange-100 gap-2">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-2 rounded-md border ${
                  viewMode === "grid"
                    ? "bg-orange-100 border-orange-300 text-orange-700"
                    : "bg-white border-orange-100 text-orange-500 hover:bg-orange-50"
                }`}
                title="Grid view"
              >
                <LayoutGrid size={18} />
              </button>
              <button
                onClick={() => {
                  setViewMode("list");
                  if (viewMode !== "list") {
                    fetchRepositories(0, pagination.pageSize);
                  }
                }}
                className={`p-2 rounded-md border ${
                  viewMode === "list"
                    ? "bg-orange-100 border-orange-300 text-orange-700"
                    : "bg-white border-orange-100 text-orange-500 hover:bg-orange-50"
                }`}
                title="List view"
              >
                <LayoutList size={18} />
              </button>
            </div>
          </div>

          {loading ? (
            viewMode === "grid" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, index) => (
                  <div
                    key={index}
                    className="bg-orange-100 p-4 rounded-lg shadow-md border border-orange-200 animate-pulse"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="h-6 bg-orange-200 rounded w-3/4"></div>
                      <div className="h-5 bg-orange-200 rounded-full w-16"></div>
                    </div>
                    <div className="space-y-2 mb-4">
                      <div className="h-3 bg-orange-200 rounded w-full"></div>
                      <div className="h-3 bg-orange-200 rounded w-5/6"></div>
                    </div>
                    <div className="flex justify-between items-center mt-6">
                      <div className="h-3 bg-orange-200 rounded w-1/3"></div>
                      <div className="h-7 bg-orange-200 rounded-md w-24"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-orange-100">
                <table className="w-full table-auto">
                  <thead className="bg-orange-50 border-b border-orange-100">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-orange-700">
                        Repository
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-orange-700 hidden md:table-cell">
                        Description
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-orange-700 hidden lg:table-cell">
                        Languages
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-orange-700 hidden md:table-cell">
                        Created
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-orange-700 hidden md:table-cell">
                        Updated
                      </th>
                      <th className="px-4 py-3 text-center text-sm font-medium text-orange-700">
                        Visibility
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-orange-700">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-orange-100">
                    {[...Array(5)].map((_, index) => (
                      <tr key={index} className="bg-orange-100 animate-pulse">
                        <td className="px-4 py-4">
                          <div className="h-5 bg-orange-200 rounded w-3/4"></div>
                        </td>
                        <td className="px-4 py-4 hidden md:table-cell">
                          <div className="h-4 bg-orange-200 rounded w-full"></div>
                        </td>
                        <td className="px-4 py-4 hidden lg:table-cell">
                          <div className="h-2 bg-orange-200 rounded-full w-3/4"></div>
                        </td>
                        <td className="px-4 py-4 hidden md:table-cell">
                          <div className="h-4 bg-orange-200 rounded w-24"></div>
                        </td>
                        <td className="px-4 py-4 hidden md:table-cell">
                          <div className="h-4 bg-orange-200 rounded w-24"></div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="h-5 bg-orange-200 rounded-full w-16 mx-auto"></div>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="h-6 bg-orange-200 rounded-md w-24 ml-auto"></div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : error ? (
            <div className="bg-red-100 border border-red-300 p-4 rounded-md flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <span className="text-red-700">{error}</span>
            </div>
          ) : repositories.length === 0 ? (
            <div className="text-center py-12 bg-orange-100/50 rounded-lg border border-orange-200 p-8">
              <Folder className="mx-auto h-12 w-12 text-orange-400" />
              <h3 className="mt-2 text-xl font-medium text-orange-700">
                No repositories found
              </h3>
              <p className="mt-1 text-orange-500">
                Connect your GitHub account to see your repositories here
              </p>
            </div>
          ) : viewMode === "grid" ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {repositories.map((repo) => (
                  <div
                    key={repo.id}
                    className="bg-white p-4 rounded-lg shadow-md border border-orange-100 hover:border-orange-400 transition-all relative flex flex-col min-h-[280px] group"
                  >
                    <div className="absolute inset-0 bg-orange-950/0 group-hover:bg-orange-950/30 transition-colors rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100">
                      {repo.coverage_status ? (
                        <div className="flex gap-2">
                          <ScanButton
                            onClick={() => handleCoverageScan(repo)}
                            disabled={isScanning[repo.id]}
                            loading={isScanning[repo.id]}
                            text={isScanning[repo.id] ? "Scanning..." : "Scan Again"}
                            icon={<Repeat2 className="svgIcon" />}
                          />
                          <ScanButton
                            href={`/repositories/report?repo=${encodeURIComponent(repo.html_url)}`}
                            text="View Report"
                            icon={<Proportions className="svgIcon" />}
                            variant="secondary"
                          />
                        </div>
                      ) : (
                        <ScanButton
                          onClick={() => handleCoverageScan(repo)}
                          disabled={isScanning[repo.id]}
                          loading={isScanning[repo.id]}
                          text={isScanning[repo.id] ? "Scanning..." : "Scan Coverage"}
                          icon={<ScanLine className="svgIcon" />}
                        />
                      )}
                    </div>

                    <div className="flex-1">
                      <div className="flex justify-between items-start mb-2">
                        <h3
                          className="text-xl font-semibold text-orange-600 truncate max-w-[80%]"
                          title={repo.name}
                        >
                          {repo.name}
                        </h3>
                        <span
                          className={`text-xs font-medium rounded-full px-2 py-1 ${
                            repo.private
                              ? "bg-orange-100 text-orange-400"
                              : "bg-green-100 text-green-700"
                          }`}
                        >
                          {repo.private ? "Private" : "Public"}
                        </span>
                      </div>
                      <p
                        className="text-[#8B5C2A] text-sm mb-2 line-clamp-2 h-10"
                        title={repo.description || "No description provided"}
                      >
                        {repo.description || "No description provided"}
                      </p>
                      <LanguageBar languages={repo.languages} />
                      <div className="flex flex-wrap gap-4 text-xs text-orange-400 mt-3">
                        <span className="flex items-center">
                          <span className="font-medium mr-1">Created:</span>
                          {formatDate(repo.created_at)}
                        </span>
                        <span className="flex items-center">
                          <span className="font-medium mr-1">Updated:</span>
                          {formatDate(repo.updated_at)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-4 flex justify-between items-center gap-2 pt-3 border-t border-orange-100">
                      <div className="flex items-center gap-2">
                        {repo.coverage_status ? (
                          <span
                            className={`text-xs ${
                              (repo.overall_coverage ?? 0) > 0
                                ? "bg-blue-50 hover:bg-blue-100 text-blue-700 hover:text-blue-900 border-blue-100"
                                : "bg-gray-50 hover:bg-gray-100 text-gray-700 hover:text-gray-900 border-gray-200"
                            } py-1 px-3 rounded-md transition-colors border`}
                            title={`Coverage: ${(repo.overall_coverage ?? 0).toFixed(1)}%`}
                          >
                            Coverage: {(repo.overall_coverage ?? 0).toFixed(1)}%
                          </span>
                        ) : (
                          <span
                            className="text-xs bg-orange-50 text-orange-400 py-1 px-3 rounded-md border border-orange-100"
                            title="Coverage not analyzed"
                          >
                            No Coverage Data
                          </span>
                        )}
                        
                      </div>
                      <a
                        href={repo.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs bg-orange-50 hover:bg-orange-100 text-orange-700 hover:text-orange-900 py-1 px-3 rounded-md transition-colors cursor-pointer border border-orange-100"
                      >
                        View on GitHub
                      </a>
                    </div>
                  </div>
                ))}
              </div>

              {repositories.length < pagination.totalCount && (
                <div className="flex justify-center mt-8">
                  <ScanButton
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    loading={loadingMore}
                    text="Show More"
                    icon={<ChevronDown className="svgIcon" />}
                  />
                </div>
              )}
            </>
          ) : (
            <>
              <div className="overflow-hidden rounded-lg border border-orange-100">
                <table className="w-full table-auto">
                  <thead className="bg-orange-50 border-b border-orange-100">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-orange-700">
                        Repository
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-orange-700">
                        Coverage Status
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-orange-700">
                        Coverage %
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-orange-700">
                        Last Updated
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-orange-700">
                        Visibility
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-orange-700">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-orange-100">
                    {repositories.map((repo) => (
                      <tr
                        key={repo.id}
                        className="bg-white hover:bg-orange-50 transition-colors"
                      >
                        <td
                          className="px-3 py-2 text-xs font-medium text-orange-600 max-w-[180px] truncate text-left"
                          title={repo.name}
                        >
                          {repo.name}
                        </td>
                        <td className="px-3 py-2 text-left">
                          <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${
                            repo.coverage_status 
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-700"
                          }`}>
                            {repo.coverage_status ? "Analyzed" : "Not Analyzed"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-left">
                          <span className={`text-xs font-medium ${
                            repo.overall_coverage 
                              ? (repo.overall_coverage > 80 ? "text-green-600" : "text-orange-600")
                              : "text-gray-500"
                          }`}>
                            {repo.overall_coverage ? `${repo.overall_coverage.toFixed(1)}%` : "N/A"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-orange-400 whitespace-nowrap text-left">
                          {formatDate(repo.updated_at)}
                        </td>
                        <td className="px-3 py-2 text-left whitespace-nowrap">
                          <span
                            className={`text-xs font-medium rounded-full px-2 py-0.5 ${
                              repo.private
                                ? "bg-orange-100 text-orange-400"
                                : "bg-green-100 text-green-700"
                            }`}
                          >
                            {repo.private ? "Private" : "Public"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-left whitespace-nowrap">
                          <button
                            onClick={() => handleCoverageScan(repo)}
                            disabled={isScanning[repo.id]}
                            className="inline-block text-xs bg-orange-500 hover:bg-orange-600 text-white py-1 px-3 rounded-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                            title="Run coverage scan"
                          >
                            {isScanning[repo.id] ? (
                              <>
                                <Loader2 size={12} className="animate-spin" />
                                <span>Scanning...</span>
                              </>
                            ) : (
                              <>
                                <span>Scan Coverage</span>
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pagination.totalCount > pagination.pageSize && (
                <PaginationControls />
              )}
            </>
          )}
        </div>
      </div>
    </PageSkeleton>
  );
};

function formatDate(dateString: string | undefined) {
  if (!dateString) return "N/A";

  try {
    const date = new Date(dateString);

    if (isNaN(date.getTime())) {
      console.log("Invalid date:", dateString);
      return "N/A";
    }

    return new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  } catch (e) {
    console.error("Error formatting date:", e);
    return "N/A";
  }
}

export default withAuth(RepositoriesPage);
