export interface Repository {
  id: string;
  name: string;
  fullName?: string;
  full_name?: string; 
  description: string;
  url: string;
  html_url: string;
  owner: string;
  githubId?: number;
  github_id?: number; 
  private: boolean;
  status: string;
  created_at: string;
  updated_at: string;
  languages?: Record<string, number>; 
}
