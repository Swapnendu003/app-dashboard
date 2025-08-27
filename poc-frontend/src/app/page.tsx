"use client";
import React, { useEffect, useState, Suspense } from "react";
import { FlickeringGrid } from "@/components/magicui/flickering-grid";
import { useRouter, useSearchParams } from "next/navigation";
import { githubSignIn, githubSignUp, isAuthenticated } from "@/services/auth";
import { GITHUB_CLIENT_ID, REDIRECT_URI } from "@/constants/routes";
import { BorderBeam } from "@/components/magicui/border-beam";

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
    <div className="flex flex-col items-center space-y-4">
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 max-w-md">
          <p>{error}</p>
        </div>
      )}
      <div className="flex flex-col space-y-3 w-full justify-center items-center">
        <button
          onClick={() => redirectToGitHub('signin')}
          disabled={loading}
          className="w-[18rem] btn py-2.5 px-6 text-white bg-gradient-to-r from-orange-500 to-red-500 rounded-lg shadow-lg hover:shadow-xl hover:from-red-500 hover:to-orange-500 transition-all duration-300 ease-in-out flex items-center justify-center"
        >
          <span className="relative flex items-center text-base font-semibold">
            <svg className="w-5 h-5 mr-3" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" d="M10 0C4.477 0 0 4.477 0 10c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V19c0 .27.16.59.67.5C17.14 18.16 20 14.42 20 10A10 10 0 0010 0z" clipRule="evenodd"></path>
            </svg>
            Sign In with GitHub
          </span>
        </button>
        <button
          onClick={() => redirectToGitHub('signup')}
          disabled={loading}
          className="w-[18rem] btn py-2.5 px-6 text-orange-500 bg-white border-2 border-orange-500 rounded-lg shadow-md hover:shadow-lg hover:bg-orange-50 transition-all duration-300 ease-in-out flex items-center justify-center"
        >
          <span className="relative flex items-center text-base font-semibold">
            <svg className="w-5 h-5 mr-3" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" d="M10 0C4.477 0 0 4.477 0 10c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V19c0 .27.16.59.67.5C17.14 18.16 20 14.42 20 10A10 10 0 0010 0z" clipRule="evenodd"></path>
            </svg>
            Continue with GitHub
          </span>
        </button>
      </div>
    </div>
  );
}

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
    <div className="relative min-h-screen bg-[#f8fafc] flex items-center justify-center">
      {/* Background grid */}
      <div className="absolute inset-0">
        <FlickeringGrid
          color="rgb(255, 140, 0)"
          maxOpacity={0.2}
          flickerChance={0.15}
          squareSize={4}
          gridGap={8}
        />
      </div>
      
      {/* Main Card */}
      <div className="relative z-10 w-full max-w-xl mx-auto p-8">
        <div className="relative bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-12 border border-transparent min-h-[520px] flex flex-col justify-center">
          <BorderBeam
            size={400}
            duration={4}
            delay={0}
            colorFrom="#f97316"
            colorTo="#ea580c"
            borderWidth={2}
          />
         
          <img
            src="https://camo.githubusercontent.com/74cbc79070c04e7077cfd86981c110678fe434e9269ea8f52eafb37b781cfb4a/68747470733a2f2f646f63732e6b65706c6f792e696f2f696d672f6b65706c6f792d6c6f676f2d6461726b2e7376673f733d32303026763d34"
            alt="Keploy Logo"
            className="mx-auto w-32 mb-6"
          />
          <p className="text-base font-semibold text-gray-600 text-center mb-8 font-rubik">
            Track coverage, boost quality, ship faster.
          </p>
          
          <Suspense fallback={<div className="flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500"></div></div>}>
            <AuthHandler
              router={router}
              loading={loading}
              setLoading={setLoading}
              setError={setError}
              setAuthType={setAuthType}
              error={error}
            />
          </Suspense>

          {/* Terms and Privacy */}
          <div className="mt-8 text-center text-xs text-gray-500">
            <p>
              By signing up, you agree to our{' '}
              <a href="#" className="text-orange-600 hover:text-orange-700 underline">Terms of Service</a>
              {' '}and{' '}
              <a href="#" className="text-orange-600 hover:text-orange-700 underline">Privacy Policy</a>
            </p>
          </div>
        </div>
      </div>

      <div className="absolute bottom-4 left-0 right-0 text-center text-sm text-gray-500">
        <p>© {new Date().getFullYear()} Keploy. All rights reserved.</p>
      </div>
    </div>
  );
}
