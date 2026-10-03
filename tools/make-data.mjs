// Writes ../data.js from the hand-written lead lists below.
// Run with: node tools/make-data.mjs
// Everything here is synthetic. Offices are "Office 001" onward, groups are
// "Group A" to "Group F", and every date and amount is made up.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CH = {
  PS: 'Paid social',
  SE: 'Search',
  DM: 'Direct mail',
  PR: 'Partner referrals',
  EV: 'Events',
  CV: 'Dentist creator videos',
};
const SOURCE = { ...CH, D: 'direct', '': '' };
const ANSWER = { ...CH, COL: 'Colleague', DR: "Don't remember", '': '' };

const d = (mmdd) => (mmdd ? `2026-${mmdd}` : null);
const dollars = (n) => n * 100;

// Single offices: [first touch, utm, self-reported, demo date, held, pilot start, paid date]
// "H" = demo held, "N" = booked but not held, "" = no demo booked.
const singles = {
  'PS-base': [
    ['04-06', 'PS', 'PS', '04-14', 'H', '04-21', '05-19'],
    ['04-22', 'PS', '', '05-04', 'N'],
    ['05-08', 'PS', 'DR', '05-15', 'H', '05-26', '06-23'],
    ['05-27', 'PS', ''],
    ['06-10', 'PS', 'PS', '06-17', 'H', '06-29'],
    ['06-30', 'PS', ''],
    ['07-13', 'PS', 'PS', '07-21', 'H'],
    ['08-05', 'PS', '', '08-12', 'N'],
    ['08-26', 'PS', ''],
    ['09-14', 'PS', 'DR', '09-22', 'N'],
    // Planted: ad click says Paid social, the answer says a colleague told them.
    ['05-18', 'PS', 'COL', '05-26', 'H', '06-02', '06-30'],
  ],
  E6: [
    ['06-03', 'PS', 'PS', '06-09', 'H', '06-16', '07-14'],
    ['06-11', 'PS', '', '06-18', 'H', '06-25', '07-23'],
    ['06-24', 'PS', '', '07-01', 'N'],
    ['07-02', 'PS', 'PS', '07-09', 'H', '07-16', '08-13'],
    ['07-20', 'PS', ''],
    ['07-29', 'PS', 'DR', '08-05', 'H', '08-12', '09-09'],
    ['08-10', 'PS', 'PS', '08-18', 'H', '08-25'],
    ['08-24', 'PS', ''],
    ['09-01', 'PS', '', '09-08', 'H'],
    ['09-09', 'PS', 'PS', '09-16', 'H'],
    ['09-15', 'PS', '', '09-24', 'N'],
    ['09-21', 'PS', ''],
  ],
  E8: [
    ['07-01', 'PS', '', '07-08', 'H', '07-15', '08-12'],
    ['07-02', 'PS', 'PS', '07-09', 'N'],
    ['07-06', 'PS', '', '07-13', 'H', '07-20', '09-01'],
    ['07-08', 'PS', '', '07-15', 'N'],
    ['07-10', 'PS', 'DR', '07-17', 'H'],
    ['07-14', 'PS', '', '07-21', 'N'],
    ['07-16', 'PS', ''],
    ['07-20', 'PS', 'PS', '07-27', 'H'],
    ['07-23', 'PS', '', '07-30', 'H'],
    ['07-27', 'PS', '', '08-03', 'N'],
    ['07-30', 'PS', ''],
    ['08-03', 'PS', '', '08-10', 'N'],
    ['08-06', 'PS', 'PS', '08-13', 'H', '08-20'],
    ['08-12', 'PS', '', '08-19', 'N'],
    ['08-17', 'PS', '', '08-24', 'N'],
    ['08-21', 'PS', ''],
    ['08-27', 'PS', '', '09-03', 'N'],
    ['09-02', 'PS', 'DR', '09-09', 'H'],
    ['09-08', 'PS', '', '09-15', 'N'],
    ['09-11', 'PS', '', '09-18', 'H'],
    ['09-16', 'PS', '', '09-23', 'N'],
    ['09-22', 'PS', ''],
  ],
  'SE-base': [
    ['04-09', 'SE', 'SE', '04-16', 'H', '04-23', '05-21'],
    ['04-28', 'SE', ''],
    ['05-12', 'SE', 'DR', '05-19', 'H', '05-27', '06-24'],
    ['06-15', 'SE', 'SE', '06-22', 'H'],
    ['06-29', 'SE', ''],
    ['07-08', 'SE', '', '07-15', 'H', '07-22', '08-19'],
    ['08-03', 'SE', 'SE', '08-10', 'H'],
    ['08-17', 'SE', '', '08-25', 'H', '09-01'],
    ['09-02', 'SE', '', '09-09', 'H'],
    ['09-10', 'SE', 'SE', '09-17', 'H'],
    ['09-16', 'SE', 'DR', '09-23', 'H'],
  ],
  E2: [
    ['05-04', 'SE', ''],
    ['05-11', 'SE', '', '05-19', 'N'],
    ['05-18', 'SE', ''],
    ['05-29', 'SE', 'DR'],
    ['06-05', 'SE', ''],
    ['06-16', 'SE', '', '06-24', 'N'],
    ['06-26', 'SE', ''],
    ['07-07', 'SE', ''],
    ['07-21', 'SE', ''],
  ],
  E3: [
    ['07-21', 'DM', 'DM', '08-04', 'H', '08-11', '09-08'],
    ['07-27', '', 'DM', '08-13', 'H', '08-20'],
    ['08-06', 'DM', '', '08-19', 'N'],
    ['08-18', '', 'DM', '09-02', 'H'],
    ['07-30', '', 'DM'],
    ['08-25', 'DM', 'DR'],
  ],
  E1: [
    ['05-04', 'PR', 'PR', '05-11', 'H', '05-18', '06-15'],
    ['05-14', '', 'PR', '05-21', 'H', '05-28', '06-25'],
    ['05-26', 'PR', '', '06-02', 'H', '06-09', '07-07'],
    ['06-09', '', 'PR', '06-16', 'H', '06-23', '07-21'],
    ['06-22', 'PR', 'PR', '06-29', 'H', '07-06', '08-03'],
    ['07-07', '', 'PR', '07-14', 'H', '07-21', '08-18'],
    ['07-23', 'PR', '', '08-04', 'H', '08-11', '09-08'],
    ['08-06', '', 'PR', '08-13', 'H', '08-20'],
    ['08-20', 'PR', 'PR', '09-01', 'H', '09-08'],
    ['08-27', '', 'PR', '09-03', 'H'],
    ['09-02', 'PR', '', '09-10', 'H'],
    ['09-08', '', 'PR', '09-15', 'H'],
    ['09-14', 'PR', 'PR', '09-22', 'H'],
    ['06-30', '', 'PR', '07-08', 'N'],
    ['09-18', '', 'PR'],
    // Planted: paid with no demo record (signed after a call the calendar never saw).
    ['07-15', '', 'PR', '', '', '', '08-12'],
  ],
  E4: [
    ['06-12', '', 'EV', '06-25', 'H', '07-02', '07-30'],
    ['06-13', '', 'EV', '06-30', 'H'],
    ['06-13', '', 'EV', '07-07', 'N'],
    ['06-12', '', 'EV'],
    ['06-13', 'EV', 'EV', '07-09', 'H', '07-16', '08-13'],
    ['09-11', '', 'EV', '09-18', 'H'],
    ['09-12', 'EV', 'EV', '09-23', 'N'],
    ['09-12', '', 'EV'],
  ],
  E5: [
    ['04-15', '', 'EV', '04-22', 'H', '04-29', '05-27'],
    ['04-15', 'EV', 'EV', '04-28', 'H', '05-05', '06-02'],
    ['05-13', '', 'EV', '05-20', 'H', '05-27', '06-24'],
    ['05-13', 'EV', ''],
    ['06-17', 'EV', 'EV', '06-24', 'H', '07-01', '07-29'],
    ['06-17', '', 'EV', '07-01', 'H', '07-08'],
    ['07-15', '', 'EV', '07-22', 'H', '07-29', '08-26'],
    ['07-15', 'EV', 'EV', '07-28', 'N'],
    ['08-12', 'EV', 'EV', '08-19', 'H', '08-26', '09-23'],
    ['08-12', '', 'EV', '08-26', 'H', '09-02'],
    ['09-09', 'EV', 'EV', '09-16', 'H'],
    ['09-09', '', 'EV', '09-23', 'H'],
    ['09-09', 'EV', 'DR'],
    ['07-15', '', 'EV'],
  ],
  E7: [
    ['05-20', 'CV', 'CV', '05-28', 'H', '06-04'],
    ['06-18', 'CV', ''],
    ['07-09', '', 'CV', '07-16', 'N'],
    ['08-14', 'CV', 'CV', '08-21', 'H'],
    ['09-03', 'CV', '', '09-10', 'H'],
    ['09-17', '', 'CV', '09-24', 'H'],
    ['08-28', 'CV', 'DR'],
  ],
  // No campaign tag: nothing ties these to a channel we pay for.
  none: [
    // Planted: no click source and no answer.
    ['06-05', '', '', '06-12', 'H', '06-19', '07-17'],
    ['07-22', 'D', '', '07-29', 'N'],
    ['08-11', 'D', 'DR'],
    ['05-06', '', 'COL', '05-13', 'H', '05-20', '06-17'],
    ['09-19', 'D', ''],
  ],
};

// Planted: the same office booked twice through two channels.
const duplicateOffice = [
  { campaign: 'SE-base', row: ['05-05', 'SE', '', '05-12', 'N'] },
  { campaign: 'PS-base', row: ['06-08', 'PS', 'PS', '06-15', 'H', '06-22', '07-20'] },
];

// Groups: [letter, campaign, locations, first touch, utm, self, demo, held, pilot, paid, paid locations]
const groups = [
  // Planted: paid for 4 of 18 locations, the rest is expansion pending.
  ['A', 'E1', 18, '06-01', '', 'PR', '06-08', 'H', '06-22', '08-05', 4],
  // Planted: booking page saw direct traffic; the answer says Events. All 14 locations paid.
  ['B', 'E4', 14, '06-12', 'D', 'EV', '06-23', 'H', '07-07', '08-04', 14],
  ['C', 'E1', 25, '08-31', 'PR', 'PR', '09-14', 'H', '', '', 0],
  ['D', 'E4', 5, '09-11', '', 'EV', '09-17', 'H', '', '', 0],
  ['E', 'E4', 8, '09-11', '', 'EV', '09-22', 'H', '', '', 0],
  ['F', 'E4', 3, '09-12', 'EV', 'EV', '09-24', 'H', '', '', 0],
];

function leadFromRow(row, campaign) {
  const [touch, utm, self, demo = '', held = '', pilot = '', paid = ''] = row;
  return {
    type: 'single',
    locations: 1,
    first_touch: d(touch),
    utm_source: SOURCE[utm],
    self_reported: ANSWER[self],
    campaign,
    demo_booked_date: d(demo),
    demo_held: held === 'H',
    pilot_start: d(pilot),
    paid_date: d(paid),
    paid_locations: paid ? 1 : 0,
  };
}

const rows = [];
for (const [campaign, list] of Object.entries(singles)) {
  for (const row of list) rows.push(leadFromRow(row, campaign === 'none' ? null : campaign));
}
const dupRows = duplicateOffice.map(({ campaign, row }) => ({ ...leadFromRow(row, campaign), dup: true }));
rows.push(...dupRows);

// Number single offices by first touch (ties keep list order); the duplicate shares one number.
const ordered = rows.map((r, i) => ({ r, i })).sort((a, b) => (a.r.first_touch < b.r.first_touch ? -1 : a.r.first_touch > b.r.first_touch ? 1 : a.i - b.i));
let n = 0;
let dupId = null;
for (const { r } of ordered) {
  if (r.dup) {
    if (!dupId) dupId = `Office ${String(++n).padStart(3, '0')}`;
    r.id = dupId;
    delete r.dup;
  } else {
    r.id = `Office ${String(++n).padStart(3, '0')}`;
  }
}

for (const [letter, campaign, locations, touch, utm, self, demo, held, pilot, paid, paidLocations] of groups) {
  rows.push({
    id: `Group ${letter}`,
    type: 'group',
    locations,
    first_touch: d(touch),
    utm_source: SOURCE[utm],
    self_reported: ANSWER[self],
    campaign,
    demo_booked_date: d(demo),
    demo_held: held === 'H',
    pilot_start: d(pilot),
    paid_date: d(paid),
    paid_locations: paidLocations,
  });
}

const leads = rows
  .map((r) => ({
    id: r.id,
    type: r.type,
    locations: r.locations,
    first_touch: r.first_touch,
    utm_source: r.utm_source,
    self_reported: r.self_reported,
    campaign: r.campaign,
    demo_booked_date: r.demo_booked_date,
    demo_held: r.demo_held,
    pilot_start: r.pilot_start,
    paid_date: r.paid_date,
    paid_locations: r.paid_locations,
  }))
  .sort((a, b) => (a.first_touch < b.first_touch ? -1 : a.first_touch > b.first_touch ? 1 : a.id < b.id ? -1 : 1));

// Spend rows: one per line per month. media_cents = media or vendor; field_cents = booth, travel, food.
const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
const spend = [];
function addSpend(line, channel, month, media, field = 0, founderHours = 0) {
  spend.push({ line, channel, month, media_cents: dollars(media), field_cents: dollars(field), founder_hours: founderHours });
}
for (const m of months) addSpend('PS-base', CH.PS, m, 1000);
for (const m of months.slice(2)) addSpend('E6', CH.PS, m, 2100);
for (const m of months.slice(3)) addSpend('E8', CH.PS, m, 3000);
for (const m of months) addSpend('SE-base', CH.SE, m, 500);
addSpend('E2', CH.SE, '2026-05', 1800);
addSpend('E2', CH.SE, '2026-06', 1700);
addSpend('E2', CH.SE, '2026-07', 1700);
addSpend('E3', CH.DM, '2026-07', 1500);
addSpend('E3', CH.DM, '2026-08', 900);
for (const m of months.slice(1)) addSpend('E1', CH.PR, m, 1920, 0, 8);
addSpend('E4', CH.EV, '2026-06', 9500, 3100, 16);
addSpend('E4', CH.EV, '2026-09', 8000, 2900, 16);
[
  ['2026-04', 800, 6],
  ['2026-05', 1000, 8],
  ['2026-06', 1000, 8],
  ['2026-07', 1200, 10],
  ['2026-08', 1000, 9],
  ['2026-09', 1000, 9],
].forEach(([m, field, hours]) => addSpend('E5', CH.EV, m, 0, field, hours));
for (const m of months) addSpend('E7', CH.CV, m, 750);

const channels = [
  { name: CH.PS, note: 'Ads on social platforms' },
  { name: CH.SE, note: 'Search ads' },
  { name: CH.DM, note: 'Postcards' },
  { name: CH.PR, note: 'Dental consultants and supply reps' },
  { name: CH.EV, note: 'Conference booths and lunch-and-learns' },
  { name: CH.CV, note: 'Short videos made by practicing dentists' },
];

const baseLines = [
  { id: 'PS-base', channel: CH.PS, name: 'Always-on paid social', note: 'Not part of a test' },
  { id: 'SE-base', channel: CH.SE, name: 'Brand search', note: 'Not part of a test' },
];

const noShow = (maxPct) => ({ kind: 'no_show_rate', max_pct: maxPct });
const founderCap = (maxHours) => ({ kind: 'founder_hours_per_month', max_hours: maxHours });
const bars = (scaleDollars, stopDollars) => ({
  scale_if: { max_cost_cents: dollars(scaleDollars), min_paid: 5 },
  stop_if: { above_cost_cents: dollars(stopDollars), cap_share_pct: 60 },
});

const experiments = [
  {
    id: 'E1', channel: CH.PR, name: 'Partner referral program', months: ['2026-05', '2026-09'], window_weeks: 22,
    hypothesis: 'Practices referred by a consultant or supply rep they already trust will start paying at under $2,000 each.',
    budget_cap_cents: dollars(12000), metric: 'Cost per paid practice', guardrail: founderCap(12), ...bars(2000, 5000),
  },
  {
    id: 'E2', channel: CH.SE, name: 'Generic software search terms', months: ['2026-05', '2026-07'], window_weeks: 12,
    hypothesis: 'Ads on generic practice-software searches will bring paying practices at under $2,500 each.',
    budget_cap_cents: dollars(8000), metric: 'Cost per paid practice', guardrail: noShow(40), ...bars(2500, 6000),
  },
  {
    id: 'E3', channel: CH.DM, name: 'Postcards near current customers', months: ['2026-07', '2026-08'], window_weeks: 8,
    hypothesis: 'Postcards to single offices within a few miles of a current customer will bring paying practices at under $1,500 each.',
    budget_cap_cents: dollars(3000), metric: 'Cost per paid practice', guardrail: noShow(40), ...bars(1500, 4000),
  },
  {
    id: 'E4', channel: CH.EV, name: 'Conference booths', months: ['2026-06', '2026-09'], window_weeks: 16,
    hypothesis: 'Booths at two regional dental conferences will reach multi-office groups and bring paying practices at under $2,500 each.',
    budget_cap_cents: dollars(26000), metric: 'Cost per paid practice', guardrail: founderCap(20), ...bars(2500, 6000),
  },
  {
    id: 'E5', channel: CH.EV, name: 'Lunch-and-learns', months: ['2026-04', '2026-09'], window_weeks: 26,
    hypothesis: 'Lunch-and-learns at single offices will bring paying practices at under $1,500 each.',
    budget_cap_cents: dollars(8000), metric: 'Cost per paid practice', guardrail: founderCap(12), ...bars(1500, 4000),
  },
  {
    id: 'E6', channel: CH.PS, name: 'Retargeting site visitors', months: ['2026-06', '2026-09'], window_weeks: 16,
    hypothesis: 'Retargeting office managers who visited the pricing page will bring paying practices at under $1,800 each.',
    budget_cap_cents: dollars(10000), metric: 'Cost per paid practice', guardrail: noShow(40), ...bars(1800, 4000),
  },
  {
    id: 'E7', channel: CH.CV, name: 'Dentist creator videos', months: ['2026-04', '2026-09'], window_weeks: 26,
    hypothesis: 'Short videos by practicing dentists will bring paying practices at under $2,000 each.',
    budget_cap_cents: dollars(6000), metric: 'Cost per paid practice', guardrail: noShow(40), ...bars(2000, 5000),
  },
  {
    id: 'E8', channel: CH.PS, name: 'Cold audience ads', months: ['2026-07', '2026-09'], window_weeks: 12,
    hypothesis: 'Cold ads to office managers in three metro areas will bring paying practices at under $2,000 each.',
    budget_cap_cents: dollars(12000), metric: 'Cost per paid practice', guardrail: noShow(40), ...bars(2000, 4500),
  },
];

const data = {
  note: 'Synthetic data. Every office, group, date and amount is made up; the rules and prices are assumptions.',
  period: { months, as_of: '2026-09-30', next_month: '2026-10', months_left_in_year: 3 },
  channels,
  base_lines: baseLines,
  experiments,
  spend,
  leads,
};

const header = `/*
 * Synthetic data for the Channel CAC Ledger. Generated by tools/make-data.mjs.
 * Every office, group, date and amount is made up. Money is integer cents.
 * Loaded as a plain script in the browser and imported by the Node tests.
 */
`;
// One row per line for the long lists, so the file stays easy to scan.
const rowsBlock = (list) => `[\n${list.map((item) => `    ${JSON.stringify(item)}`).join(',\n')}\n  ]`;
const parts = Object.entries(data).map(([key, value]) => {
  if (key === 'leads' || key === 'spend' || key === 'channels' || key === 'base_lines') return `  ${key}: ${rowsBlock(value)}`;
  if (key === 'experiments') {
    const one = (e) => `    {\n${Object.entries(e).map(([k, v]) => `      ${k}: ${JSON.stringify(v)}`).join(',\n')}\n    }`;
    return `  ${key}: [\n${value.map(one).join(',\n')}\n  ]`;
  }
  return `  ${key}: ${JSON.stringify(value)}`;
});
const body = `globalThis.LEDGER_DATA = {\n${parts.join(',\n')}\n};\n`;
writeFileSync(path.join(projectDir, 'data.js'), header + body);
console.log(`wrote data.js: ${leads.length} lead rows, ${spend.length} spend rows, ${experiments.length} experiments`);
