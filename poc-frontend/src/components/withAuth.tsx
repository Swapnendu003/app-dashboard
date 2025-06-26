'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/services/auth';

export function withAuth<P extends object>(Component: React.ComponentType<P>) {
  return function ProtectedRoute(props: P) {
    const router = useRouter();
    
    useEffect(() => {
      // Check if user is authenticated
      if (!isAuthenticated()) {
        // If not authenticated, redirect to login page
        router.push('/');
      }
    }, [router]);

    // If user is authenticated, render the protected component
    if (isAuthenticated()) {
      return <Component {...props} />;
    }

    // Return null while checking authentication or redirecting
    return null;
  };
}

export default withAuth;
