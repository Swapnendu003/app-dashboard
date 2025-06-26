import { Cookies } from 'react-cookie';
import { CookieSetOptions } from 'universal-cookie';

const cookies = new Cookies();

// Cookie default configuration
const defaultOptions: CookieSetOptions = {
  path: '/',
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
};

export const setCookie = (
  key: string,
  value: string,
  options?: CookieSetOptions
): void => {
  cookies.set(key, value, { ...defaultOptions, ...options });
};

export const getCookie = (key: string): string | undefined => {
  return cookies.get(key);
};


export const removeCookie = (
  key: string,
  options?: CookieSetOptions
): void => {
  cookies.remove(key, { ...defaultOptions, ...options });
};

export const AUTH_TOKEN_KEY = 'auth_token';
export const USER_DATA_KEY = 'user_data';

export const setAuthToken = (token: string): void => {
  setCookie(AUTH_TOKEN_KEY, token);
};

export const getAuthToken = (): string | undefined => {
  return getCookie(AUTH_TOKEN_KEY);
};

export const removeAuthToken = (): void => {
  removeCookie(AUTH_TOKEN_KEY);
};

export const setUserData = (userData: any): void => {
  setCookie(USER_DATA_KEY, JSON.stringify(userData));
};

export const getUserData = (): any | undefined => {
  const data = getCookie(USER_DATA_KEY);
  if (data) {
    try {
      return JSON.parse(data);
    } catch (error) {
      console.error('Error parsing user data from cookie:', error);
      return undefined;
    }
  }
  return undefined;
};

export const removeUserData = (): void => {
  removeCookie(USER_DATA_KEY);
};

// Clear all auth related cookies
export const clearAuthCookies = (): void => {
  removeAuthToken();
  removeUserData();
};
