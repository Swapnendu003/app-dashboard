"use client";
import React, { useEffect, useState, Suspense } from "react";
import { WavyBackground } from "@/components/ui/wavy-background";
import { useRouter, useSearchParams } from "next/navigation";
import { githubSignIn, githubSignUp, isAuthenticated } from "@/services/auth";
import { GITHUB_CLIENT_ID, REDIRECT_URI } from "@/constants/routes";

function AuthButtons({
  loading,
  error,
  redirectToGitHub,
}: {
  loading: boolean;
  error: string | null;
  redirectToGitHub: (type: 'signup' | 'signin') => void;
}) {
  return (
    <div className="flex flex-col items-center mt-10">
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 max-w-md">
          <p>{error}</p>
        </div>
      )}
      <div className="flex space-x-4">
        <button
          onClick={() => redirectToGitHub('signin')}
          disabled={loading}
          className="btn text-sm py-2 px-6 text-white bg-gradient-to-r from-orange-500 to-red-500 rounded-full shadow-lg hover:shadow-xl hover:from-red-500 hover:to-orange-500 transition-all duration-300 ease-in-out flex items-center justify-center relative overflow-hidden"
        >
          <span className="relative flex items-center text-base font-semibold">
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" d="M10 0C4.477 0 0 4.477 0 10c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V19c0 .27.16.59.67.5C17.14 18.16 20 14.42 20 10A10 10 0 0010 0z" clipRule="evenodd"></path>
            </svg>
            Sign In with GitHub
          </span>
        </button>
        <button
          onClick={() => redirectToGitHub('signup')}
          disabled={loading}
          className="btn text-sm py-2 px-6 text-white bg-gradient-to-r from-orange-500 to-red-500 rounded-full shadow-lg hover:shadow-xl hover:from-red-500 hover:to-orange-500 transition-all duration-300 ease-in-out flex items-center justify-center relative overflow-hidden"
        >
          <span className="relative flex items-center text-base font-semibold">
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" d="M10 0C4.477 0 0 4.477 0 10c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V19c0 .27.16.59.67.5C17.14 18.16 20 14.42 20 10A10 10 0 0010 0z" clipRule="evenodd"></path>
            </svg>
            Sign Up with GitHub
          </span>
        </button>
      </div>
    </div>
  );
}

// Move the logic that uses useSearchParams into a child component
function AuthHandler({
  router,
  loading,
  setLoading,
  setError,
  setAuthType,
  error,
}: {
  router: ReturnType<typeof useRouter>;
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setAuthType: React.Dispatch<React.SetStateAction<'signup' | 'signin' | null>>;
  error: string | null;
}) {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (isAuthenticated()) {
      router.push('/dashboard');
      return;
    }

    const code = searchParams.get('code');
    const storedAuthType = localStorage.getItem('authType') as 'signup' | 'signin' | null;

    if (code && storedAuthType) {
      handleGitHubCallback(code, storedAuthType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, searchParams]);

  const handleGitHubCallback = async (code: string, authType: 'signup' | 'signin') => {
    setLoading(true);
    setError(null);

    try {
      if (authType === 'signup') {
        await githubSignUp(code);
      } else {
        await githubSignIn(code);
      }

      localStorage.removeItem('authType');
      router.push('/dashboard');
    } catch (err: any) {
      console.error('Authentication error:', err);
      setError(err.response?.data?.error || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const redirectToGitHub = (type: 'signup' | 'signin') => {
    localStorage.setItem('authType', type);
    setAuthType(type);

    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=repo,user:email`;
    window.location.href = githubAuthUrl;
  };

  if (loading) {
    return (
      <div className="flex justify-center mt-10">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <AuthButtons loading={loading} error={error} redirectToGitHub={redirectToGitHub} />
  );
}

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authType, setAuthType] = useState<'signup' | 'signin' | null>(null);

  return (
    <div className="relative min-h-screen bg-[#f8fafc]">
      {/* Orange hue gradient overlay at right */}
      <div className="pointer-events-none fixed top-0 right-0 w-1/2 h-full z-0"
        style={{
          background: "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,186,120,0.25) 60%, rgba(255,140,0,0.18) 100%)"
        }}
      />
      <WavyBackground
        className="w-[100vw] mx-auto pb-40"
        backgroundFill="#f8fafc"
      >
        <img
          src="https://camo.githubusercontent.com/74cbc79070c04e7077cfd86981c110678fe434e9269ea8f52eafb37b781cfb4a/68747470733a2f2f646f63732e6b65706c6f792e696f2f696d672f6b65706c6f792d6c6f676f2d6461726b2e7376673f733d32303026763d34"
          alt="Keploy Logo"
          className="mx-auto w-40 mb-8"
        />
        <p className="text-2xl md:text-4xl lg:text-7xl text-gray-900 font-bold inter-var text-center">
          Keploy - Simplify Your API Testing
        </p>
        <p className="text-base md:text-lg mt-4 text-gray-700 font-normal inter-var text-center">
          Automate performance and functional testing for your APIs with ease
        </p>
        <Suspense fallback={<div className="flex justify-center mt-10"><div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-orange-400"></div></div>}>
          <AuthHandler
            router={router}
            loading={loading}
            setLoading={setLoading}
            setError={setError}
            setAuthType={setAuthType}
            error={error}
          />
        </Suspense>
      </WavyBackground>
    </div>
  );
}
