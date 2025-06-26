'use client';

import React from 'react';
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
  if (!data || data.length === 0) {
    return (
      <div className="flex justify-center items-center h-[300px] bg-[#1F2B39] rounded-lg border border-gray-700 p-4">
        <p className="text-gray-400">No historical data available</p>
      </div>
    );
  }

  const formattedData = data.map(item => ({
    ...item,
    formattedDate: new Date(item.date).toLocaleDateString()
  }));

  return (
    <div className="bg-[#1F2B39] rounded-lg border border-gray-700 p-4">
      <h3 className="text-lg font-medium text-gray-300 mb-4">Coverage History</h3>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={formattedData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis 
            dataKey="formattedDate"
            stroke="#888"
            tick={{ fill: '#888', fontSize: 12 }}
          />
          <YAxis 
            stroke="#888"
            domain={[0, 100]}
            tick={{ fill: '#888', fontSize: 12 }}
            tickFormatter={(value) => `${value}%`}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#263544', borderColor: '#444', color: '#fff' }}
            formatter={(value) => [`${value}%`, 'Coverage']}
            labelFormatter={(label) => `Date: ${label}`}
          />
          <Line 
            type="monotone" 
            dataKey="coverage" 
            stroke="#FF7D2D" 
            strokeWidth={2}
            dot={{ fill: '#FF7D2D', r: 4, strokeWidth: 1, stroke: '#333' }}
            activeDot={{ r: 6, fill: '#FF7D2D', stroke: '#fff' }}
            animationDuration={1500}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default CoverageHistoryChart;
