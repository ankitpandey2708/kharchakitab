# PostHog: Channel Acquisition Analysis (Users with ≥1 Expense)

## Goal
Find users who logged at least 1 expense, broken down by acquisition channel (Reddit, LinkedIn, etc.), and compare with total visitors per channel + Day N retention.

## Key Events
- `transaction_added` — the front-end event for a user logging an expense (has `source`, `input_method`, `amount`, `category`, `payment_method` properties)
- `expense_parsed` — server-side event, always fires as `anonymous`, no user identity; NOT useful for user-level analysis
- `$pageview` — has `$referring_domain` and `$referrer` properties; use this for channel attribution

## Key Properties
- Channel attribution lives on `$pageview` events as `$referring_domain` (e.g., `www.reddit.com`, `com.linkedin.android`, `$direct`)
- Person properties (`$initial_utm_source`, `$initial_referring_domain`, `$virt_initial_channel_type`) are ALL EMPTY — UTM tracking is not set up
- Do NOT rely on person properties for channel; use event-level `$pageview.$referring_domain` instead

## Important PostHog Caveat: Person ID Merging
When a user identifies (logs in), PostHog retroactively merges their anonymous pageview sessions under their identified `person_id`. This means:
- Joining `$pageview` and `transaction_added` on `person_id` always yields 100% conversion (false result)
- For visitor counts, use `count(DISTINCT distinct_id)` from `$pageview` events
- For expense user counts, use `count(DISTINCT person_id)` from `transaction_added` with first-pageview referrer attribution
- Present these as two separate columns; do not join them directly

## Query 1: Visitor Count (by channel)
```sql
SELECT
  multiIf(
    JSONExtractString(properties, '$referring_domain') = '$direct', 'Direct',
    JSONExtractString(properties, '$referring_domain') LIKE '%reddit%', 'Reddit',
    JSONExtractString(properties, '$referring_domain') LIKE '%linkedin%' OR JSONExtractString(properties, '$referring_domain') LIKE '%lnkd%', 'LinkedIn',
    JSONExtractString(properties, '$referring_domain') LIKE '%facebook%' OR JSONExtractString(properties, '$referring_domain') LIKE '%fb%', 'Facebook',
    JSONExtractString(properties, '$referring_domain') LIKE '%google%', 'Google',
    JSONExtractString(properties, '$referring_domain') LIKE '%github%', 'GitHub',
    JSONExtractString(properties, '$referring_domain') LIKE '%bing%', 'Bing',
    'Other'
  ) AS channel,
  count(DISTINCT distinct_id) AS visitors
FROM events
WHERE event = '$pageview'
GROUP BY channel
ORDER BY visitors DESC
```

## Query 2: Expense Users + Day N Retention (by channel, first-touch attribution)
```sql
WITH first_referrer AS (
  SELECT
    person_id,
    argMin(JSONExtractString(properties, '$referring_domain'), timestamp) AS initial_referrer
  FROM events
  WHERE event = '$pageview'
  GROUP BY person_id
),
expense_days AS (
  SELECT
    person_id,
    count(DISTINCT toDate(timestamp)) AS distinct_days
  FROM events
  WHERE event = 'transaction_added'
  GROUP BY person_id
),
expense_users AS (
  SELECT DISTINCT person_id FROM events WHERE event = 'transaction_added'
),
first_touch AS (
  SELECT
    eu.person_id,
    multiIf(
      fr.initial_referrer = '$direct', 'Direct',
      fr.initial_referrer LIKE '%reddit%', 'Reddit',
      fr.initial_referrer LIKE '%linkedin%' OR fr.initial_referrer LIKE '%lnkd%', 'LinkedIn',
      fr.initial_referrer LIKE '%facebook%' OR fr.initial_referrer LIKE '%fb%', 'Facebook',
      fr.initial_referrer LIKE '%google%', 'Google',
      fr.initial_referrer LIKE '%github%', 'GitHub',
      fr.initial_referrer LIKE '%bing%', 'Bing',
      'Other'
    ) AS channel,
    ed.distinct_days
  FROM expense_users eu
  LEFT JOIN first_referrer fr ON eu.person_id = fr.person_id
  LEFT JOIN expense_days ed ON eu.person_id = ed.person_id
)
SELECT
  channel,
  count(DISTINCT person_id) AS expense_users,
  countDistinctIf(person_id, distinct_days > 1) AS returned_day_n
FROM first_touch
GROUP BY channel
ORDER BY expense_users DESC
```

## Results (as of 2026-03-07)
| Channel  | Visitors | Expense Users | Conversion | Returned (Day N≠1) | Day-N Rate |
|----------|----------|---------------|------------|---------------------|------------|
| Direct   | 333      | 48            | 14.4%      | 3                   | 6.3%       |
| Reddit   | 72       | 25            | 34.7%      | 0                   | 0%         |
| LinkedIn | 74       | 6             | 8.1%       | 0                   | 0%         |
| Facebook | 12       | 0             | 0%         | —                   | —          |
| Google   | 9        | 1             | 11.1%      | 0                   | 0%         |
| Other    | 7        | 1             | 14.3%      | 1                   | 100%       |
| Bing     | 1        | 0             | 0%         | —                   | —          |
| GitHub   | 1        | 1             | ~100%      | 0                   | 0%         |

Total unique expense users: 82

## Findings
- Reddit has the highest Day-1 conversion (34.7%) — best quality acquisition traffic
- LinkedIn drives comparable volume to Reddit but converts at 8.1% (3x lower)
- Facebook and Bing drive zero activations
- **Retention is near-zero across all channels** — only 3/82 expense users (3.7%) returned on a different day; all 3 were Direct
- Reddit brings good first-day activation but zero retention — curiosity-driven, not habitual
- The core problem is retention, not acquisition — all channels fail at Day N
- UTM tracking is not set up — adding UTM params to Reddit/LinkedIn posts would improve attribution accuracy
