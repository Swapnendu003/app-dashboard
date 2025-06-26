export interface JobStatus {
  id: string;
  job_type: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  start_time: string;
  end_time?: string;
  error?: string;
  repository: string;
  branch?: string;
  result_id?: string;
  progress: number;
}
