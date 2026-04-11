# Unified Gamification Blueprint — KharchaKitab

> **Goal:** Make expense tracking feel like playing a game, not data entry.
> 
> **Base Layer:** Sikke (सिक्के) — the universal currency of engagement.
> 
> **Philosophy:** Duolingo didn't change *what* you learn. They changed *how it feels*. KharchaKitab should change how it feels to log "chai 20" — from boring data entry to scoring a point.

---

## Table of Contents

1. [Sikke — The Base Layer](#1-sikke--the-base-layer)
2. [Feature: Weekly Challenges — "Hafta Challenge"](#2-feature-weekly-challenges--hafta-challenge)
3. [Feature: Monthly Report Card — "Mahina Report"](#3-feature-monthly-report-card--mahina-report)
4. [Feature: Sabse Sasta Comparisons](#4-feature-sabse-sasta-comparisons)
5. [Game: Kitna Jaante Ho? — Couple Prediction Game](#5-game-kitna-jaante-ho--couple-prediction-game)
6. [Game: Saste Ka Saudagar — Daily Price Guessing](#6-game-saste-ka-saudagar--daily-price-guessing)
7. [Game: Kharcha Poker — Weekly Spending Bet](#7-game-kharcha-poker--weekly-spending-bet)
8. [Implementation Priority](#8-implementation-priority)

---

## 1. Sikke — The Base Layer

### What is Sikke?

Sikke (सिक्के = coins in Hindi) is the universal currency of engagement in KharchaKitab. Every action in the app earns Sikke, which accumulate and drive progression, stakes, and rewards.

### Earning Table

| Action | Sikke Earned | Input Required |
|--------|-------------|----------------|
| Log an expense (text) | +5 | Manual entry |
| Log an expense (voice) | +8 | Voice input |
| Log a receipt scan | +10 | Camera/receipt |
| Bulk paste import (per expense) | +2 | Paste input |
| Stay under daily budget | +15 | Any logged expense |
| Log 5+ expenses in a day | +20 | Multiple entries |
| Complete a weekly challenge | +50 | Hafta Challenge completion |
| Unlock a badge | +25 | Achievement unlock |
| First expense of the day | +3 | Daily first log |

### Storage

```typescript
// localStorage keys
kk_sikke_total: number        // Lifetime Sikke earned (never decreases)
kk_sikke_balance: number      // Spendable balance (decreases on bets/freeze)
kk_sikke_today: number        // Sikke earned today (resets daily)
kk_sikke_last_date: string    // ISO date of last calculation
```

### Psychology

- **Operant conditioning:** Every log = immediate numerical reward
- **Variable ratio reinforcement:** Different actions earn different amounts
- **Endowment effect:** Accumulated Sikke feel like "yours" — losing them feels painful
- **Behavioral steering:** Higher Sikke for voice input pushes users toward KharchaKitab's differentiator

---

## 2. Feature: Weekly Challenges — "Hafta Challenge"

> **Doc:** games_1 (Feature 7)

### Input

User performs specific actions throughout the week:
- Log expenses daily (3+ per day)
- Use voice input 5 times
- Scan a receipt
- Stay under daily budget every day
- Visit analytics 3 times
- Set up a recurring expense
- Have one no-spend day

### Outcome

- **On completion:** "Mubaarak!" celebration + 50 Sikke + challenge badge
- **On expiry:** "Agla hafta, agla mauka" faded card
- **Persistence:** Progress bar showing X/Y days/actions completed

### UI Placement

- Challenge card on home screen (below budget card, above Apni Awaaz)
- Shows: challenge description (Hinglish), progress bar, days remaining

### Psychology

- **Novelty:** Challenges change weekly, preventing habituation
- **Variable goals:** Different challenges activate different behaviors
- **Finite time window:** Weekly deadline creates urgency without daily pressure

### Storage

```typescript
interface WeeklyChallenge {
  weekNumber: number;
  challengeId: string;
  progress: number;
  target: number;
  completedAt: string | null;
  sikkeAwarded: boolean;
}
```

---

## 3. Feature: Monthly Report Card — "Mahina Report"

> **Doc:** games_1 (Feature 8)

### Input

- Generated from user's transaction data over the month
- On 1st of each month (or manual "View Report" tap)

### Outcome

Shareable 9:16 image card containing:
- Total Kharcha, Budget, Saved amount
- Top Category, Total Entries
- Sikke earned this month (displays as stat only)
- vs Last Month comparison
- Hinglish one-liner via Apni Awaaz (Gemini)

```
┌─────────────────────────────────┐
│     📊 MAHINA REPORT            │
│     March 2026                  │
│                                 │
│  Total Kharcha:    ₹45,230     │
│  Budget:           ₹50,000     │
│  Saved:            ₹4,770 ✅   │
│                                 │
│  Top Category:     Food (₹12K) │
│  Total Entries:    287        │
│                                 │
│  Sikke Earned:     1,240       │
│                                 │
│  vs Last Month:    ₹3,200 less │
│                     (-6.6%)    │
│                                 │
│  "Iss mahine tum Ambani nahi   │
│   bane, lekin bankrupt bhi     │
│   nahi hue" 😏                 │
│                                 │
│  🪙 KharchaKitab              │
└─────────────────────────────────┘
```

### Shareability

- Rendered as canvas/image (html2canvas)
- Share via native share API (works on PWA)
- Designed for Instagram Stories / WhatsApp Status (9:16)
- Branded with KharchaKitab logo

### Psychology

- **Shareability = organic growth:** Monthly shareable cards normalize expense tracking
- **Closure:** Gives meaning to a month of daily logging
- **Sikke as stat:** Shows historical progress, no reward attached

---

## 4. Feature: Sabse Sasta Comparisons

> **Doc:** games_1 (Feature 10)

### Input

- User provides: City tier (metro/tier1/tier2/tier3), Income bracket (25k-50k/50k-75k/75k-100k/100k+)
- Stored in localStorage as `kk_benchmark_city_tier`, `kk_benchmark_income_bracket`

### Outcome

Per-category benchmark comparison bars in analytics:
- "Mumbai mein aapke jaisi income wale log average ₹4,200/month food pe kharcha karte hain. Aapne ₹3,800 kharcha kiya — shandaar!"
- Shows: Your spending vs national average per category

### Data Source

Hardcoded benchmark JSON from public data (RBI HCES, NSSO) — no server needed. Update with app releases.

### Privacy

- No data leaves the device
- Benchmark data is one-way (app has data, user data stays local)

### Psychology

- **Social comparison:** Users want to know how they stack up
- **Sikke role:** None — purely informational motivation

---

## 5. Game: Kitna Jaante Ho? — Couple Prediction Game

> **Doc:** games_2 (Game 1)

### Input

**Daily (8 PM):**
- Both partners must log expenses during the day (this is the trojan horse)
- Each partner answers 3 questions about the OTHER's spending:
  - Amount guess: "Partner ne aaj food pe kitna kharcha kiya?"
  - Category guess: "Partner ka sabse bada kharcha kis category mein tha?"
  - Count guess: "Partner ne aaj kitne transactions kiye?"
  - Yes/No: "Kya partner ne aaj cash use kiya?"
  - Comparison: "Partner ne aaj zyada kharcha kiya ya tum ne?"

### Outcome

| Accuracy | Points |
|----------|--------|
| Within 10% | 3 points (🎯 "Ekdum sahi!") |
| Within 25% | 2 points ("Bahut kareeb!") |
| Within 50% | 1 point ("Thoda door") |
| More than 50% off | 0 points |

**Weekly tiers:**
- 90%+ : "Jodi No. 1 — Dil se jaante ho!" ❤️
- 70-89%: "Ache se jaante ho — par thoda aur dhyaan do" 👍
- 50-69%: "Average — kharche pe baat karo kabhi" 😅
- Below 50%: "Partner kaun hai — yaad hai na?" 😬

**Sikke:** Weekly winner gets bonus Sikke + bragging rights

### Shareability

- Daily result card shareable on WhatsApp/Instagram
- Shows: both partners' answers, actual values, score, Apni Awaaz roast

### Edge Cases

- Partner hasn't logged: Show nudge instead of quiz
- Only 1-2 transactions: Reduce to 1-2 questions
- Not paired: Game hidden, show teaser

### Storage

```typescript
interface DailyQuiz {
  date: string;
  questions: QuizQuestion[];
  myAnswers: number[] | string[];
  revealedAt: string | null;
  score: number;
}

kk_kjh_quizzes: DailyQuiz[]      // Last 30 days
kk_kjh_weekly_score: number       // Current week
kk_kjh_best_week: number          // Highest ever
```

### Why It Works

- **Trojan horse:** Cannot play without both partners logging expenses
- **Daily ritual:** One round per day like Wordle
- **Uses existing infrastructure:** Household pairing + WebRTC sync
- **Emotionally engaging:** "How well do you know your partner?"

---

## 6. Game: Saste Ka Saudagar — Daily Price Guessing

> **Doc:** games_2 (Game 4)

### Input

**Daily (8 AM):**
- One question: "Mumbai mein 1 plate momos ka average price kya hai?"
- User guesses using slider/number input
- Categories: street food, groceries, transport, services, dining, utilities, entertainment

### Outcome

| Accuracy | Feedback |
|----------|----------|
| Within 5% | 🎯 "Ekdum sahi! Saste Ka Saudagar!" |
| Within 15% | 🟢 "Bahut kareeb!" |
| Within 30% | 🟡 "Thoda door" |
| More than 30% | 🔴 "Mehnga padh gaya guess!" |

**Personal comparison (the trojan horse):**
> "Average: ₹120. Tumne last month momos pe average ₹95 kharcha kiya — tum toh average se bhi saste mein kha rahe ho! 🎉"

**Shareable result card:**
```
Saste Ka Saudagar 🏷️ #142

Item: 1 plate momos (Mumbai)
Average: ₹120
My guess: ₹100
Accuracy: 83% 🟢

Streak: 12 days 🔥

KharchaKitab
```

**Sikke:** Bonus for accuracy streaks

### Question Selection

- Deterministic from date + city seed (all users in same city get same question)
- Hardcoded from public data (Numbeo, Zomato, government bulletins)
- City-specific: Mumbai, Delhi, Bangalore, Hyderabad, Chennai, Kolkata, Pune

### Storage

```typescript
interface SasteKaSaudagar {
  currentStreak: number;
  bestStreak: number;
  totalPlayed: number;
  totalCorrect: number;
  history: DailyGuess[];  // Last 30 days
}
```

### Why It Works

- **Wordle proved daily puzzles create massive habits**
- **"Guess the price" is universally fun** (The Price Is Right ran 50+ years)
- **City-specific Indian context** makes it shareable and debatable
- **Trojan horse is subtle:** Personal comparison naturally leads to logging

---

## 7. Game: Kharcha Poker — Weekly Spending Bet

> **Doc:** games_2 (Game 5)

### Input

**Weekly (Monday):**
- User places bets (staking 20-100 Sikke) on their own spending behavior
- Available bets:
  - Category cap: "Food pe ₹3,000 se kam"
  - Total cap: "Total kharcha ₹10,000 se kam"
  - Logging consistency: "Har din log karunga"
  - No-spend day: "Iss hafte ek din kuch nahi kharunga"
  - Cash-free week: "Poora hafta sirf UPI"

**Couples mode:**
- Bet against partner's spending behavior
- "Partner food pe ₹X se zyada kharcha karega"
- "Main partner se kam kharcha karunga"
- Partner sees bets → creates playful tension all week

### Outcome

| Result | Payout |
|--------|--------|
| Target hit | 2x Sikke back |
| Target missed | Lose staked Sikke |
| Partial hit (6/7 days) | 1x Sikke back (break even) |

**Sunday reveal:** Dramatic results screen showing all bets and outcomes

### Sikke Role

**Primary outcome** — Sikke is the actual stake. This is the only game where Sikke can be lost, not just earned.

### Storage

```typescript
interface WeeklyBet {
  weekNumber: number;
  bets: Bet[];
  resolvedAt: string | null;
}

interface Bet {
  type: "category_cap" | "total_cap" | "logging" | "no_spend" | "partner_prediction";
  target: number | string;
  stake: number;
  result: "won" | "lost" | "partial" | "pending";
  payout: number;
}
```

### Why It Works

- **Betting is inherently exciting:** Fantasy sports (Dream11 in India) is ₹34,000 crore industry
- **Skin in the game:** Staking Sikke makes outcome matter
- **Couples bets create week-long narrative:** "She bet I'd overspend — I'll prove her wrong"
- **Self-fulfilling trojan horse:** Betting forces thinking about budget + accurate tracking

### Dependencies

- Requires Sikke system (implemented first)
- Couples mode requires household pairing (already exists)

---

## 8. Implementation Priority

### Phase 1: Quick Wins (Weeks 1-4)

| Priority | Game/Feature | Why |
|----------|--------------|-----|
| 1 | **Saste Ka Saudagar** | Easiest to build, validates daily-puzzle loop, works for singles |
| 2 | **Kitna Jaante Ho?** | Strongest trojan horse, perfect for couples (core use case), low effort |

### Phase 2: Sikke Integration (Weeks 5-8)

| Priority | Game/Feature | Why |
|----------|--------------|-----|
| 3 | **Sikke System** | Base layer needed for stakes |
| 4 | **Kharcha Poker** | Adds weekly stakes, uses Sikke as primary outcome |

### Phase 3: Secondary Features (Weeks 9-12)

| Priority | Game/Feature | Why |
|----------|--------------|-----|
| 5 | **Hafta Challenge** | Weekly engagement booster |
| 6 | **Mahina Report** | Shareable monthly recap |
| 7 | **Sabse Sasta Comparisons** | Informational benchmark |

---

## Summary Table

| Game/Feature | Input | Primary Outcome | Sikke Role |
|--------------|-------|-----------------|------------|
| **Saste Ka Saudagar** | Daily price guess | Shareable result card + streak | Bonus for accuracy streaks |
| **Kitna Jaante Ho?** | Partner spending guesses | Weekly tier badge + shareable | Bonus for weekly winner |
| **Kharcha Poker** | Weekly bet placement | Actual Sikke transfer (win/lose) | **Primary — real stakes** |
| **Hafta Challenge** | Weekly action tasks | Celebration card + badge | 50 Sikke on completion |
| **Mahina Report** | Monthly transaction data | Shareable 9:16 image | Displays stat only |
| **Sabse Sasta Comparisons** | City/income selection | Benchmark bars + roast | None |

---

## Psychology Framework (Reference)

### The "Hooked" Model

```
Trigger (push notification / Apni Awaaz nudge / streak anxiety)
    → Action (open app, log expense)
        → Variable Reward (Sikke earned, badge, challenge progress, game result)
            → Investment (streak grows, Sikke accumulate, level increases, badges collected)
```

### Key Psychology Principles Used

1. **Variable ratio reinforcement** — Different actions earn different Sikke
2. **Loss aversion** — Streak anxiety + bet stakes
3. **Endowment effect** — Accumulated Sikke feel like "yours"
4. **Social proof** — Comparisons, leaderboards, couple games
5. **Closure** — Monthly reports give meaning to daily logging
6. **Novelty** — Weekly challenges change preventing habituation
7. **Trojan horse** — Games require expense logging to function