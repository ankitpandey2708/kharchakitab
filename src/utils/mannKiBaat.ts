import { fetchTransactions } from "@/src/db/db";
import type { Transaction } from "@/src/types";
import type { CategoryKey } from "@/src/config/categories";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ItemBreakdown {
  name: string;
  amount: number;
  count: number;
  category: CategoryKey;
}

export interface DayStats {
  totalSpend: number;
  txCount: number;
  categories: Partial<Record<CategoryKey, { total: number; count: number }>>;
  topCategory: string;
  paymentMethodBreakdown: Record<"cash" | "upi" | "card", number>;
  dayOfWeek: string;
  isWeekend: boolean;
  // Enhanced: Item-level details for hyper-personalized messages
  items: ItemBreakdown[];           // All items grouped by name
  topItem: ItemBreakdown | null;    // Single biggest expense
  frequentItems: string[];          // Items appearing 2+ times
  hasMultipleSameItem: boolean;     // Flag for "Chai x3" type messages
}

interface RecentContext {
  week: { totalSpend: number; dailyAvg: number; categoryFrequency: Partial<Record<string, number>> };
  month: { totalSpend: number; dailyAvg: number; weeklyAvg: number };
  streakDaysBelowAvg: number;
}

export type MessageType = "roast" | "pattern" | "praise" | "warning" | "streak";

export interface MannKiBaatMessage {
  message: string;
  type: MessageType;
  emoji: string;
  stats?: DayStats;
  generatedAt?: number;
  dismissed?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const dayRange = (daysAgo: number): { start: number; end: number } => {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end);
  start.setDate(start.getDate() - daysAgo);
  return { start: start.getTime(), end: end.getTime() };
};

const yesterdayRange = (): { start: number; end: number } => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  return { start: yesterdayStart.getTime(), end: todayStart.getTime() };
};

const filterEligible = (txs: Transaction[], ownerId?: string): Transaction[] =>
  txs.filter((tx) => {
    if (tx.deleted_at) return false;
    if (tx.is_private) return false;
    if (tx.amortized || tx.recurring) return false;
    if (ownerId && tx.owner_device_id !== ownerId) return false;
    return true;
  });

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

const aggregateTransactions = (txs: Transaction[]): DayStats => {
  const categories: DayStats["categories"] = {};
  const paymentMethodBreakdown: DayStats["paymentMethodBreakdown"] = { cash: 0, upi: 0, card: 0 };
  const itemMap = new Map<string, ItemBreakdown>();
  let totalSpend = 0;

  for (const tx of txs) {
    totalSpend += tx.amount;
    const cat = tx.category as CategoryKey;
    if (!categories[cat]) categories[cat] = { total: 0, count: 0 };
    categories[cat]!.total += tx.amount;
    categories[cat]!.count += 1;
    if (tx.paymentMethod !== "unknown") {
      paymentMethodBreakdown[tx.paymentMethod] += tx.amount;
    }

    // Aggregate items by name for hyper-personalized messages
    const itemName = tx.item.trim();
    const key = itemName.toLowerCase();
    const existing = itemMap.get(key);
    if (existing) {
      existing.amount += tx.amount;
      existing.count += 1;
    } else {
      itemMap.set(key, { name: itemName, amount: tx.amount, count: 1, category: cat });
    }
  }

  let topCategory = "Other";
  let topAmount = 0;
  for (const [cat, data] of Object.entries(categories)) {
    if (data && data.total > topAmount) {
      topAmount = data.total;
      topCategory = cat;
    }
  }

  // Build items array and find top item
  const items = Array.from(itemMap.values()).sort((a, b) => b.amount - a.amount);
  const topItem = items.length > 0 ? items[0] : null;
  const frequentItems = items.filter((i) => i.count >= 2).map((i) => i.name);
  const hasMultipleSameItem = frequentItems.length > 0;

  const sampleDate = txs.length > 0 ? new Date(txs[0].timestamp) : new Date();
  const dow = sampleDate.getDay();

  return {
    totalSpend,
    txCount: txs.length,
    categories,
    topCategory,
    paymentMethodBreakdown,
    dayOfWeek: DAYS[dow],
    isWeekend: dow === 0 || dow === 6,
    items,
    topItem,
    frequentItems,
    hasMultipleSameItem,
  };
};

// ---------------------------------------------------------------------------
// Full data pipeline
// ---------------------------------------------------------------------------

export const getMannKiBaatData = async (ownerId?: string) => {
  const [yesterdayTxRaw, weekTxRaw, monthTxRaw] = await Promise.all([
    fetchTransactions({ range: yesterdayRange() }),
    fetchTransactions({ range: dayRange(7) }),
    fetchTransactions({ range: dayRange(30) }),
  ]);

  const yesterdayTx = filterEligible(yesterdayTxRaw, ownerId);
  const weekTx = filterEligible(weekTxRaw, ownerId);
  const monthTx = filterEligible(monthTxRaw, ownerId);

  const yesterdayStats = aggregateTransactions(yesterdayTx);

  // Category frequency over last 7 days (how many days each category appeared)
  const categoryDays: Partial<Record<string, Set<string>>> = {};
  for (const tx of weekTx) {
    const d = new Date(tx.timestamp);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const cat = tx.category;
    if (!categoryDays[cat]) categoryDays[cat] = new Set();
    categoryDays[cat]!.add(day);
  }
  const categoryFrequency: Partial<Record<string, number>> = {};
  for (const [cat, days] of Object.entries(categoryDays)) {
    if (days) categoryFrequency[cat] = days.size;
  }

  const weekTotal = weekTx.reduce((s, tx) => s + tx.amount, 0);
  const monthTotal = monthTx.reduce((s, tx) => s + tx.amount, 0);

  // Streak: consecutive days (from yesterday backwards) below 30-day daily avg
  const monthDailyAvg = monthTotal / 30;
  let streakDaysBelowAvg = 0;
  for (let i = 1; i <= 7; i++) {
    const dStart = new Date();
    dStart.setHours(0, 0, 0, 0);
    dStart.setDate(dStart.getDate() - i);
    const dEnd = new Date(dStart);
    dEnd.setDate(dEnd.getDate() + 1);
    const dayTotal = weekTx
      .filter((tx) => tx.timestamp >= dStart.getTime() && tx.timestamp < dEnd.getTime())
      .reduce((s, tx) => s + tx.amount, 0);
    if (dayTotal < monthDailyAvg) streakDaysBelowAvg++;
    else break;
  }

  const recentContext: RecentContext = {
    week: { totalSpend: weekTotal, dailyAvg: weekTotal / 7, categoryFrequency },
    month: { totalSpend: monthTotal, dailyAvg: monthDailyAvg, weeklyAvg: monthTotal / 4 },
    streakDaysBelowAvg,
  };

  return { yesterdayStats, recentContext };
};

// ---------------------------------------------------------------------------
// Deterministic message type selection
// ---------------------------------------------------------------------------

export const selectMessageType = (stats: DayStats, ctx: RecentContext): MessageType => {
  // Priority: streak > warning > pattern > roast > praise

  // Streak: 3+ consecutive days below daily average
  if (ctx.streakDaysBelowAvg >= 3) return "streak";

  // Warning: 7-day rolling total > last month weekly average × 1.3
  if (ctx.week.totalSpend > ctx.month.weeklyAvg * 1.3 && ctx.month.weeklyAvg > 0) return "warning";

  // Pattern: same category 4+ days in last 7, OR weekend spend > 2x weekday avg
  for (const count of Object.values(ctx.week.categoryFrequency)) {
    if (count && count >= 4) return "pattern";
  }

  // Roast: single category > 40% of daily spend AND txCount > 2
  for (const data of Object.values(stats.categories)) {
    if (data && stats.totalSpend > 0 && data.total / stats.totalSpend > 0.4 && data.count > 2) {
      return "roast";
    }
  }

  // Praise: low spend day or zero spend
  if (stats.txCount === 0 || (ctx.month.dailyAvg > 0 && stats.totalSpend < ctx.month.dailyAvg * 0.5)) {
    return "praise";
  }

  return "roast"; // default
};

// ---------------------------------------------------------------------------
// Fallback messages (no Gemini needed) - Enhanced with item-level details
// ---------------------------------------------------------------------------

export const getFallbackMessage = (stats: DayStats, type: MessageType): MannKiBaatMessage => {
  const total = Math.round(stats.totalSpend);

  // Build item-aware messages when Gemini is unavailable
  const getItemAwareMessage = (): { message: string; emoji: string } => {
    const topItem = stats.topItem;
    const frequentItems = stats.frequentItems;

    switch (type) {
      case "roast":
        if (topItem && topItem.amount > total * 0.5) {
          // Single big expense
          return {
            message: `Kal ₹${total} mein se ₹${Math.round(topItem.amount)} sirf ${topItem.name} pe? Aaj thoda soch samajh ke.`,
            emoji: "😤"
          };
        }
        if (frequentItems.length > 0) {
          // Multiple same items — use the actual frequent item, not topItem
          const freq = stats.items.find((i) => i.name === frequentItems[0]);
          if (freq) {
            return {
              message: `${freq.name} x${freq.count} (₹${Math.round(freq.amount)})? Addiction lag raha hai. Aaj break le.`,
              emoji: "🔥"
            };
          }
        }
        return { message: `Kal ${stats.topCategory} pe ₹${total} gaye. Aaj soch ke kharcha kar.`, emoji: "🔥" };

      case "pattern":
        if (frequentItems.length > 0) {
          return { message: `${frequentItems[0]} phir se? Aadat ban rahi hai bhai.`, emoji: "🔁" };
        }
        return { message: `${stats.topCategory} phir se? Aadat ban rahi hai bhai.`, emoji: "🔁" };

      case "praise":
        if (total === 0) {
          return { message: `Kal ₹0 kharch? Rest day ya bhool gaya? Either way, wallet safe hai.`, emoji: "😇" };
        }
        return { message: `Kal ka spend: ₹${total}. Control mein hai. Aise hi chalne do!`, emoji: "✨" };

      case "warning":
        return { message: `Is hafte zyada ho raha hai. Thoda control kar.`, emoji: "⚠️" };

      case "streak":
        return { message: `Low spend streak chal rahi hai. Mat tod!`, emoji: "🔥" };

      default:
        return { message: `Kal ka spend: ₹${total}.`, emoji: "💸" };
    }
  };

  const { message, emoji } = getItemAwareMessage();
  return { message, type, emoji, generatedAt: Date.now() };
};

// ---------------------------------------------------------------------------
// Gemini API call
// ---------------------------------------------------------------------------

export const fetchMannKiBaatMessage = async (
  stats: DayStats,
  ctx: RecentContext,
  type: MessageType
): Promise<{ message: string; type: MessageType; emoji: string }> => {
  const res = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "mann-ki-baat",
      messageType: type,
      text: JSON.stringify({
        yesterday: {
          items: stats.items.map((i) => ({ name: i.name, amount: i.amount, count: i.count })),
          totalSpend: stats.totalSpend,
          isWeekend: stats.isWeekend,
        },
        weekTotal: Math.round(ctx.week.totalSpend),
        dailyAvg: Math.round(ctx.month.dailyAvg),
        ...(type === "streak" && { streakDays: ctx.streakDaysBelowAvg }),
      }),
    }),
  });

  if (!res.ok) throw new Error(`API error ${res.status}`);

  const json = await res.json();
  const data = json.data;

  if (data && typeof data.message === "string") {
    return {
      message: data.message,
      type,
      emoji: data.emoji || "💸",
    };
  }

  throw new Error("Invalid response shape");
};
