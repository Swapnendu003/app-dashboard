import React, { useState } from 'react';
import { Line, Bar, Doughnut, Pie } from 'react-chartjs-2';
import { 
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler 
} from 'chart.js';
import { DashboardWidgetType as DashboardWidgetType, MetricsData, TimeSeriesDataPoint, Repository, TestResult } from '@/types/dashboardTypes';

ChartJS.register(
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  BarElement,
  ArcElement,
  Title, 
  Tooltip, 
  Legend, 
  Filler
);

interface DashboardWidgetProps {
  widget: DashboardWidgetType;
  repositories: Repository[];
  timeSeriesData: TimeSeriesDataPoint[];
  metricsData: MetricsData | null;
  isEditMode: boolean;
  onRemove: () => void;
  onEdit: () => void;
  onSettingsChange: (settings: any) => void;
  selectedRepository: string | null;
  repositoryTests: TestResult[];
  testStatusCounts: {[key: string]: number};
  timePeriod: '24h' | '7d' | '30d' | '90d';

}

const DashboardWidget: React.FC<DashboardWidgetProps> = ({
  widget,
  repositories,
  timeSeriesData,
  metricsData,
  isEditMode,
  onRemove,
  onEdit,
  onSettingsChange,
  selectedRepository,
  repositoryTests,
  testStatusCounts,
  timePeriod,

}) => {
  const [showSettings, setShowSettings] = useState<boolean>(false);
  
  const renderWidgetContent = () => {
    switch (widget.type) {
      case 'chart':
        return renderChart();
      case 'card':
        return renderCard();
      case 'table':
        return renderTable();
      default:
        return <div>Unknown widget type</div>;
    }
  };
  
  const renderChart = () => {
    const chartSubtype = widget.settings?.chartType || 'line';
    
    switch (chartSubtype) {
      case 'line':
        return renderLineChart();
      case 'bar':
        return renderBarChart();
      case 'pie':
        return renderPieChart();
      case 'doughnut':
        return renderDoughnutChart();
      case 'gauge':
        return renderGaugeChart();
      default:
        return renderLineChart();
    }
  };
  
  const renderLineChart = () => {
    // Similar to your existing chart data preparation functions
    const data = prepareChartData();
    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top' as const,
          display: widget.settings?.showLegend !== false,
        },
        title: {
          display: true,
          text: widget.title,
          color: '#f8fafc',
          font: {
            size: 13
          }
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(156, 163, 175, 0.1)'
          },
          ticks: {
            color: '#cbd5e1'
          }
        },
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: '#cbd5e1'
          }
        }
      }
    };
    
    return (
      <div className="h-full w-full p-2">
        <Line data={data} options={options} />
      </div>
    );
  };
  
  const renderBarChart = () => {
    // Generate data for bar chart
    const data = {
      labels: ['Passed', 'Failed', 'Skipped', 'Error'],
      datasets: [
        {
          label: 'Test Results',
          data: [
            testStatusCounts.passed || 0,
            testStatusCounts.failed || 0,
            testStatusCounts.skipped || 0,
            testStatusCounts.error || 0
          ],
          backgroundColor: [
            'rgba(34, 197, 94, 0.6)',
            'rgba(239, 68, 68, 0.6)',
            'rgba(250, 204, 21, 0.6)',
            'rgba(156, 163, 175, 0.6)'
          ],
          borderColor: [
            'rgb(34, 197, 94)',
            'rgb(239, 68, 68)',
            'rgb(250, 204, 21)',
            'rgb(156, 163, 175)'
          ],
          borderWidth: 1
        }
      ]
    };
    
    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top' as const,
          display: widget.settings?.showLegend !== false,
        },
        title: {
          display: true,
          text: widget.title,
          color: '#f8fafc',
          font: {
            size: 13
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(156, 163, 175, 0.1)'
          },
          ticks: {
            color: '#cbd5e1'
          }
        },
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: '#cbd5e1'
          }
        }
      }
    };
    
    return (
      <div className="h-full w-full p-2">
        <Bar data={data} options={options} />
      </div>
    );
  };
  
  const renderPieChart = () => {
    // Generate data for pie chart
    const data = {
      labels: ['Passed', 'Failed', 'Skipped', 'Error'],
      datasets: [
        {
          data: [
            testStatusCounts.passed || 0,
            testStatusCounts.failed || 0,
            testStatusCounts.skipped || 0,
            testStatusCounts.error || 0
          ],
          backgroundColor: [
            'rgba(34, 197, 94, 0.6)',
            'rgba(239, 68, 68, 0.6)',
            'rgba(250, 204, 21, 0.6)',
            'rgba(156, 163, 175, 0.6)'
          ],
          borderColor: [
            'rgb(34, 197, 94)',
            'rgb(239, 68, 68)',
            'rgb(250, 204, 21)',
            'rgb(156, 163, 175)'
          ],
          borderWidth: 1
        }
      ]
    };
    
    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right' as const,
          display: widget.settings?.showLegend !== false,
          labels: {
            color: '#cbd5e1'
          }
        },
        title: {
          display: true,
          text: widget.title,
          color: '#f8fafc',
          font: {
            size: 13
          }
        }
      }
    };
    
    return (
      <div className="h-full w-full p-2">
        <Pie data={data} options={options} />
      </div>
    );
  };
  
  const renderDoughnutChart = () => {

    const data = {
      labels: ['Passed', 'Failed', 'Skipped', 'Error'],
      datasets: [
        {
          data: [
            testStatusCounts.passed || 0,
            testStatusCounts.failed || 0,
            testStatusCounts.skipped || 0,
            testStatusCounts.error || 0
          ],
          backgroundColor: [
            'rgba(34, 197, 94, 0.6)',
            'rgba(239, 68, 68, 0.6)',
            'rgba(250, 204, 21, 0.6)',
            'rgba(156, 163, 175, 0.6)'
          ],
          borderColor: [
            'rgb(34, 197, 94)',
            'rgb(239, 68, 68)',
            'rgb(250, 204, 21)',
            'rgb(156, 163, 175)'
          ],
          borderWidth: 1
        }
      ]
    };
    
    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right' as const,
          display: widget.settings?.showLegend !== false,
          labels: {
            color: '#cbd5e1'
          }
        },
        title: {
          display: true,
          text: widget.title,
          color: '#f8fafc',
          font: {
            size: 13
          }
        }
      }
    };
    
    return (
      <div className="h-full w-full p-2">
        <Doughnut data={data} options={options} />
      </div>
    );
  };
  
  const renderGaugeChart = () => {
    // A simple gauge visualization using CSS
    const metric = widget.settings?.metric || 'passRate';
    const value = metricsData ? metricsData[metric as keyof MetricsData] || 0 : 0;
    const min = widget.settings?.min || 0;
    const max = widget.settings?.max || 100;
    const percentage = Math.min(100, Math.max(0, (((Number(value) || 0) - (Number(min) || 0)) / ((Number(max) || 1) - (Number(min) || 0))) * 100));
    
    let color = '#f97316'; // Default orange
    if (percentage > 80) {
      color = '#22c55e'; // Green
    } else if (percentage > 60) {
      color = '#eab308'; // Yellow
    } else if (percentage < 40) {
      color = '#ef4444'; // Red
    }
    
    return (
      <div className="h-full w-full flex flex-col items-center justify-center p-3">
        <h3 className="text-sm font-semibold text-white mb-2">{widget.title}</h3>
        <div className="w-full flex justify-center">
          <div className="relative h-32 w-32">
            <div 
              className="absolute inset-0 rounded-full border-8 border-gray-700"
              style={{ clipPath: 'polygon(50% 50%, 0% 0%, 100% 0%)' }}
            ></div>
            <div 
              className="absolute inset-0 rounded-full border-8 transition-all duration-500"
              style={{ 
                borderColor: color,
                clipPath: `polygon(50% 50%, 0% 0%, ${percentage}% 0%)`,
              }}
            ></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-bold" style={{ color }}>{typeof value === 'number' ? value : JSON.stringify(value)}</span>
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-300 mt-2">{widget.settings?.label || metric}</p>
      </div>
    );
  };
  
  const renderCard = () => {
    const metric = widget.settings?.metric || 'passRate';
    const value = metricsData ? metricsData[metric as keyof MetricsData] || 0 : 0;
    const label = widget.settings?.label || metric;
    const showTrend = widget.settings?.showTrend !== false;
    
    // Calculate trend (simplified)
    let trend = "+0%";
    if (showTrend && timeSeriesData && timeSeriesData.length >= 2) {
      const latest = timeSeriesData[timeSeriesData.length - 1];
      const previous = timeSeriesData[timeSeriesData.length - 2];
      
      if (latest && previous) {
        if (metric === 'passRate') {
          const latestValue = latest.passed / (latest.total || 1) * 100;
          const previousValue = previous.passed / (previous.total || 1) * 100;
          const diff = latestValue - previousValue;
          trend = diff >= 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`;
        }
      }
    }
    
    return (
      <div className="h-full w-full p-3 bg-gray-900 rounded-md shadow flex flex-col justify-between">
        <h3 className="text-sm font-semibold text-gray-300">{widget.title}</h3>
        <div className="mt-2">
          <p className="text-2xl font-bold text-[#f97316]">
            {typeof value === 'number' ? value : JSON.stringify(value)}
            {metric === 'passRate' && typeof value === 'number' ? '%' : ''}
          </p>
          {showTrend && (
            <div className="mt-1 text-xs text-gray-400">{trend} from previous</div>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-auto">{label}</p>
      </div>
    );
  };
  
  const renderTable = () => {
    const pageSize = widget.settings?.pageSize || 5;
    const showPagination = widget.settings?.showPagination !== false;
    const sortable = widget.settings?.sortable !== false;
    
    return (
      <div className="h-full w-full p-2 overflow-auto">
        <h3 className="text-sm font-semibold text-white mb-2">{widget.title}</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700 border border-gray-700 text-xs">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Name</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Duration</th>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {repositoryTests.slice(0, pageSize).map((test, index) => (
                <tr key={index} className="hover:bg-gray-700">
                  <td className="px-3 py-2 whitespace-nowrap text-xs font-medium text-gray-300">{test.name}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                      ${test.status === 'passed' ? 'bg-green-100 text-green-800' : 
                        test.status === 'failed' ? 'bg-red-100 text-red-800' : 
                        test.status === 'skipped' ? 'bg-yellow-100 text-yellow-800' : 
                        'bg-gray-100 text-gray-800'}`}>
                      {test.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-400">{test.duration} ms</td>
                </tr>
              ))}
              {repositoryTests.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-center text-xs text-gray-400">
                    No test results found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {showPagination && repositoryTests.length > pageSize && (
          <div className="mt-2 flex justify-end">
            <button className="text-xs text-gray-400 hover:text-white">
              View More
            </button>
          </div>
        )}
      </div>
    );
  };
  
  const prepareChartData = () => {
    if (!timeSeriesData || timeSeriesData.length === 0) {
      return {
        labels: [],
        datasets: []
      };
    }

    const labels = timeSeriesData.map(item => {
      const date = new Date(item.date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    
    const datasets = [];
    const showPassed = widget.settings?.showPassed !== false;
    const showFailed = widget.settings?.showFailed !== false;
    const showSkipped = widget.settings?.showSkipped !== false;
    const showError = widget.settings?.showError !== false;
    const fillArea = widget.settings?.fillArea === true;
    
    if (showPassed) {
      datasets.push({
        label: 'Passed',
        data: timeSeriesData.map(item => item.passed || 0),
        borderColor: 'rgb(34, 197, 94)',
        backgroundColor: 'rgba(34, 197, 94, 0.5)',
        tension: 0.2,
        fill: fillArea
      });
    }
    
    if (showFailed) {
      datasets.push({
        label: 'Failed',
        data: timeSeriesData.map(item => item.failed || 0),
        borderColor: 'rgb(239, 68, 68)',
        backgroundColor: 'rgba(239, 68, 68, 0.5)',
        tension: 0.2,
        fill: fillArea
      });
    }
    
    if (showSkipped) {
      datasets.push({
        label: 'Skipped',
        data: timeSeriesData.map(item => item.skipped || 0),
        borderColor: 'rgb(250, 204, 21)',
        backgroundColor: 'rgba(250, 204, 21, 0.5)',
        tension: 0.2,
        fill: fillArea
      });
    }
    
    if (showError) {
      datasets.push({
        label: 'Error',
        data: timeSeriesData.map(item => item.error || 0),
        borderColor: 'rgb(156, 163, 175)',
        backgroundColor: 'rgba(156, 163, 175, 0.5)',
        tension: 0.2,
        fill: fillArea
      });
    }
    
    return { labels, datasets };
  };
  
  const renderWidgetSettings = () => {
    if (!showSettings) return null;
    
    // Different settings for different widget types
    switch (widget.type) {
      case 'chart':
        return renderChartSettings();
      case 'card':
        return renderCardSettings();
      case 'table':
        return renderTableSettings();
      default:
        return null;
    }
  };
  
  const renderChartSettings = () => {
    return (
      <div className="p-2 bg-gray-700 rounded border border-gray-600">
        <h4 className="text-xs font-medium text-gray-300 mb-2">Chart Settings</h4>
        
        <div className="space-y-2">
          <div className="flex items-center">
            <input
              type="checkbox"
              id={`${widget.widgetKey}-show-passed`}
              checked={widget.settings?.showPassed !== false}
              onChange={e => onSettingsChange({ showPassed: e.target.checked })}
              className="mr-2 h-3 w-3"
            />
            <label htmlFor={`${widget.widgetKey}-show-passed`} className="text-xs text-gray-300">Show Passed</label>
          </div>
          
          <div className="flex items-center">
            <input
              type="checkbox"
              id={`${widget.widgetKey}-show-failed`}
              checked={widget.settings?.showFailed !== false}
              onChange={e => onSettingsChange({ showFailed: e.target.checked })}
              className="mr-2 h-3 w-3"
            />
            <label htmlFor={`${widget.widgetKey}-show-failed`} className="text-xs text-gray-300">Show Failed</label>
          </div>
          
          <div className="flex items-center">
            <input
              type="checkbox"
              id={`${widget.widgetKey}-fill-area`}
              checked={widget.settings?.fillArea === true}
              onChange={e => onSettingsChange({ fillArea: e.target.checked })}
              className="mr-2 h-3 w-3"
            />
            <label htmlFor={`${widget.widgetKey}-fill-area`} className="text-xs text-gray-300">Fill Area</label>
          </div>
          
          <div className="flex items-center">
            <input
              type="checkbox"
              id={`${widget.widgetKey}-show-legend`}
              checked={widget.settings?.showLegend !== false}
              onChange={e => onSettingsChange({ showLegend: e.target.checked })}
              className="mr-2 h-3 w-3"
            />
            <label htmlFor={`${widget.widgetKey}-show-legend`} className="text-xs text-gray-300">Show Legend</label>
          </div>
        </div>
      </div>
    );
  };
  
  const renderCardSettings = () => {
    return (
      <div className="p-2 bg-gray-700 rounded border border-gray-600">
        <h4 className="text-xs font-medium text-gray-300 mb-2">Card Settings</h4>
        
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-300 mb-1">Metric</label>
            <select
              value={widget.settings?.metric || 'passRate'}
              onChange={e => onSettingsChange({ metric: e.target.value })}
              className="w-full p-1 border border-gray-600 rounded bg-gray-600 text-white text-xs"
            >
              <option value="passRate">Pass Rate</option>
              <option value="totalTests">Total Tests</option>
              <option value="averageDuration">Avg Duration</option>
            </select>
          </div>
          
          <div className="flex items-center">
            <input
              type="checkbox"
              id={`${widget.widgetKey}-show-trend`}
              checked={widget.settings?.showTrend !== false}
              onChange={e => onSettingsChange({ showTrend: e.target.checked })}
              className="mr-2 h-3 w-3"
            />
            <label htmlFor={`${widget.widgetKey}-show-trend`} className="text-xs text-gray-300">Show Trend</label>
          </div>
        </div>
      </div>
    );
  };
  
  const renderTableSettings = () => {
    return (
      <div className="p-2 bg-gray-700 rounded border border-gray-600">
        <h4 className="text-xs font-medium text-gray-300 mb-2">Table Settings</h4>
        
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-300 mb-1">Page Size</label>
            <select
              value={widget.settings?.pageSize || 5}
              onChange={e => onSettingsChange({ pageSize: parseInt(e.target.value) })}
              className="w-full p-1 border border-gray-600 rounded bg-gray-600 text-white text-xs"
            >
              <option value="5">5 rows</option>
              <option value="10">10 rows</option>
              <option value="15">15 rows</option>
            </select>
          </div>
          
          <div className="flex items-center">
            <input
              type="checkbox"
              id={`${widget.widgetKey}-show-pagination`}
              checked={widget.settings?.showPagination !== false}
              onChange={e => onSettingsChange({ showPagination: e.target.checked })}
              className="mr-2 h-3 w-3"
            />
            <label htmlFor={`${widget.widgetKey}-show-pagination`} className="text-xs text-gray-300">Show Pagination</label>
          </div>
        </div>
      </div>
    );
  };
  
  return (
    <div className={   'bg-white text-black'}>
      {isEditMode && (
        <div className="p-1 bg-gray-700 flex justify-between items-center border-b border-gray-600">
          <div className="flex items-center">
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className="text-xs text-gray-300 hover:text-white p-1"
              title="Widget Settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
          <div className="text-xs font-medium text-gray-300 truncate px-1">{widget.title}</div>
          <div className="flex items-center">
            <button 
              onClick={onEdit}
              className="text-xs text-gray-300 hover:text-white p-1"
              title="Edit Widget"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button 
              onClick={onRemove}
              className="text-xs text-red-400 hover:text-red-600 p-1"
              title="Remove Widget"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      )}
      
      {showSettings && isEditMode && renderWidgetSettings()}
      
      <div className="flex-1 overflow-hidden">
        {renderWidgetContent()}
      </div>
    </div>
  );
};

export default DashboardWidget;
