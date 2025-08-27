import React from "react";
import {
  ChevronsLeft,
  ChevronsRight,
  BarChart2,
  GitBranch,
  ClipboardCheck,
  Settings,
  LogOut,
  History,
} from "lucide-react";
import LogoutButton from "./LogoutButton";

type TabKey = "metrics" | "repositories" | "tests" | "settings" | "history";

type SidebarProps = {
  sidebarCollapsed: boolean;
  activeTab: TabKey;
  toggleSidebar: () => void;
  handleTabChange: (tab: TabKey) => void;
};

const NavItem: React.FC<{
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  collapsed: boolean;
  onClick: () => void;
}> = ({ label, icon, isActive, collapsed, onClick }) => {
  return (
    <li
      onClick={onClick}
      className={[
        "group relative cursor-pointer",
        "flex items-center",
        collapsed ? "justify-center px-0" : "px-2",
        "py-2 rounded-md",
        "transition-colors duration-200",
        "hover:bg-orange-50",
        isActive ? "text-orange-600" : "text-gray-700 hover:text-orange-600",
      ].join(" ")}
    >
  
      <span
        className={[
          "absolute left-2 right-2 -bottom-0.5 h-0.5",
          isActive ? "bg-orange-500" : "bg-transparent",
          "rounded-full",
          collapsed ? "left-1 right-1" : "",
        ].join(" ")}
        aria-hidden="true"
      />
      <span
        className={[
          "shrink-0",
          collapsed ? "" : "mr-2",
          isActive ? "text-orange-600" : "text-orange-500 group-hover:text-orange-600",
        ].join(" ")}
      >
        {icon}
      </span>
      {!collapsed && (
        <span className={isActive ? "font-medium" : ""}>{label}</span>
      )}
    </li>
  );
};

const Sidebar: React.FC<SidebarProps> = ({
  sidebarCollapsed,
  activeTab,
  toggleSidebar,
  handleTabChange,
}) => {
  return (
    <div
      className={[
        sidebarCollapsed ? "w-14" : "w-56",
        "fixed top-0 left-0 h-screen bg-white text-gray-900",
        "shadow-lg border-r border-gray-200",
        "transition-all duration-300 ease-in-out z-10",
      ].join(" ")}
    >
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
          className="p-1 rounded-md hover:bg-orange-50 hover:text-orange-600 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? <ChevronsRight size={20} /> : <ChevronsLeft size={20} />}
        </button>
      </div>

      <ul className={`mt-4 space-y-1 ${sidebarCollapsed ? "px-1" : "px-2"}`}>
        <NavItem
          label="Metrics"
          icon={<BarChart2 size={18} />}
          isActive={activeTab === "metrics"}
          collapsed={sidebarCollapsed}
          onClick={() => handleTabChange("metrics")}
        />
        <NavItem
          label="Repositories"
          icon={<GitBranch size={18} />}
          isActive={activeTab === "repositories"}
          collapsed={sidebarCollapsed}
          onClick={() => handleTabChange("repositories")}
        />
        <NavItem
          label="Scan Coverage"
          icon={<ClipboardCheck size={18} />}
          isActive={activeTab === "tests"}
          collapsed={sidebarCollapsed}
          onClick={() => handleTabChange("tests")}
        />
        <NavItem
          label="History"
          icon={<History size={18} />}
          isActive={activeTab === "history"}
          collapsed={sidebarCollapsed}
          onClick={() => handleTabChange("history")}
        />
        <NavItem
          label="Settings"
          icon={<Settings size={18} />}
          isActive={activeTab === "settings"}
          collapsed={sidebarCollapsed}
          onClick={() => handleTabChange("settings")}
        />
      </ul>

      <div className={`absolute bottom-4 w-full ${sidebarCollapsed ? "px-1 text-center" : "px-3"}`}>
        <LogoutButton
          className={[
            "flex items-center justify-center w-full",
            "p-2 rounded-md",
            "bg-gray-100 hover:bg-gray-200 text-gray-800",
            "transition-colors duration-200",
          ].join(" ")}
        >
          <LogOut size={16} className={`${sidebarCollapsed ? "" : "mr-2"}`} />
          {!sidebarCollapsed && <span className="text-sm">Sign Out</span>}
        </LogoutButton>
      </div>
    </div>
  );
};

export default Sidebar;
