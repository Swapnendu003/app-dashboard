'use client';
import React, { useState, useEffect } from "react";
import PageSkeleton from "@/components/PageSkeleton";
import withAuth from "@/components/withAuth";
import { getUserProfile } from "@/services/api";
import { Loader2, Save, AlertCircle, User } from 'lucide-react';
import Image from 'next/image';

const SettingsPage = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    notificationEmail: true,
    notificationSlack: false
  });
  
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        setLoading(true);
        const response = await getUserProfile();
        const userData = response.data.user || {};
        setUser(userData);
        
        // Initialize form with user data
        setFormData({
          displayName: userData.name || '',
          email: userData.email || '',
          notificationEmail: true,
          notificationSlack: false
        });
        
        setError(null);
      } catch (err: any) {
        console.error('Error fetching user profile:', err);
        setError(err.response?.data?.error || 'Failed to fetch user profile');
      } finally {
        setLoading(false);
      }
    };

    fetchUserProfile();
  }, []);

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    // Simulate API call
    setTimeout(() => {
      // In a real application, you would make an API call to update user settings
      setIsSaving(false);
      alert('Settings saved successfully');
    }, 1000);
  };

  return (
    <PageSkeleton title="Settings" subtitle="Manage your account settings">
      {/* Light theme background */}
      <div className="min-h-full bg-gradient-to-br from-orange-50 via-orange-100 to-white text-gray-900 p-4 rounded-lg">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 text-orange-500 animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-red-100 border border-red-300 p-4 rounded-md flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
            <span className="text-red-700">{error}</span>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl mx-auto border border-orange-100">
            {/* Profile Section with Avatar */}
            <div className="flex flex-col items-center sm:flex-row sm:items-start gap-6 mb-8 p-6 bg-orange-50/80 rounded-lg border border-orange-100 hover:border-orange-400 transition-colors">
              <div className="relative h-24 w-24 rounded-full border-4 border-orange-400 overflow-hidden flex-shrink-0">
                {user && user.avatar_url ? (
                  <Image
                    src={user.avatar_url}
                    alt="Profile"
                    fill
                    className="object-cover"
                    unoptimized={true}
                  />
                ) : (
                  <div className="w-full h-full bg-orange-50 flex items-center justify-center">
                    <User size={48} className="text-orange-300" />
                  </div>
                )}
              </div>
              
              <div className="flex flex-col items-center sm:items-start">
                <h2 className="text-xl font-bold text-orange-700">{user?.name || 'User'}</h2>
                <p className="text-orange-400">{user?.email || 'No email available'}</p>
                <div className="mt-2 px-3 py-1 bg-orange-100 text-orange-600 text-xs rounded-full">
                  GitHub User
                </div>
              </div>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-orange-700 border-b border-orange-100 pb-2">Profile Information</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="displayName" className="text-sm text-orange-400">Display Name</label>
                    <input
                      type="text"
                      id="displayName"
                      name="displayName"
                      value={formData.displayName}
                      onChange={handleFormChange}
                      className="w-full px-3 py-2 bg-orange-50 border border-orange-200 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-400 text-orange-900"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="email" className="text-sm text-orange-400">Email Address</label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleFormChange}
                      disabled
                      className="w-full px-3 py-2 bg-orange-50 border border-orange-200 rounded-md text-orange-300"
                    />
                    <p className="text-xs text-orange-300">Email is managed by GitHub</p>
                  </div>
                </div>
              </div>
              
              {/* Notification Preferences */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-orange-700 border-b border-orange-100 pb-2">Notification Preferences</h3>
                <div className="space-y-3">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="notificationEmail"
                      name="notificationEmail"
                      checked={formData.notificationEmail}
                      onChange={handleFormChange}
                      className="h-4 w-4 rounded border-orange-200 bg-orange-50 text-orange-500 focus:ring-orange-400"
                    />
                    <label htmlFor="notificationEmail" className="ml-2 block text-sm text-orange-700">
                      Email Notifications
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="notificationSlack"
                      name="notificationSlack"
                      checked={formData.notificationSlack}
                      onChange={handleFormChange}
                      className="h-4 w-4 rounded border-orange-200 bg-orange-50 text-orange-500 focus:ring-orange-400"
                    />
                    <label htmlFor="notificationSlack" className="ml-2 block text-sm text-orange-700">
                      Slack Notifications
                    </label>
                  </div>
                </div>
              </div>
              
              <div className="pt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-red-500 hover:to-orange-500 text-white font-medium rounded-md transition-colors flex items-center space-x-2 disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </PageSkeleton>
  );
};

export default withAuth(SettingsPage);
