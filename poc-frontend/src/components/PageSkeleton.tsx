'use client';
import React, { ReactNode, useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { UserCircle, Bell, Loader2, History } from 'lucide-react';
import Image from 'next/image';
import { getUserProfile, getActiveJobs } from '@/services/api';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const [activeTab, setActiveTab] = useState<'metrics' | 'repositories' | 'tests' | 'settings' | 'history'>('metrics');
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeJobs, setActiveJobs] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname === '/dashboard') {
      setActiveTab('metrics');
    } else if (pathname.startsWith('/repositories')) {
      setActiveTab('repositories');
    } else if (pathname === '/settings') {
      setActiveTab('settings');
    } else if (pathname === '/adhoc-coverage') {
      setActiveTab('tests');
    } else if (pathname.startsWith('/history')) {
      setActiveTab('history');
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

  useEffect(() => {
    const fetchActiveJobs = async () => {
      try {
        const response = await getActiveJobs();
        setActiveJobs(response.data.filter((job: any) => job.status === "in_progress"));
      } catch (error) {
        console.error('Error fetching active jobs:', error);
      }
    };

    fetchActiveJobs();
    const interval = setInterval(fetchActiveJobs, 10000); 

    return () => clearInterval(interval);
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const handleTabChange = (tab: 'metrics' | 'repositories' | 'tests' | 'settings' | 'history') => {
    setActiveTab(tab);
    switch (tab) {
      case 'metrics':
        router.push('/dashboard');
        break;
      case 'repositories':
        router.push('/repositories');
        break;
      case 'tests':
        router.push('/adhoc-coverage');
        break;
      case 'settings':
        router.push('/settings');
        break;
      case 'history':
        router.push('/history');
        break;
      default:
        break;
    }
  };

  const mainContentClass = sidebarCollapsed 
    ? "ml-14 transition-all duration-300 ease-in-out" 
    : "ml-56 transition-all duration-300 ease-in-out";

  return (
    <div className="flex h-screen bg-[#f8fafc]">
      <Sidebar
        sidebarCollapsed={sidebarCollapsed}
        activeTab={activeTab}
        toggleSidebar={toggleSidebar}
        handleTabChange={handleTabChange}
      />
      <div className={`flex flex-col flex-1 ${mainContentClass}`}>
        <div className="bg-white text-gray-900 p-4 shadow-md flex justify-between items-center border-b border-gray-100">
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            {subtitle && (
              <p className="text-gray-500 text-sm">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="relative p-2 hover:bg-orange-50 rounded-full transition-colors">
                  <Bell size={20} className="text-orange-600" />
                  {activeJobs.length > 0 && (
                    <span className="absolute top-0 right-0 w-4 h-4 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center">
                      {activeJobs.length}
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                {activeJobs.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    No active coverage jobs
                  </div>
                ) : (
                  activeJobs.map((job) => (
                    <DropdownMenuItem 
                      key={`job-${job.job_id}`} 
                      onClick={() => router.push(`/adhoc-coverage?tab=activity${job.repository ? `&repo=${encodeURIComponent(job.repository)}` : ''}`)}
                      className="p-3 cursor-pointer"
                    >
                      <div className="flex items-center w-full text-left">
                        <div className="flex-1">
                          <div className="font-medium text-orange-700">
                            Coverage Scan
                          </div>
                          <div className="text-sm text-orange-500">
                            {job.repository?.split('/').pop()}
                          </div>
                        </div>
                        <Loader2 className="h-4 w-4 text-orange-500 animate-spin ml-2" />
                      </div>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {!loading && userProfile && userProfile.avatar_url ? (
              <div
                className="relative h-10 w-10 cursor-pointer"
                onClick={() => router.push('/settings')}
                title="Profile / Settings"
              >
                <Image 
                  src={userProfile.avatar_url} 
                  alt="Profile"
                  fill
                  className="rounded-full border-2 border-[#fb923c] object-cover"
                />
              </div>
            ) : (
              <UserCircle
                size={40}
                className="text-gray-400 cursor-pointer"
                onClick={() => router.push('/settings')}
              >
              </UserCircle>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-x-hidden overflow-y-auto p-6 bg-[#f8fafc]">
          <div className="bg-white rounded-xl shadow p-6 min-h-full">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PageSkeleton;