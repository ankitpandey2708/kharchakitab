# Trojan Horse Games — KharchaKitab

> **Core Philosophy:** People don't open KharchaKitab to track expenses. They open it to play a game, check on their pet, or compete with their partner. Expense tracking is the **entry ticket**, not the main event.
>
> **Inspiration:** Pokemon Go made people walk 10km without thinking about exercise. Fortune City made people track expenses to build a virtual city. CRED made people pay bills to play slot machines. The "boring thing" is hidden inside something fun.
>
> **This document complements `gamification-blueprint.md`** — that doc covers making the tracking flow more rewarding (Sikke, badges, streaks). This doc covers **standalone games and entertainment** that create an independent reason to open the app, with expense tracking woven in subtly.

---

## Table of Contents

1. [The Trojan Horse Principle](#1-the-trojan-horse-principle)
2. [Research: Apps That Got This Right](#2-research-apps-that-got-this-right)
3. [Game 1: Kitna Jaante Ho? — Couple Prediction Game](#3-game-1-kitna-jaante-ho--couple-prediction-game)
4. [Game 2: Gullak Pet — Virtual Piggy Bank Creature](#4-game-2-gullak-pet--virtual-piggy-bank-creature)
5. [Game 3: Dukaan — Build Your Virtual Business](#5-game-3-dukaan--build-your-virtual-business)
6. [Game 4: Saste Ka Saudagar — Daily Price Guessing Game](#6-game-4-saste-ka-saudagar--daily-price-guessing-game)
7. [Game 5: Kharcha Poker — Weekly Spending Bet](#7-game-5-kharcha-poker--weekly-spending-bet)
8. [Game 6: Kharcha Rummy — Couple Card Game](#8-game-6-kharcha-rummy--couple-card-game)
9. [Comparison Matrix](#9-comparison-matrix)
10. [Recommendation & Phasing](#10-recommendation--phasing)
11. [Feasibility & Architecture Notes](#11-feasibility--architecture-notes)
12. [Psychology & Research References](#12-psychology--research-references)

---

## 1. The Trojan Horse Principle

### The Problem With Gamified Tracking

Traditional gamification (streaks, badges, XP) makes the boring thing *less* boring. But the user still opens the app thinking "I need to log my expenses." The mental model is duty, not play.

### The Trojan Horse Flip

The user opens the app thinking "I want to play my game / check my pet / beat my partner." Expense tracking happens as a **side effect** of playing. The mental model is play, not duty.

### Proven Examples

| App | Users think they're... | But they're actually... | Scale |
|-----|------------------------|------------------------|-------|
| Pokemon Go | Catching Pokemon | Walking 5-10km daily | 150M+ MAU |
| Fortune City | Building a SimCity | Tracking every expense | 10M+ downloads |
| CRED | Playing slot machines / scratch cards | Paying credit card bills on time | 7.5M+ users |
| Finch | Raising a baby bird | Completing self-care tasks daily | Millions of users |
| Ant Forest (Alipay) | Growing a virtual forest | Reducing carbon footprint | 650M users |
| Zombies, Run! | Surviving a zombie apocalypse | Running/cardio exercise | 10M+ downloads |
| Habitica | Playing an RPG | Completing daily tasks/habits | 4M+ users |
| Duolingo | Competing in Diamond League | Learning a language | 47M DAU |

### The Key Insight

**The game must be fun with ZERO utility context.** If you strip away the expense tracking layer, the game should still be something people would play. Fortune City is a real city builder. CRED has real slot machines. Finch is a real pet sim. The finance layer is the input mechanism, not the fun.

### How This Applies to KharchaKitab

KharchaKitab's unique assets for game design:
- **Couples pairing already exists** (WebRTC sync) — couple games are a natural fit
- **Voice input** — can create voice-based game interactions
- **Hinglish personality** (Apni Awaaz) — a sassy game narrator already exists
- **Indian cultural context** — card games (Rummy/Teen Patti), dukaan/business culture, family dynamics
- **Offline-first architecture** — games must work without internet
- **Transaction data** — rich, personal, daily-updating dataset to fuel game mechanics

---

## 2. Research: Apps That Got This Right

### Fortune City (Expense Tracker → City Builder)

**How it works:**
- Every expense logged builds a building in your virtual city
- Food expense → restaurant building. Transport → bus station. Shopping → mall.
- 100+ unique building styles, citizens who "apply" to live in your city
- Up to 5 buildings per day (encourages spreading logs across the day)
- City grows visually over months — users screenshot and share their cities

**Why people play:** City builders (SimCity, Cities Skylines) are a billion-dollar genre. Watching your creation grow over time is deeply satisfying. The expense tracking is just the construction input.

**Key lesson for KharchaKitab:** The visual payoff of seeing something grow from your daily actions is the core loop. The growth must be visible, tangible, and shareable.

### CRED (Bill Payment → Casino Games)

**How it works:**
- Pay credit card bill → earn CRED coins
- Spend coins on:
  - **Jackpot Slots:** 777 slot machine. Prizes: iPhones, laptops, Harley Davidsons.
  - **Kill the Bill:** Scratch cards revealing cashback amounts (max 5/month, 1000 coins each)
  - **Spin the Wheel:** Daily spin for bitcoins, gift vouchers, cashback
- Daily limits create scarcity → users return every 24 hours

**Why people play:** Casino mechanics (variable-ratio reinforcement) are the most psychologically compelling game format ever designed. The "what will I win?" moment is pure dopamine.

**Key lesson for KharchaKitab:** Variable rewards (scratch card / spin the wheel) are more engaging than predictable rewards. But CRED's approach requires real prizes — KharchaKitab would need to use virtual currency/cosmetics instead.

### Finch (Self-Care → Virtual Pet)

**How it works:**
- Hatch a baby bird, name it, assign pronouns
- Complete self-care tasks (drink water, journal, stretch) → bird earns energy
- Bird goes on adventures, discovers items, grows over time
- Neglect tasks → bird looks sad and lethargic
- Earn Rainbow Stones to buy outfits, furniture, micropets (tiny companion creatures)

**Why people play:** Emotional attachment to a virtual creature. The guilt of a sad Finch is more motivating than any badge. Tamagotchi sold 82 million units on this same mechanic.

**Key lesson for KharchaKitab:** Emotional guilt (neglected pet) is a stronger motivator than reward (earned badge). Loss aversion applied to an emotional bond.

### Couple Quiz Apps (Paired, Couple Game, Lovewick)

**How they work:**
- **Couple Game:** One partner answers 10 questions. Other partner guesses what they answered. Score points for correct guesses. 22 quiz packs.
- **Paired:** Daily questions pushed to both partners simultaneously. "Your partner just answered — now it's your turn."
- **Lovewick:** Therapist-designed conversation cards rather than competitive quizzes.

**Common mechanic:** The **prediction-reveal loop** — predict what your partner will say, then see the real answer. This works because:
- Surprise of being wrong ("You think THAT?!")
- Validation of being right ("I know you so well")
- Intimacy of learning something new about someone you think you know
- FOMO from "partner already answered" notifications

**Key lesson for KharchaKitab:** The prediction-reveal loop is the perfect mechanic for couples + expense data. "Guess how much your partner spent on food today" is inherently interesting AND requires both partners to log expenses.

### Ant Forest (Alipay — Environmental Behavior → Virtual Forest)

**How it works:**
- Low-carbon activities (paying bills online, cycling, walking) earn "green energy points"
- Points grow a virtual tree over days/weeks
- Social: Compare your forest with friends, "steal" energy from friends' trees each morning
- For every virtual tree fully grown, Alipay plants a REAL tree in Inner Mongolia
- 650 million users, 120+ million real trees planted

**Key lesson for KharchaKitab:** Connecting virtual progress to real-world impact is enormously motivating. The social "steal energy" mechanic creates daily engagement (check friends' trees every morning). Could KharchaKitab's savings translate to something tangible?

---

## 3. Game 1: Kitna Jaante Ho? — Couple Prediction Game

### Concept

A daily couple quiz where each partner predicts the other's spending behavior. The fun is in the prediction and reveal — "How well do you REALLY know your partner's spending?"

### How It Works

#### Daily Flow (Evening, ~8 PM)

**Step 1: Both partners log expenses throughout the day** (this is the trojan horse — logging is required for the game to have questions)

**Step 2: At 8 PM, push notification:**
> "Partner ne aaj ke kharche log kar diye. 3 sawaal tayaar hain — kitna jaante ho? 🤔"

**Step 3: Each partner gets 3 questions about the OTHER's spending:**

Question types (randomly selected each day):

| Type | Example Question | Answer Source |
|------|-----------------|---------------|
| Amount guess | "Partner ne aaj food pe kitna kharcha kiya?" | Sum of partner's food transactions today |
| Category guess | "Partner ka sabse bada kharcha kis category mein tha?" | Partner's highest-spend category today |
| Count guess | "Partner ne aaj kitne transactions kiye?" | Count of partner's transactions today |
| Item guess | "Partner ne aaj sabse mehnga kya kharida?" | Partner's largest single transaction |
| Yes/No | "Kya partner ne aaj cash use kiya?" | Whether partner has any cash transactions |
| Comparison | "Partner ne aaj zyada kharcha kiya ya tum ne?" | Compare totals |
| Specific amount | "Partner ka auto/cab ka kharcha kitna tha?" | Sum of partner's travel expenses |

**Step 4: Scoring**

| Accuracy | Points |
|----------|--------|
| Within 10% of actual | 3 points (🎯 "Ekdum sahi!") |
| Within 25% | 2 points ("Bahut kareeb!") |
| Within 50% | 1 point ("Thoda door, par theek") |
| More than 50% off | 0 points ("Bilkul galat — partner ko jaano!") |

For multiple-choice/yes-no questions: correct = 3 points, wrong = 0.

**Step 5: Daily reveal screen**
Show both partners' answers side by side with the real data. Highlight surprises. Generate a Hinglish one-liner via Apni Awaaz:
> "Tumhe lagta tha partner ne ₹200 ka chai piya? Asli mein ₹800 ka shopping kiya. Aankhein kholo! 😂"

#### Weekly Scorecard

- Accumulate daily scores across the week
- Weekly "Kitna Jaante Ho?" percentage: (points earned / max possible) × 100
- Tiers:
  - 90%+ : "Jodi No. 1 — Dil se jaante ho!" ❤️
  - 70-89%: "Ache se jaante ho — par thoda aur dhyaan do" 👍
  - 50-69%: "Average — kharche pe baat karo kabhi" 😅
  - Below 50%: "Partner kaun hai — yaad hai na?" 😬
- Weekly winner gets bragging rights + bonus Sikke (if Sikke system exists)

### Question Generation Logic

```typescript
interface DailyQuiz {
  date: string;                    // ISO date
  questions: QuizQuestion[];       // 3 questions
  partnerAnswered: boolean;        // Whether partner has submitted answers
  myAnswers: number[] | string[];  // User's guesses
  revealedAt: string | null;       // When results were shown
  score: number;                   // 0-9 points
}

interface QuizQuestion {
  type: "amount" | "category" | "count" | "item" | "yesno" | "comparison" | "specific_amount";
  questionText: string;            // Hinglish question
  correctAnswer: number | string;  // Derived from partner's actual transactions
  category?: string;               // If question is category-specific
}

// Question generation runs locally on each device
// Uses partner's synced transaction data from IndexedDB
// Selects 3 random question types, avoiding repeats from yesterday
function generateDailyQuiz(partnerTransactions: Transaction[], date: string): DailyQuiz {
  // Filter partner's transactions for today
  // Select 3 question types (deterministic from date seed so both devices generate same quiz)
  // Compute correct answers from transaction data
}
```

### Edge Cases

- **Partner hasn't logged anything today:** Show a nudge instead of quiz: "Partner ne aaj kuch log nahi kiya. Unhe yaad dilao toh game khel paoge!"
- **Only 1-2 transactions by partner:** Reduce to 1-2 questions instead of 3. Show: "Partner ne aaj sirf 1 cheez log ki — easy round!"
- **User hasn't logged anything today:** Can still guess partner's spending (their side of the game works). But nudge: "Tumne bhi log karo toh partner bhi guess kar payega!"
- **Not paired:** Game is hidden/inaccessible. Show a teaser: "Partner ke saath pair karo aur Kitna Jaante Ho khelo!"

### UI/UX Sketch

```
┌─────────────────────────────────┐
│  🤔 KITNA JAANTE HO?           │
│  Aaj ke 3 sawaal                │
│                                 │
│  Q1: Partner ne aaj food pe     │
│      kitna kharcha kiya?        │
│                                 │
│  ┌─────────────────────────┐    │
│  │  ₹ [slider: 0 — 2000]  │    │
│  │  Your guess: ₹450       │    │
│  └─────────────────────────┘    │
│                                 │
│  Q2: Sabse bada kharcha kis     │
│      category mein?             │
│  ○ Food  ○ Travel  ● Shopping  │
│  ○ Bills ○ Other               │
│                                 │
│  Q3: Kitne transactions kiye?   │
│  ┌─────────────────────────┐    │
│  │  [  -  ]   7   [  +  ]  │    │
│  └─────────────────────────┘    │
│                                 │
│  [ Submit Answers →  ]          │
│                                 │
│  ⏰ Partner ka jawab aa chuka   │
│     hai — guess karo!           │
└─────────────────────────────────┘
```

**Reveal Screen:**
```
┌─────────────────────────────────┐
│  📊 AAJ KA RESULT               │
│                                 │
│  Q1: Food kharcha               │
│  Tumhara guess: ₹450           │
│  Asli: ₹380     🎯 3 points!  │
│                                 │
│  Q2: Sabse badi category        │
│  Tumhara guess: Shopping        │
│  Asli: Food      ❌ 0 points   │
│                                 │
│  Q3: Transaction count          │
│  Tumhara guess: 7              │
│  Asli: 5         👍 2 points   │
│                                 │
│  ─────────────────────────────  │
│  Aaj ka score: 5/9             │
│  Weekly: 68% — "Average" 😅   │
│                                 │
│  "Shopping nahi, khaana!        │
│   Partner ko itna bhi nahi      │
│   jaante? Sharma nahi lagi?" 😏 │
│              — Apni Awaaz       │
│                                 │
│  [ Share Result 📤 ]            │
└─────────────────────────────────┘
```

### Storage

```typescript
// localStorage
kk_kjh_quizzes: DailyQuiz[]       // Last 30 days of quiz data
kk_kjh_weekly_score: number        // Current week's accumulated score
kk_kjh_streak: number             // Consecutive days both partners played
kk_kjh_best_week: number          // Highest weekly percentage ever
```

### Why This Is the #1 Recommendation

1. **Strongest trojan horse:** The game literally cannot function without both partners logging expenses. No other mechanic forces this so naturally.
2. **Daily ritual creation:** Like Wordle, it's one round per day. Creates anticipation ("has partner answered yet?").
3. **Uses existing infrastructure:** Household pairing + WebRTC sync already provides all the data needed.
4. **Low build effort:** No art assets, no complex game logic. Just questions, guesses, and comparisons.
5. **Emotionally engaging:** "How well do you know your partner?" is universally interesting for couples.
6. **Shareable:** Daily results can be shared as images on WhatsApp/Instagram — organic growth.
7. **Culturally resonant:** Indian couples discussing money is a sensitive topic — making it playful breaks the taboo.

---

## 4. Game 2: Gullak Pet — Virtual Piggy Bank Creature

### Concept

A living, animated Gullak (piggy bank) creature that the user raises and cares for. The Gullak's health, mood, and growth are tied to the user's expense tracking and budgeting behavior.

### The Gullak's Personality

The Gullak is a small, round, metallic piggy bank with:
- **Eyes** that express emotion (happy, sleepy, worried, excited, sad)
- **A coin slot** on its back that glows when you log expenses
- **Little legs** that wiggle when it walks around its room
- **Accessories** (hats, scarves, glasses, capes) that can be unlocked

### Behavior Mapping

| User Action | Gullak Reaction |
|-------------|----------------|
| Log an expense | Coin animation into slot, happy wiggle, "+1 fed!" |
| Log via voice | Extra-excited reaction (bounces, sparkles) |
| Stay under daily budget | Gullak grows slightly bigger, does a little dance |
| Overspend (above budget) | Gullak looks worried, sweats, turns slightly red |
| Maintain 7-day streak | Gullak unlocks a new accessory |
| Miss a day of logging | Gullak looks sad, droopy eyes, sits in corner |
| Miss 3+ days | Gullak falls asleep (hibernation mode), needs "waking up" |
| Log a no-spend day | Gullak meditates peacefully, zen music |
| Reach a budget milestone | Gullak celebrates (confetti, party hat appears) |

### Growth Stages

The Gullak evolves through stages based on consistent tracking + saving:

| Stage | Name | Requirement | Visual |
|-------|------|-------------|--------|
| 1 | Baby Gullak | Day 1 | Tiny, dull copper, no accessories |
| 2 | Chhota Gullak | 7-day streak + under budget 3 days | Slightly bigger, shinier, eyes more expressive |
| 3 | Pakka Gullak | 30-day streak + under budget 15 days | Medium, silver tint, room gets furniture |
| 4 | Sona Gullak | 100-day streak + under budget 50 days | Large, golden, full room, multiple accessories |
| 5 | Heera Gullak | 365-day streak + under budget 200 days | Diamond-encrusted, crown, palace room |

### The Room

The Gullak lives in a small room that evolves:
- **Stage 1:** Empty floor, single cushion
- **Stage 2:** Small rug, a plant, a window
- **Stage 3:** Bookshelf, paintings, better furniture
- **Stage 4:** Luxurious room, chandelier, multiple decorations
- **Stage 5:** Palace setting, fountain, garden view

Room items are unlocked through milestones or purchased with Sikke.

### For Couples (Paired Households)

When both partners are paired:
- Both Gullaks live in the **same room**
- If both log consistently → Gullaks play together, high-five, share food
- If one partner neglects logging → their Gullak sulks while the other tries to cheer it up
- If both neglect → both Gullaks are sad, room gets dusty
- Couple milestones unlock couple-specific room items (a shared sofa, family photo, etc.)

### Storage

```typescript
// localStorage
interface GullakState {
  stage: 1 | 2 | 3 | 4 | 5;
  mood: "happy" | "excited" | "neutral" | "worried" | "sad" | "sleeping";
  lastFedDate: string;               // ISO date of last expense log
  consecutiveFedDays: number;         // For stage progression
  underBudgetDays: number;            // Lifetime count
  unlockedAccessories: string[];      // IDs of unlocked accessories
  equippedAccessory: string | null;   // Currently worn accessory
  unlockedRoomItems: string[];        // IDs of unlocked room decorations
  totalFeedCount: number;             // Total expenses logged (lifetime)
}

kk_gullak: GullakState
```

### Implementation Considerations

- **Art assets required:** This is the highest-effort feature. Need character design, multiple expressions, room assets, accessories. Options:
  - Commission a pixel-art or vector-art Gullak character set
  - Use Lottie animations for expressions/reactions
  - Start minimal (2D, simple shapes) and iterate
- **Animation framework:** Framer Motion (already in the codebase) can handle most animations. For complex character animation, consider Rive or Lottie.
- **Performance:** Gullak screen should be lightweight. Pre-render states, don't animate continuously. Animate on interaction/transition only.
- **Offline:** All Gullak logic runs locally. No server needed.

### Why This Works

- **Emotional guilt > rational motivation:** A sad Gullak sitting in a corner is more motivating than a "you missed a day" notification. Tamagotchi proved this — people set alarms at 3 AM to feed their virtual pets.
- **Visual progress:** Watching the Gullak grow from a dull copper baby to a diamond-encrusted creature over months is deeply satisfying.
- **Couples bond:** Two Gullaks interacting in a shared room creates shared emotional investment. Neither partner wants to be the one whose Gullak is sad.
- **Shareability:** "Look at my Sona Gullak!" is inherently shareable content.

---

## 5. Game 3: Dukaan — Build Your Virtual Business

### Concept

The user runs a virtual dukaan (shop/business). Real-life savings (budget minus actual spending) become "investment capital" that grows the business. The more you save IRL, the faster your virtual empire grows.

### How It Works

#### Core Loop

```
Log expenses accurately → Know your real spending → Calculate savings
    → Savings become investment capital → Invest in your Dukaan
        → Dukaan grows → Revenue increases → Unlock new business types
            → Want more growth → Save more IRL → Log more accurately
```

#### Business Progression

| Level | Business Type | Capital to Unlock | Daily Virtual Revenue |
|-------|--------------|-------------------|----------------------|
| 1 | Paan ki Dukaan | ₹0 (start here) | ₹50/day |
| 2 | Chai Stall | ₹2,000 saved | ₹150/day |
| 3 | Kirana Store | ₹5,000 saved | ₹400/day |
| 4 | Restaurant | ₹15,000 saved | ₹1,000/day |
| 5 | Clothing Shop | ₹30,000 saved | ₹2,500/day |
| 6 | Electronics Store | ₹60,000 saved | ₹5,000/day |
| 7 | Shopping Mall | ₹1,50,000 saved | ₹15,000/day |
| 8 | Hotel Chain | ₹3,00,000 saved | ₹40,000/day |
| 9 | Business Empire | ₹5,00,000 saved | ₹1,00,000/day |

(Savings are cumulative across months — total lifetime savings = total capital)

#### Investment Mechanics

Each month:
1. App calculates: `savings = budget - actual_spending`
2. If positive: savings added to investment capital
3. If negative: nothing lost (no punishment for overspending — just no growth)
4. User can "invest" capital into:
   - **Upgrading current business** (better visual, higher revenue)
   - **Unlocking next business level** (when capital threshold met)
   - **Hiring virtual staff** (cosmetic — adds characters to the shop)
   - **Decorating the shop** (cosmetic — signs, plants, lighting)

#### Daily Engagement

Even on days between month-ends:
- **Virtual revenue ticks in:** Open the app to see how much your Dukaan "earned" since last visit
- **Customer events:** Random events like "Aaj festival hai — 2x customers!" or "Baarish mein koi nahi aaya — slow day"
- **Staff interactions:** Virtual staff say Hinglish one-liners about the business
- **Competitor events:** "Saamne wali dukaan ne sale lagayi — tum bhi kuch karo!" (purely cosmetic/fun)

#### For Couples

- Run the Dukaan together as co-owners
- Both partners' savings contribute to the capital pool
- "Employee of the Month" award to the partner who saved more
- Argue about whether to invest in decoration or expansion (playful decision-making together)

### Storage

```typescript
interface DukaanState {
  level: number;                      // Current business level (1-9)
  businessType: string;               // Current business name
  totalCapital: number;               // Lifetime savings invested
  availableCapital: number;           // Unspent capital
  virtualRevenue: number;             // Total virtual revenue earned
  lastRevenueCollected: string;       // ISO timestamp
  staff: string[];                    // IDs of hired virtual staff
  decorations: string[];              // IDs of purchased decorations
  upgradeLevel: number;               // Current business upgrade tier
}

kk_dukaan: DukaanState
```

### Why This Works

- **Idle/tycoon games are massive:** AdVenture Capitalist, Idle Miner Tycoon, and similar games have hundreds of millions of downloads. People love watching numbers go up.
- **Culturally resonant:** "Dukaan" is a universally understood concept in India. Every family has dreamed of or runs a small business.
- **Savings incentive:** Unlike other games that just require logging, this one incentivizes actual under-spending. The game is better when you save more.
- **Long-term stickiness:** Business progression takes months — users are invested for the long haul.

---

## 6. Game 4: Saste Ka Saudagar — Daily Price Guessing Game

### Concept

A Wordle-style daily game: guess the average price of a common item/service in your city. One question per day, streak tracking, shareable results.

### How It Works

#### Daily Flow

1. **One question appears each day at 8 AM:**
   > "Mumbai mein 1 plate momos ka average price kya hai?"

2. **User guesses** using a slider or number input

3. **Reveal with feedback:**
   - Within 5%: 🎯 "Ekdum sahi! Saste Ka Saudagar!"
   - Within 15%: 🟢 "Bahut kareeb!"
   - Within 30%: 🟡 "Thoda door"
   - More than 30%: 🔴 "Mehnga padh gaya guess!"

4. **Personal comparison (the trojan horse):**
   > "Average: ₹120. Tumne last month momos pe average ₹95 kharcha kiya — tum toh average se bhi saste mein kha rahe ho! 🎉"

   This comparison requires the user to have logged food expenses — subtly encouraging tracking.

5. **Shareable result card:**
   ```
   Saste Ka Saudagar 🏷️ #142

   Item: 1 plate momos (Mumbai)
   Average: ₹120
   My guess: ₹100
   Accuracy: 83% 🟢

   Streak: 12 days 🔥

   KharchaKitab
   ```

#### Question Bank

Categories of questions:

| Category | Example Questions |
|----------|-----------------|
| Street Food | "1 plate momos", "1 vada pav", "1 plate chole bhature", "1 chai" |
| Groceries | "1kg tomatoes", "1L milk", "1kg rice (basmati)", "1 dozen eggs" |
| Transport | "Uber/Ola 5km ride", "Auto 3km", "Metro monthly pass" |
| Services | "Haircut (men's)", "Laundry 1kg", "Maid (monthly)", "WiFi monthly bill" |
| Dining | "2 people dinner (mid-range restaurant)", "1 coffee (Starbucks)", "1 pizza (Dominos medium)" |
| Utilities | "Electricity bill (2BHK, summer)", "Mobile recharge (monthly)", "LPG cylinder" |
| Entertainment | "Movie ticket (multiplex)", "Netflix monthly", "Gym monthly" |

**Data sourcing:**
- Hardcoded from public data: Numbeo, Zomato averages, government price bulletins
- City-specific where possible (Metro: Mumbai, Delhi, Bangalore, Hyderabad, Chennai, Kolkata, Pune)
- Update the dataset with each app release
- Future: Crowdsource from anonymized KharchaKitab user data (requires opt-in + server)

#### Question Selection

```typescript
// Deterministic from date — all users in same city get same question
function getDailyQuestion(date: string, city: string): PriceQuestion {
  const seed = hashCode(date + city);
  const pool = getQuestionsForCity(city);
  return pool[seed % pool.length];
}
```

### Storage

```typescript
interface SasteKaSaudagar {
  currentStreak: number;
  bestStreak: number;
  totalPlayed: number;
  totalCorrect: number;           // Within 15% accuracy
  lastPlayedDate: string;
  history: DailyGuess[];          // Last 30 days
}

interface DailyGuess {
  date: string;
  questionId: string;
  guess: number;
  actual: number;
  accuracy: number;               // Percentage
}

kk_sks: SasteKaSaudagar
```

### Why This Works

- **Wordle proved daily puzzles create massive habits:** 2M+ daily players at peak, purely through shareable results
- **"Guess the price" is universally fun:** The Price Is Right has run for 50+ years on this mechanic
- **City-specific Indian context:** "Mumbai mein momos kitne ka hai?" is a conversation starter — shareable and debatable
- **Low build effort:** No art, no complex logic. Just a question, a slider, and a reveal animation.
- **Trojan horse is subtle:** The personal comparison ("you spent ₹X on this") naturally leads to checking/logging expenses

---

## 7. Game 5: Kharcha Poker — Weekly Spending Bet

### Concept

At the start of each week, users place bets (using Sikke from the gamification system) on their own spending behavior. Hit your target = double your Sikke. Miss it = lose your bet. For couples: bet against each other's spending.

### How It Works

#### Solo Mode: Bet on Yourself

**Monday morning notification:**
> "Naya hafta, naya daav! Kya bet lagaoge?"

**Available bets (choose 1-3):**

| Bet | Example | Difficulty |
|-----|---------|-----------|
| Category cap | "Food pe ₹3,000 se kam" | User sets their own target |
| Total cap | "Total kharcha ₹10,000 se kam" | User sets target |
| Logging consistency | "Har din log karunga" | Fixed |
| No-spend day | "Iss hafte ek din kuch nahi kharunga" | Fixed |
| Cash-free week | "Poora hafta sirf UPI" | Fixed |

**Bet mechanics:**
- User stakes 20-100 Sikke per bet (their choice — higher risk, higher reward)
- Hit the target → 2x Sikke back
- Miss → lose the staked Sikke
- Partial hits (e.g., 6 out of 7 days logged) → 1x Sikke back (break even)

#### Couples Mode: Bet Against Each Other

**Monday morning, both partners see:**
> "Partner ke baare mein bet lagao!"

**Couple-specific bets:**

| Bet | How it works |
|-----|-------------|
| "Partner food pe ₹X se zyada kharcha karega" | If partner overspends on food, you win |
| "Main partner se kam kharcha karunga" | Total spending comparison |
| "Partner streak todega iss hafte" | Bet on partner missing a logging day |
| "Dono ka combined food kharcha ₹X se kam hoga" | Collaborative bet — both win or both lose |

**Social dynamics:**
- Bets are visible to both partners → creates playful tension all week
- "Tumne mere shopping pe bet lagayi? Ab toh main nahi khareedunga!" → the bet itself changes behavior
- Sunday evening reveal: dramatic results screen showing all bets and outcomes

### Storage

```typescript
interface WeeklyBet {
  weekNumber: number;
  bets: Bet[];
  resolvedAt: string | null;
}

interface Bet {
  id: string;
  type: "category_cap" | "total_cap" | "logging" | "no_spend" | "cash_free" | "partner_prediction";
  description: string;
  target: number | string;
  stake: number;                 // Sikke staked
  result: "won" | "lost" | "partial" | "pending";
  payout: number;                // Sikke won/lost
}

kk_bets: WeeklyBet[]            // Last 8 weeks
```

### Why This Works

- **Betting is inherently exciting:** Fantasy sports (Dream11 in India) is a ₹34,000 crore industry built on this psychology
- **Skin in the game:** Staking Sikke makes the outcome matter. It's not a passive challenge — you chose to risk something.
- **Couples bets create a week-long narrative:** "She bet I'd overspend on food — I'll prove her wrong" is a fun story that plays out over 7 days
- **Self-fulfilling trojan horse:** Making a bet about spending forces you to (a) think about your budget and (b) track expenses accurately to know if you're winning

### Dependencies

- Requires Sikke system (from `gamification-blueprint.md`) to be implemented first
- Couples mode requires household pairing (already exists)

---

## 8. Game 6: Kharcha Rummy — Couple Card Game

### Concept

A simplified Rummy-inspired card game where the "cards" are derived from real expenses. Each partner gets "dealt" their actual expense data as cards, and they compete to form sets and runs.

### How It Works

#### Card Generation

Each logged expense becomes a card:
- **Suit** = Category (Food 🍕, Travel 🚗, Shopping 🛒, Bills 📱, Other ⭐)
- **Value** = Amount rounded to nearest ₹100 (e.g., ₹450 → "₹500 Food card")
- **Color** = Payment method (Green = UPI, Blue = Card, Orange = Cash)

#### Daily Round (1 round per day, 2-3 minutes)

1. Each partner is "dealt" 5 cards from their day's expenses
2. **Goal:** Form "melds" (sets or runs) for points:
   - **Set:** 3+ cards from the same category = 10 points per card
   - **Run:** 3+ cards from consecutive days (cards carry over) = 15 points per card
   - **Flush:** 3+ cards with same payment method = 5 points per card
   - **Wild card:** Earned from streak days or under-budget days. Can substitute any card.
3. Unmelded cards subtract from score (penalty for loose cards)
4. Partner with higher score wins the round
5. Weekly aggregate determines the week's winner

#### Strategic Depth

- **More expenses = more cards = better chances of melds.** This naturally encourages thorough logging.
- **Categorization matters:** If you categorize expenses accurately, your cards form cleaner sets. Miscategorized expenses become harder to meld.
- **Daily carryover:** Unused cards carry to next day's hand (up to 3). This creates multi-day strategy.
- **Trading (future feature):** Partners could trade cards — "I'll give you my ₹500 Food card for your ₹300 Travel card"

### Storage

```typescript
interface RummyState {
  currentHand: RummyCard[];        // Today's unplayed cards
  carryOver: RummyCard[];          // Cards carried from previous days (max 3)
  weeklyScore: number;
  partnerWeeklyScore: number;
  roundsPlayed: number;
  wildCards: number;               // Available wild cards
}

interface RummyCard {
  transactionId: string;           // Links to real transaction
  suit: string;                    // Category
  value: number;                   // Rounded amount
  color: string;                   // Payment method
  date: string;                    // Transaction date
}

kk_rummy: RummyState
```

### Why This Works

- **Card games are India's #1 casual game format:** Teen Patti, Rummy, and poker are cultural staples. Using expense data as cards feels both familiar and novel.
- **Categorization incentive:** Players want clean sets, which means they'll categorize expenses correctly — improving data quality as a side effect.
- **High effort, very unique:** No expense app in the world has a card game mechanic. This would be genuinely distinctive.

### Caveats

- **Highest build effort** of all 6 ideas — card game logic, UI, animations
- **Might feel forced** — the mapping of expenses to cards may feel arbitrary to some users
- **Better as a Phase 3 feature** after simpler games prove engagement

---

## 9. Comparison Matrix

| Criteria | Kitna Jaante Ho? | Gullak Pet | Dukaan | Saste Ka Saudagar | Kharcha Poker | Kharcha Rummy |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|
| **Fun without finance context** | High | High | High | Medium-High | High | Medium |
| **Trojan horse strength** | Very Strong | Strong | Strong | Medium | Very Strong | Medium |
| **Couples fit** | Perfect | Great | Good | N/A (solo) | Great | Great |
| **Singles fit** | N/A | Great | Great | Perfect | Good | N/A |
| **Build effort** | Low-Medium | High | High | Low | Low-Medium | High |
| **Art/design needed** | Minimal | Heavy | Heavy | Minimal | Minimal | Medium |
| **Daily engagement driver** | Yes (8 PM ritual) | Yes (pet mood) | Moderate (idle) | Yes (daily puzzle) | Weekly | Daily |
| **Shareability** | High | Medium | Medium | Very High (Wordle-style) | Low | Low |
| **Uniqueness** | Very High | Medium | High | Medium | High | Very High |
| **Requires Sikke system** | No | No | No | No | Yes | No |
| **Requires household pairing** | Yes | No (enhanced with) | No (enhanced with) | No | No (enhanced with) | Yes |
| **Offline compatible** | Yes | Yes | Yes | Yes | Yes | Yes |

---

## 10. Recommendation & Phasing

### Phase 1: Quick Wins (Launch within 2-4 weeks)

| Priority | Game | Why First |
|----------|------|-----------|
| 1 | **Kitna Jaante Ho?** | Strongest trojan horse, lowest effort, perfect for couples (KharchaKitab's core use case). Uses existing household pairing infrastructure. No art needed. |
| 2 | **Saste Ka Saudagar** | Wordle-level simplicity, works for singles (who can't play Kitna Jaante Ho), shareable, builds daily habit. Hardcode initial question bank. |

**Rationale:** These two games cover both user types (couples and singles) with minimal build effort. They validate whether game-based engagement works for KharchaKitab before investing in heavier features.

### Phase 2: Engagement Deepening (Month 2-3)

| Priority | Game | Why Second |
|----------|------|-----------|
| 3 | **Kharcha Poker** | Adds weekly stakes. Requires Sikke system from `gamification-blueprint.md`. Couples mode creates week-long narrative tension. |
| 4 | **Gullak Pet** (MVP version) | Start with a simple 2D Gullak — 3-4 expressions, no room customization. Prove emotional attachment works before investing in full art. |

### Phase 3: Differentiation (Month 4+)

| Priority | Game | Why Third |
|----------|------|-----------|
| 5 | **Dukaan** | Full idle tycoon game. High effort but massive long-term stickiness. Only build if Phase 1-2 shows gamification is driving retention. |
| 6 | **Kharcha Rummy** | Most ambitious, most unique. Could be the feature that makes KharchaKitab go viral — "an expense tracker with a card game" is a headline. But high risk, high effort. |

### Relationship to Gamification Blueprint

The games in this document and the mechanics in `gamification-blueprint.md` are complementary:

```
gamification-blueprint.md          trojan-horse-games.md
(Make tracking rewarding)          (Give reasons to open app beyond tracking)
         │                                    │
         ▼                                    ▼
   Sikke, Badges, Streaks             Kitna Jaante Ho?, Gullak,
   Levels, Challenges                 Dukaan, Saste Ka Saudagar,
                                      Kharcha Poker, Rummy
         │                                    │
         └──────────── BOTH FEED ─────────────┘
                         │
                         ▼
              User opens app daily,
              logs expenses thoroughly,
              stays for months/years
```

**Build order suggestion:**
1. Sikke system (gamification-blueprint.md) — foundation for everything
2. Kitna Jaante Ho? (this doc) — couples engagement
3. Saste Ka Saudagar (this doc) — singles engagement
4. Badges + Streak enhancements (gamification-blueprint.md) — deepen the reward loop
5. Kharcha Poker (this doc) — weekly stakes using Sikke
6. Remaining features from both docs based on data

---

## 11. Feasibility & Architecture Notes

### All Games Are Local-First

| Game | Data Source | Storage | Server Needed? |
|------|-----------|---------|---------------|
| Kitna Jaante Ho? | Partner's synced transactions (IndexedDB) | localStorage | No — uses existing WebRTC sync |
| Gullak Pet | User's own transactions + budget (IndexedDB) | localStorage | No |
| Dukaan | Monthly budget vs actual (IndexedDB) | localStorage | No |
| Saste Ka Saudagar | Hardcoded price data (static JSON) + user's transactions | localStorage | No (update data with app releases) |
| Kharcha Poker | User's transactions + Sikke balance | localStorage | No |
| Kharcha Rummy | Both partners' transactions (IndexedDB) | localStorage | No — uses existing WebRTC sync |

### New UI Integration Points

Games should be accessible from the existing tab navigation. Options:
1. **A fourth "Games" tab** in BottomTabBar — dedicated space, clear discovery
2. **A "Play" button on the home screen** — opens a games overlay (like AnalyticsView is an overlay)
3. **Integrated into home screen** — Kitna Jaante Ho? card appears at 8 PM, Saste Ka Saudagar appears at 8 AM

**Recommendation:** Start with option 3 (integrated cards on home screen) for Phase 1. If multiple games exist (Phase 2+), add a dedicated Games tab.

### Performance Considerations

- Game logic should be lightweight — no heavy computation on every render
- Gullak Pet animations should use CSS/Lottie, not canvas (better performance on low-end phones)
- Price data for Saste Ka Saudagar should be bundled as a static JSON import, not fetched
- Quiz question generation for Kitna Jaante Ho should run once at 8 PM, cache result

### Sync Considerations for Couples Games

- **Kitna Jaante Ho?** needs both devices to know the questions are the same → use deterministic generation from date seed
- **Kharcha Rummy** needs both devices to see each other's cards → derive from synced transaction data (already available)
- **Kharcha Poker** couple bets need visibility → add a `bets` field to the WebRTC sync payload
- No new sync protocol needed for any game — all data is derivable from existing synced transactions

---

## 12. Psychology & Research References

### Core Psychological Principles Used

| Principle | Which Games Use It | How |
|-----------|-------------------|-----|
| **Prediction-Reveal Loop** | Kitna Jaante Ho?, Saste Ka Saudagar | Guess → reveal creates dopamine hit regardless of correctness |
| **Loss Aversion** (Kahneman) | Gullak (sad pet), Kharcha Poker (lose Sikke) | Fear of losing is 2x stronger than joy of gaining |
| **Variable-Ratio Reinforcement** (Skinner) | All games | Unpredictable outcomes are more engaging than predictable ones |
| **Emotional Attachment** | Gullak Pet | Guilt over a sad virtual creature drives action (Tamagotchi effect) |
| **Idle Game Loop** | Dukaan | Revenue ticking while away → "let me check how my shop is doing" |
| **Social Comparison** (Festinger) | Kitna Jaante Ho?, Kharcha Poker, Kharcha Rummy | Competing with partner creates accountability |
| **Daily Ritual / Habit Loop** | Saste Ka Saudagar, Kitna Jaante Ho? | One action per day at a fixed time → becomes automatic habit |
| **Identity** | Dukaan ("I'm a business owner"), Gullak ("I'm a good pet parent") | Self-image drives consistent behavior |
| **Commitment Escalation** | Dukaan (months of growth), Gullak (stage progression) | The more invested, the harder to quit |

### Research Sources

**Game Mechanics:**
- Fortune City by Sparkful — expense tracker as city builder (10M+ downloads)
- Long Game by Truist — real mobile games (Fruit Ninja, Candy Crush clones) inside a savings app
- Monobank (Ukraine) — cat mascot + hidden mini-games in a banking app (10% of country uses it)
- Ikano Bank — Flappy Bird clone ("Flappy Saver") inside a banking app
- CRED (India) — Slot machines, scratch cards, spin-the-wheel inside a bill payment app

**Couple Apps:**
- Couple Game: Relationship Quiz — prediction/reveal loop (22 quiz packs, high engagement)
- Paired — daily questions pushed to both partners simultaneously
- Lovewick — therapist-designed conversation cards for couples
- LovBirdz — daily ritual builder for couples

**Trojan Horse Apps:**
- Pokemon Go — exercise disguised as AR monster catching
- Zombies, Run! — cardio disguised as zombie survival audio drama
- Ant Forest (Alipay) — environmental behavior disguised as virtual tree growing (650M users)
- Duolingo — language learning disguised as a competitive mobile game

**Virtual Pet / Emotional Attachment:**
- Finch — self-care tasks feed a virtual baby bird (millions of users)
- Habitica — task management as a full RPG with pets, quests, and parties (4M+ users)
- Tamagotchi — original virtual pet (82M units sold, proved emotional attachment to virtual creatures drives habitual behavior)

**Betting / Prediction:**
- StepBet / WayBetter — bet real money on hitting step goals. Research (PMC) showed "large and clinically relevant increase in step counts"
- Dream11 (India) — fantasy sports betting (₹34,000 crore industry) proves betting mechanics work in Indian market
- SaveUp — lottery-style rewards for good financial habits

**Price Awareness:**
- Costcodle — Wordle for Costco product prices
- The Price Is Right — 50+ years of TV proving "guess the price" is universally entertaining
