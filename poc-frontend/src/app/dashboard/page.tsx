'use client';
import React, { useState, useEffect } from "react";
import PageSkeleton from "@/components/PageSkeleton";
import withAuth from "@/components/withAuth";
import { getUserProfile, getGitHubContributions, getCoverageTrends, getCoverageMetrics } from "@/services/api";
import { AlertCircle, Loader2, ChevronDown, Calendar, Info, Clipboard, BarChart2, LineChart, Code2, PieChart } from 'lucide-react';
import ActivityGraph from "@/components/ActivityGraph";
import { CoverageHistoryChart } from "@/components/CoverageVisualizations";


const DashboardPage = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [contributionsLoading, setContributionsLoading] = useState<boolean>(false);
  const [coverageLoading, setCoverageLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState({
    repositories: 0,
    totalScans: 0,
    passRate: 0,
    recentScans: 0
  });
  const [activityData, setActivityData] = useState<any>({
    dailyActivities: [],
    totalCount: 0,
    maxCount: 0,
    repoBreakdown: [],
    recentActivity: []
  });
  const [githubContributions, setGithubContributions] = useState<any>({
    total: { lastYear: 0 },
    contributions: []
  });
  const [coverageTrends, setCoverageTrends] = useState<any>([]);
  const [selectedYear, setSelectedYear] = useState<string>('last');
  const [yearDropdownOpen, setYearDropdownOpen] = useState<boolean>(false);
  const [selectedRepo, setSelectedRepo] = useState<string>('');
  
  // Generate year options: last 5 years plus "last year" option
  const currentYear = new Date().getFullYear();
  const yearOptions = [
    { value: 'last', label: 'Last Year' },
    { value: currentYear.toString(), label: currentYear.toString() },
    { value: (currentYear - 1).toString(), label: (currentYear - 1).toString() },
    { value: (currentYear - 2).toString(), label: (currentYear - 2).toString() },
    { value: (currentYear - 3).toString(), label: (currentYear - 3).toString() },
  ];
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [userResponse, metricsResponse] = await Promise.all([
          getUserProfile(),
          getCoverageMetrics()
        ]);
        
        setUser(userResponse.data.user || {});
        if (userResponse.data.user?.username) {
          sessionStorage.setItem('github_username', userResponse.data.user.username);
        }

        setMetrics({
          repositories: metricsResponse.data.repositories,
          totalScans: metricsResponse.data.total_scans,
          passRate: metricsResponse.data.pass_rate,
          recentScans: metricsResponse.data.recent_scans
        });

        await fetchGithubContributions(userResponse.data.user?.username, selectedYear);
        setError(null);
      } catch (err: any) {
        console.error('Error fetching dashboard data:', err);
        setError(err.response?.data?.error || 'Failed to fetch dashboard data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);
  
  const fetchGithubContributions = async (username: string | undefined, year: string) => {
    try {
      setContributionsLoading(true);
      if (!username) {
        username = sessionStorage.getItem('github_username') || '';
        console.log('Using username from sessionStorage:', username);
      }
      if (!username) {
        setGithubContributions({ total: { lastYear: 0 }, contributions: [] });
        return;
      }
      const contributionsResponse = await getGitHubContributions(username, year);
      if (contributionsResponse.data) {
        setGithubContributions({
          total: contributionsResponse.data.total || { lastYear: 0 },
          contributions: contributionsResponse.data.contributions || []
        });
      }
    } catch (contributionsErr) {
      console.error('Error fetching GitHub contributions:', contributionsErr);
    } finally {
      setContributionsLoading(false);
    }
  };
  
  useEffect(() => {
    const fetchCoverageData = async () => {
      if (user?.repositories?.length > 0 && selectedRepo) {
        try {
          setCoverageLoading(true);
          const coverageResponse = await getCoverageTrends(selectedRepo, 30);
          setCoverageTrends(coverageResponse.data);
        } catch (err) {
          console.error("Failed to fetch coverage data:", err);
        } finally {
          setCoverageLoading(false);
        }
      }
    };

    fetchCoverageData();
  }, [user, selectedRepo]);

  useEffect(() => {
    if (user?.repositories?.length > 0 && !selectedRepo) {
      setSelectedRepo(user.repositories[0].html_url);
    }
  }, [user, selectedRepo]);
  
  const handleYearChange = (year: string) => {
    setSelectedYear(year);
    const username = sessionStorage.getItem('github_username') || user?.username;
    fetchGithubContributions(username, year);
    setYearDropdownOpen(false);
  };

  const displayActivities = githubContributions.contributions && 
    githubContributions.contributions.length > 0 ? 
    githubContributions.contributions : activityData.dailyActivities || [];

  return (
    <PageSkeleton title="Dashboard" subtitle="Overview of your GitHub API metrics">
      <div className="w-full">
        {error && (
          <div className="bg-red-100 border border-red-400 p-4 rounded-md flex items-start space-x-3 mb-6">
            <div className="flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-red-500" />
            </div>
            <span className="text-red-700">{error}</span>
          </div>
        )}

        {loading ? (
          <div className="w-full">
            {/* Welcome message skeleton */}
            <div className="bg-gradient-to-r from-orange-100 to-orange-50 rounded-lg p-6 mb-8 border-l-4 border-orange-400">
              <div className="h-6 w-1/3 bg-orange-200 rounded mb-2 animate-pulse"></div>
              <div className="h-4 w-1/2 bg-orange-100 rounded animate-pulse"></div>
            </div>
            {/* Metrics cards skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {[...Array(4)].map((_, idx) => (
                <div key={idx} className="bg-gradient-to-br from-orange-100 to-orange-50 rounded-lg shadow p-6 border border-orange-200 animate-pulse">
                  <div className="flex justify-between items-center mb-4">
                    <div className="h-5 w-1/3 bg-orange-200 rounded"></div>
                    <div className="h-6 w-6 bg-orange-100 rounded-full"></div>
                  </div>
                  <div className="h-10 w-1/2 bg-orange-200 rounded mb-2"></div>
                  <div className="h-4 w-1/3 bg-orange-100 rounded"></div>
                </div>
              ))}
              {/* Coverage Card skeleton */}
              <div className="bg-gradient-to-br from-orange-50 via-orange-100 to-white rounded-lg border border-orange-100 p-4 animate-pulse">
                <div className="flex justify-between items-start mb-1">
                  <div className="h-4 w-1/4 bg-orange-100 rounded"></div>
                  <div className="h-5 w-5 bg-orange-200 rounded-full"></div>
                </div>
                <div className="h-8 w-1/2 bg-orange-200 rounded my-2"></div>
                <div className="h-3 w-1/3 bg-orange-100 rounded mb-2"></div>
                <div className="h-8 w-full bg-orange-50 rounded"></div>
              </div>
            </div>
            {/* Activity Graph skeleton */}
            <div className="mb-8">
              <div className="bg-gradient-to-br from-orange-50 via-orange-100 to-white rounded-lg shadow p-6 border border-orange-100 w-full animate-pulse">
                <div className="flex justify-between items-center mb-4">
                  <div className="h-6 w-1/4 bg-orange-200 rounded"></div>
                  <div className="h-8 w-24 bg-orange-100 rounded"></div>
                </div>
                <div className="h-64 w-full bg-orange-50 rounded"></div>
              </div>
            </div>
            {/* Coverage History skeleton */}
            <div className="lg:col-span-3">
              <div className="bg-gradient-to-br from-orange-50 via-orange-100 to-white rounded-lg border border-orange-100 p-4 animate-pulse">
                <div className="flex justify-between items-center mb-4">
                  <div className="h-6 w-1/4 bg-orange-200 rounded"></div>
                  <div className="h-5 w-20 bg-orange-100 rounded"></div>
                </div>
                <div className="h-64 w-full bg-orange-50 rounded"></div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="bg-gradient-to-r from-orange-100 to-orange-50 rounded-lg p-6 mb-8 border-l-4 border-orange-400">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Welcome, {user?.name || 'Developer'}!
              </h2>
              <p className="text-gray-700">
                Your personalized dashboard for repository insights and code coverage trends.
              </p>
            </div>
            
            {/* Metrics cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-gradient-to-br from-orange-100 to-orange-50 rounded-lg shadow p-6 border border-orange-200">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-orange-700">Repositories</h2>
                  <Info className="h-6 w-6 text-orange-500" />
                </div>
                <p className="text-3xl font-bold text-orange-500">{metrics.repositories}</p>
                <p className="text-sm text-orange-400 mt-2">Connected repos</p>
              </div>
              
              <div className="bg-gradient-to-br from-orange-50 via-orange-100 to-orange-50 rounded-lg shadow p-6 border border-orange-100">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-orange-700">Total Scans</h2>
                  <Clipboard className="h-6 w-6 text-orange-500" />
                </div>
                <p className="text-3xl font-bold text-orange-500">{metrics.totalScans}</p>
                <p className="text-sm text-orange-400 mt-2">Coverage scans</p>
              </div>
              
              <div className="bg-gradient-to-br from-orange-50 via-orange-200 to-orange-50 rounded-lg shadow p-6 border border-orange-100">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-orange-700">Pass Rate</h2>
                  <BarChart2 className="h-6 w-6 text-orange-500" />
                </div>
                <p className="text-3xl font-bold text-orange-500">{metrics.passRate.toFixed(1)}%</p>
                <p className="text-sm text-orange-400 mt-2">Average coverage</p>
              </div>
              
              <div className="bg-gradient-to-br from-[#ffedd5] via-[#fdba74] to-[#f97316] rounded-lg shadow p-6 border border-orange-300">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-orange-700">Recent Scans</h2>
                  <LineChart className="h-6 w-6 text-orange-500" />
                </div>
                <p className="text-3xl font-bold text-orange-500">{metrics.recentScans}</p>
                <p className="text-sm text-orange-400 mt-2">Last 7 days</p>
              </div>

              {/* Coverage Card */}
              <div className="bg-gradient-to-br from-orange-50 via-orange-100 to-white rounded-lg border border-orange-100 p-4 hover:border-orange-400 transition-colors duration-300">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="text-orange-700 text-sm">Average Coverage</h3>
                  <PieChart className="h-5 w-5 text-orange-500" />
                </div>
                {coverageLoading ? (
                  <div className="flex items-center justify-center h-12">
                    <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
                  </div>
                ) : coverageTrends && coverageTrends.length > 0 ? (
                  <>
                    <div className="text-2xl font-bold text-orange-700">
                      {(coverageTrends.reduce((sum: number, item: any) => sum + item.coverage, 0) / coverageTrends.length).toFixed(1)}%
                    </div>
                    <p className="text-xs text-orange-400">Last 30 days</p>
                    <div className="mt-2 w-full">
                      <select 
                        className="w-full p-1 text-sm bg-orange-50 text-orange-700 rounded border border-orange-200"
                        value={selectedRepo}
                        onChange={(e) => setSelectedRepo(e.target.value)}
                      >
                        {user?.repositories?.map((repo: any) => (
                          <option key={repo.id} value={repo.html_url}>{repo.name}</option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : (
                  <div className="text-orange-400 text-sm">No coverage data available</div>
                )}
              </div>
            </div>
            
            {/* Activity Graph with Year Toggle */}
            <div className="mb-8">
              <div className="bg-gradient-to-br from-orange-50 via-orange-100 to-white rounded-lg shadow p-6 border border-orange-100 w-full hover:border-orange-400 transition-colors duration-300">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-orange-700 flex items-center">
                    <Calendar className="h-5 w-5 mr-2 text-orange-500" />
                    GitHub Contributions
                  </h3>
                  {/* Year Selector Dropdown */}
                  <div className="relative">
                    <button 
                      onClick={() => setYearDropdownOpen(!yearDropdownOpen)}
                      className="flex items-center px-3 py-1 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-md text-sm transition-all duration-300 hover:from-red-500 hover:to-orange-500"
                    >
                      {yearOptions.find(y => y.value === selectedYear)?.label || 'Select Year'}
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </button>
                    {yearDropdownOpen && (
                      <div className="absolute right-0 mt-1 w-32 bg-white rounded-md shadow-lg z-10 border border-orange-200">
                        {yearOptions.map((year) => (
                          <button
                            key={year.value}
                            onClick={() => handleYearChange(year.value)}
                            className={`block w-full text-left px-4 py-2 text-sm ${
                              selectedYear === year.value 
                                ? 'bg-orange-100 text-orange-600 font-semibold' 
                                : 'text-orange-700 hover:bg-orange-50'
                            } transition-colors`}
                          >
                            {year.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {/* Loading state for contributions */}
                {contributionsLoading ? (
                  <div className="flex justify-center items-center h-64">
                    <Loader2 className="h-6 w-6 text-orange-500 animate-spin" />
                    <span className="ml-3 text-sm text-orange-400">Loading contributions...</span>
                  </div>
                ) : (
                  <>
                    <div className="text-xs text-orange-400 mb-3">
                      {githubContributions.total?.lastYear || 0} contributions in the selected period
                    </div>
                    <div className="bg-orange-50 rounded-lg border border-orange-100 p-4">
                      <ActivityGraph 
                        activities={displayActivities} 
                        totalCount={githubContributions.total?.lastYear || activityData.totalCount || 0} 
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Coverage History */}
            <div className="lg:col-span-3">
              <div className="bg-gradient-to-br from-orange-50 via-orange-100 to-white rounded-lg border border-orange-100 p-4 hover:border-orange-400 transition-colors duration-300">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-orange-700">
                    <PieChart className="inline mr-2 h-5 w-5 text-orange-500" />
                    Coverage History
                  </h3>
                  <div>
                    {selectedRepo && (
                      <a 
                        href={`/repositories?repo=${encodeURIComponent(selectedRepo)}`} 
                        className="text-sm text-orange-600 hover:underline"
                      >
                        View Details →
                      </a>
                    )}
                  </div>
                </div>
                
                {coverageLoading ? (
                  <div className="flex justify-center items-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
                  </div>
                ) : coverageTrends && coverageTrends.length > 0 ? (
                  <div className="h-64">
                    <CoverageHistoryChart data={coverageTrends} height={250} />
                  </div>
                ) : (
                  <div className="flex justify-center items-center h-64 text-gray-400">
                    No coverage history available
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      
      
    </PageSkeleton>
  );
};

export default withAuth(DashboardPage);
