# Tally — personal finance PWA

Net worth, live transactions, a category budget and savings goals. It's a static site with no build step and no server. Your data stays in the browser on the device you use it on.

## Sections
- **Overview**: shows net worth with history (1M / 3M / 1Y / All), how much sits in checking & savings vs. retirement, what you owe on cards, this month's spending, and every account.
- **Transactions**: search, filter by account, and see pending charges. Tap a transaction to recategorize it. With "Always use this category" checked, every past and future charge from that merchant follows.
- **Budget**: monthly categories (Mortgage, Groceries, Eating out, …) with a "today" marker so you can see whether you're ahead of pace. You can edit amounts for every month or for one month, and add or delete categories.
- **Goals**: set a target and an optional date, then log contributions or withdrawals. Each goal shows the monthly amount you need to reach it on time.
- **⚙ Settings**: bank connection, account types, CSV import, backup and restore.

## Hosting (GitHub Pages)
1. Create a repo (e.g. `PeekMeek/tally`), push this folder's contents to `main`.
2. Repo → Settings → Pages → Deploy from branch → `main` / root.
3. Open `https://peekmeek.github.io/tally/` on your phone → Share → **Add to Home Screen**.

When you change files, bump `CACHE` in `sw.js`. Open copies of the app will then show a "new version — Refresh" banner.

> **Privacy:** the repo only holds the app code. Your balances and transactions never go into it.

## Connecting accounts (SimpleFIN Bridge)
Tally reads accounts through [SimpleFIN Bridge](https://bridge.simplefin.org). It's read-only and costs $15/year.
1. At bridge.simplefin.org, add LOC Credit Union, American Express, Citi (Costco Anywhere Visa) and your retirement provider(s).
2. Go to **Apps → New connection** and copy the setup token.
3. In Tally, open ⚙ → paste the token → **Connect**.

Tally syncs when you open it and every few hours while it's open (default is 4). SimpleFIN pulls from the banks roughly once a day and limits apps to about 24 requests a day. Expect same-day updates, not instant ones. Pending charges show up and get replaced by the posted versions automatically.

### If Connect says "Your browser blocked the request"
Some browsers won't let a web page call SimpleFIN directly (CORS). The fix is a free proxy:
1. Go to dash.cloudflare.com → Workers & Pages → Create → Hello World worker → **Edit code**.
2. Paste `proxy/simplefin-proxy.js` and set `ALLOWED_ORIGIN` to `https://peekmeek.github.io`. Then Deploy.
3. In Tally → ⚙ → *Sync proxy & schedule*, paste the worker URL → Save → Connect again.

The worker only forwards to simplefin.org, only answers your site, and stores nothing.

## Apple Card
Apple doesn't let web apps or aggregators read Apple Card. Only native iPhone apps can, through FinanceKit. Import its statements instead:
- iPhone: Wallet → Apple Card → **Card Balance** → choose a statement → **Export Transactions** → CSV.
- Tally → ⚙ → **Import a CSV statement**. The Apple format is detected automatically, and duplicates are skipped, so overlapping exports are fine.
- Tap the Apple Card account on Overview to set the current balance.

The same importer works for any bank's CSV download.

## Your data
- Everything is stored in this browser's `localStorage`. Each device keeps its own copy.
- Use **⚙ → Download backup** now and then. Clearing browser data would erase it.
- The SimpleFIN access URL works like a password for reading your transactions. It's stored only on the device. The backup asks before including it.
- The 👁 button blurs every amount, which is handy in public.

## Home-screen widget (iPhone, via Scriptable)
The widget shows what's left in this month's budget, with a ring for each category you pick. Tapping it opens Tally.

Tally sends a small summary (budget totals per category, plus when it last synced) to **your own** Cloudflare Worker. No transactions or account details are sent. The widget reads that summary, so it shows what Tally knew the last time you opened it.

**1. Worker (one time, ~10 minutes)**
1. dash.cloudflare.com → Workers & Pages → Create → *Hello World* worker. If you already made the sync proxy, reuse that worker.
2. **Edit code** → paste `proxy/simplefin-proxy.js` → check that `ALLOWED_ORIGIN` is `https://peekmeek.github.io` → **Deploy**.
3. **Storage & Databases → KV → Create namespace** called `tally`.
4. Back on the worker: **Settings → Bindings → Add → KV namespace**, variable name `TALLY_KV`, namespace `tally`.
5. In Tally: ⚙ → **Home-screen widget** → **Generate** a key → **Copy**.
6. Worker **Settings → Variables and Secrets → Add → Secret**, name `WIDGET_KEY`, value = the key → **Deploy**.

**2. Tally**
⚙ → Home-screen widget:
1. Tick **Send my budget to the widget**.
2. Paste the worker URL.
3. Tap the categories to show, in the order you want them. Medium shows the first 4, large the first 8.
4. Choose whether to show "last synced".
5. Tap **Save & update widget**.

**3. iPhone**
1. Install **Scriptable** from the App Store.
2. In Tally on your phone: ⚙ → Home-screen widget → **Copy widget script**.
3. Scriptable → **+** → paste → rename it "Tally" → Done.
4. Long-press the home screen → **Edit → Add Widget → Scriptable** → pick a size → Add.
5. Long-press the new widget → **Edit Widget** → Script: **Tally**, When Interacting: **Open URL**.

**Changing categories:** do it in Tally. Alternatively, run the Tally script inside Scriptable and choose **Choose categories**; that choice only affects the widget and overrides Tally's. You can also type names in the widget's **Parameter** field, e.g. `Groceries, Shopping, Mortgage, Gas`, which overrides both.

**Sizes:**
- Small: total left with a progress bar.
- Medium: total left plus 4 category rings.
- Large: total left, an overall bar and up to 8 rings.

Ring colors: green = on pace, orange = spending faster than the month, red = over budget.
