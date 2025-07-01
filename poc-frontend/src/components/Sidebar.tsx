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
    <div className={`${sidebarCollapsed ? 'w-14' : 'w-56'} fixed top-0 left-0 h-screen bg-white text-gray-900 shadow-lg border-r border-gray-200 transition-all duration-300 ease-in-out z-10`}>
      <div className="flex items-center justify-between p-3">
        {!sidebarCollapsed && (
          <div className="flex justify-center w-full">
            <img
              src="https://camo.githubusercontent.com/74cbc79070c04e7077cfd86981c110678fe434e9269ea8f52eafb37b781cfb4a/68747470733a2f2f646f63732e6b65706c6f792e696f2f696d672f6b65706c6f792d6c6f676f2d6461726b2e7376673f733d32303026763d34"
              alt="Keploy Logo"
              className="h-8 object-contain"
            />
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1 rounded-md hover:bg-orange-50 hover:text-orange-600 transition-colors duration-200"
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
          className={`p-2 rounded-md transition-all duration-300 cursor-pointer flex ${sidebarCollapsed ? 'justify-center' : 'items-center'} ${activeTab === 'metrics' ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-md' : 'hover:bg-orange-50 hover:text-orange-600'}`}
          onClick={() => handleTabChange('metrics')}
        >
          <BarChart2 size={16} className={`${sidebarCollapsed ? '' : 'mr-2'} ${activeTab === 'metrics' ? 'text-white' : 'text-orange-500'}`} />
          {!sidebarCollapsed && <span className="text-sm">{activeTab === 'metrics' ? <span className="font-semibold">Metrics</span> : 'Metrics'}</span>}
        </li>
        <li
          className={`p-2 rounded-md transition-all duration-300 cursor-pointer flex ${sidebarCollapsed ? 'justify-center' : 'items-center'} ${activeTab === 'repositories' ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-md' : 'hover:bg-orange-50 hover:text-orange-600'}`}
          onClick={() => handleTabChange('repositories')}
        >
          <GitBranch size={16} className={`${sidebarCollapsed ? '' : 'mr-2'} ${activeTab === 'repositories' ? 'text-white' : 'text-orange-500'}`} />
          {!sidebarCollapsed && <span className="text-sm">{activeTab === 'repositories' ? <span className="font-semibold">Repositories</span> : 'Repositories'}</span>}
        </li>
        <li
          className={`p-2 rounded-md transition-all duration-300 cursor-pointer flex ${sidebarCollapsed ? 'justify-center' : 'items-center'} ${activeTab === 'tests' ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-md' : 'hover:bg-orange-50 hover:text-orange-600'}`}
          onClick={() => handleTabChange('tests')}
        >
          <ClipboardCheck size={16} className={`${sidebarCollapsed ? '' : 'mr-2'} ${activeTab === 'tests' ? 'text-white' : 'text-orange-500'}`} />
          {!sidebarCollapsed && <span className="text-sm">{activeTab === 'tests' ? <span className="font-semibold">API Tests</span> : 'API Tests'}</span>}
        </li>
        <li
          className={`p-2 rounded-md transition-all duration-300 cursor-pointer flex ${sidebarCollapsed ? 'justify-center' : 'items-center'} ${activeTab === 'settings' ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-md' : 'hover:bg-orange-50 hover:text-orange-600'}`}
          onClick={() => handleTabChange('settings')}
        >
          <Settings size={16} className={`${sidebarCollapsed ? '' : 'mr-2'} ${activeTab === 'settings' ? 'text-white' : 'text-orange-500'}`} />
          {!sidebarCollapsed && <span className="text-sm">{activeTab === 'settings' ? <span className="font-semibold">Settings</span> : 'Settings'}</span>}
        </li>
      </ul>

      <div className={`absolute bottom-4 w-full px-3 ${sidebarCollapsed ? 'text-center' : ''}`}>
        <LogoutButton 
          className={`flex items-center p-2 rounded-md bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-red-500 hover:to-orange-500 w-full transition-all duration-300 ${sidebarCollapsed ? 'justify-center' : ''}`}
        >
          <LogOut size={16} className={`${sidebarCollapsed ? '' : 'mr-2'}`} />
          {!sidebarCollapsed && <span className="text-sm">Sign Out</span>}
        </LogoutButton>
      </div>
    </div>
  );
};

export default Sidebar;
