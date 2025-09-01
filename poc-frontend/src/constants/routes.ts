
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";
export const RECONNECT_DELAY = 5000;

export const GITHUB_CLIENT_ID = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID;
export const REDIRECT_URI = typeof window !== 'undefined' ? `${window.location.origin}` : "";
