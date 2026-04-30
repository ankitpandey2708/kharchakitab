type DateRange = { start: number; end: number };
export type FilterKey = "today" | "month" | "lastMonth" | "custom";

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
  } else if (filter === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(end.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
  } else if (filter === "lastMonth") {
    start.setMonth(start.getMonth() - 1, 1);
    start.setHours(0, 0, 0, 0);
    end.setDate(0); // last day of previous month
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
  if (filter !== "month" && filter !== "lastMonth") {
    end.setHours(23, 59, 59, 999);
  }
  return { start: start.getTime(), end: end.getTime() };
};
