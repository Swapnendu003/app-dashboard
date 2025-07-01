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
      <div className="flex justify-center items-center h-[300px] bg-white rounded-lg border border-orange-100 p-4">
        <p className="text-orange-400">No historical data available</p>
      </div>
    );
  }

  const formattedData = data.map(item => ({
    ...item,
    formattedDate: new Date(item.date).toLocaleDateString()
  }));

  return (
    <div className="bg-white rounded-lg border border-orange-100 p-4">
      <h3 className="text-lg font-medium text-orange-700 mb-4">Coverage History</h3>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={formattedData}
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
          <Tooltip 
            contentStyle={{ backgroundColor: '#FFF7ED', borderColor: '#FF7D2D', color: '#FF7D2D' }}
            formatter={(value) => [`${value}%`, 'Coverage']}
            labelFormatter={(label) => `Date: ${label}`}
          />
          <Line 
            type="monotone" 
            dataKey="coverage" 
            stroke="#FF7D2D" 
            strokeWidth={2}
            dot={{ fill: '#FF7D2D', r: 4, strokeWidth: 1, stroke: '#FFA366' }}
            activeDot={{ r: 6, fill: '#FF7D2D', stroke: '#fff' }}
            animationDuration={1500}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default CoverageHistoryChart;
