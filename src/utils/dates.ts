type DateRange = { start: number; end: number };
export type FilterKey = "today" | "week" | "month" | "custom";

const getTodayRange = (now = new Date()) => {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start: start.getTime(), end: end.getTime() };
};

export const formatDateYMD = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const toDateInputValue = (value: Date | number) =>
  formatDateYMD(typeof value === "number" ? new Date(value) : value);

export const isToday = (timestamp: number, now = new Date()) => {
  const { start, end } = getTodayRange(now);
  return timestamp >= start && timestamp <= end;
};

const getWeekStart = (date: Date) => {
  const start = new Date(date);
  const day = start.getDay();
  const diff = (day + 6) % 7;
  start.setDate(start.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  return start;
};

const getWeekEnd = (date: Date) => {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
};

export const getRangeForFilter = (
  filter: FilterKey,
  options: { now?: Date; customStart?: string; customEnd?: string } = {}
): DateRange | null => {
  const now = options.now ?? new Date();
  const start = new Date(now);
  const end = new Date(now);
  if (filter === "today") {
    const today = getTodayRange(now);
    start.setTime(today.start);
    end.setTime(today.end);
  } else if (filter === "week") {
    const weekStart = getWeekStart(now);
    start.setTime(weekStart.getTime());
    end.setTime(getWeekEnd(now).getTime());
  } else if (filter === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(end.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
  } else if (filter === "custom") {
    const { customStart, customEnd } = options;
    if (!customStart || !customEnd) return null;
    const startDate = new Date(customStart);
    const endDate = new Date(customEnd);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return null;
    }
    if (startDate.getTime() > endDate.getTime()) {
      return null;
    }
    start.setTime(startDate.getTime());
    end.setTime(endDate.getTime());
    start.setHours(0, 0, 0, 0);
  }
  if (filter !== "week" && filter !== "month") {
    end.setHours(23, 59, 59, 999);
  }
  return { start: start.getTime(), end: end.getTime() };
};
