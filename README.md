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
