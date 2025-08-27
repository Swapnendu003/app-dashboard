"use client";

import React, { useState, useEffect } from "react";
import { getUserScannedRepositories } from "@/services/api";
import { History, Loader2, RefreshCw } from "lucide-react";
import PageSkeleton from "@/components/PageSkeleton";
import withAuth from "@/components/withAuth";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

const HistoryPage = () => {
  const [scannedRepos, setScannedRepos] = useState<any[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [timeframe, setTimeframe] = useState<"daily" | "weekly" | "monthly">("weekly");

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = () => {
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
  };

  return (
    <PageSkeleton
      title="Coverage History"
      subtitle="View coverage history for all repositories"
    >
      <div className="min-h-full">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage className="text-orange-400">Coverage History</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="bg-white p-6 rounded-lg border border-orange-100 shadow hover:border-orange-400 transition-colors mt-4">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-orange-700">
              <History size={18} className="inline mr-2" />
              Previously Scanned Repositories
            </h3>
            <div className="flex items-center space-x-4">
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
              <button
                onClick={fetchHistory}
                className="p-2 text-orange-500 hover:text-orange-600 rounded-md"
                title="Refresh scan history"
              >
                <RefreshCw size={16} className={loadingRepos ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow border border-orange-100 divide-y divide-orange-100">
            {loadingRepos ? (
              <div className="p-4 text-center">
                <Loader2 className="w-6 h-6 text-orange-500 animate-spin mx-auto" />
                <p className="mt-2 text-sm text-orange-600">Loading scan history...</p>
              </div>
            ) : scannedRepos.length === 0 ? (
              <div className="p-8 text-center">
                <History className="w-8 h-8 text-orange-400 mx-auto mb-2" />
                <p className="text-orange-600 font-medium">No scan history available</p>
                <p className="text-orange-400 text-sm mt-1">Run a coverage scan to see history</p>
              </div>
            ) : (
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
                    <th className="px-6 py-3 text-right text-xs font-medium text-orange-700 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-orange-100">
                  {scannedRepos.map((repo, i) => (
                    <tr key={repo.repository + i} className="hover:bg-orange-50">
                      <td className="px-6 py-4 text-sm text-orange-900">
                        {repo.repository}
                      </td>
                      <td className="px-6 py-4 text-sm text-orange-600">
                        {repo.last_scanned
                          ? new Date(repo.last_scanned).toLocaleString()
                          : "-"}
                      </td>
                      <td className="px-6 py-4 text-sm text-orange-600">
                        {repo.total_scans ?? "-"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <a
                          href={`/history/report?repo=${encodeURIComponent(repo.repository)}`}
                          className="text-orange-500 hover:text-orange-700 font-medium text-sm"
                        >
                          View Report
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </PageSkeleton>
  );
};

export default withAuth(HistoryPage);
