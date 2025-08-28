import React from 'react';
import { FileDiff } from '@/types/coverage';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, PieChart, Pie, Legend, Sector } from 'recharts';
import { Info } from 'lucide-react';
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FileCoverageAnalyticsProps {
  fileDiffs: FileDiff[];
  branch1: string;
  branch2: string;
}

export const FileCoverageAnalytics: React.FC<FileCoverageAnalyticsProps> = ({
  fileDiffs,
  branch1,
  branch2,
}) => {
  // Calculate distribution ranges
  const getDistributionData = (coverage: number[]) => {
    const ranges = [
      { range: '0-20%', count: 0 },
      { range: '21-40%', count: 0 },
      { range: '41-60%', count: 0 },
      { range: '61-80%', count: 0 },
      { range: '81-100%', count: 0 },
    ];

    coverage.forEach(value => {
      if (value <= 20) ranges[0].count++;
      else if (value <= 40) ranges[1].count++;
      else if (value <= 60) ranges[2].count++;
      else if (value <= 80) ranges[3].count++;
      else ranges[4].count++;
    });

    return ranges;
  };

  const branch1Distribution = getDistributionData(fileDiffs.map(d => d.branch1));
  const branch2Distribution = getDistributionData(fileDiffs.map(d => d.branch2));

  // Calculate impact categories
  const impactData = [
    { name: 'Improved', value: fileDiffs.filter(d => d.diff > 0).length },
    { name: 'Declined', value: fileDiffs.filter(d => d.diff < 0).length },
    { name: 'Unchanged', value: fileDiffs.filter(d => d.diff === 0).length },
  ];

  const COLORS = ['#22c55e', '#ef4444', '#f97316'];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-2 border border-orange-200 rounded shadow-lg">
          <p className="text-sm font-medium">{`Coverage Range: ${label}`}</p>
          <p className="text-sm text-orange-600">{`${branch1}: ${payload[0].value} files`}</p>
          <p className="text-sm text-orange-600">{`${branch2}: ${payload[1].value} files`}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
      <div className="bg-white p-4 rounded-lg border border-orange-100">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-lg font-semibold text-orange-700">Coverage Distribution</h3>
          <TooltipProvider>
            <UITooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-orange-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">
                  This bar chart shows how files are distributed across coverage ranges for both branches.
                  Each bar represents the number of files in a coverage range for each branch.
                  Hover over bars to see exact counts.
                </p>
              </TooltipContent>
            </UITooltip>
          </TooltipProvider>
        </div>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={branch1Distribution}
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="range" />
              <YAxis />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="count" name={branch1} fill="#f97316" />
              <Bar dataKey="count" name={branch2} fill="#fb923c" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg border border-orange-100">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-lg font-semibold mb-0 text-orange-700">Coverage Impact</h3>
          <TooltipProvider>
            <UITooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-orange-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">
                  This pie chart shows the impact of coverage changes between branches.
                  "Improved" means coverage increased, "Declined" means coverage decreased, and "Unchanged" means no change.
                  Hover over slices to see exact counts.
                </p>
              </TooltipContent>
            </UITooltip>
          </TooltipProvider>
        </div>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={impactData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                fill="#8884d8"
                paddingAngle={5}
                dataKey="value"
                label={({
                  cx,
                  cy,
                  midAngle,
                  innerRadius,
                  outerRadius,
                  value,
                  index
                }) => {
                  const RADIAN = Math.PI / 180;
                  const radius = 25 + innerRadius + (outerRadius - innerRadius);
                  const x = cx + radius * Math.cos(-midAngle * RADIAN);
                  const y = cy + radius * Math.sin(-midAngle * RADIAN);

                  return (
                    <text
                      x={x}
                      y={y}
                      fill={COLORS[index % COLORS.length]}
                      textAnchor={x > cx ? 'start' : 'end'}
                      dominantBaseline="central"
                      className="text-sm"
                    >
                      {impactData[index].name} ({value})
                    </text>
                  );
                }}
              >
                {impactData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default FileCoverageAnalytics;
