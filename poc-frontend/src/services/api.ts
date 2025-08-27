import axios from 'axios';
import { getAuthToken } from '../utils/cookies';
import { API_BASE_URL } from '@/constants/routes';

const debounce = <F extends (...args: any[]) => any>(
  func: F, 
  waitFor: number
): (...args: Parameters<F>) => void => {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<F>): void => {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => func(...args), waitFor);
  };
};

const requestCache: Record<string, {timestamp: number, promise: Promise<any>}> = {};
const CACHE_TTL = 10000;

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

let requestCounter = 0;
const generateRequestId = () => {
  requestCounter += 1;
  return `req-${Date.now()}-${requestCounter}`;
};

api.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    try {
      if (!config.headers['X-Request-ID'] && typeof localStorage !== 'undefined') {
        const corsIssue = localStorage.getItem('x-request-id-cors-issue');
        if (corsIssue !== 'true') {
          config.headers['X-Request-ID'] = generateRequestId();
        }
      }
    } catch (e) {
      console.error('Failed to set X-Request-ID header:', e);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401 && typeof window !== 'undefined') {
      window.location.href = '/';
    }
    if (error.message && error.message.includes('cors') && 
        error.message.toLowerCase().includes('x-request-id')) {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('x-request-id-cors-issue', 'true');
          console.warn('Detected CORS issue with X-Request-ID header. Will stop sending this header.');
        }
      } catch (e) {
      }
    }
    return Promise.reject(error);
  }
);

export const getUserProfile = async () => {
  return api.get('/api/profile');
};

export const getUserRepositories = async (skip = 0, limit = 10, search = '', refresh = false) => {
  try {
    const params = new URLSearchParams();
    params.append('skip', skip.toString());
    params.append('limit', limit.toString());
    if (search) {
      params.append('search', search);
    }
    if (refresh) {
      params.append('refresh', 'true');
    }
    const cacheKey = `repos-${skip}-${limit}-${search}-${refresh}`;
    const now = Date.now();
    if (!refresh && requestCache[cacheKey] && (now - requestCache[cacheKey].timestamp < CACHE_TTL)) {
      return await requestCache[cacheKey].promise;
    }
    const promise = api.get(`/api/repositories?${params.toString()}`, {
      timeout: refresh ? 60000 : 30000,
      headers: {
        'X-Request-ID': generateRequestId()
      }
    });
    if (!refresh) {
      requestCache[cacheKey] = {
        timestamp: now,
        promise
      };
    }
    return await promise;
  } catch (error) {
    console.error('Error fetching repositories:', error);
    if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
      throw new Error('Request timed out. Please try again later.');
    } else if (axios.isAxiosError(error) && error.response?.status === 403) {
      throw new Error('GitHub API access denied. Please check your authentication or try again later.');
    }
    throw error;
  }
};

export const refreshRepositories = async (skip = 0, limit = 10, search = '') => {
  console.log(`Refreshing repositories - skip: ${skip}, limit: ${limit}, search: "${search}"`);
  try {
    const endpoint = limit >= 100 ? '/api/repositories/force-refresh' : '/api/repositories/refresh';
    const params = new URLSearchParams();
    params.append('skip', skip.toString());
    params.append('limit', limit.toString());
    if (search) {
      params.append('search', search);
    }
    const response = await api.get(`${endpoint}?${params.toString()}`, {
      timeout: 120000,
      headers: {
        'X-Request-ID': generateRequestId()
      }
    });
    console.log(`Refresh request successful - received response:`, response.data);
    if (endpoint === '/api/repositories/force-refresh') {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const actualResponse = await getUserRepositories(skip, limit, search, false);
      return actualResponse;
    }
    return response;
  } catch (error) {
    console.error('Repository refresh failed:', error);
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status;
      const errorDetails = error.response?.data;
      console.error(`Refresh error details - Status: ${statusCode}, Response:`, errorDetails);
      if (statusCode === 403) {
        console.error('Possible GitHub API rate limit exceeded');
      } else if (statusCode === 401) {
        console.error('GitHub authentication issue - token may be invalid or expired');
      }
      console.error('Request details:', {
        url: error.config?.url,
        method: error.config?.method,
        headers: error.config?.headers,
        params: error.config?.params
      });
    }
    throw error;
  }
};

export const getGitHubContributions = async (username: string, year = 'last') => {
  if (!username) throw new Error('GitHub username is required');
  return await api.get(`api/github-contributions?year=${year}&username=${username}`);
};

export const runCoverageScan = async (
  repoUrl: string, 
  branch?: string, 
  options?: { 
    async?: boolean; 
    cloneTimeout?: number 
  }
) => {
  return api.post('api/coverage', { 
    repo_url: repoUrl, 
    branch, 
    async: options?.async || false, 
    clone_timeout: options?.cloneTimeout || 300
  });
};

export const clearJobStatusTracking = (jobId: string) => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`job_${jobId}_start_time`);
      localStorage.removeItem(`job_${jobId}_polling`);
    }
  } catch (e) {
    console.error("Failed to clear job status tracking:", e);
  }
};

export const getCoverageJobStatus = async (jobId: string) => {
  try {
    if (typeof localStorage !== 'undefined') {
      const jobStatus = localStorage.getItem(`job_${jobId}_status`);
      if (jobStatus === 'completed' || jobStatus === 'failed') {
        console.log(`Job ${jobId} already marked as ${jobStatus}, returning cached result`);
        return {
          data: {
            status: jobStatus,
            job_id: jobId,
            result_id: localStorage.getItem(`job_${jobId}_result_id`) || undefined
          }
        };
      }
      localStorage.setItem(`job_${jobId}_polling`, 'true');
    }
    const response = await api.get(`/api/coverage/status/${jobId}`);
    if (typeof localStorage !== 'undefined' && 
        (response.data.status === 'completed' || response.data.status === 'failed')) {
      localStorage.setItem(`job_${jobId}_status`, response.data.status);
      if (response.data.result_id) {
        localStorage.setItem(`job_${jobId}_result_id`, response.data.result_id);
      }
    }
    return response;
  } catch (error) {
    console.error(`Error fetching job status for ${jobId}:`, error);
    throw error;
  }
};

export const getActiveJobs = async () => {
  return api.get('/api/coverage/jobs/active');
};

export const cancelJob = async (jobId: string) => {
  return api.delete(`api/coverage/jobs/${jobId}`);
};

export const getCoverageHistory = async (repoUrl: string) => {
  return api.get('/api/coverage/history', { params: { repo_url: repoUrl } });
};

export const getCoverageById = async (id: string) => {
  return api.get(`api/coverage/${id}`);
};

export const getCoverageTrends = async (repoUrl: string, days = 30) => {
  return api.get('/api/coverage/trends', { params: { repo_url: repoUrl, days } });
};

export const scanMultipleBranches = async (repoUrl: string, branches: string[]) => {
  return api.post('/api/coverage/branches', { 
    repo_url: repoUrl, 
    branches,
    async: true
  });
};

export const getBranchCoverage = async (repoUrl: string) => {
  return api.get('api/coverage/branches', { params: { repo_url: repoUrl } });
};

export const getBranchList = async (repoUrl: string) => {
  return api.get('/api/repositories/branches', { params: { repo_url: repoUrl } });
};

export const compareBranchCoverage = async (repoUrl: string, branch1: string, branch2: string) => {
  return api.get('/api/coverage/compare', { 
    params: { repo_url: repoUrl, branch1, branch2 } 
  });
};

export const getCoverageMetrics = async () => {
  return api.get('/api/coverage/metrics');
};

export const getRecentActivity = async () => {
  return api.get('/api/coverage/recent-activity');
};

export const getDashboardMetrics = async () => {
  return api.get('/api/dashboard/metrics');
};

export const getUserScannedRepositories = async () => {
  return api.get('/api/coverage/scanned-repos');
};

export const getBranchesWithHistory = async (repoUrl: string) => {
  return api.get('/api/coverage/branches/history', { params: { repo_url: repoUrl } });
};

export const getJobErrorAnalysis = async (jobId: string) => {
  try {
    const response = await api.get(`/api/coverage/jobs/${jobId}/error-analysis`);
    return response.data;
  } catch (error) {
    console.error('Error fetching job error analysis:', error);
    throw error;
  }
};

export const acknowledgeWelcome = async () => {
  return api.patch('/api/profile/welcome-ack');
};

export default api;
