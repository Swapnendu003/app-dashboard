'use client';
import React from 'react';
import { Tooltip } from 'react-tooltip';

interface DailyActivity {
  date: string;
  count: number;
  level: number;
}

interface ActivityGraphProps {
  activities: DailyActivity[];
  totalCount?: number;
}

const ActivityGraph: React.FC<ActivityGraphProps> = ({ activities, totalCount = 0 }) => {
  const getMonths = () => {
    const months: string[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const month = new Date(now);
      month.setMonth(now.getMonth() - i);
      const monthName = month.toLocaleString('default', { month: 'short' });
      months.push(monthName);
    }
    return months;
  };

  // Group activities by week
  const getWeeksArray = () => {
    // Create a map of all dates in the past year
    const dateMap = new Map<string, DailyActivity>();
    const today = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setDate(today.getDate() - 365);
    
    // Initialize with empty activity (level 0) for all days
    let currentDate = new Date(oneYearAgo);
    while (currentDate <= today) {
      const dateString = currentDate.toISOString().split('T')[0];
      dateMap.set(dateString, { date: dateString, count: 0, level: 0 });
      
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Fill in actual activity data
    activities.forEach(activity => {
      dateMap.set(activity.date, activity);
    });
    
    // Group by week (7 days per row)
    const weeks: DailyActivity[][] = [];
    let week: DailyActivity[] = [];
    
    // Start from Sunday of the week that includes oneYearAgo
    let startDay = new Date(oneYearAgo);
    startDay.setDate(startDay.getDate() - startDay.getDay());
    
    currentDate = new Date(startDay);
    while (currentDate <= today) {
      const dateString = currentDate.toISOString().split('T')[0];
      
      // If it's the start of a new week (Sunday), create a new week array
      if (currentDate.getDay() === 0 && week.length > 0) {
        weeks.push([...week]);
        week = [];
      }
      
      // Add this day's activity to the current week
      if (dateMap.has(dateString)) {
        week.push(dateMap.get(dateString)!);
      } else {
        // If we don't have data for this day, add empty activity
        week.push({ date: dateString, count: 0, level: 0 });
      }
      
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Add the last week if not empty
    if (week.length > 0) {
      weeks.push(week);
    }
    
    return weeks;
  };

  const months = getMonths();
  const weeks = getWeeksArray();
  
  const levelToColor = (level: number): string => {
    switch (level) {
      case 0: return 'bg-[#1F2B39] border border-[#263544]'; // Empty/no activity
      case 1: return 'bg-[#FF7D2D]/20';
      case 2: return 'bg-[#FF7D2D]/40';
      case 3: return 'bg-[#FF7D2D]/70';
      case 4: return 'bg-[#FF7D2D]';
      default: return 'bg-[#1F2B39] border border-[#263544]';
    }
  };
  
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric'
    });
  };

  return (
    <>
      <div className="flex flex-col space-y-1 overflow-x-auto pb-2">
        {/* Month labels row */}
        <div className="flex text-xs text-gray-400 pl-8 mb-1 min-w-[1000px]">
          {months.map((month, index) => (
            <div key={index} className="flex-1 text-center">{month}</div>
          ))}
        </div>
        
        {/* Day of week labels column */}
        <div className="flex min-w-[1000px]">
          <div className="w-8 flex flex-col justify-around text-xs text-gray-400">
            <span>Sun</span>
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
          </div>
          
          {/* Activity grid */}
          <div className="flex-1 grid grid-cols-53 gap-[2px]">
            {weeks.map((week, weekIndex) => (
              <React.Fragment key={weekIndex}>
                {week.map((day, dayIndex) => (
                  <div 
                    key={day.date} 
                    className={`aspect-square w-full ${levelToColor(day.level)} rounded-sm hover:ring-1 hover:ring-[#FF7D2D] cursor-pointer transition-all`}
                    data-tooltip-id="activity-tooltip"
                    data-tooltip-content={`${day.count} ${day.count === 1 ? 'contribution' : 'contributions'} on ${formatDate(day.date)}`}
                  />
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>
        
        {/* Legend */}
        <div className="flex items-center justify-end space-x-2 mt-3 pt-3 border-t border-gray-700">
          <span className="text-xs text-gray-400">Less</span>
          <div className={`w-3 h-3 ${levelToColor(0)} rounded-sm`}></div>
          <div className={`w-3 h-3 ${levelToColor(1)} rounded-sm`}></div>
          <div className={`w-3 h-3 ${levelToColor(2)} rounded-sm`}></div>
          <div className={`w-3 h-3 ${levelToColor(3)} rounded-sm`}></div>
          <div className={`w-3 h-3 ${levelToColor(4)} rounded-sm`}></div>
          <span className="text-xs text-gray-400">More</span>
        </div>
      </div>
      
      <Tooltip id="activity-tooltip" />
    </>
  );
};

export default ActivityGraph;
