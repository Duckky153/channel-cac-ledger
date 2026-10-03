// Plain Node tests for the Channel CAC Ledger. No packages needed.
// Run from the sample folder:  node tests/run-tests.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
await import(new URL('../data.js', import.meta.url).href);
await import(new URL('../ledger.mjs', import.meta.url).href);

const L = globalThis.ChannelLedger;
const DATA = globalThis.LEDGER_DATA;
const clone = (x) => JSON.parse(JSON.stringify(x));

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const MODES = ['click', 'self', 'blend'];
const COUNTS = ['practice', 'account'];
const FOUNDER = [false, true];
const everySetting = () => MODES.flatMap((mode) => COUNTS.flatMap((countBy) => FOUNDER.map((includeFounder) => ({ mode, countBy, includeFounder, founderRateCents: 10000 }))));
const experiment = (id, settings) => L.experimentsTable(DATA, settings).find((x) => x.exp.id === id);

// Walk any value and collect every field whose name ends in "cents".
function centsFields(value, path = '', out = []) {
  if (Array.isArray(value)) value.forEach((v, i) => centsFields(v, `${path}[${i}]`, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (/cents$/i.test(k)) out.push({ path: `${path}.${k}`, value: v });
      centsFields(v, `${path}.${k}`, out);
    }
  }
  return out;
}

// ------------------------------------------------------------ data

test('data passes every consistency check', () => {
  assert.deepEqual(L.validateData(DATA), []);
});

test('data has 6 channels, 8 experiments, about 120 leads, April to September 2026', () => {
  assert.deepEqual(DATA.channels.map((c) => c.name), ['Paid social', 'Search', 'Direct mail', 'Partner referrals', 'Events', 'Dentist creator videos']);
  assert.deepEqual(DATA.experiments.map((e) => e.id), ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8']);
  assert.ok(DATA.leads.length >= 110 && DATA.leads.length <= 135, `lead rows: ${DATA.leads.length}`);
  assert.deepEqual(DATA.period.months, ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
  const groups = DATA.leads.filter((l) => l.type === 'group').map((l) => l.id).sort();
  assert.deepEqual(groups, ['Group A', 'Group B', 'Group C', 'Group D', 'Group E', 'Group F']);
});

test('the consistency check catches a bad edit', () => {
  const bad = clone(DATA);
  bad.spend[0].media_cents = 1000.5;
  bad.leads[0].utm_source = 'Billboard';
  bad.leads[1].paid_locations = 99;
  const problems = L.validateData(bad);
  assert.ok(problems.some((p) => p.includes('whole cents')), problems.join('\n'));
  assert.ok(problems.some((p) => p.includes('Billboard')));
  assert.ok(problems.some((p) => p.includes('paid locations')));
});

// ------------------------------------------------------------ attribution

test('creditedChannel follows each mode on the planted rows', () => {
  const names = DATA.channels.map((c) => c.name);
  const lead = (id) => L.dedupeLeads(DATA.leads).leads.find((l) => l.id === id);
  const groupB = lead('Group B'); // click says direct, answer says Events
  assert.equal(L.creditedChannel(groupB, 'click', names), 'Unknown');
  assert.equal(L.creditedChannel(groupB, 'self', names), 'Events');
  assert.equal(L.creditedChannel(groupB, 'blend', names), 'Events');
  const colleague = DATA.leads.find((l) => l.utm_source === 'Paid social' && l.self_reported === 'Colleague');
  assert.equal(L.creditedChannel(colleague, 'click', names), 'Paid social');
  assert.equal(L.creditedChannel(colleague, 'self', names), 'Unknown');
  assert.equal(L.creditedChannel(colleague, 'blend', names), 'Paid social');
  const blank = DATA.leads.find((l) => l.utm_source === '' && l.self_reported === '');
  for (const mode of MODES) assert.equal(L.creditedChannel(blank, mode, names), 'Unknown');
  assert.throws(() => L.creditedChannel(blank, 'last-touch', names));
});

test('totals reconcile in every mode, count and founder setting', () => {
  for (const s of everySetting()) {
    const t = L.channelTable(DATA, s);
    assert.ok(t.reconcile.ok, JSON.stringify(s));
    assert.equal(t.reconcile.practices.channels + t.reconcile.practices.unknown, t.total.paidPractices);
    assert.equal(t.reconcile.accounts.channels + t.reconcile.accounts.unknown, t.total.paidAccounts);
    assert.equal(t.total.paidPractices, 50);
    assert.equal(t.total.paidAccounts, 34);
  }
});

test('click credit underrates offline channels compared with Blend', () => {
  const events = (mode) => L.channelTable(DATA, { mode }).rows.find((r) => r.name === 'Events').paidPractices;
  assert.equal(events('click'), 4);
  assert.equal(events('blend'), 22);
});

// ------------------------------------------------------------ cost per paid practice

test('zero wins gives no cost (not $0, not infinity) and says so', () => {
  const t = L.channelTable(DATA, L.DEFAULTS);
  const videos = t.rows.find((r) => r.name === 'Dentist creator videos');
  assert.equal(videos.paidPractices, 0);
  assert.equal(videos.costPerPracticeCents, null);
  assert.equal(videos.costPerAccountCents, null);
  assert.ok(videos.noPaidYet);
  assert.equal(L.costPerText(videos.costPerPracticeCents), 'no paid practices yet');
  assert.equal(L.costPerText(null, 'account'), 'no paid accounts yet');
  const e7 = experiment('E7', L.DEFAULTS);
  assert.equal(e7.decision.costPerCents, null);
});

test('under 3 wins gets the too-few-to-call badge', () => {
  const t = L.channelTable(DATA, L.DEFAULTS);
  const mail = t.rows.find((r) => r.name === 'Direct mail');
  assert.equal(mail.paidPractices, 1);
  assert.ok(mail.tooFew);
  assert.ok(!t.rows.find((r) => r.name === 'Partner referrals').tooFew);
});

test('cost per practice and per account are integer floors of cost over count', () => {
  const t = L.channelTable(DATA, L.DEFAULTS);
  const events = t.rows.find((r) => r.name === 'Events');
  assert.equal(events.cost.totalCents, 2950000);
  assert.equal(events.costPerPracticeCents, Math.floor(2950000 / 22));
  assert.equal(events.costPerAccountCents, Math.floor(2950000 / 9));
});

test('founder time adds hours times the rate to cost, only when switched on', () => {
  const off = L.channelTable(DATA, { includeFounder: false, founderRateCents: 10000 }).rows.find((r) => r.name === 'Events');
  const on = L.channelTable(DATA, { includeFounder: true, founderRateCents: 10000 }).rows.find((r) => r.name === 'Events');
  assert.equal(off.cost.founderCents, 0);
  assert.equal(on.cost.founderCents, on.cost.founderHours * 10000);
  assert.equal(on.cost.totalCents, off.cost.totalCents + on.cost.founderCents);
});

test('the same office booked twice counts once, at its earliest touch', () => {
  const raw = DATA.leads.filter((l) => l.id === 'Office 009');
  assert.equal(raw.length, 2);
  const { leads, merged } = L.dedupeLeads(DATA.leads);
  assert.equal(leads.length, DATA.leads.length - 1);
  assert.equal(merged.length, 1);
  const kept = leads.filter((l) => l.id === 'Office 009');
  assert.equal(kept.length, 1);
  assert.equal(kept[0].first_touch, '2026-05-05');
  assert.equal(L.creditedChannel(kept[0], 'blend', DATA.channels.map((c) => c.name)), 'Search');
  assert.equal(kept[0].paid_locations, 1); // the later booking's payment, counted once
});

// ------------------------------------------------------------ experiments

test('E1 to E8 give their planted decisions in their stated settings', () => {
  const perPractice = { countBy: 'practice', includeFounder: false };
  const perAccount = { countBy: 'account', includeFounder: false };
  const withFounder = { countBy: 'practice', includeFounder: true, founderRateCents: 10000 };
  const cases = [
    ['E1', perPractice, 'Scale'],
    ['E2', perPractice, 'Stop'],
    ['E3', perPractice, 'Too few to call'],
    ['E4', perAccount, 'Stop'],
    ['E4', perPractice, 'Scale'],
    ['E5', perPractice, 'Scale'],
    ['E5', withFounder, 'Keep testing'],
    ['E6', perPractice, 'Keep testing'],
    ['E7', perPractice, 'Keep testing'],
    ['E8', perPractice, 'Stop'],
  ];
  for (const [id, settings, expected] of cases) {
    assert.equal(experiment(id, settings).decision.decision, expected, `${id} ${JSON.stringify(settings)}`);
  }
});

test('the stop reasons are the planted ones', () => {
  const e2 = experiment('E2', L.DEFAULTS).decision;
  assert.equal(e2.step, 'cap');
  assert.match(e2.reason, /^Stop: 65% of the \$8,000 cap is spent \(\$5,200\) with 0 held demos\./);
  const e8 = experiment('E8', L.DEFAULTS).decision;
  assert.equal(e8.step, 'guardrail');
  assert.match(e8.reason, /no-shows/);
  const e3 = experiment('E3', L.DEFAULTS);
  assert.equal(e3.decision.paid, 1);
  const e4 = experiment('E4', { countBy: 'practice' });
  assert.equal(e4.results.paidPractices, 16); // one 14-location group paid for all 14
});

test('reason sentences are built from the rule', () => {
  assert.equal(experiment('E1', L.DEFAULTS).decision.reason, 'Scale: $800 per paid practice is under the $2,000 bar, with 12 paid practices (bar: 5).');
  const e5 = experiment('E5', { includeFounder: true, founderRateCents: 10000 }).decision.reason;
  assert.equal(e5, 'Keep testing: $1,833 per paid practice is above the $1,500 scale bar but not above the $4,000 stop bar. Cost includes 50 founder hours at $100 an hour.');
});

// ------------------------------------------------------------ what changed, exceptions, headline

test('what changed: the top two cells drive about 60% of the change', () => {
  const c = L.changeDecomposition(DATA, L.DEFAULTS);
  assert.equal(c.totalFrom, 12);
  assert.equal(c.totalTo, 22);
  assert.equal(c.totalChange, 10);
  assert.equal(c.topTwoChange, 6);
  assert.equal(c.sharePct, 60);
  assert.equal(c.cells.reduce((a, x) => a + x.change, 0), c.totalChange);
  for (const s of everySetting()) assert.equal(L.changeDecomposition(DATA, s).totalChange, 10);
});

test('every planted exception is listed with a reason', () => {
  const list = L.findExceptions(DATA);
  const kinds = new Set(list.map((e) => e.kind));
  assert.deepEqual([...kinds].sort(), ['conflict', 'duplicate', 'no_source', 'paid_no_demo', 'partial_paid', 'spend_no_leads']);
  const subjects = (kind) => list.filter((e) => e.kind === kind).map((e) => e.subject);
  assert.deepEqual(subjects('conflict'), ['Group B (14 locations)', 'Office 017']);
  assert.deepEqual(subjects('no_source'), ['Office 025']);
  assert.deepEqual(subjects('partial_paid'), ['Group A (18 locations)']);
  assert.deepEqual(subjects('paid_no_demo'), ['Office 057']);
  assert.deepEqual(subjects('duplicate'), ['Office 009']);
  assert.deepEqual(subjects('spend_no_leads'), ['Dentist creator videos, April 2026']);
  assert.equal(list.length, 7);
  for (const e of list) assert.ok(e.why.length > 40, e.subject);
  assert.match(list.find((e) => e.kind === 'partial_paid').why, /4 of 18/);
  assert.match(list.find((e) => e.subject === 'Office 017').why, /1 paid practice rides/);
});

test('the result sentence is computed at the default settings', () => {
  assert.equal(L.headline(DATA), 'Per paid practice, events cost $1,340, less than paid social at $2,600; per signed account, events cost the most of any channel, at $3,277.');
});

// ------------------------------------------------------------ next month's budget

const BUDGETS = [0, 1, 999, 7777, 20000, 40000, 55555, 100000, 250000, 1000000, 10000000];

test('budget lines add up to the budget exactly, in cents', () => {
  for (const dollars of BUDGETS) {
    for (const includeFounder of FOUNDER) {
      const plan = L.planBudget(DATA, { budgetCents: dollars * 100, includeFounder });
      const total = plan.lines.reduce((a, l) => a + l.allocationCents, 0);
      assert.equal(total, dollars * 100, `$${dollars} founder=${includeFounder}`);
      assert.equal(plan.allocatedCents, dollars * 100);
    }
  }
  const plan = L.planBudget(DATA);
  assert.equal(plan.allocatedCents, 4000000);
  assert.equal(plan.heldBackCents, 0);
});

test('stopped tests get $0 and test slices stay under 10% and their cap', () => {
  for (const dollars of BUDGETS) {
    const plan = L.planBudget(DATA, { budgetCents: dollars * 100 });
    for (const line of plan.lines) {
      if (line.tier === 'stop') assert.equal(line.allocationCents, 0, line.id);
      if (line.tier === 'slice') {
        const exp = DATA.experiments.find((e) => e.id === line.id);
        assert.ok(line.allocationCents <= Math.floor((dollars * 100) / 10), `${line.id} at $${dollars}`);
        assert.ok(line.allocationCents <= exp.budget_cap_cents, `${line.id} cap`);
      }
    }
  }
  const tiers = Object.fromEntries(L.planBudget(DATA).lines.map((l) => [l.id, l.tier]));
  assert.deepEqual(tiers, { 'PS-base': 'base', 'SE-base': 'base', E1: 'scale', E2: 'stop', E3: 'slice', E4: 'scale', E5: 'scale', E6: 'slice', E7: 'slice', E8: 'stop' });
});

test('no channel gets more than 40% of a realistic budget', () => {
  for (const dollars of BUDGETS.filter((d) => d >= 20000)) {
    for (const includeFounder of FOUNDER) {
      const plan = L.planBudget(DATA, { budgetCents: dollars * 100, includeFounder });
      for (const ch of plan.channels) assert.ok(ch.allocationCents * 100 <= 40 * dollars * 100, `${ch.name} at $${dollars}`);
    }
  }
  // At $100,000 the limit binds for Events, and the money it can't take moves to the other Scale channel.
  const big = L.planBudget(DATA, { budgetCents: 10000000 });
  assert.equal(big.channels.find((c) => c.name === 'Events').allocationCents, 4000000);
  assert.ok(big.lines.filter((l) => l.channel === 'Events' && l.tier === 'scale').every((l) => l.capped));
});

test('money no line can take is held back as its own line', () => {
  const plan = L.planBudget(DATA, { budgetCents: 1000000000 });
  const held = plan.lines.find((l) => l.tier === 'held');
  assert.ok(held && held.allocationCents > 0);
  assert.equal(plan.heldBackCents, held.allocationCents);
  assert.equal(plan.allocatedCents, 1000000000);
});

test('Scale lines split by paid practices per dollar', () => {
  const plan = L.planBudget(DATA);
  const e1 = plan.lines.find((l) => l.id === 'E1');
  const e5 = plan.lines.find((l) => l.id === 'E5');
  // E1: 12 practices for $9,600; E5: 6 practices for $6,000. 1.25 vs 1.00 per $1,000.
  assert.equal(e1.perThousandHundredths, 125);
  assert.equal(e5.perThousandHundredths, 100);
  assert.ok(Math.abs(e1.allocationCents * 100 - e5.allocationCents * 125) <= 100 * 125, 'E1:E5 should be 1.25:1');
});

test('counting founder time moves lunch-and-learns from Scale to a test slice', () => {
  const tier = (includeFounder) => L.planBudget(DATA, { includeFounder }).lines.find((l) => l.id === 'E5').tier;
  assert.equal(tier(false), 'scale');
  assert.equal(tier(true), 'slice');
});

test('practice range and goal pace', () => {
  const plan = L.planBudget(DATA);
  for (const l of plan.lines) assert.ok(l.range.low <= l.range.high, l.id);
  const g = plan.goal;
  assert.equal(g.current, 50);
  assert.equal(g.monthsLeft, 3);
  assert.equal(g.pace, 650); // (2,000 - 50) / 3, rounded up
  assert.equal(g.low, 40);
  assert.equal(g.high, 76);
  assert.equal(g.gapLow, 574);
  assert.equal(g.gapHigh, 610);
  assert.equal(g.neededLowCents % 100, 0);
  const met = L.planBudget(DATA, { currentPaidPractices: 2000 }).goal;
  assert.equal(met.pace, 0);
  assert.equal(met.gapHigh, 0);
});

test('budget input must be whole dollars', () => {
  assert.throws(() => L.planBudget(DATA, { budgetCents: 4000050 }));
  assert.throws(() => L.planBudget(DATA, { budgetCents: 40000.5 }));
});

// ------------------------------------------------------------ integers only

test('no money value anywhere is a float', () => {
  const outputs = [DATA];
  for (const s of everySetting()) {
    outputs.push(L.channelTable(DATA, s), L.experimentsTable(DATA, s));
  }
  for (const dollars of BUDGETS) for (const includeFounder of FOUNDER) outputs.push(L.planBudget(DATA, { budgetCents: dollars * 100, includeFounder }));
  let checked = 0;
  for (const out of outputs) {
    for (const f of centsFields(out)) {
      checked += 1;
      assert.ok(f.value === null || Number.isSafeInteger(f.value), `${f.path} = ${f.value}`);
    }
  }
  assert.ok(checked > 1000, `checked ${checked} money fields`);
});

test('formatting and input parsing', () => {
  assert.equal(L.formatDollars(134099), '$1,340');
  assert.equal(L.formatDollars(0), '$0');
  assert.throws(() => L.formatDollars(1.5));
  assert.equal(L.parseWhole('40,000', 0, 10000000), 40000);
  assert.equal(L.parseWhole('1.5', 0, 10), null);
  assert.equal(L.parseWhole('-3', 0, 10), null);
  assert.equal(L.parseWhole('abc', 0, 10), null);
  assert.equal(L.parseWhole('11', 0, 10), null);
  assert.equal(L.parseDollarsToCents('$100.50'), 10050);
  assert.equal(L.parseDollarsToCents('1e3'), null);
  assert.equal(L.floorDiv(7, 2), 3);
});

// ------------------------------------------------------------ pages and files

function allFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (name.startsWith('.')) return [];
    const p = join(dir, name);
    return statSync(p).isDirectory() ? allFiles(p) : [p];
  });
}
const TEXT = /\.(html|css|js|mjs|md|json|txt)$/;

test('the logic module has no page or network code', () => {
  const src = readFileSync(join(root, 'ledger.mjs'), 'utf8');
  for (const word of ['document', 'window', 'localStorage', 'fetch(', 'XMLHttpRequest', 'innerHTML']) {
    assert.ok(!src.includes(word), `ledger.mjs mentions ${word}`);
  }
});

test('pages load only local files and link to each other', () => {
  const index = readFileSync(join(root, 'index.html'), 'utf8');
  const budget = readFileSync(join(root, 'budget.html'), 'utf8');
  for (const [name, html] of [['index.html', index], ['budget.html', budget]]) {
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    for (const ref of refs) {
      assert.ok(!/^[a-z]+:/i.test(ref) && !ref.startsWith('//'), `${name} loads ${ref}`);
      assert.ok(existsSync(join(root, ref.split('#')[0])), `${name} points at missing ${ref}`);
    }
    assert.match(html, /Synthetic data/);
    assert.match(html, /Built by Dakshit Raj/);
  }
  assert.match(index, /<a class="next-link" id="budget-link" href="budget\.html">/); // visible, not hidden
  assert.match(index, /Next month's budget &rarr;/);
  assert.match(budget, /href="index\.html"/);
  for (const q of ['When a group signs', 'which do you trust', 'Do founder hours', 'What payback period']) assert.ok(index.includes(q), q);
});

test('no company, people, tools or private details named in any file', () => {
  const unscramble = (s) => s.split('').reverse().join('');
  const banned = [
    unscramble('arova'), unscramble('ijevif'), unscramble('nretsew esac'), unscramble('soriak'), unscramble('/sresu/'),
    unscramble('dm.edualc'), unscramble('dm.stnega'), unscramble('asiv'), unscramble('noitargimmi'), unscramble('reyolpme'),
    unscramble('gnirih'), unscramble('emuser'), unscramble('noitacilppa boj'), unscramble('351ykkcud'), unscramble('lezinu'),
    unscramble('liamg'), unscramble('topsbuh'), unscramble('oitta'), unscramble('gohtsop'), unscramble('ylnedlac'),
    unscramble('koobecaf'), unscramble('margatsni'), unscramble('kotkit'), unscramble('ebutuoy'), unscramble('nideknil'),
  ];
  const allowedName = unscramble('jaR tihskaD yb tliuB');
  const firstName = unscramble('tihskad');
  // Built from parts so this file doesn't trip its own scan.
  const statusWord = new RegExp(`\\b${unscramble('TPO')}\\b`);
  const vendorWords = new RegExp(`\\b(${unscramble('elgoog')}|${unscramble('pmar')})\\b`, 'i');
  const metaCompany = new RegExp(`(?<![<.\\-])\\b${unscramble('ateM')}\\b`); // not <meta>, import.meta or a CSS class
  const dashes = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);
  const offenders = [];
  for (const file of allFiles(root).filter((f) => TEXT.test(f))) {
    const text = readFileSync(file, 'utf8');
    const lower = text.toLowerCase();
    const rel = relative(root, file);
    for (const word of banned) {
      const edge = /^\w/.test(word) ? '\\b' : '';
      if (new RegExp(`${edge}${word.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`, 'i').test(lower)) offenders.push(`${rel}: ${word}`);
    }
    if (statusWord.test(text)) offenders.push(`${rel}: work-status word`);
    if (vendorWords.test(text) || metaCompany.test(text)) offenders.push(`${rel}: platform or vendor name`);
    if (dashes.test(text)) offenders.push(`${rel}: en or em dash`);
    if (/https?:\/\//.test(text)) offenders.push(`${rel}: external URL`);
    if (/@[a-z0-9-]+\.[a-z]/i.test(text)) offenders.push(`${rel}: email address`);
    const names = lower.split(allowedName.toLowerCase()).join('').includes(firstName);
    if (names) offenders.push(`${rel}: personal name outside the footer line`);
  }
  assert.deepEqual(offenders, []);
});

test('README covers the required sections', () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  for (const heading of ['## What it does', '## How it works', '## Assumptions', '## How to run', '## Limits']) {
    assert.ok(readme.includes(heading), heading);
  }
  assert.match(readme, /synthetic/i);
  assert.match(readme, /Built with AI assistance \(Claude Code \/ Codex\)/);
});

// ------------------------------------------------------------ run

let failed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${String(error && error.message ? error.message : error).split('\n').join('\n        ')}`);
  }
}
console.log(`\n${tests.length - failed} of ${tests.length} tests passed`);
process.exitCode = failed ? 1 : 0;
