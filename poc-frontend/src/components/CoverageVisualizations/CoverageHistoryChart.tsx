'use client';

import React, { useMemo } from 'react';
import { CoverageTrend } from '@/types/coverage';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface CoverageHistoryChartProps {
  data: CoverageTrend[];
  height?: number;
}

const CoverageHistoryChart: React.FC<CoverageHistoryChartProps> = ({ 
  data,
  height = 300
}) => {
  // Color palette for different branches
  const branchColors = [
    '#FF7D2D', // Orange
    '#3B82F6', // Blue
    '#10B981', // Green
    '#F59E0B', // Amber
    '#EF4444', // Red
    '#8B5CF6', // Purple
    '#06B6D4', // Cyan
    '#F97316', // Orange variant
    '#84CC16', // Lime
    '#EC4899', // Pink
  ];

  const processedData = useMemo(() => {
    if (!data || data.length === 0) return { chartData: [], branches: [] };

    const branches = [...new Set(data.map(item => item.branch))];
  
    const dataByDate = data.reduce((acc, item) => {
      const dateKey = item.date;
      if (!acc[dateKey]) {
        acc[dateKey] = {
          date: dateKey,
          formattedDate: new Date(item.date).toLocaleDateString()
        };
      }
      if (item.branch) {
        acc[dateKey][item.branch] = item.coverage;
      }
      return acc;
    }, {} as Record<string, { date: string; formattedDate: string; [key: string]: any }>);

    const chartData = Object.values(dataByDate).sort((a: any, b: any) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    return { chartData, branches };
  }, [data]);

  if (!data || data.length === 0) {
    return (
      <div className="flex justify-center items-center h-[300px] bg-white rounded-lg border border-orange-100 p-4">
        <p className="text-orange-400">No historical data available</p>
      </div>
    );
  }

  const customTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg">
          <p className="text-gray-600 text-sm mb-2">{`Date: ${label}`}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="text-sm font-medium">
              {`${entry.dataKey}: ${entry.value}%`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-lg border border-orange-100 p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-orange-700">Coverage History</h3>
        
        {/* Legend */}
        <div className="flex flex-wrap gap-3">
          {processedData.branches.map((branch, index) => (
            <div key={branch} className="flex items-center gap-1">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: branchColors[index % branchColors.length] }}
              />
              <span className="text-sm text-gray-600 font-medium">{branch}</span>
            </div>
          ))}
        </div>
      </div>
      
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={processedData.chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f3f3" />
          <XAxis 
            dataKey="formattedDate"
            stroke="#FFA366"
            tick={{ fill: '#FFA366', fontSize: 12 }}
          />
          <YAxis 
            stroke="#FFA366"
            domain={[0, 100]}
            tick={{ fill: '#FFA366', fontSize: 12 }}
            tickFormatter={(value) => `${value}%`}
          />
          <Tooltip content={customTooltip} />
          
          {/* Render a line for each branch */}
          {processedData.branches.map((branch, index) => (
            <Line
              key={branch}
              type="monotone"
              dataKey={branch}
              stroke={branchColors[index % branchColors.length]}
              strokeWidth={2}
              dot={{ 
                fill: branchColors[index % branchColors.length], 
                r: 4, 
                strokeWidth: 1, 
                stroke: '#fff' 
              }}
              activeDot={{ 
                r: 6, 
                fill: branchColors[index % branchColors.length], 
                stroke: '#fff',
                strokeWidth: 2
              }}
              animationDuration={1500}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default CoverageHistoryChart;