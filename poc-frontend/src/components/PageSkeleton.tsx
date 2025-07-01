'use client';
import React, { ReactNode, useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { UserCircle } from 'lucide-react';
import Image from 'next/image';
import { getUserProfile } from '@/services/api';

interface PageSkeletonProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

const PageSkeleton: React.FC<PageSkeletonProps> = ({ 
  children, 
  title, 
  subtitle 
}) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'metrics' | 'repositories' | 'tests' | 'settings'>('metrics');
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const pathname = usePathname();
  const router = useRouter();

  // Set the active tab based on pathname
  useEffect(() => {
    if (pathname === '/dashboard') {
      setActiveTab('metrics');
    } else if (pathname === '/repositories') {
      setActiveTab('repositories');
    } else if (pathname === '/settings') {
      setActiveTab('settings');
    }
  }, [pathname]);

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const response = await getUserProfile();
        if (response.data && response.data.user) {
          setUserProfile(response.data.user);
        }
      } catch (error) {
        console.error('Error fetching user profile:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchUserProfile();
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const handleTabChange = (tab: 'metrics' | 'repositories' | 'tests' | 'settings') => {
    setActiveTab(tab);
    switch (tab) {
      case 'metrics':
        router.push('/dashboard');
        break;
      case 'repositories':
        router.push('/repositories');
        break;
      case 'settings':
        router.push('/settings');
        break;
      default:
        break;
    }
  };

  const mainContentClass = sidebarCollapsed 
    ? "ml-14 transition-all duration-300 ease-in-out" 
    : "ml-56 transition-all duration-300 ease-in-out";

  return (
    <div className="flex h-screen bg-gray-900">
      <Sidebar
        sidebarCollapsed={sidebarCollapsed}
        activeTab={activeTab}
        toggleSidebar={toggleSidebar}
        handleTabChange={handleTabChange}
      />
      <div className={`flex flex-col flex-1 ${mainContentClass}`}>
        <div className="bg-[#1F2B39] text-white p-4 shadow-md flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            {subtitle && (
              <p className="text-gray-400 text-sm">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center">
            {!loading && userProfile && userProfile.avatar_url ? (
              <div className="relative h-10 w-10">
                <Image 
                  src={userProfile.avatar_url} 
                  alt="Profile"
                  fill
                  className="rounded-full border-2 border-[#FF7D2D] object-cover"
                />
              </div>
            ) : (
              <UserCircle size={40} className="text-gray-400" />
            )}
          </div>
        </div>
        <div className="flex-1 overflow-x-hidden overflow-y-auto p-6">
          {children}
        </div>
      </div>
    </div>
  );
};

export default PageSkeleton;
