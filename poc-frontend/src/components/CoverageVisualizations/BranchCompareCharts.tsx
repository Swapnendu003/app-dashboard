import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ScatterChart, Scatter, ZAxis } from 'recharts';
import { FileDiff } from '@/types/coverage';

interface BranchCompareChartsProps {
  branch1: string;
  branch2: string;
  coverage1: number;
  coverage2: number;
  fileDiffs: FileDiff[];
}

export const BranchCompareCharts: React.FC<BranchCompareChartsProps> = ({
  branch1,
  branch2,
  coverage1,
  coverage2,
  fileDiffs,
}) => {
  const coverageData = [
    { name: branch1, coverage: coverage1 },
    { name: branch2, coverage: coverage2 },
  ];

  const scatterData = fileDiffs.map(diff => ({
    x: diff.branch1,
    y: diff.branch2,
    z: Math.abs(diff.diff),
    name: diff.file,
    diff: diff.diff
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-orange-200 rounded shadow-lg">
          <p className="text-sm font-medium text-orange-700">{data.name}</p>
          <p className="text-sm text-orange-600">Coverage: {data.coverage.toFixed(2)}%</p>
        </div>
      );
    }
    return null;
  };

  const ScatterTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-orange-200 rounded shadow-lg">
          <p className="text-sm font-medium text-orange-700 truncate max-w-xs">{data.name}</p>
          <p className="text-sm text-orange-600">{branch1}: {data.x.toFixed(2)}%</p>
          <p className="text-sm text-orange-600">{branch2}: {data.y.toFixed(2)}%</p>
          <p className="text-sm text-orange-600">
            Difference: {data.diff > 0 ? '+' : ''}{data.diff.toFixed(2)}%
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
      <div className="bg-white p-4 rounded-lg border border-orange-100">
        <h3 className="text-lg font-semibold mb-4 text-orange-700">Overall Coverage Comparison</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={coverageData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis domain={[0, 100]} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="coverage" fill="#f97316" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg border border-orange-100">
        <h3 className="text-lg font-semibold mb-4 text-orange-700">File Coverage Distribution</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                type="number" 
                dataKey="x" 
                name={branch1} 
                unit="%" 
                domain={[0, 100]}
                label={{ value: branch1, position: 'bottom' }} 
              />
              <YAxis 
                type="number" 
                dataKey="y" 
                name={branch2} 
                unit="%" 
                domain={[0, 100]}
                label={{ value: branch2, angle: -90, position: 'left' }} 
              />
              <ZAxis type="number" dataKey="z" range={[50, 500]} />
              <Tooltip content={<ScatterTooltip />} />
              <Scatter
                data={scatterData}
                fill="#f97316"
                shape="circle"
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default BranchCompareCharts;
