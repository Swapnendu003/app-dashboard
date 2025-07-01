import React from 'react';
import { ChevronsLeft, ChevronsRight, BarChart2, GitBranch, ClipboardCheck, Settings, LogOut } from 'lucide-react';
import LogoutButton from './LogoutButton';

type SidebarProps = {
  sidebarCollapsed: boolean;
  activeTab: 'metrics' | 'repositories' | 'tests' | 'settings';
  toggleSidebar: () => void;
  handleTabChange: (tab: 'metrics' | 'repositories' | 'tests' | 'settings') => void;
};

const Sidebar: React.FC<SidebarProps> = ({ sidebarCollapsed, activeTab, toggleSidebar, handleTabChange }) => {
  return (
    <div className={`${sidebarCollapsed ? 'w-14' : 'w-56'} fixed top-0 left-0 h-screen bg-gradient-to-b from-[#1F2B39] to-[#18273A] text-white shadow-lg rounded-r-lg border-r border-[#FF7D2D]/30 transition-all duration-300 ease-in-out z-10`}>
      <div className="flex items-center justify-between p-3">
        {!sidebarCollapsed && <div className="text-lg font-semibold">Keploy</div>}
        <button
          onClick={toggleSidebar}
          className="p-1 rounded-md hover:bg-[#2C3E50] hover:text-[#FF7D2D] transition-colors duration-200"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? (
            <ChevronsRight size={20} />
          ) : (
            <ChevronsLeft size={20} />
          )}
        </button>
      </div>
      <ul className={`mt-4 space-y-2 px-2 ${sidebarCollapsed ? 'items-center' : ''}`}>
        <li
          className={`hover:bg-[#263544] hover:text-[#FF7D2D] p-2 rounded-md transition-all duration-300 cursor-pointer flex ${sidebarCollapsed ? 'justify-center' : 'items-center'} ${activeTab === 'metrics' ? 'bg-[#263544] text-[#FF7D2D] border-l-4 border-[#FF7D2D] shadow-md' : ''}`}
          onClick={() => handleTabChange('metrics')}
        >
          <BarChart2 size={16} className={`${sidebarCollapsed ? '' : 'mr-2'}`} />
          {!sidebarCollapsed && <span className="text-sm">Metrics</span>}
        </li>
        <li
          className={`hover:bg-[#263544] hover:text-[#FF7D2D] p-2 rounded-md transition-all duration-300 cursor-pointer flex ${sidebarCollapsed ? 'justify-center' : 'items-center'} ${activeTab === 'repositories' ? 'bg-[#263544] text-[#FF7D2D] border-l-4 border-[#FF7D2D] shadow-md' : ''}`}
          onClick={() => handleTabChange('repositories')}
        >
          <GitBranch size={16} className={`${sidebarCollapsed ? '' : 'mr-2'}`} />
          {!sidebarCollapsed && <span className="text-sm">Repositories</span>}
        </li>
        <li
          className={`hover:bg-[#263544] hover:text-[#FF7D2D] p-2 rounded-md transition-all duration-300 cursor-pointer flex ${sidebarCollapsed ? 'justify-center' : 'items-center'} ${activeTab === 'settings' ? 'bg-[#263544] text-[#FF7D2D] border-l-4 border-[#FF7D2D] shadow-md' : ''}`}
          onClick={() => handleTabChange('settings')}
        >
          <Settings size={16} className={`${sidebarCollapsed ? '' : 'mr-2'}`} />
          {!sidebarCollapsed && <span className="text-sm">Settings</span>}
        </li>
      </ul>

      <div className={`absolute bottom-4 w-full px-3 ${sidebarCollapsed ? 'text-center' : ''}`}>
        <LogoutButton 
          className={`flex items-center p-2 rounded-md hover:bg-[#263544] hover:text-[#FF7D2D] w-full transition-all duration-300 ${sidebarCollapsed ? 'justify-center' : ''}`}
        >
          <LogOut size={16} className={`${sidebarCollapsed ? '' : 'mr-2'}`} />
          {!sidebarCollapsed && <span className="text-sm">Sign Out</span>}
        </LogoutButton>
      </div>
    </div>
  );
};

export default Sidebar;
