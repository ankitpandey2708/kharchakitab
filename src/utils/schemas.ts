import { z } from "zod";

export const ExpenseSchema = z.object({
  amount: z.number().describe("The cost in numbers only"),
  category: z.string().describe("One word category e.g. Food, Travel"),
  item: z.string().describe("Short description of item"),
  date: z.string().describe("Date in YYYY-MM-DD format"),
  paymentMethod: z.enum(["cash", "upi", "card"]).optional().default("cash"),
  confidence: z.number().optional().describe("Confidence score 0-1"),
});

export type Expense = z.infer<typeof ExpenseSchema>;
