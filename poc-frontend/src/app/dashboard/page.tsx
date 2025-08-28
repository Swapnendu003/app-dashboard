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
  GitBranchPlus,
  LineChart as LineChartIcon,
  ChevronDown,
  Loader2,
  ArrowRight,
} from "lucide-react";
import PageSkeleton from "@/components/PageSkeleton";
import withAuth from "@/components/withAuth";
import {
  getUserProfile,
  getGitHubContributions,
  getCoverageTrends,
  getCoverageMetrics,
  getDashboardMetrics,
  getUserScannedRepositories,
  acknowledgeWelcome,
} from "@/services/api";
import ActivityGraph from "@/components/ActivityGraph";
import SpotlightCard from "@/components/SpotLightCard";
import { BorderBeam } from "@/components/magicui/border-beam";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import CTAButton from "@/components/ui/CTAButton";
import AnimatedList from "@/components/AnimatedList";
import { useRouter } from "next/navigation";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import ScanButton from "@/components/ui/UniversalButton";

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
  const [scannedReposModalOpen, setScannedReposModalOpen] = useState(false);
  const [scannedReposLoading, setScannedReposLoading] = useState(false);
  const [scannedRepos, setScannedRepos] = useState<any[]>([]);
  const [scannedReposError, setScannedReposError] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeHandled, setWelcomeHandled] = useState(false);
  const router = useRouter();

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
        if (!userResponse.data.user?.is_welcomed && !welcomeHandled) {
          setShowWelcome(true);
        }
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
  }, [welcomeHandled]);

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

  // Modify the coverage data transformation to include branch information
  const coverageByRepoData = React.useMemo(() => {
    // Group coverage trend data by repository
    const groupedData = dashboardData?.coverage_trend?.reduce((acc: any, item: any) => {
      const repoName = item.repo?.split('/').pop() || 'Unknown';
      if (!acc[repoName]) {
        acc[repoName] = [];
      }
      acc[repoName].push({
        branch: item.branch,
        coverage: Math.round(item.coverage * 10) / 10
      });
      return acc;
    }, {});

    return Object.entries(groupedData || {}).map(([repo, branches]) => {
      const branchArray = branches as Array<{ branch: string; coverage: number }>;
      const result: any = { name: repo };
      branchArray.forEach((branch, index) => {
        result[branch.branch] = branch.coverage;
        result[`${branch.branch}Color`] = index === 0 
          ? 'hsl(25, 100.00%, 58.60%)'
          : `hsl(${200 + (index - 1) * 40}, 70%, 50%)`; 
      });
      return result;
    });
  }, [dashboardData?.coverage_trend]);

  // Get all unique branch names for the stacked bars
  const branchNames = React.useMemo(() => {
    const branches = new Set<string>();
    dashboardData?.coverage_trend?.forEach((item: any) => {
      branches.add(item.branch);
    });
    return Array.from(branches);
  }, [dashboardData?.coverage_trend]);

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

  const handleRecentScansClick = async () => {
    setScannedReposModalOpen(true);
    setScannedReposLoading(true);
    setScannedReposError(null);
    try {
      const response = await getUserScannedRepositories();
      setScannedRepos(response.data.repositories || []);
    } catch (err: any) {
      setScannedReposError("Failed to fetch scanned repositories");
    } finally {
      setScannedReposLoading(false);
    }
  };

  const handleRepoBarClick = (data: any) => {
    if (data && data.activeLabel) {
      const repoObj = dashboardData?.coverage_by_repo?.find(
        (item: any) => item.repo?.split('/').pop() === data.activeLabel
      );
      if (repoObj && repoObj.repo) {
        router.push(`/history/report?repo=${encodeURIComponent(repoObj.repo)}`);
      }
    }
  };

  const handleWelcomeAcknowledge = async () => {
    try {
      await acknowledgeWelcome();
      setShowWelcome(false);
      setWelcomeHandled(true);
    } catch (error) {
      console.error('Failed to acknowledge welcome message:', error);
    }
  };

  return (
    <PageSkeleton
      title="Dashboard"
      subtitle="Overview of your GitHub API metrics"
    >
      <Dialog open={showWelcome} onOpenChange={setShowWelcome}>
        <DialogContent className="sm:max-w-[600px] bg-gradient-to-br from-orange-50 to-white border-orange-200">
          <DialogHeader>
            <div className="relative flex flex-col items-center justify-center p-8">
              <div className="absolute inset-0 pointer-events-none">
                {/* <SparklesCore
                  background="transparent"
                  minSize={0.4}
                  maxSize={1}
                  particleDensity={100}
                  className="w-full h-full"
                  particleColor="#f97316"
                /> */}
              </div>
              
              <img 
                src="https://i.postimg.cc/tJ2CBv5s/Chat-GPT-Image-Aug-26-2025-11-12-37-AM-removebg-preview.png" 
                alt="Welcome illustration" 
                className="w-48 h-auto mb-6 drop-shadow-xl"
              />
              
              <DialogTitle className="text-2xl font-bold text-orange-600 mb-4 text-center">
                Welcome to Your Coverage Dashboard!
              </DialogTitle>
              
              <div className="space-y-4 text-center">
                <p className="text-orange-700">
                  Your journey to better code coverage starts here. Let's explore what your repositories have to offer!
                </p>
                <div className="grid grid-cols-2 gap-4 mt-6">
                  <div className="p-4 bg-white/50 rounded-lg border border-orange-200">
                    <div className="text-orange-500 font-semibold">Track Coverage</div>
                    <div className="text-sm text-orange-600">Monitor your code coverage trends across repositories</div>
                  </div>
                  <div className="p-4 bg-white/50 rounded-lg border border-orange-200">
                    <div className="text-orange-500 font-semibold">Compare Branches</div>
                    <div className="text-sm text-orange-600">Analyze coverage differences between branches</div>
                  </div>
                </div>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <CTAButton
              text="Let's Get Started"
              variant="primary"
              icon={<ArrowRight className="h-5 w-5" />}
              onClick={handleWelcomeAcknowledge}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <div className="mb-8">
              <div className="bg-gradient-to-br from-orange-50 via-orange-100 to-white rounded-lg shadow p-6 border border-orange-100 w-full animate-pulse">
                <div className="flex justify-between items-center mb-4">
                  <div className="h-6 w-1/4 bg-orange-200 rounded"></div>
                  <div className="h-8 w-24 bg-orange-100 rounded"></div>
                </div>
                <div className="h-64 w-full bg-orange-50 rounded"></div>
              </div>
            </div>
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
            {(metrics.repositories === 0 &&
              metrics.totalScans === 0 &&
              metrics.passRate === 0 &&
              metrics.recentScans === 0) ? (
              <div className="flex flex-col items-center justify-center p-12 bg-gradient-to-br from-orange-50/80 to-white rounded-2xl border border-orange-200 shadow-lg hover:shadow-xl transition-all duration-300 h-[80vh]">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-orange-100/50 blur-2xl"></div>
                  <img
                    src="https://i.postimg.cc/FFxwcvdh/4828dc21-99b3-4507-9886-25ff7343372d.png"
                    alt="No metrics illustration"
                    className="relative w-[360px] h-auto mb-8 drop-shadow-xl"
                  />
                </div>
                <div className="text-center space-y-2 relative">
                  <h3 className="text-2xl font-semibold text-orange-700">
                    Welcome to Your Dashboard!
                  </h3>
                  <p className="text-lg text-orange-600/90 max-w-md">
                    No metrics available yet.
                    Start your journey by running an ad-hoc coverage scan!
                  </p>
                  <div className="mt-8">
                    <button
                      onClick={() => router.push("/adhoc-coverage")}
                      className="group relative inline-flex items-center justify-center px-8 py-3 font-semibold text-white transition-all duration-300 ease-in-out bg-gradient-to-r from-orange-500 to-red-500 rounded-full hover:from-red-500 hover:to-orange-500 hover:shadow-[0_0_40px_8px_rgba(251,146,60,0.25)] focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2"
                    >
                      <span className="mr-2">Run Your First Scan</span>
                      <svg
                        className="w-5 h-5 transition-transform duration-300 ease-out transform group-hover:translate-x-1"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M13 7l5 5m0 0l-5 5m5-5H6"
                        ></path>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
            <>

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
                  <GitBranchPlus className="h-6 w-6 text-orange-500" />
                </div>
                <p className="text-3xl font-bold text-orange-500">
                  {metrics.repositories}
                </p>
                <p className="text-sm text-gray-500 mt-2">Active repositories being tracked</p>
                <BorderBeam
                  duration={4}
                  size={300}
                  reverse
                  className="from-transparent via-orange-400 to-transparent"
                />
              </SpotlightCard>

              <SpotlightCard
                className="custom-spotlight-card bg-orange-50 border border-orange-200"
                spotlightColor="rgba(251, 146, 60, 0.44)"
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
                <p className="text-sm text-gray-500 mt-2">Coverage checks completed</p>
                <BorderBeam
                  duration={4}
                  size={300}
                  reverse
                  className="from-transparent via-orange-400 to-transparent"
                />
              </SpotlightCard>

              <SpotlightCard
                className="custom-spotlight-card bg-orange-50 border border-orange-200"
                spotlightColor="rgba(251, 146, 60, 0.44)"
              >
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-orange-700">
                    Success Rate
                  </h2>
                  <BarChart3 className="h-6 w-6 text-orange-500" />
                </div>
                <p className="text-3xl font-bold text-orange-500">
                  {metrics.passRate.toFixed(1)}%
                </p>
                <p className="text-sm text-gray-500 mt-2">Code coverage achievement</p>
                <BorderBeam
                  duration={4}
                  size={300}
                  reverse
                  className="from-transparent via-orange-400 to-transparent"
                />
              </SpotlightCard>

              <SpotlightCard
                className="custom-spotlight-card bg-orange-50 border border-orange-200"
                spotlightColor="rgba(251, 146, 60, 0.44)"
              >
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-orange-700">
                    Weekly Activity
                  </h2>
                  <LineChartIcon className="h-6 w-6 text-orange-500" />
                </div>
                <button
                  className="w-full text-left"
                  onClick={handleRecentScansClick}
                  aria-label="Show recent scans"
                >
                  <p className="text-3xl font-bold text-orange-500">
                    {metrics.recentScans}
                  </p>
                  <p className="text-sm text-gray-500 mt-2">Coverage checks this week</p>
                </button>
                <BorderBeam
                  duration={4}
                  size={300}
                  reverse
                  className="from-transparent via-orange-400 to-transparent"
                />
              </SpotlightCard>
            </div>


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
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-4 w-4 text-orange-400 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">
                              Each bar represents a repository's code coverage percentage.
                              Different colors indicate coverage across different branches.
                              Click on a bar to view detailed repository metrics.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </CardTitle>
                    <CardDescription>
                      Code coverage percentage across repositories and branches
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={{}}>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart
                          data={coverageByRepoData}
                          onClick={handleRepoBarClick}
                        >
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
                            content={({ active, payload, label }) => {
                              if (active && payload && payload.length) {
                                return (
                                  <div className="bg-white p-3 border border-orange-200 rounded-lg shadow-lg">
                                    <p className="font-medium text-orange-700">{label}</p>
                                    {payload.map((entry: any) => (
                                      <p 
                                        key={entry.name} 
                                        className="text-sm"
                                        style={{ 
                                          color: coverageByRepoData.find(d => d.name === label)?.[`${entry.name}Color`] 
                                        }}
                                      >
                                        {entry.name}: {entry.value}%
                                      </p>
                                    ))}
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          {branchNames.map((branch, index) => (
                            <Bar
                              key={branch}
                              dataKey={branch}
                              stackId="coverage"
                              fill={['main', 'master'].includes(branch.toLowerCase()) 
                                ? 'hsl(25, 70%, 50%)' 
                                : `hsl(${200 + index * 40}, 70%, 50%)`}
                              radius={index === branchNames.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                            >
                              {coverageByRepoData.map((entry: any, idx: number) => (
                                <Cell
                                  key={`cell-${idx}`}
                                  fill={entry[`${branch}Color`]}
                                />
                              ))}
                            </Bar>
                          ))}
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
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-4 w-4 text-orange-400 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">
                              Shows coverage trends from your most recent scans.
                              Each point represents a scan, with coverage percentage on the Y-axis.
                              Hover over points to see detailed scan information.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
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
                {/* Coverage Trend Area Chart - Full Width */}
                <Card className="border-orange-100 shadow-sm hover:shadow-md transition-shadow lg:col-span-1">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-orange-700">
                      <TrendingUp className="h-5 w-5" />
                      Coverage Trend Overview
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-4 w-4 text-orange-400 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">
                              Area chart showing coverage distribution across repositories.
                              The filled area indicates coverage percentage.
                              Higher peaks represent better coverage in those repositories.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
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
                
                <Card className="border-orange-100 shadow-sm hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-orange-700">
                      <Activity className="h-5 w-5" />
                      Coverage Scan Summary
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-4 w-4 text-orange-400 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">
                              Overview of your code coverage metrics.
                              Shows total scans run, repositories covered,
                              and overall coverage achievement with a progress bar.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </CardTitle>
                    <CardDescription>
                      Overview of your coverage scan activity and results
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Total Scans Run</span>
                        <span className="text-lg font-bold text-orange-500">{metrics.totalScans.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Repositories Scanned</span>
                        <span className="text-lg font-bold text-orange-500">{metrics.repositories}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Average Coverage Achieved</span>
                        <span className="text-lg font-bold text-orange-500">{metrics.passRate.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-orange-200 rounded-full h-2">
                        <div 
                          className="bg-gradient-to-r from-orange-400 to-orange-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${metrics.passRate}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-orange-400 text-center">
                        Summary of all coverage scans you've executed
                      </p>
                    </div>
                    <div className="flex flex-row gap-2 mt-16 justify-center border-t  pt-4 border-orange-200">
                      <ScanButton
                        onClick={() => router.push("/adhoc-coverage")}
                        text="Run New Scan"
                        icon={<Clipboard className="svgIcon" />}
                      />
                      <ScanButton
                        onClick={() => router.push("/repositories")}
                        text="Manage Repos"
                        icon={<Code2 className="svgIcon" />}
                      />
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
          </>
        )}
      </div>
      <Dialog open={scannedReposModalOpen} onOpenChange={setScannedReposModalOpen}>
        <DialogContent className="max-w-lg w-full border-orange-200 h-[500px] max-h-[500px] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-orange-700">
              Recent Scanned Repositories
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {scannedReposLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 text-orange-500 animate-spin" />
                <span className="ml-3 text-sm text-orange-400">
                  Loading scanned repositories...
                </span>
              </div>
            ) : scannedReposError ? (
              <div className="text-red-500 text-sm">{scannedReposError}</div>
            ) : scannedRepos.length === 0 ? (
              <div className="text-orange-400 text-sm">No scanned repositories found.</div>
            ) : (
              <AnimatedList
                items={scannedRepos.map((repo) => (
                  <div className="flex flex-col">
                    <span className="font-medium text-orange-700">
                      {repo.repository.split("/").pop()}
                    </span>
                    <span className="text-xs text-orange-500">
                      Last scanned: {new Date(repo.last_scanned).toLocaleString()}
                    </span>
                    <span className="text-xs text-orange-400">
                      Total scans: {repo.total_scans}
                    </span>
                  </div>
                ))}
                showGradients={true}
                className="w-full"
                itemClassName="bg-orange-50 border-orange-100"
                displayScrollbar={true}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </PageSkeleton>
  );
};

export default withAuth(ProfessionalDashboard);