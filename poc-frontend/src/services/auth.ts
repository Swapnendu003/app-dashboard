import api from './api';
import { setAuthToken, setUserData, clearAuthCookies, getAuthToken } from '../utils/cookies';

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    github_id: number;
    username: string;
    email: string;
    name: string;
    avatar_url: string;
    created_at: string;
    updated_at: string;
  };
}

export interface GitHubAuthRequest {
  code: string;
}

export const githubSignUp = async (code: string): Promise<AuthResponse> => {
  const response = await api.post<AuthResponse>('/auth/github/signup', { code });
  
  if (response.data) {
    setAuthToken(response.data.token);
    setUserData(response.data.user);
  }
  
  return response.data;
};

export const githubSignIn = async (code: string): Promise<AuthResponse> => {
  const response = await api.post<AuthResponse>('/auth/github/signin', { code });
  
  if (response.data) {
    setAuthToken(response.data.token);
    setUserData(response.data.user);
  }
  
  return response.data;
};

export const getUserProfile = async () => {
  const response = await api.get('/api/profile');
  return response.data;
};

export const signOut = () => {
  clearAuthCookies();
  if (typeof window !== 'undefined') {
    window.location.href = '/';
  }
};

export const isAuthenticated = (): boolean => {
  const token = getAuthToken();
  return !!token;
};
