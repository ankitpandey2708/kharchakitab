# Recurring Transaction Flow - Implementation Plan

## Overview
Implement a template-based recurring transaction system that separates recurring templates from generated transaction instances.

---

## 1. Data Model Changes

### 1.1 New Interface: `Recurring_template`
```typescript
export interface Recurring_template {
  _id: string;
  item: string;
  category: string;
  amount: number;
  paymentMethod: "cash" | "upi" | "card" | "unknown";
  recurring_frequency: Frequency;
  recurring_start_date: number;
  recurring_end_date: number;
  recurring_next_due_at: number;
  recurring_last_paid_at?: number;
  recurring_reminder_days: number;
  
  // Standard fields
  owner_device_id?: string;
  created_at: number;
  updated_at: number;
  version?: number;
}
```

### 1.2 Update Transaction Interface
**Remove** these fields from `Transaction`:
- `recurring_frequency`
- `recurring_start_date`
- `recurring_end_date`
- `recurring_next_due_at`
- `recurring_last_paid_at`
- `recurring_reminder_days`

**Keep/Add** these fields:
```typescript
export interface Transaction {
  // ... existing fields ...
  recurring?: boolean;
  recurring_template_id?: string;
}
```

### 1.3 Storage
- Create new IndexedDB object store: `"recurring_templates"`
- Keep existing `"transactions"` store for generated transaction instances

---

## 2. Database Operations

### 2.1 New DB Functions (in `src/db/db.ts`)

```typescript
// Template CRUD
export async function createRecurringTemplate(template: Recurring_template): Promise<void>
export async function updateRecurringTemplate(id: string, updates: Partial<Recurring_template>): Promise<void>
export async function deleteRecurringTemplate(id: string): Promise<void>
export async function getRecurringTemplates(): Promise<Recurring_template[]>
export async function getRecurringTemplateById(id: string): Promise<Recurring_template | undefined>

// Transaction generation (future-only)
export async function generateRecurringTransactions(template: Recurring_template): Promise<Transaction[]>
export async function deleteGeneratedTransactions(templateId: string): Promise<void>
```

### 2.2 Update Existing DB Functions

Update `initDB()` to create the new `recurring_templates` object store.

---

## 3. Core Logic: Transaction Generation

### 3.1 Generate Future Transactions Only (on template save)

**Algorithm** (generates from today onwards):
```typescript
function generateRecurringTransactions(template: Recurring_template): Transaction[] {
  const transactions: Transaction[] = [];
  const now = Date.now();
  
  // Start from max(start_date, today) - ONLY FUTURE
  let currentDate = Math.max(template.recurring_start_date, now);
  
  // Align to next occurrence if currentDate is in the past
  if (currentDate === template.recurring_start_date && currentDate < now) {
    currentDate = getNextUpcomingDueDate(
      currentDate,
      template.recurring_frequency,
      now,
      template.recurring_end_date
    );
  }
  
  const endDate = template.recurring_end_date;
  
  while (currentDate <= endDate) {
    transactions.push({
      id: generateUniqueId(),
      amount: template.amount,
      item: template.item,
      category: template.category,
      paymentMethod: template.paymentMethod,
      timestamp: currentDate,
      recurring: true,
      recurring_template_id: template._id,
      owner_device_id: template.owner_device_id,
      created_at: Date.now(),
      updated_at: Date.now(),
    });
    
    currentDate = calculateNextDueDate(currentDate, template.recurring_frequency);
  }
  
  return transactions;
}
```

**Key behavior:**
- ✅ Only generates transactions with `timestamp >= Date.now()`
- ✅ No ghost past transactions
- ✅ Clean separation: templates = planning, manual txns = actual payments

**When to trigger**:
- On initial template creation
- On template edit (delete old future transactions, regenerate)

### 3.2 Calculate and Maintain `recurring_next_due_at`

**Critical:** `recurring_next_due_at` must always point to the next upcoming payment date. This requires calculation at multiple points:

#### **On Template Creation**
```typescript
async function createRecurringTemplate(templateData) {
  const now = Date.now();
  const startDate = templateData.recurring_start_date;
  
  // Calculate first upcoming due date
  let nextDueAt = startDate;
  
  // If start_date is in the past, find next occurrence
  if (startDate < now) {
    nextDueAt = getNextUpcomingDueDate(
      startDate,
      templateData.recurring_frequency,
      now,
      templateData.recurring_end_date
    );
  }
  
  const template: Recurring_template = {
    ...templateData,
    recurring_next_due_at: nextDueAt,
    created_at: now,
    updated_at: now,
  };
  
  await db.recurring_templates.add(template);
}
```

#### **On Template Edit**
```typescript
async function updateRecurringTemplate(id: string, updates: Partial<Recurring_template>) {
  const template = await getRecurringTemplateById(id);
  
  // Recalculate next_due_at if frequency or dates changed
  if (
    updates.recurring_frequency ||
    updates.recurring_start_date !== undefined ||
    updates.recurring_end_date !== undefined
  ) {
    const newStartDate = updates.recurring_start_date ?? template.recurring_start_date;
    const newFrequency = updates.recurring_frequency ?? template.recurring_frequency;
    const newEndDate = updates.recurring_end_date ?? template.recurring_end_date;
    
    updates.recurring_next_due_at = getNextUpcomingDueDate(
      newStartDate,
      newFrequency,
      Date.now(),
      newEndDate
    );
  }
  
  await db.recurring_templates.update(id, {
    ...updates,
    updated_at: Date.now()
  });
}
```

#### **On App Load (Normalization)** ⭐ Most Important
```typescript
const loadRecurring = useCallback(async () => {
  setIsLoading(true);
  try {
    const templates = await getRecurringTemplates();
    const now = Date.now();
    const updates: Promise<unknown>[] = [];
    
    // Normalize stale next_due_at values
    const normalized = templates.map(template => {
      const dueAt = template.recurring_next_due_at;
      
      // If next_due_at is in the past, recalculate
      if (dueAt < now && now <= template.recurring_end_date) {
        const nextDue = getNextUpcomingDueDate(
          dueAt,
          template.recurring_frequency,
          now,
          template.recurring_end_date
        );
        
        if (nextDue !== dueAt) {
          console.info('[recurring:normalize] next-due-updated', {
            id: template._id,
            item: template.item,
            previousDue: dueAt,
            nextDue,
            frequency: template.recurring_frequency,
          });
          
          // Update in database
          updates.push(
            updateRecurringTemplate(template._id, { 
              recurring_next_due_at: nextDue 
            })
          );
          
          // Return normalized template for immediate UI display
          return { ...template, recurring_next_due_at: nextDue };
        }
      }
      
      return template;
    });
    
    // Persist updates to database
    if (updates.length > 0) {
      await Promise.allSettled(updates);
    }
    
    // Filter out expired templates
    const active = normalized.filter(t => now <= t.recurring_end_date);
    setTemplates(active);
  } finally {
    setIsLoading(false);
  }
}, []);
```

#### **Helper: `getNextUpcomingDueDate`**
Ensure this exists in `src/config/recurring.ts`:
```typescript
export function getNextUpcomingDueDate(
  startDate: number,
  frequency: Frequency,
  fromTimestamp: number,
  endDate?: number
): number {
  let currentDate = startDate;
  
  // If startDate is already in the future, return it
  if (currentDate >= fromTimestamp) {
    return currentDate;
  }
  
  // Calculate how many intervals have passed since startDate
  while (currentDate < fromTimestamp) {
    currentDate = calculateNextDueDate(currentDate, frequency);
    
    // Don't go past end date
    if (endDate && currentDate > endDate) {
      return endDate;
    }
  }
  
  return currentDate;
}
```

**Why normalization on load is critical:**
- User creates template Feb 1 with `next_due_at = Feb 5`
- User opens app Feb 10 (5 days later)
- Without normalization: Shows "Due 5 days ago" ❌
- With normalization: Recalculates to Mar 5, shows "Due in 23 days" ✅

---

## 4. RecurringEditModal Updates

### 4.1 Save Flow

**On Save**:
1. Create/update `Recurring_template` in `recurring_templates` store
2. Generate all future transactions via `generateRecurringTransactions()`
3. Save all generated transactions to `transactions` store
4. Calculate and set `recurring_next_due_at` on template (first upcoming date)

### 4.2 Edit Flow

**On Edit Existing Template**:
1. Update template in `recurring_templates` store
2. Delete all generated transactions: `recurring_template_id === template._id`
3. Regenerate transactions from today onwards (using future-only logic)
4. Recalculate `recurring_next_due_at`

**Note:** No validation needed! Since only future transactions exist:
- ✅ User can edit any field (start_date, end_date, amount, etc.)
- ✅ Changes only affect future reminders
- ✅ No risk of orphaned past transactions

### 4.3 Delete Flow

**On Delete Template**:
1. Hard delete template from `recurring_templates` store
2. Delete all generated transactions: `recurring_template_id === template._id`
3. Done! (No past transactions to worry about)

---

## 5. RecurringView Updates

### 5.1 Data Loading

**Load Templates** (not transactions):
```typescript
const loadRecurring = async () => {
  const templates = await getRecurringTemplates();
  const activeTemplates = templates.filter(t => 
    Date.now() <= t.recurring_end_date
  );
  setRecurringItems(activeTemplates);
};
```

### 5.2 Due Soon vs Upcoming Logic (Option A)

**Split templates into two sections:**

```typescript
// Due Soon: Templates where next payment is within reminder window
const dueSoonTemplates = useMemo(
  () =>
    templates.filter(template => {
      const dueAt = template.recurring_next_due_at;
      const reminderDays = template.recurring_reminder_days ?? 5;
      return isDueSoon(dueAt, reminderDays);
    }),
  [templates]
);

// Upcoming: All other active templates
const upcomingTemplates = useMemo(
  () =>
    templates.filter(
      template => !dueSoonTemplates.some(due => due._id === template._id)
    ),
  [dueSoonTemplates, templates]
);
```

**Render:**
```typescript
return (
  <div className="space-y-6">
    {/* Due Soon Section - Highlighted */}
    {dueSoonTemplates.length > 0 && (
      <div className="space-y-3">
        <div className="kk-label text-[var(--kk-saffron)]">Due Soon</div>
        {dueSoonTemplates.map(template => 
          renderTemplateCard(template, true)
        )}
      </div>
    )}

    {/* All Recurring Section */}
    {upcomingTemplates.length > 0 && (
      <div className="space-y-3">
        <div className="kk-label">All Recurring</div>
        {upcomingTemplates.map(template => 
          renderTemplateCard(template, false)
        )}
      </div>
    )}
  </div>
);
```

### 5.3 UI Display

- Show templates (not individual transactions)
- Display `recurring_next_due_at` as the due date
- Edit button opens template editor (affects all future occurrences)
- Delete button removes template + future transactions

### 5.4 Comment Out "Mark as Paid"

**Remove/comment**:
- `handleMarkAsPaid` function (lines 180-191)
- "Mark as Paid" button in `renderCard` (lines 272-281)
- `showMarkPaid` parameter usage

---

## 6. Main Tabs Integration

### 6.1 Personal/Household Tabs

**Include generated recurring transactions (future only)**:
- Transactions with `recurring: true` appear in the main timeline
- Show alongside regular transactions as **future reminders**
- Users see upcoming Netflix payment, rent, etc.
- Filter/sort normally by date

**Clarity:**
- Generated recurring txns = Future obligations (reminders)
- Manual voice/entry txns = Actual payments (history)
- Clear separation between planned vs actual

### 6.2 Visual Distinction (Recommended)

Add visual indicators to distinguish generated transactions:
- 🔄 Small recurring icon/badge
- Lighter background color or dotted border
- Label: "Upcoming" or "Recurring: Monthly"
- Different style from actual paid transactions

---

## 7. Implementation Steps

### Phase 1: Database Layer
1. ✅ Update `src/types/index.ts` - Add `Recurring_template`, remove fields from `Transaction`
2. ✅ Update `src/db/db.ts` - Add new object store in `initDB()`
3. ✅ Create CRUD functions for templates
4. ✅ Create `generateRecurringTransactions()` function
5. ✅ Create `deleteGeneratedTransactions()` function

### Phase 2: Business Logic
6. ✅ Update `RecurringEditModal` save handler
7. ✅ Update `RecurringEditModal` edit handler (delete + regenerate)
8. ✅ Update `RecurringEditModal` delete handler

### Phase 3: UI Updates
9. ✅ Update `RecurringView` to load templates instead of transactions
10. ✅ Update due soon calculation
11. ✅ Comment out "Mark as Paid" logic
12. ✅ Remove unused parameters and functions
13. ✅ Add visual distinction for generated transactions in Personal tab (optional)

<!-- ### Phase 4: Testing
14. ✅ Test create new recurring template (verify only future txns created)
15. ✅ Test edit existing template (verify delete + regeneration)
16. ✅ Test delete template (verify all generated txns removed)
17. ✅ Verify future transactions appear in Personal tab
18. ✅ Test due soon notifications
19. ✅ Test template created with start_date in the past (verify first txn is in future)
 -->
---
---
<!-- 
## 9. Future Enhancements (Out of Scope)

- **Auto-matching**: Match voice-created transactions to recurring ones
- **Paid status tracking**: Mark transactions as paid, track payment history
- **Template pause/resume**: Temporarily pause a subscription
- **Variable amounts**: Support amount ranges (e.g., electricity ₹500-800)
- **Smart reminders**: Push notifications for upcoming due dates
- **Analytics**: Track recurring expense trends over time

--- -->
