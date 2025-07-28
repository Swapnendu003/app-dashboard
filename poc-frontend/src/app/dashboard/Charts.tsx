import React from "react";
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
} from "lucide-react";

const ShadcnDashboardCharts = ({ dashboardData }) => {
  if (!dashboardData) return null;

  // Transform coverage by repo data for bar chart
  const coverageByRepoData = dashboardData.coverage_by_repo?.map((item, index) => ({
    name: item.repo?.split('/').pop() || `Repo ${index + 1}`,
    coverage: Math.round(item.coverage * 10) / 10,
    fill: `hsl(${25 + index * 45}, 70%, 55%)`,
  })) || [];

  // Transform language breakdown data for pie chart (top 8 languages)
  const languageData = dashboardData.language_breakdown 
    ? Object.entries(dashboardData.language_breakdown)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 8)
        .map(([language, lines], index) => ({
          name: language,
          value: Math.round(lines),
          fill: `hsl(${index * 45 + 25}, 70%, 55%)`,
        }))
    : [];

  // Transform recent scans for line chart
  const recentScansData = dashboardData.recent_scans?.map((scan, index) => ({
    scan: `Scan ${index + 1}`,
    coverage: Math.round(scan.coverage * 10) / 10,
    repo: scan.repo?.split('/').pop() || 'Unknown',
    date: new Date(scan.date).toLocaleDateString(),
  })) || [];

  // Test results data for pie chart
  const testResultsData = dashboardData.test_results ? [
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

  // Coverage trend area chart data
  const coverageTrendData = dashboardData.coverage_trend?.reduce((acc, item) => {
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
  }, []) || [];

  // Chart configurations
  const coverageChartConfig = {
    coverage: {
      label: "Coverage %",
      color: "hsl(var(--chart-1))",
    },
  };

  const languageChartConfig = {
    lines: {
      label: "Lines of Code",
      color: "hsl(var(--chart-2))",
    },
  };

  return (
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
          <ChartContainer config={coverageChartConfig}>
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
          <ChartContainer config={languageChartConfig}>
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
          <ChartContainer config={coverageChartConfig}>
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
          <ChartContainer config={coverageChartConfig}>
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

      {/* Coverage Trend Area Chart */}
      <Card className="border-orange-100 shadow-sm hover:shadow-md transition-shadow lg:col-span-2">
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
          <ChartContainer config={coverageChartConfig}>
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
    </div>
  );
};

export default ShadcnDashboardCharts;