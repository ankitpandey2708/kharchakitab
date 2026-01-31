# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into KharchaKitab, a Hinglish expense tracking application. The integration covers both client-side and server-side event tracking, capturing key user interactions across voice recording, receipt processing, manual entry, and expense management workflows.

## Integration Summary

- **Client-side initialization**: Updated `instrumentation-client.ts` to enable automatic exception capture
- **Server-side client**: Created `src/lib/posthog-server.ts` for API route tracking
- **Event tracking**: Added 15 distinct events across 5 files covering core user journeys
- **Environment variables**: Already configured with `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST`

## Events Implemented

| Event Name | Description | File Path |
|------------|-------------|-----------|
| `recording_started` | User started voice recording to add an expense | `app/page.tsx` |
| `recording_stopped` | User stopped voice recording after speaking their expense | `app/page.tsx` |
| `transaction_added` | A new expense transaction was successfully added (via voice, receipt, or manual entry) | `app/page.tsx` |
| `transaction_edited` | User edited an existing expense transaction | `app/page.tsx` |
| `transaction_deleted` | User deleted an expense transaction | `app/page.tsx` |
| `receipt_upload_started` | User initiated receipt image upload for expense extraction | `app/page.tsx` |
| `receipt_processed` | Receipt was successfully processed and expense extracted | `app/page.tsx` |
| `manual_entry_opened` | User opened the manual expense entry modal | `app/page.tsx` |
| `history_viewed` | User opened the expense history view | `app/page.tsx` |
| `about_dismissed` | User dismissed the about/onboarding card | `app/page.tsx` |
| `error_occurred` | An error occurred during app usage | `app/page.tsx` |
| `expenses_exported` | User exported their expenses to CSV file | `src/components/HistoryView.tsx` |
| `transcription_completed` | Audio transcription API call completed successfully (server-side) | `app/api/sarvam/route.ts` |
| `expense_parsed` | Gemini AI successfully parsed an expense from text (server-side) | `app/api/gemini/route.ts` |
| `receipt_parsed` | Gemini AI successfully parsed an expense from receipt image (server-side) | `app/api/receipt/route.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

### Dashboard
- [Analytics basics](https://us.posthog.com/project/301391/dashboard/1166104) - Core analytics dashboard for KharchaKitab

### Insights
- [Transactions Added Over Time](https://us.posthog.com/project/301391/insights/3XhgQHXU) - Daily trend of new expense transactions
- [Transaction Sources Breakdown](https://us.posthog.com/project/301391/insights/XJTXPKSt) - Breakdown by input source (voice, receipt, manual)
- [Voice Recording Funnel](https://us.posthog.com/project/301391/insights/5hdMRpis) - Conversion funnel from recording to transaction
- [Errors by Type](https://us.posthog.com/project/301391/insights/0dtIJru3) - Application errors breakdown for debugging
- [User Engagement Actions](https://us.posthog.com/project/301391/insights/syD7gsu5) - Key engagement events tracking