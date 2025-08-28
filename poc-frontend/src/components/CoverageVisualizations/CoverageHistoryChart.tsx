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
  const branchColors = [
    '#FF7D2D',
    '#3B82F6',
    '#10B981', 
    '#F59E0B',
    '#EF4444',
    '#8B5CF6',
    '#06B6D4',
    '#F97316',
    '#84CC16',
    '#EC4899'
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
      <h3 className="text-lg font-medium text-orange-700 mb-4">Coverage Trend</h3>
      
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

      <div className="mt-6 flex flex-wrap gap-4 justify-center">
        {processedData.branches.map((branch, index) => (
          <div key={branch} className="flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50">
            <div 
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: branchColors[index % branchColors.length] }}
            />
            <span className="text-sm text-gray-700 font-medium">{branch}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CoverageHistoryChart;