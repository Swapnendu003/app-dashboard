'use client';

import React from 'react';
import { signOut } from '@/services/auth';

interface LogoutButtonProps {
  className?: string;
  children?: React.ReactNode;
}

const LogoutButton: React.FC<LogoutButtonProps> = ({ 
  className = "text-white hover:text-gray-300", 
  children 
}) => {
  const handleLogout = () => {
    signOut();
  };

  return (
    <button 
      onClick={handleLogout}
      className={className}
    >
      {children || 'Sign Out'}
    </button>
  );
};

export default LogoutButton;
