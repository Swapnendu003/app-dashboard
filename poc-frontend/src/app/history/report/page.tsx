"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import PageSkeleton from "@/components/PageSkeleton";
import withAuth from "@/components/withAuth";
import {
  getCoverageHistory,
  getCoverageTrends,
} from "@/services/api";
import {
  FileHeatmap,
  CoverageHistoryChart,
  CoverageHistoryList,
} from "@/components/CoverageVisualizations";
import {
  History,
  BarChart2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const HistoryReport = () => {
  const searchParams = useSearchParams();
  const repoUrl = searchParams.get("repo");
  const heatmapRef = useRef<HTMLDivElement>(null);
  
  const [timeframe, setTimeframe] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [coverageHistory, setCoverageHistory] = useState<any[]>([]);
  const [coverageTrends, setCoverageTrends] = useState<any[]>([]);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<any>(null);

  useEffect(() => {
    if (!repoUrl) return;

    const fetchHistory = async () => {
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

    fetchHistory();
  }, [repoUrl, timeframe]);

  const handleViewHistoryDetails = (history: any) => {
    setSelectedHistoryItem(history);
    setTimeout(() => {
      heatmapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  if (!repoUrl) {
    return (
      <PageSkeleton
        title="Coverage Report"
        subtitle="View coverage history and trends"
      >
        <div className="bg-orange-50 border border-orange-200 p-4 rounded-md">
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            <span className="text-orange-700">No repository URL provided</span>
          </div>
        </div>
      </PageSkeleton>
    );
  }

  return (
    <PageSkeleton
      title="Coverage Report"
      subtitle="View coverage history and trends"
    >
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/history" className="text-orange-600 hover:text-orange-700">
              Coverage History
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="text-orange-400">Coverage Report</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="min-h-full bg-white p-6 rounded-lg border border-orange-100 shadow hover:border-orange-400 transition-colors mt-4">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold text-orange-700">
            <History size={18} className="inline mr-2" />
            Coverage History for {decodeURIComponent(repoUrl)}
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
        ) : historyLoading ? (
          <div className="space-y-8">
            <div className="bg-white rounded-lg p-4">
              <div className="h-[300px] bg-gray-100 rounded-lg animate-pulse" />
            </div>
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="bg-white p-4 rounded-lg border border-gray-100">
                  <div className="flex justify-between items-center">
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-gray-100 rounded w-1/4 animate-pulse" />
                      <div className="h-3 bg-gray-100 rounded w-1/2 animate-pulse" />
                    </div>
                    <div className="flex gap-2">
                      <div className="h-8 w-20 bg-gray-100 rounded animate-pulse" />
                      <div className="h-8 w-20 bg-gray-100 rounded animate-pulse" />
                    </div>
                  </div>
                </div>
              ))}
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

            {selectedHistoryItem && (
              <div ref={heatmapRef} className="mt-8 border-t border-orange-200 pt-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-orange-700">
                    <BarChart2 size={18} className="inline mr-2" />
                    Coverage Details
                  </h3>
                  <button 
                    onClick={() => setSelectedHistoryItem(null)}
                    className="text-orange-500 hover:text-orange-700"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
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

                {selectedHistoryItem.files && selectedHistoryItem.files.length > 0 && (
                  <FileHeatmap files={selectedHistoryItem.files} />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </PageSkeleton>
  );
};

export default withAuth(HistoryReport);
