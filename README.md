# Channel CAC Ledger

A small static site that takes six months of acquisition data for software sold to dental practices (single offices and multi-location groups) and answers three questions:

1. What does each channel cost per paid practice, and per signed account?
2. Under rules written before the results, which experiments should scale, stop or keep testing?
3. Where do click attribution and the "How did you hear about us?" answer disagree?

A second page turns those decisions into next month's budget.

**All data is synthetic.** Every office, group, date and dollar amount is made up, and the rules, bars and prices are assumptions.

## What it does

**`index.html`, the ledger**

1. One result sentence, computed at the default settings: "Per paid practice, events cost $1,340, less than paid social at $2,600; per signed account, events cost the most of any channel, at $3,277."
2. Three controls: who gets credit (Click, Self-reported or Blend), whether wins are counted per paid practice or per signed account, and whether founder time counts as cost (default $100 an hour).
3. Cost by channel: spend, leads, demos booked, demos held, pilots, paid accounts, paid practices, cost per account and cost per practice. Each step shows its count against the step before ("15 of 16"). A check under the table confirms the channels plus Unknown add up to the total.
4. Experiments: eight tests, each with its hypothesis, budget cap, spend, result, the rules it was judged by, a decision badge and a one-sentence reason.
5. What changed this month: held demos in September against August, split by channel and practice type, with the share of the change that comes from the top two cells.
6. Rows a person should check: seven rows the rules count but a person should look at, each with the reason.
7. Assumptions, then the questions I'd ask first.

**`budget.html`, next month's budget**

Inputs: total monthly budget (default $40,000), year-end practice goal (default 2,000, an assumption), paid practices today (default 50, from the data) and the founder-time switch. Output: dollars for each channel and test with the reason, the practices that money could bring in as a low-to-high range, the monthly pace the goal needs, and the gap. `index.html` links to this page ("Next month's budget"), and it links back.

## How it works

Each rule in one sentence.

**Counting**

- **Paid practice:** one office location that started paying by September 30, so a 14-office group that pays for all 14 counts 14.
- **Signed account:** one customer, whatever its size, so the same group counts 1.
- **Expansion pending:** when a group pays for only some offices (4 of 18), only the paying offices count, and the row is flagged.
- **Cost:** media or vendor spend plus field costs (booth, travel, food), plus founder hours times the hourly rate when founder time is switched on.
- **Cost per paid practice:** a channel's cost divided by its paid practices, rounded down to the cent.
- **No wins:** a channel with zero paid practices shows "no paid practices yet" instead of $0 or infinity, because there's nothing to divide by.
- **Too few to call:** under 3 paid practices gets a badge, because one lucky deal isn't a channel.
- **Booked twice:** an office that books through two channels counts once, credited to its earliest touch, keeping the furthest step either booking reached.
- **Reconciliation:** the six channels plus Unknown must equal the total counted straight from every lead, in every credit mode.

**Credit**

- **Click (UTM):** credit goes to the ad or link the booking came from.
- **Self-reported:** credit goes to the answer to "How did you hear about us?".
- **Blend:** take the answer when it names a channel, otherwise the click, because mail, events and referrals leave no click.
- **Unknown:** a lead whose click and answer name no channel ("direct", "Colleague", "Don't remember" or blank) counts in the totals and is credited to no channel.

**Experiment decisions**, checked in this order, first match wins:

1. **Stop** if 60% or more of the budget cap is spent and not one demo was held.
2. **Stop** if the guardrail is broken (demo no-show rate above 40%, or founder time above its monthly limit).
3. **Keep testing** if there are no paid practices yet.
4. **Too few to call** if there are 1 or 2 paid practices.
5. **Stop** if the cost per paid practice is above the test's stop bar.
6. **Scale** if the cost per paid practice is at or under the scale bar and there are at least 5 paid practices.
7. **Keep testing** otherwise (between the bars, or under the bar with too few wins).

A test's leads are tagged to it when they arrive (a partner code, a booth scan, a postcard code or an ad campaign), so the decisions don't move with the credit setting.

**The planted cases worth knowing**

- **E4, conference booths:** counted per account it's a Stop ($7,833 per account against a $6,000 stop bar); counted per practice it's a Scale ($1,468 per practice), because one 14-location group paid for all 14.
- **E5, lunch-and-learns:** a Scale at $1,000 per practice with founder time left out; Keep testing at $1,833 once 50 founder hours at $100 an hour are counted.
- **E2, generic search terms:** Stop, because 65% of the cap is spent with 0 held demos.
- **E8, cold audience ads:** Stop on its guardrail, because 56% of booked demos were no-shows.
- **E7, dentist creator videos:** demos held but nothing paid yet, so the cost shows "no paid practices yet" and the decision is Keep testing.

**What changed this month:** held demos are counted by channel and practice type for August and September, the cells are sorted by how much they moved, and the page says what share of the total change the top two cells explain (60% here).

**Rows a person should check:** sources that disagree (with how many paid practices ride on it), a lead with no source at all, a group with expansion pending, a paid office with no demo record, an office booked twice, and a month with spend but no leads.

**Next month's budget**

- Lines that aren't tests (always-on paid social and brand search) keep last month's spend, taken off the top.
- Tests marked Stop get $0.
- Tests marked Keep testing or Too few to call each get a test slice of 10% of the budget, never more than that test's own cap.
- Tests marked Scale split the rest in proportion to paid practices per dollar, and no channel ends up with more than 40% of the budget; money a capped channel can't take goes to the other Scale channels.
- Anything no line can take is held back as its own line, so the lines always add up to the budget exactly, to the cent.
- The practice range for each line is its budget divided by its worst and best past month's cost per paid practice. It's a range, not a forecast.
- The goal pace is the practices still needed divided by the three months left in the year, rounded up.

## Assumptions

- The data covers April to September 2026: 129 lead rows (128 offices and groups after one duplicate), spend by line and month, and eight experiments.
- The scale and stop bars, minimum wins, guardrails, caps and windows for each test, the 10% slice, the 40% channel limit, the $100 founder rate and the 2,000-practice goal are all assumptions.
- A pilot runs about four weeks before a practice pays.
- Money is stored in whole cents and shown in whole dollars, rounded down. Budget splits use whole-number arithmetic, so nothing depends on floating-point rounding.

## How to run

- Open `index.html` in a browser. It works straight from disk and on any static host; there is no build step and nothing to install.
- Run the tests with Node 18 or newer: `node tests/run-tests.mjs`
- To change the data, edit the lists in `tools/make-data.mjs`, run `node tools/make-data.mjs` to rewrite `data.js`, then run the tests.

## Files

- `index.html`, `budget.html`: the two pages.
- `styles.css`: shared styles, light and dark.
- `data.js`: the synthetic data, as one global (`LEDGER_DATA`). Money is integer cents.
- `ledger.mjs`: every calculation, as pure functions with no page code. It has no import or export lines on purpose: browsers won't load a module from a page opened from disk, so the pages load it as a plain script and Node loads it as a module. Either way it sets one global, `ChannelLedger`.
- `app.js`, `budget.js`: read the controls and render each page.
- `tests/run-tests.mjs`: plain Node tests.
- `tools/make-data.mjs`: writes `data.js` from hand-written lead lists.

## Limits

- The data is small and made up, so the numbers show how the rules behave, not what any real channel costs.
- Spend is credited to the month it was spent, but practices pay about a month later, so the newest months look more expensive than they'll end up.
- Cost per practice treats every office as equal. If price follows providers or chairs rather than offices, the count should change.
- There's no payback or lifetime-value view, so "cheap per practice" doesn't yet mean "pays back fastest".
- The budget range assumes a channel keeps its past cost per practice. Most channels get more expensive as they get more money, so the high end is the optimistic one.
- Blend trusts the self-reported answer over the click. That is a judgment call, which is why disagreeing rows are listed for a person instead of being resolved quietly.

Built with AI assistance (Claude Code / Codex).

Built by Dakshit Raj
