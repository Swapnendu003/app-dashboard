"use client";
import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Code2,
  GitBranch,
  Activity,
  TestTube,
  BarChart3,
  AlertCircle,
  Calendar,
  Info,
  Clipboard,
  LineChart as LineChartIcon,
  ChevronDown,
  Loader2,
} from "lucide-react";
import PageSkeleton from "@/components/PageSkeleton";
import withAuth from "@/components/withAuth";
import {
  getUserProfile,
  getGitHubContributions,
  getCoverageTrends,
  getCoverageMetrics,
  getDashboardMetrics,
} from "@/services/api";
import ActivityGraph from "@/components/ActivityGraph";
import SpotlightCard from "@/components/SpotLightCard";
import { BorderBeam } from "@/components/magicui/border-beam";

const ProfessionalDashboard = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [contributionsLoading, setContributionsLoading] = useState<boolean>(false);
  const [coverageLoading, setCoverageLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState({
    repositories: 0,
    totalScans: 0,
    passRate: 0,
    recentScans: 0,
  });
  const [activityData, setActivityData] = useState<any>({
    dailyActivities: [],
    totalCount: 0,
    maxCount: 0,
    repoBreakdown: [],
    recentActivity: [],
  });
  const [githubContributions, setGithubContributions] = useState<any>({
    total: { lastYear: 0 },
    contributions: [],
  });
  const [coverageTrends, setCoverageTrends] = useState<any>([]);
  const [selectedYear, setSelectedYear] = useState<string>("last");
  const [yearDropdownOpen, setYearDropdownOpen] = useState<boolean>(false);
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [dashboardLoading, setDashboardLoading] = useState<boolean>(true);

  // Generate year options: last 5 years plus "last year" option
  const currentYear = new Date().getFullYear();
  const yearOptions = [
    { value: "last", label: "Last Year" },
    { value: currentYear.toString(), label: currentYear.toString() },
    {
      value: (currentYear - 1).toString(),
      label: (currentYear - 1).toString(),
    },
    {
      value: (currentYear - 2).toString(),
      label: (currentYear - 2).toString(),
    },
    {
      value: (currentYear - 3).toString(),
      label: (currentYear - 3).toString(),
    },
  ];

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [userResponse, metricsResponse] = await Promise.all([
          getUserProfile(),
          getCoverageMetrics(),
        ]);

        setUser(userResponse.data.user || {});
        if (userResponse.data.user?.username) {
          sessionStorage.setItem(
            "github_username",
            userResponse.data.user.username
          );
        }

        setMetrics({
          repositories: metricsResponse.data.repositories,
          totalScans: metricsResponse.data.total_scans,
          passRate: metricsResponse.data.pass_rate,
          recentScans: metricsResponse.data.recent_scans,
        });

        await fetchGithubContributions(
          userResponse.data.user?.username,
          selectedYear
        );
        setError(null);
      } catch (err: any) {
        console.error("Error fetching dashboard data:", err);
        setError(err.response?.data?.error || "Failed to fetch dashboard data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const fetchGithubContributions = async (
    username: string | undefined,
    year: string
  ) => {
    try {
      setContributionsLoading(true);
      if (!username) {
        username = sessionStorage.getItem("github_username") || "";
        console.log("Using username from sessionStorage:", username);
      }
      if (!username) {
        setGithubContributions({ total: { lastYear: 0 }, contributions: [] });
        return;
      }
      const contributionsResponse = await getGitHubContributions(
        username,
        year
      );
      if (contributionsResponse.data) {
        setGithubContributions({
          total: contributionsResponse.data.total || { lastYear: 0 },
          contributions: contributionsResponse.data.contributions || [],
        });
      }
    } catch (contributionsErr) {
      console.error("Error fetching GitHub contributions:", contributionsErr);
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
    const username =
      sessionStorage.getItem("github_username") || user?.username;
    fetchGithubContributions(username, year);
    setYearDropdownOpen(false);
  };

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        setDashboardLoading(true);
        const response = await getDashboardMetrics();
        setDashboardData(response.data);
      } catch (err) {
        console.error("Error fetching dashboard metrics:", err);
      } finally {
        setDashboardLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  const displayActivities =
    githubContributions.contributions &&
    githubContributions.contributions.length > 0
      ? githubContributions.contributions
      : activityData.dailyActivities || [];

  // Chart data transformations
  type CoverageByRepoItem = {
    repo?: string;
    coverage: number;
  };

  const coverageByRepoData = dashboardData?.coverage_by_repo?.map((item: CoverageByRepoItem, index: number) => ({
    name: item.repo?.split('/').pop() || `Repo ${index + 1}`,
    coverage: Math.round(item.coverage * 10) / 10,
    fill: `hsl(${25 + index * 45}, 70%, 55%)`,
  })) || [];

  const languageData = dashboardData?.language_breakdown 
    ? Object.entries(dashboardData.language_breakdown)
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .slice(0, 8)
        .map(([language, lines], index) => ({
          name: language,
          value: Math.round(lines as number),
          fill: `hsl(${index * 45 + 25}, 70%, 55%)`,
        }))
    : [];

  const recentScansData = dashboardData?.recent_scans?.map((scan: any, index: number) => ({
    scan: `Scan ${index + 1}`,
    coverage: Math.round(scan.coverage * 10) / 10,
    repo: scan.repo?.split('/').pop() || 'Unknown',
    date: new Date(scan.date).toLocaleDateString(),
  })) || [];

  const testResultsData = dashboardData?.test_results ? [
    {
      name: "Passed",
      value: dashboardData.test_results.passed || 0,
      fill: "hsl(142, 71%, 45%)",
    },
    {
      name: "Failed", 
      value: dashboardData.test_results.failed || 0,
      fill: "hsl(0, 84%, 60%)",
    },
    {
      name: "Error",
      value: dashboardData.test_results.error || 0,
      fill: "hsl(48, 96%, 53%)",
    },
    {
      name: "Skipped",
      value: dashboardData.test_results.skipped || 0,
      fill: "hsl(210, 40%, 70%)",
    },
  ].filter(item => item.value > 0) : [];

  const coverageTrendData = dashboardData?.coverage_trend?.reduce(
    (acc: { repo: string; coverage: number }[], item: any) => {
      const repoName = item.repo?.split('/').pop() || 'Unknown';
      const existingRepo = acc.find(r => r.repo === repoName);
      
      if (existingRepo) {
        existingRepo.coverage = Math.max(existingRepo.coverage, item.coverage);
      } else {
        acc.push({
          repo: repoName,
          coverage: Math.round(item.coverage * 10) / 10,
        });
      }
      return acc;
    },
    []
  ) || [];

  return (
    <PageSkeleton
      title="Dashboard"
      subtitle="Overview of your GitHub API metrics"
    >
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
                <div
                  key={idx}
                  className="bg-gradient-to-br from-orange-100 to-orange-50 rounded-lg shadow p-6 border border-orange-200 animate-pulse"
                >
                  <div className="flex justify-between items-center mb-4">
                    <div className="h-5 w-1/3 bg-orange-200 rounded"></div>
                    <div className="h-6 w-6 bg-orange-100 rounded-full"></div>
                  </div>
                  <div className="h-10 w-1/2 bg-orange-200 rounded mb-2"></div>
                  <div className="h-4 w-1/3 bg-orange-100 rounded"></div>
                </div>
              ))}
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
            {/* Charts skeleton */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {[...Array(6)].map((_, idx) => (
                <div key={idx} className="bg-white rounded-lg border border-orange-100 p-4 animate-pulse">
                  <div className="h-6 w-1/3 bg-orange-200 rounded mb-4"></div>
                  <div className="h-48 w-full bg-orange-50 rounded"></div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Welcome Section */}
            <div className="bg-gradient-to-r from-orange-100 to-orange-50 rounded-lg p-6 mb-8 border-l-4 border-orange-400">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Welcome, {user?.name || "Developer"}!
              </h2>
              <p className="text-gray-700">
                Your personalized dashboard for repository insights and code
                coverage trends.
              </p>
            </div>

            {/* Metrics Cards with SpotlightCard */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <SpotlightCard
                className="custom-spotlight-card bg-orange-50 border border-orange-200"
                spotlightColor="rgba(251, 146, 60, 0.44)"
              >
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-orange-700">
                    Repositories
                  </h2>
                  <Info className="h-6 w-6 text-orange-500" />
                </div>
                <p className="text-3xl font-bold text-orange-500">
                  {metrics.repositories}
                </p>
                <p className="text-sm text-orange-400 mt-2">Scanned repos</p>
                <BorderBeam
                  duration={4}
                  size={300}
                  reverse
                  className="from-transparent via-orange-400 to-transparent"
                />
              </SpotlightCard>

              <SpotlightCard
                className="custom-spotlight-card bg-orange-50 border border-orange-100"
                spotlightColor="rgba(251, 146, 60, 0.38)"
              >
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-orange-700">
                    Total Scans
                  </h2>
                  <Clipboard className="h-6 w-6 text-orange-500" />
                </div>
                <p className="text-3xl font-bold text-orange-500">
                  {metrics.totalScans}
                </p>
                <p className="text-sm text-orange-400 mt-2">Coverage scans</p>
                <BorderBeam
                  duration={4}
                  size={300}
                  reverse
                  className="from-transparent via-orange-400 to-transparent"
                />
              </SpotlightCard>

              <SpotlightCard
                className="custom-spotlight-card bg-orange-50 border border-orange-100"
                spotlightColor="rgba(251, 146, 60, 0.32)"
              >
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-orange-700">
                    Pass Rate
                  </h2>
                  <BarChart3 className="h-6 w-6 text-orange-500" />
                </div>
                <p className="text-3xl font-bold text-orange-500">
                  {metrics.passRate.toFixed(1)}%
                </p>
                <p className="text-sm text-orange-400 mt-2">Average coverage</p>
                <BorderBeam
                  duration={4}
                  size={300}
                  reverse
                  className="from-transparent via-orange-400 to-transparent"
                />
              </SpotlightCard>

              <SpotlightCard
                className="custom-spotlight-card bg-orange-100 border border-orange-300"
                spotlightColor="rgba(251, 146, 60, 0.46)"
              >
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-orange-700">
                    Recent Scans
                  </h2>
                  <LineChartIcon className="h-6 w-6 text-orange-500" />
                </div>
                <p className="text-3xl font-bold text-orange-500">
                  {metrics.recentScans}
                </p>
                <p className="text-sm text-orange-400 mt-2">Last 7 days</p>
                <BorderBeam
                  duration={4}
                  size={300}
                  reverse
                  className="from-transparent via-orange-500 to-transparent"
                />
              </SpotlightCard>
            </div>

            {/* GitHub Contributions Section */}
           

            {/* Professional Dashboard Charts Section */}
            {dashboardLoading ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {[...Array(6)].map((_, idx) => (
                  <div key={idx} className="bg-white rounded-lg border border-orange-100 p-4 animate-pulse">
                    <div className="h-6 w-1/3 bg-orange-200 rounded mb-4"></div>
                    <div className="h-48 w-full bg-orange-50 rounded"></div>
                  </div>
                ))}
              </div>
            ) : dashboardData ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Coverage by Repository Bar Chart */}
                <Card className="border-orange-100 shadow-sm hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-orange-700">
                      <BarChart3 className="h-5 w-5" />
                      Coverage by Repository
                    </CardTitle>
                    <CardDescription>
                      Code coverage percentage across repositories
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={{}}>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={coverageByRepoData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-orange-100" />
                          <XAxis 
                            dataKey="name" 
                            tick={{ fill: 'hsl(20, 60%, 40%)' }}
                            angle={-45}
                            textAnchor="end"
                            height={60}
                          />
                          <YAxis tick={{ fill: 'hsl(20, 60%, 40%)' }} />
                          <ChartTooltip
                            content={<ChartTooltipContent />}
                            labelFormatter={(label) => `Repository: ${label}`}
                            formatter={(value) => [`${value}%`, "Coverage"]}
                          />
                          <Bar 
                            dataKey="coverage" 
                            radius={[4, 4, 0, 0]}
                            className="fill-orange-500"
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </CardContent>
                </Card>
                {/* Recent Scans Line Chart */}
                <Card className="border-orange-100 shadow-sm hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-orange-700">
                      <Activity className="h-5 w-5" />
                      Recent Scan Coverage
                    </CardTitle>
                    <CardDescription>
                      Coverage trends from recent scans
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={{}}>
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={recentScansData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-orange-100" />
                          <XAxis 
                            dataKey="scan" 
                            tick={{ fill: 'hsl(20, 60%, 40%)' }}
                          />
                          <YAxis tick={{ fill: 'hsl(20, 60%, 40%)' }} />
                          <ChartTooltip
                            content={({ active, payload, label }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                return (
                                  <div className="bg-white p-3 border border-orange-200 rounded-lg shadow-lg">
                                    <p className="font-medium text-orange-700">{label}</p>
                                    <p className="text-sm text-orange-600">Repository: {data.repo}</p>
                                    <p className="text-sm text-orange-600">Coverage: {data.coverage}%</p>
                                    <p className="text-sm text-orange-500">Date: {data.date}</p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="coverage" 
                            stroke="hsl(25, 70%, 50%)"
                            strokeWidth={3}
                            dot={{ fill: 'hsl(25, 70%, 50%)', strokeWidth: 2, r: 4 }}
                            activeDot={{ r: 6, stroke: 'hsl(25, 70%, 50%)', strokeWidth: 2 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </CardContent>
                </Card>

                {/* Language Breakdown Pie Chart */}
                <Card className="border-orange-100 shadow-sm hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-orange-700">
                      <Code2 className="h-5 w-5" />
                      Language Breakdown
                    </CardTitle>
                    <CardDescription>
                      Distribution of programming languages
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={{}}>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={languageData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, percent }) => 
                              percent > 5 ? `${name} ${(percent * 100).toFixed(0)}%` : ''
                            }
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {languageData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Pie>
                          <ChartTooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                return (
                                  <div className="bg-white p-3 border border-orange-200 rounded-lg shadow-lg">
                                    <p className="font-medium text-orange-700">{data.name}</p>
                                    <p className="text-sm text-orange-600">{data.value} lines</p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </CardContent>
                </Card>

                {/* Test Results Pie Chart */}
                <Card className="border-orange-100 shadow-sm hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-orange-700">
                      <TestTube className="h-5 w-5" />
                      Test Results
                    </CardTitle>
                    <CardDescription>
                      Distribution of test outcomes
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={{}}>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={testResultsData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, value, percent }) => 
                              `${name}: ${value} (${(percent * 100).toFixed(1)}%)`
                            }
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {testResultsData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Pie>
                          <ChartTooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                return (
                                  <div className="bg-white p-3 border border-orange-200 rounded-lg shadow-lg">
                                    <p className="font-medium text-orange-700">{data.name}</p>
                                    <p className="text-sm text-orange-600">{data.value} tests</p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </CardContent>
                </Card>

                {/* Coverage Trend Area Chart - Full Width */}
                <Card className="border-orange-100 shadow-sm hover:shadow-md transition-shadow lg:col-span-1">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-orange-700">
                      <TrendingUp className="h-5 w-5" />
                      Coverage Trend Overview
                    </CardTitle>
                    <CardDescription>
                      Code coverage distribution across all repositories
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={{}}>
                      <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={coverageTrendData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-orange-100" />
                          <XAxis 
                            dataKey="repo" 
                            tick={{ fill: 'hsl(20, 60%, 40%)' }}
                            angle={-45}
                            textAnchor="end"
                            height={60}
                          />
                          <YAxis tick={{ fill: 'hsl(20, 60%, 40%)' }} />
                          <ChartTooltip
                            content={<ChartTooltipContent />}
                            labelFormatter={(label) => `Repository: ${label}`}
                            formatter={(value) => [`${value}%`, "Coverage"]}
                          />
                          <Area 
                            type="monotone" 
                            dataKey="coverage" 
                            stroke="hsl(25, 70%, 50%)"
                            fill="hsl(25, 70%, 85%)"
                            strokeWidth={2}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </CardContent>
                </Card>

                {/* Additional Metrics Row */}
                <Card className="border-orange-100 shadow-sm hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-orange-700">
                      <GitBranch className="h-5 w-5" />
                      Repository Health
                    </CardTitle>
                    <CardDescription>
                      Overall health metrics for your repositories
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-orange-700">Active Repositories</span>
                        <span className="text-lg font-bold text-orange-500">{metrics.repositories}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-orange-700">Average Pass Rate</span>
                        <span className="text-lg font-bold text-orange-500">{metrics.passRate.toFixed(1)}%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-orange-700">Total Test Runs</span>
                        <span className="text-lg font-bold text-orange-500">{metrics.totalScans.toLocaleString()}</span>
                      </div>
                      <div className="w-full bg-orange-200 rounded-full h-2">
                        <div 
                          className="bg-gradient-to-r from-orange-400 to-orange-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${metrics.passRate}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-orange-400 text-center mb-4">
                        Overall repository health score
                      </p>
                    </div>
                    <div className="flex flex-row gap-3">
                      <button className="flex-1 flex items-center justify-center px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-md text-sm transition-all duration-300 hover:from-red-500 hover:to-orange-500 hover:shadow-lg">
                        <Clipboard className="mr-2 h-4 w-4" />
                        Run New Scan
                      </button>
                      <button className="flex-1 flex items-center justify-center px-4 py-2 bg-gradient-to-r from-orange-400 to-orange-500 text-white rounded-md text-sm transition-all duration-300 hover:from-orange-500 hover:to-orange-600 hover:shadow-lg">
                        <BarChart3 className="mr-2 h-4 w-4" />
                        View Reports
                      </button>
                      <button className="flex-1 flex items-center justify-center px-4 py-2 bg-gradient-to-r from-orange-300 to-orange-400 text-white rounded-md text-sm transition-all duration-300 hover:from-orange-400 hover:to-orange-500 hover:shadow-lg">
                        <Code2 className="mr-2 h-4 w-4" />
                        Manage Repos
                      </button>
                    </div>

                  </CardContent>
                </Card>
                
              </div>
            ) : null}
             <div className="mb-8">
              <div className="bg-gradient-to-br from-orange-50 via-orange-100 to-white rounded-lg shadow p-6 border border-orange-100 w-full hover:border-orange-400 transition-colors duration-300">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-orange-700 flex items-center">
                    <Calendar className="h-5 w-5 mr-2 text-orange-500" />
                    GitHub Contributions
                  </h3>
                  <div className="relative">
                    <button
                      onClick={() => setYearDropdownOpen(!yearDropdownOpen)}
                      className="flex items-center px-3 py-1 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-md text-sm transition-all duration-300 hover:from-red-500 hover:to-orange-500"
                    >
                      {yearOptions.find((y) => y.value === selectedYear)
                        ?.label || "Select Year"}
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
                                ? "bg-orange-100 text-orange-600 font-semibold"
                                : "text-orange-700 hover:bg-orange-50"
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
                    <span className="ml-3 text-sm text-orange-400">
                      Loading contributions...
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="text-xs text-orange-400 mb-3">
                      {githubContributions.total?.lastYear || 0} contributions
                      in the selected period
                    </div>
                    <div className="bg-orange-50 rounded-lg border border-orange-100 p-4">
                      <ActivityGraph
                        activities={displayActivities}
                        totalCount={
                          githubContributions.total?.lastYear ||
                          activityData.totalCount ||
                          0
                        }
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </PageSkeleton>
  );
};

export default withAuth(ProfessionalDashboard);