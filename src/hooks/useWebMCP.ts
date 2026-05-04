"use client";

import { useEffect } from 'react';
import { buildSnapshot } from '@/src/lib/agent/snapshot';
import { deleteTransaction } from '@/src/db/db';
import { createAgentTools } from '@/src/lib/agent/tools';

/**
 * Hook to implement WebMCP API support.
 * Exposes site tools to AI agents via the browser.
 * See: https://webmachinelearning.github.io/webmcp/
 */
export function useWebMCP(
  processTextInput: (text: string) => Promise<void>,
  refreshTransactions: () => void
) {
  useEffect(() => {
    // WebMCP check
    if (typeof window === 'undefined' || !('modelContext' in navigator)) {
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;

    // Register WebMCP context and tools
    // We use provideContext as requested by the user, which is part of the emerging WebMCP spec
    try {
      // @ts-ignore - WebMCP is an experimental API
      navigator.modelContext.provideContext({
        tools: [
          {
            name: "list_expenses",
            description: "List recent expense transactions. You can filter by category, item name (item_contains), or date range (date_from/date_to).",
            inputSchema: {
              type: "object",
              properties: {
                category: { type: "string", description: "Expense category (e.g. food, travel, shopping)" },
                item_contains: { type: "string", description: "Search for items containing this text" },
                date_from: { type: "string", description: "Start date in YYYY-MM-DD format" },
                date_to: { type: "string", description: "End date in YYYY-MM-DD format" },
                min_amount: { type: "number" },
                max_amount: { type: "number" },
              }
            },
            execute: async (args: any) => {
              const snapshot = await buildSnapshot();
              const tools = createAgentTools(snapshot);
              return await tools.query_expenses.execute(args);
            }
          },
          {
            name: "get_summary",
            description: "Get aggregated spending totals (summaries) by category, item, week, or day for a specific period.",
            inputSchema: {
              type: "object",
              properties: {
                group_by: { 
                  type: "string", 
                  enum: ["category", "item", "week", "day"],
                  description: "How to group the expenses"
                },
                period: { 
                  type: "string", 
                  enum: ["this_month", "last_month", "last_3_months", "this_week"],
                  description: "The time period to summarize"
                },
              },
              required: ["group_by", "period"]
            },
            execute: async (args: any) => {
              const snapshot = await buildSnapshot();
              const tools = createAgentTools(snapshot);
              return await tools.get_summary.execute(args);
            }
          },
          {
            name: "add_expense",
            description: "Add a new expense using natural language (e.g. 'chai for 20 rupees' or '150 for lunch').",
            inputSchema: {
              type: "object",
              properties: {
                text: { type: "string", description: "Natural language description of the expense" },
              },
              required: ["text"]
            },
            execute: async ({ text }: { text: string }) => {
              await processTextInput(text);
              return { status: "success", message: `Initiated processing for: "${text}"` };
            }
          },
          {
            name: "delete_expense",
            description: "Delete an existing expense transaction by its unique ID.",
            inputSchema: {
              type: "object",
              properties: {
                id: { type: "string", description: "The ID of the transaction to delete" },
              },
              required: ["id"]
            },
            execute: async ({ id }: { id: string }) => {
              try {
                await deleteTransaction(id);
                refreshTransactions();
                return { status: "success", message: `Transaction ${id} deleted.` };
              } catch (err) {
                return { status: "error", message: err instanceof Error ? err.message : String(err) };
              }
            }
          },
          {
            name: "get_budget_status",
            description: "Check the current monthly budget limit, amount spent, and remaining balance.",
            inputSchema: { type: "object", properties: {} },
            execute: async () => {
              const snapshot = await buildSnapshot();
              const tools = createAgentTools(snapshot);
              return await tools.get_budget.execute();
            }
          },
          {
            name: "get_recurring_expenses",
            description: "List recurring expenses (bills, subscriptions) due soon.",
            inputSchema: {
              type: "object",
              properties: {
                lookahead_days: { type: "number", default: 7, description: "Number of days to look ahead (max 30)" }
              }
            },
            execute: async (args: any) => {
              const snapshot = await buildSnapshot();
              const tools = createAgentTools(snapshot);
              return await tools.get_recurring.execute(args);
            }
          }
        ]
      }, { signal });
      
      if (process.env.NODE_ENV === "development") {
        console.log("[WebMCP] Site tools registered successfully.");
      }
    } catch (err) {
      console.error("[WebMCP] Failed to register tools:", err);
    }

    return () => {
      controller.abort();
    };
  }, [processTextInput, refreshTransactions]);
}
