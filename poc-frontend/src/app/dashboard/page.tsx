'use client';
import React, { useState, useEffect } from "react";
import PageSkeleton from "@/components/PageSkeleton";
import withAuth from "@/components/withAuth";
import { getUserProfile, getGitHubContributions, getCoverageTrends } from "@/services/api";
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
    totalTests: 0,
    passRate: 0,
    testsLast7Days: 0
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
        const userResponse = await getUserProfile();
        setUser(userResponse.data.user || {});
        // Store username in sessionStorage for later use
        if (userResponse.data.user?.username) {
          sessionStorage.setItem('github_username', userResponse.data.user.username);
        }
        // Fetch GitHub contributions data for initial year
        await fetchGithubContributions(userResponse.data.user?.username, selectedYear);
        
        setMetrics({
          repositories: 12,
          totalTests: 256,
          passRate: 87,
          testsLast7Days: 45
        });
        
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

  // Get the activities to display
  const displayActivities = githubContributions.contributions && 
    githubContributions.contributions.length > 0 ? 
    githubContributions.contributions : activityData.dailyActivities || [];

  return (
    <PageSkeleton title="Dashboard" subtitle="Overview of your GitHub API metrics">
      <div className="w-full">
        {error && (
          <div className="bg-red-900/20 border border-red-800 p-4 rounded-md flex items-start space-x-3 mb-6">
            <div className="flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-red-500" />
            </div>
            <span className="text-red-500">{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 text-[#FF7D2D] animate-spin" />
            <span className="ml-3 text-sm text-gray-300">Loading dashboard metrics...</span>
          </div>
        ) : (
          <>
            {/* Welcome message */}
            <div className="bg-[#1F2B39]/80 rounded-lg p-6 mb-8 border-l-4 border-[#FF7D2D]">
              <h2 className="text-xl font-semibold text-white mb-2">Welcome back, {user?.name || 'User'}!</h2>
              <p className="text-gray-400">Here's a summary of your GitHub API activity</p>
            </div>
            
            {/* Metrics cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-[#1F2B39] rounded-lg shadow-lg p-6 border border-gray-700 hover:border-[#FF7D2D] transition-colors duration-300">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-gray-300">Repositories</h2>
                  <Info className="h-6 w-6 text-[#FF7D2D]" />
                </div>
                <p className="text-3xl font-bold text-[#FF7D2D]">{metrics.repositories}</p>
                <p className="text-sm text-gray-500 mt-2">Connected repos</p>
              </div>
              
              <div className="bg-[#1F2B39] rounded-lg shadow-lg p-6 border border-gray-700 hover:border-[#FF7D2D] transition-colors duration-300">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-gray-300">Total Tests</h2>
                  <Clipboard className="h-6 w-6 text-[#FF7D2D]" />
                </div>
                <p className="text-3xl font-bold text-[#FF7D2D]">{metrics.totalTests}</p>
                <p className="text-sm text-gray-500 mt-2">API tests run</p>
              </div>
              
              <div className="bg-[#1F2B39] rounded-lg shadow-lg p-6 border border-gray-700 hover:border-[#FF7D2D] transition-colors duration-300">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-gray-300">Pass Rate</h2>
                  <BarChart2 className="h-6 w-6 text-[#FF7D2D]" />
                </div>
                <p className="text-3xl font-bold text-[#FF7D2D]">{metrics.passRate}%</p>
                <p className="text-sm text-gray-500 mt-2">Success rate</p>
              </div>
              
              <div className="bg-[#1F2B39] rounded-lg shadow-lg p-6 border border-gray-700 hover:border-[#FF7D2D] transition-colors duration-300">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-gray-300">Recent Tests</h2>
                  <LineChart className="h-6 w-6 text-[#FF7D2D]" />
                </div>
                <p className="text-3xl font-bold text-[#FF7D2D]">{metrics.testsLast7Days}</p>
                <p className="text-sm text-gray-500 mt-2">Last 7 days</p>
              </div>

              {/* Coverage Card */}
              <div className="bg-[#1F2B39] rounded-lg border border-gray-700 p-4">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="text-gray-400 text-sm">Average Coverage</h3>
                  <PieChart className="h-5 w-5 text-[#FF7D2D]" />
                </div>
                {coverageLoading ? (
                  <div className="flex items-center justify-center h-12">
                    <Loader2 className="h-6 w-6 animate-spin text-[#FF7D2D]" />
                  </div>
                ) : coverageTrends && coverageTrends.length > 0 ? (
                  <>
                    <div className="text-2xl font-bold text-white">
                      {(coverageTrends.reduce((sum: number, item: any) => sum + item.coverage, 0) / coverageTrends.length).toFixed(1)}%
                    </div>
                    <p className="text-xs text-gray-500">Last 30 days</p>
                    <div className="mt-2 w-full">
                      <select 
                        className="w-full p-1 text-sm bg-gray-800 text-gray-300 rounded border border-gray-700"
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
                  <div className="text-gray-500 text-sm">No coverage data available</div>
                )}
              </div>
            </div>
            
            {/* Activity Graph with Year Toggle */}
            <div className="mb-8">
              <div className="bg-[#1F2B39] rounded-lg shadow-lg p-6 border border-gray-700 w-full">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-200 flex items-center">
                    <Calendar className="h-5 w-5 mr-2 text-[#FF7D2D]" />
                    GitHub Contributions
                  </h3>
                  
                  {/* Year Selector Dropdown */}
                  <div className="relative">
                    <button 
                      onClick={() => setYearDropdownOpen(!yearDropdownOpen)}
                      className="flex items-center px-3 py-1 bg-[#263544] hover:bg-[#324559] rounded-md text-gray-300 text-sm transition-colors"
                    >
                      {yearOptions.find(y => y.value === selectedYear)?.label || 'Select Year'}
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </button>
                    
                    {yearDropdownOpen && (
                      <div className="absolute right-0 mt-1 w-32 bg-[#263544] rounded-md shadow-lg z-10 border border-gray-700">
                        {yearOptions.map((year) => (
                          <button
                            key={year.value}
                            onClick={() => handleYearChange(year.value)}
                            className={`block w-full text-left px-4 py-2 text-sm ${
                              selectedYear === year.value 
                                ? 'bg-[#324559] text-[#FF7D2D]' 
                                : 'text-gray-300 hover:bg-[#324559]/50'
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
                    <Loader2 className="h-6 w-6 text-[#FF7D2D] animate-spin" />
                    <span className="ml-3 text-sm text-gray-400">Loading contributions...</span>
                  </div>
                ) : (
                  <>
                    <div className="text-xs text-gray-400 mb-3">
                      {githubContributions.total?.lastYear || 0} contributions in the selected period
                    </div>
                    <ActivityGraph 
                      activities={displayActivities} 
                      totalCount={githubContributions.total?.lastYear || activityData.totalCount || 0} 
                    />
                  </>
                )}
              </div>
            </div>

            {/* Coverage History */}
            <div className="lg:col-span-3">
              <div className="bg-[#1F2B39] rounded-lg border border-gray-700 p-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-300">
                    <PieChart className="inline mr-2 h-5 w-5" />
                    Coverage History
                  </h3>
                  <div>
                    {selectedRepo && (
                      <a 
                        href={`/repositories?repo=${encodeURIComponent(selectedRepo)}`} 
                        className="text-sm text-[#FF7D2D] hover:underline"
                      >
                        View Details →
                      </a>
                    )}
                  </div>
                </div>
                
                {coverageLoading ? (
                  <div className="flex justify-center items-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin text-[#FF7D2D]" />
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
