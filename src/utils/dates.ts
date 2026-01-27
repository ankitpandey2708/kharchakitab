export const getTodayRange = (now = new Date()) => {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start: start.getTime(), end: end.getTime() };
};

export const isToday = (timestamp: number, now = new Date()) => {
  const { start, end } = getTodayRange(now);
  return timestamp >= start && timestamp <= end;
};
