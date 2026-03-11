# Tooltip Behaviour

## Element types & trigger strategy

| | Always visible element | Conditionally rendered element |
|---|---|---|
| **When tooltip shows** | Once ever (first visit to app) | Once ever (first time user navigates to that section) |
| **How triggered** | `showTooltipsInOrder` on mount | `showTooltip` in a nav-state effect |
| **Example** | `notifications-toggle` (gear icon always in header) | `recurring-presets` (only rendered when recurring section is open) |

Both show **only once** — `hasSeenTip` ensures that. The difference is only in how you trigger them.

## Current tooltips

| ID | Element | Trigger | Delay |
|---|---|---|---|
| `notifications-toggle` | Settings gear icon | Mount (`showTooltipsInOrder`) | 3000ms |
| `household-icon` | Household tab button | `showHousehold && activeTab !== "household"` | 2500ms |
| `recurring-presets` | Recurring presets section | `activeTab === "recurring"` | 800ms |

## Conflict & ordering rules

- **No visual overlap** — the queue ensures only one tooltip shows at a time, always.
- **Always visible tooltips** — add to the `showTooltipsInOrder` array in `page.tsx`. Order in the array is the display order.
- **Conditionally rendered tooltips** — use `showTooltip` in a nav-state `useEffect`. They queue behind whatever is currently showing.
- **Nav-state tooltips don't need explicit ordering** — they are mutually exclusive by navigation (can't be on two sections simultaneously). If two ever become co-visible, ordering would need to be addressed.

## Adding a new tooltip

1. Add the ID to `TooltipId` in `useOnboardingTour.ts`
2. Add the config to `TOOLTIP_CONFIG` (element selector, title, description, side, align)
3. Add `data-tour="<id>"` to the target element in the component
4. Trigger it:
   - Always visible element → append ID to `showTooltipsInOrder([...])` in `page.tsx`
   - Conditionally rendered element → add a `useEffect` with the nav condition + `showTooltip(id, delay)`

## Cleanup guarantee

`pendingTimersRef` is a `Set` — every in-flight timer is tracked independently. All are cancelled on unmount regardless of how many are pending simultaneously.
