export interface Repository {
  _id?: string;
  name: string;
  owner: string;
  status: 'active' | 'inactive' | 'error';
  url: string;
  description?: string;
}

export interface MetricsData {
  passRate: number;
  totalRepositories: number;
  totalTests: number;
  testsLast7Days: number;
  averageDuration: number;
  testsByStatus: {
    passed: number;
    failed: number;
    skipped: number;
    error: number;
  };
}

export interface TimeSeriesDataPoint {
  date: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  error?: number;
  avgDuration?: number;
}

export interface TestResult {
  _id: string;
  repositoryId: string;
  name: string;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  duration: number;
  executedAt: string;
  endpoint?: string;
  method?: string;
  details?: {
    error?: string;
    requestBody?: any;
    responseBody?: any;
    statusCode?: number;
  };
}

export interface RepositoryTestsResponse {
  success: boolean;
  count: number;
  statusCounts: {
    passed: number;
    failed: number;
    skipped: number;
    error: number;
  };
  data: TestResult[];
}

export interface LayoutConfig {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

export interface DashboardWidgetType {
  widgetKey: string;
  title: string;
  type: 'chart' | 'card' | 'table' | 'custom';
  dataSource: string;
  position: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  settings?: {
    [key: string]: any;
    chartType?: 'line' | 'bar' | 'pie' | 'doughnut' | 'gauge';
    showLegend?: boolean;
    fillArea?: boolean;
    showPassed?: boolean;
    showFailed?: boolean;
    showSkipped?: boolean;
    showError?: boolean;
    metric?: string;
    showTrend?: boolean;
    pageSize?: number;
    showPagination?: boolean;
    sortable?: boolean;
  };
}

export interface DashboardComponent {
  id: string;
  name: string;
  type: "chart" | "card" | "table" | "custom";
  subtype?: string;
  description: string;
  defaultDataSource: string;
  defaultSize: {
    w: number;
    h: number;
  };
  defaultSettings?: {
    [key: string]: any;
  };
}

export interface DashboardConfig {
  id?: string;
  userId: string;
  name: string;
  description?: string;
  layout?: string;
  widgets: DashboardWidgetType[];
  createdAt?: string;
  updatedAt?: string;
}

export interface WebSocketMessage {
  type: string;
  data?: any;
}
