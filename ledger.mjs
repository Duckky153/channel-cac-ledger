/*
 * Channel CAC Ledger: all calculation, as pure functions. No DOM, no network.
 *
 * Money is always integer cents. Every division of money rounds down with
 * integer arithmetic, and budget splits use BigInt, so nothing depends on
 * floating-point rounding.
 *
 * This file has no imports or exports on purpose: browsers refuse to load ES
 * modules from a page opened straight from disk, so the pages load it as a
 * plain script. Node loads it as a module. Either way it registers one object,
 * globalThis.ChannelLedger.
 */
(function (root) {
  'use strict';

  const MODES = [
    { key: 'click', label: 'Click (UTM)' },
    { key: 'self', label: 'Self-reported' },
    { key: 'blend', label: 'Blend' },
  ];
  const MODE_LABEL = Object.fromEntries(MODES.map((m) => [m.key, m.label]));
  const UNKNOWN = 'Unknown';
  const MIN_TO_CALL = 3;
  const NON_ANSWERS = ['', "Don't remember"];
  const DEFAULTS = Object.freeze({ mode: 'blend', countBy: 'practice', includeFounder: false, founderRateCents: 10000 });
  const BUDGET_DEFAULTS = Object.freeze({ budgetCents: 4000000, goalPractices: 2000, slicePct: 10, maxSharePct: 40 });

  // ---------------------------------------------------------------- integers

  function assertCents(value, what) {
    if (!Number.isSafeInteger(value)) throw new Error(`${what} must be a whole number of cents, got ${value}`);
    return value;
  }

  // floor(a / b) for integers a >= 0, b > 0, without floating point.
  function floorDiv(a, b) {
    assertCents(a, 'amount');
    if (!Number.isSafeInteger(b) || b <= 0) throw new Error(`divisor must be a positive whole number, got ${b}`);
    return (a - (a % b)) / b;
  }

  const sum = (items, pick) => items.reduce((total, item) => total + pick(item), 0);
  const monthOf = (date) => (date ? date.slice(0, 7) : null);

  // ---------------------------------------------------------------- formatting

  function withCommas(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // Whole dollars, rounded down. "$1,340"
  function formatDollars(cents) {
    assertCents(cents, 'amount');
    const negative = cents < 0;
    const whole = floorDiv(Math.abs(cents), 100);
    return `${negative ? '-' : ''}$${withCommas(whole)}`;
  }

  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function formatMonth(month) {
    const [y, m] = month.split('-').map(Number);
    return `${MONTH_NAMES[m - 1]} ${y}`;
  }

  function monthName(month) {
    return MONTH_NAMES[Number(month.split('-')[1]) - 1];
  }

  function formatDate(date) {
    const [, m, d] = date.split('-').map(Number);
    return `${MONTH_NAMES[m - 1].slice(0, 3)} ${d}`;
  }

  function plural(n, singular, many) {
    return `${withCommas(n)} ${n === 1 ? singular : many || `${singular}s`}`;
  }

  const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);

  // Integer percent of part over whole, rounded to nearest (display only, never money).
  function percent(part, whole) {
    if (!whole) return 0;
    return Math.round((part * 100) / whole);
  }

  // "100" or "100.50" -> cents, by string parsing (no floating point). Returns null if invalid.
  function parseDollarsToCents(text) {
    const value = String(text == null ? '' : text).trim().replace(/[$,\s]/g, '');
    const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(value);
    if (!match) return null;
    const cents = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
    return Number.isSafeInteger(cents) ? cents : null;
  }

  // Whole numbers only, within [min, max]. Returns null if invalid.
  function parseWhole(text, min, max) {
    const value = String(text == null ? '' : text).trim().replace(/[,\s]/g, '');
    if (!/^\d{1,9}$/.test(value)) return null;
    const n = Number(value);
    return n >= min && n <= max ? n : null;
  }

  // ---------------------------------------------------------------- leads

  /*
   * The same office can appear more than once (booked twice through two
   * channels). It counts once: the earliest touch keeps its source fields, and
   * the merged record keeps the furthest step either record reached.
   */
  function dedupeLeads(leads) {
    const byId = new Map();
    for (const lead of leads) {
      if (!byId.has(lead.id)) byId.set(lead.id, []);
      byId.get(lead.id).push(lead);
    }
    const out = [];
    const merged = [];
    for (const [id, rows] of byId) {
      if (rows.length === 1) {
        out.push(rows[0]);
        continue;
      }
      const sorted = rows.slice().sort((a, b) => (a.first_touch < b.first_touch ? -1 : a.first_touch > b.first_touch ? 1 : 0));
      const kept = { ...sorted[0] };
      for (const later of sorted.slice(1)) {
        if (!kept.demo_held && later.demo_held) {
          kept.demo_held = true;
          kept.demo_booked_date = later.demo_booked_date;
        } else if (!kept.demo_booked_date && later.demo_booked_date) {
          kept.demo_booked_date = later.demo_booked_date;
        }
        kept.pilot_start = earliest(kept.pilot_start, later.pilot_start);
        kept.paid_date = earliest(kept.paid_date, later.paid_date);
        kept.paid_locations = Math.max(kept.paid_locations, later.paid_locations);
      }
      out.push(kept);
      merged.push({ id, rows: sorted, kept });
    }
    return { leads: out, merged };
  }

  function earliest(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    return a < b ? a : b;
  }

  function channelNames(data) {
    return data.channels.map((c) => c.name);
  }

  // Which channel gets credit for a lead under each attribution mode.
  function creditedChannel(lead, mode, names) {
    const isChannel = (value) => names.includes(value);
    if (mode === 'click') return isChannel(lead.utm_source) ? lead.utm_source : UNKNOWN;
    if (mode === 'self') return isChannel(lead.self_reported) ? lead.self_reported : UNKNOWN;
    if (mode === 'blend') {
      if (isChannel(lead.self_reported)) return lead.self_reported;
      if (isChannel(lead.utm_source)) return lead.utm_source;
      return UNKNOWN;
    }
    throw new Error(`unknown attribution mode: ${mode}`);
  }

  // ---------------------------------------------------------------- spend

  function founderRate(settings) {
    return settings && settings.includeFounder ? assertCents(settings.founderRateCents, 'founder rate') : 0;
  }

  function costOf(spendRows, rateCents) {
    const cash = sum(spendRows, (r) => assertCents(r.media_cents, 'media spend') + assertCents(r.field_cents, 'field spend'));
    const hours = sum(spendRows, (r) => r.founder_hours || 0);
    const founder = hours * rateCents;
    return { cashCents: cash, founderCents: assertCents(founder, 'founder cost'), totalCents: cash + founder, founderHours: hours };
  }

  // spend[channel][month] in cents (cash only), for the spend table and the checks.
  function spendMatrix(data) {
    const matrix = {};
    for (const name of channelNames(data)) {
      matrix[name] = {};
      for (const month of data.period.months) matrix[name][month] = 0;
    }
    for (const row of data.spend) matrix[row.channel][row.month] += row.media_cents + row.field_cents;
    return matrix;
  }

  // ---------------------------------------------------------------- funnel

  function funnel(leads) {
    const booked = leads.filter((l) => l.demo_booked_date);
    const held = booked.filter((l) => l.demo_held);
    const pilots = held.filter((l) => l.pilot_start);
    const paidViaPilot = pilots.filter((l) => l.paid_date);
    const paid = leads.filter((l) => l.paid_date);
    const pending = paid.filter((l) => l.paid_locations < l.locations);
    return {
      leads: leads.length,
      booked: booked.length,
      held: held.length,
      noShows: booked.length - held.length,
      pilots: pilots.length,
      paidViaPilot: paidViaPilot.length,
      paidAccounts: paid.length,
      paidPractices: sum(paid, (l) => l.paid_locations),
      offPath: paid.length - paidViaPilot.length,
      expansionPending: pending.length,
      pendingLocations: sum(pending, (l) => l.locations - l.paid_locations),
    };
  }

  function costPer(totalCents, count) {
    return count > 0 ? floorDiv(totalCents, count) : null;
  }

  // ---------------------------------------------------------------- channel table

  function channelTable(data, settings = DEFAULTS) {
    const s = { ...DEFAULTS, ...settings };
    const names = channelNames(data);
    const { leads } = dedupeLeads(data.leads);
    const rate = founderRate(s);

    const buildRow = (name, kind, spendRows, rowLeads) => {
      const cost = spendRows ? costOf(spendRows, rate) : null;
      const f = funnel(rowLeads);
      const counted = s.countBy === 'account' ? f.paidAccounts : f.paidPractices;
      return {
        name,
        kind,
        cost,
        ...f,
        costPerAccountCents: cost ? costPer(cost.totalCents, f.paidAccounts) : null,
        costPerPracticeCents: cost ? costPer(cost.totalCents, f.paidPractices) : null,
        counted,
        tooFew: kind === 'channel' && counted > 0 && counted < MIN_TO_CALL,
        noPaidYet: kind === 'channel' && counted === 0,
      };
    };

    const rows = names.map((name) =>
      buildRow(
        name,
        'channel',
        data.spend.filter((r) => r.channel === name),
        leads.filter((l) => creditedChannel(l, s.mode, names) === name),
      ),
    );
    const unknown = buildRow(UNKNOWN, 'unknown', null, leads.filter((l) => creditedChannel(l, s.mode, names) === UNKNOWN));
    // The total is counted straight from every lead, not by adding up the rows, so the check below means something.
    const total = buildRow('All leads', 'total', data.spend, leads);

    const reconcile = {
      practices: { channels: sum(rows, (r) => r.paidPractices), unknown: unknown.paidPractices, total: total.paidPractices },
      accounts: { channels: sum(rows, (r) => r.paidAccounts), unknown: unknown.paidAccounts, total: total.paidAccounts },
    };
    reconcile.ok =
      reconcile.practices.channels + reconcile.practices.unknown === reconcile.practices.total &&
      reconcile.accounts.channels + reconcile.accounts.unknown === reconcile.accounts.total;

    return { settings: s, rows, unknown, total, reconcile };
  }

  // ---------------------------------------------------------------- experiments

  function experimentResults(data, exp, settings = DEFAULTS) {
    const { leads } = dedupeLeads(data.leads);
    const rate = founderRate({ ...DEFAULTS, ...settings });
    const rows = data.spend.filter((r) => r.line === exp.id);
    const cost = costOf(rows, rate);
    const f = funnel(leads.filter((l) => l.campaign === exp.id));
    const maxHoursInAMonth = rows.reduce((max, r) => Math.max(max, r.founder_hours || 0), 0);
    return { ...f, cost, maxHoursInAMonth, rateCents: rate };
  }

  function unitWords(countBy) {
    return countBy === 'account' ? ['account', 'accounts'] : ['practice', 'practices'];
  }

  function guardrailCheck(exp, r) {
    const g = exp.guardrail;
    if (g.kind === 'no_show_rate') {
      const breached = r.booked > 0 && r.noShows * 100 > g.max_pct * r.booked;
      return {
        breached,
        rule: `demo no-show rate at most ${g.max_pct}%`,
        detail: r.booked > 0
          ? `${percent(r.noShows, r.booked)}% of booked demos were no-shows (${r.noShows} of ${r.booked})`
          : 'no demos booked yet',
      };
    }
    if (g.kind === 'founder_hours_per_month') {
      return {
        breached: r.maxHoursInAMonth > g.max_hours,
        rule: `founder time at most ${g.max_hours} hours a month`,
        detail: `founder time peaked at ${r.maxHoursInAMonth} hours in a month`,
      };
    }
    throw new Error(`unknown guardrail: ${g.kind}`);
  }

  function rulesText(exp, countBy) {
    const [one] = unitWords(countBy);
    const g = guardrailCheck(exp, { booked: 0, noShows: 0, maxHoursInAMonth: 0 });
    return {
      scale: `Scale at or under ${formatDollars(exp.scale_if.max_cost_cents)} per paid ${one}, with at least ${exp.scale_if.min_paid} paid.`,
      stop: `Stop above ${formatDollars(exp.stop_if.above_cost_cents)} per paid ${one}, or at ${exp.stop_if.cap_share_pct}% of the cap with no held demo.`,
      guardrail: `Guardrail: ${g.rule}.`,
    };
  }

  /*
   * One decision per test, from rules written before the results. The steps run
   * in this order and the first one that applies wins.
   */
  function decide(exp, r, countBy = 'practice') {
    const [one, many] = unitWords(countBy);
    const paid = countBy === 'account' ? r.paidAccounts : r.paidPractices;
    const cost = r.cost.totalCents;
    const cash = r.cost.cashCents;
    const cap = exp.budget_cap_cents;
    const per = costPer(cost, paid);
    const unitCount = (n) => plural(n, `paid ${one}`, `paid ${many}`);
    const founderNote = r.rateCents > 0 && r.cost.founderHours > 0
      ? ` Cost includes ${r.cost.founderHours} founder hours at ${formatDollars(r.rateCents)} an hour.`
      : '';
    const out = (decision, step, reason) => ({ decision, step, reason: reason + founderNote, costPerCents: per, paid, unit: one });

    // 1. Most of the cap gone and not one held demo.
    if (cash * 100 >= exp.stop_if.cap_share_pct * cap && r.held === 0) {
      return out('Stop', 'cap', `Stop: ${floorDiv(cash * 100, cap)}% of the ${formatDollars(cap)} cap is spent (${formatDollars(cash)}) with 0 held demos. The rule stops a test at ${exp.stop_if.cap_share_pct}% of its cap with no held demo.`);
    }
    // 2. Guardrail broken.
    const g = guardrailCheck(exp, r);
    if (g.breached) return out('Stop', 'guardrail', `Stop: ${g.detail}, past the guardrail (${g.rule}).`);
    // 3. Nothing paid yet.
    if (paid === 0) {
      if (r.held === 0) return out('Keep testing', 'none-yet', `Keep testing: no held demos or paid ${many} yet; ${formatDollars(cash)} of the ${formatDollars(cap)} cap is spent.`);
      const pilots = r.pilots ? ` and ${plural(r.pilots, 'pilot')} started` : '';
      return out('Keep testing', 'none-yet', `Keep testing: no paid ${many} yet, but ${r.held} of ${r.booked} booked demos were held${pilots}; ${formatDollars(cash)} of the ${formatDollars(cap)} cap is spent.`);
    }
    // 4. Too few wins to trust a cost.
    if (paid < MIN_TO_CALL) {
      return out('Too few to call', 'too-few', `Too few to call: ${unitCount(paid)} so far, and at least ${MIN_TO_CALL} are needed to call it either way.`);
    }
    // 5. Cost above the stop bar.
    if (per > exp.stop_if.above_cost_cents) {
      return out('Stop', 'stop-bar', `Stop: ${formatDollars(per)} per paid ${one} is above the ${formatDollars(exp.stop_if.above_cost_cents)} stop bar, with ${unitCount(paid)}.`);
    }
    // 6. Cost at or under the scale bar, with enough wins.
    const bar = exp.scale_if.max_cost_cents;
    if (per <= bar && paid >= exp.scale_if.min_paid) {
      return out('Scale', 'scale', `Scale: ${formatDollars(per)} per paid ${one} is ${per < bar ? 'under' : 'at'} the ${formatDollars(bar)} bar, with ${unitCount(paid)} (bar: ${exp.scale_if.min_paid}).`);
    }
    // 7. In between.
    if (per > bar) {
      return out('Keep testing', 'between', `Keep testing: ${formatDollars(per)} per paid ${one} is above the ${formatDollars(bar)} scale bar but not above the ${formatDollars(exp.stop_if.above_cost_cents)} stop bar.`);
    }
    return out('Keep testing', 'few-wins', `Keep testing: ${formatDollars(per)} per paid ${one} is under the ${formatDollars(bar)} bar, but there are only ${unitCount(paid)} (bar: ${exp.scale_if.min_paid}).`);
  }

  function experimentsTable(data, settings = DEFAULTS) {
    const s = { ...DEFAULTS, ...settings };
    return data.experiments.map((exp) => {
      const results = experimentResults(data, exp, s);
      return { exp, results, decision: decide(exp, results, s.countBy), rules: rulesText(exp, s.countBy) };
    });
  }

  // ---------------------------------------------------------------- what changed this month

  function changeDecomposition(data, settings = DEFAULTS, from = '2026-08', to = '2026-09') {
    const s = { ...DEFAULTS, ...settings };
    const names = channelNames(data);
    const { leads } = dedupeLeads(data.leads);
    const cells = new Map();
    for (const lead of leads) {
      if (!lead.demo_held) continue;
      const month = monthOf(lead.demo_booked_date);
      if (month !== from && month !== to) continue;
      const channel = creditedChannel(lead, s.mode, names);
      const key = `${channel}|${lead.type}`;
      if (!cells.has(key)) cells.set(key, { channel, type: lead.type, from: 0, to: 0 });
      cells.get(key)[month === from ? 'from' : 'to'] += 1;
    }
    const list = [...cells.values()].map((c) => ({ ...c, change: c.to - c.from, label: `${c.channel}, ${c.type === 'group' ? 'groups' : 'single offices'}` }));
    list.sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || b.change - a.change || (a.label < b.label ? -1 : 1));
    const totalFrom = sum(list, (c) => c.from);
    const totalTo = sum(list, (c) => c.to);
    const totalChange = totalTo - totalFrom;
    const topTwo = list.slice(0, 2);
    const topTwoChange = sum(topTwo, (c) => c.change);
    const sharePct = totalChange !== 0 ? percent(topTwoChange, totalChange) : null;

    let sentence;
    if (totalChange === 0) {
      sentence = `Held demos were flat: ${totalFrom} in ${monthName(from)} and ${totalTo} in ${monthName(to)}.`;
    } else if (topTwo.length < 2) {
      const signed = (n) => (n > 0 ? `+${n}` : String(n));
      sentence = `Held demos went from ${totalFrom} in ${monthName(from)} to ${totalTo} in ${monthName(to)} (${signed(totalChange)}), all in ${lowerFirst(topTwo[0].label)}.`;
    } else {
      const direction = totalChange > 0 ? 'rose' : 'fell';
      const signed = (n) => (n > 0 ? `+${n}` : String(n));
      sentence = `Held demos ${direction} from ${totalFrom} in ${monthName(from)} to ${totalTo} in ${monthName(to)} (${signed(totalChange)}). ` +
        `Two cells account for ${topTwoChange} of the ${Math.abs(totalChange)} (${sharePct}%): ` +
        `${lowerFirst(topTwo[0].label)} (${signed(topTwo[0].change)}) and ${lowerFirst(topTwo[1].label)} (${signed(topTwo[1].change)}).`;
    }
    return { from, to, cells: list, totalFrom, totalTo, totalChange, topTwoChange, sharePct, sentence };
  }

  // ---------------------------------------------------------------- rows a person should check

  function findExceptions(data) {
    const names = channelNames(data);
    const isChannel = (v) => names.includes(v);
    const { leads, merged } = dedupeLeads(data.leads);
    const out = [];
    const who = (l) => (l.type === 'group' ? `${l.id} (${l.locations} locations)` : l.id);

    const conflicts = leads
      .filter((l) => l.utm_source !== '' && !NON_ANSWERS.includes(l.self_reported) && l.self_reported !== l.utm_source)
      .sort((a, b) => b.paid_locations - a.paid_locations || (a.id < b.id ? -1 : 1));
    for (const l of conflicts) {
      const blend = creditedChannel(l, 'blend', names);
      const stake = l.paid_locations > 0
        ? ` ${plural(l.paid_locations, 'paid practice')} ${l.paid_locations === 1 ? 'rides' : 'ride'} on which one is right.`
        : '';
      let why;
      if (!isChannel(l.utm_source) && isChannel(l.self_reported)) {
        why = `The booking page saw ${l.utm_source} traffic, so click credit goes to no channel; they said ${l.self_reported}, so Blend and Self-reported credit ${l.self_reported}.${stake}`;
      } else if (isChannel(l.utm_source) && !isChannel(l.self_reported)) {
        why = `The click says ${l.utm_source}, but they said "${l.self_reported}". Blend keeps ${blend} because "${l.self_reported}" isn't a channel with spend, though word of mouth may deserve the credit.${stake}`;
      } else {
        why = `The click says ${l.utm_source}, but they said ${l.self_reported}. Blend goes with ${blend}.${stake}`;
      }
      out.push({ kind: 'conflict', label: 'Sources disagree', subject: who(l), why });
    }

    for (const l of leads.filter((x) => x.utm_source === '' && x.self_reported === '')) {
      const paid = l.paid_date ? ` It paid on ${formatDate(l.paid_date)}, so it's in the totals.` : '';
      out.push({ kind: 'no_source', label: 'No source at all', subject: who(l), why: `No click source and no answer to "How did you hear about us?". Counted as Unknown and credited to no channel.${paid}` });
    }

    for (const l of leads.filter((x) => x.paid_date && x.paid_locations < x.locations)) {
      out.push({
        kind: 'partial_paid',
        label: 'Expansion pending',
        subject: who(l),
        why: `Paid for ${l.paid_locations} of ${l.locations} locations. Counted as ${plural(l.paid_locations, 'paid practice')}; the other ${l.locations - l.paid_locations} are expansion pending and not counted.`,
      });
    }

    for (const l of leads.filter((x) => x.paid_date && !x.demo_booked_date)) {
      out.push({
        kind: 'paid_no_demo',
        label: 'Paid with no demo record',
        subject: who(l),
        why: `Started paying on ${formatDate(l.paid_date)} with no demo on record. It's counted as paid, but the demo and pilot steps can't include it. Worth checking whether the demo happened off the calendar.`,
      });
    }

    for (const m of merged) {
      const touches = m.rows.map((r) => `${creditedChannel(r, 'blend', names)} on ${formatDate(r.first_touch)}`).join(', then ');
      out.push({
        kind: 'duplicate',
        label: 'Booked twice',
        subject: m.id,
        why: `Booked through ${touches}. Counted once, credited to the first touch (${creditedChannel(m.kept, 'blend', names)}), keeping the furthest step either record reached${m.kept.paid_date ? ' (paid)' : ''}.`,
      });
    }

    const matrix = spendMatrix(data);
    for (const name of names) {
      for (const month of data.period.months) {
        const spent = matrix[name][month];
        if (spent <= 0) continue;
        const any = leads.some((l) => monthOf(l.first_touch) === month && MODES.some((mode) => creditedChannel(l, mode.key, names) === name));
        if (!any) {
          out.push({
            kind: 'spend_no_leads',
            label: 'Spend with no leads',
            subject: `${name}, ${formatMonth(month)}`,
            why: `${formatDollars(spent)} spent and no lead that month under any attribution mode. The cost may belong to later months' leads (for example, a video that went live later).`,
          });
        }
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- display helpers and data checks

  // A cost per paid practice or account for display. Zero wins is not $0 and not infinity.
  function costPerText(cents, unit = 'practice') {
    if (cents == null) return `no paid ${unit === 'account' ? 'accounts' : 'practices'} yet`;
    return formatDollars(cents);
  }

  /*
   * Consistency checks on the data file. Returns a list of problems (empty when
   * the data is sound), so a bad edit to data.js shows up in the tests and on the
   * page instead of quietly changing the numbers.
   */
  function validateData(data) {
    const problems = [];
    const names = channelNames(data);
    const lineIds = [...data.experiments.map((e) => e.id), ...data.base_lines.map((b) => b.id)];
    const sources = [...names, 'direct', ''];
    const answers = [...names, 'Colleague', "Don't remember", ''];
    const months = data.period.months;
    const whole = (v) => Number.isSafeInteger(v) && v >= 0;

    for (const r of data.spend) {
      const at = `spend ${r.line} ${r.month}`;
      if (!names.includes(r.channel)) problems.push(`${at}: unknown channel "${r.channel}"`);
      if (!lineIds.includes(r.line)) problems.push(`${at}: unknown line`);
      if (!months.includes(r.month)) problems.push(`${at}: month outside the period`);
      if (!whole(r.media_cents) || !whole(r.field_cents)) problems.push(`${at}: money must be whole cents`);
      if (!whole(r.founder_hours)) problems.push(`${at}: founder hours must be a whole number`);
    }
    for (const e of data.experiments) {
      if (!names.includes(e.channel)) problems.push(`${e.id}: unknown channel`);
      for (const v of [e.budget_cap_cents, e.scale_if.max_cost_cents, e.stop_if.above_cost_cents]) {
        if (!whole(v)) problems.push(`${e.id}: money must be whole cents`);
      }
      if (e.scale_if.max_cost_cents > e.stop_if.above_cost_cents) problems.push(`${e.id}: scale bar is above the stop bar`);
    }
    for (const l of data.leads) {
      const at = `lead ${l.id}`;
      if (!/^(Office \d{3}|Group [A-F])$/.test(l.id)) problems.push(`${at}: unexpected id`);
      if (l.type === 'single' && l.locations !== 1) problems.push(`${at}: a single office has one location`);
      if (l.type === 'group' && !(l.locations >= 3 && l.locations <= 25)) problems.push(`${at}: a group has 3 to 25 locations`);
      if (!sources.includes(l.utm_source)) problems.push(`${at}: unknown click source "${l.utm_source}"`);
      if (!answers.includes(l.self_reported)) problems.push(`${at}: unknown answer "${l.self_reported}"`);
      if (l.campaign !== null && !lineIds.includes(l.campaign)) problems.push(`${at}: unknown campaign`);
      if (l.demo_held && !l.demo_booked_date) problems.push(`${at}: demo held but never booked`);
      if (l.pilot_start && !l.demo_held) problems.push(`${at}: pilot without a held demo`);
      if (!Number.isSafeInteger(l.paid_locations) || l.paid_locations < 0 || l.paid_locations > l.locations) problems.push(`${at}: paid locations out of range`);
      if (Boolean(l.paid_date) !== l.paid_locations > 0) problems.push(`${at}: paid date and paid locations disagree`);
    }
    return problems;
  }

  // ---------------------------------------------------------------- headline

  /*
   * One plain sentence at the default settings (Blend, per practice, founder
   * time off). It finds the channel that costs the most per signed account and
   * says how it compares per paid practice.
   */
  function headline(data) {
    const t = channelTable(data, DEFAULTS);
    const priced = t.rows.filter((r) => r.paidAccounts > 0);
    if (!priced.length) return 'No channel has a paid practice yet.';
    const top = priced.reduce((a, b) => (b.costPerAccountCents > a.costPerAccountCents ? b : a));
    const pricier = priced.filter((r) => r !== top && r.paidPractices >= MIN_TO_CALL && r.costPerPracticeCents > top.costPerPracticeCents);
    if (pricier.length) {
      const comp = pricier.reduce((a, b) => (b.costPerPracticeCents > a.costPerPracticeCents ? b : a));
      const name = lowerFirst(top.name);
      return `Per paid practice, ${name} cost ${formatDollars(top.costPerPracticeCents)}, less than ${lowerFirst(comp.name)} at ${formatDollars(comp.costPerPracticeCents)}; per signed account, ${name} cost the most of any channel, at ${formatDollars(top.costPerAccountCents)}.`;
    }
    const cheapest = priced.reduce((a, b) => (b.costPerPracticeCents < a.costPerPracticeCents ? b : a));
    return `Cheapest per paid practice: ${lowerFirst(cheapest.name)} at ${formatDollars(cheapest.costPerPracticeCents)}; most expensive per signed account: ${lowerFirst(top.name)} at ${formatDollars(top.costPerAccountCents)}.`;
  }

  // ---------------------------------------------------------------- next month's budget

  // Split totalDollars across weights (BigInt), largest remainder, ties to the earlier line.
  function splitProportional(totalDollars, weights) {
    const total = BigInt(totalDollars);
    const weightSum = weights.reduce((a, b) => a + b, 0n);
    if (weightSum === 0n || total === 0n) return weights.map(() => 0);
    const exact = weights.map((w) => ({ floor: (total * w) / weightSum, rem: (total * w) % weightSum }));
    let left = total - exact.reduce((a, e) => a + e.floor, 0n);
    const order = exact.map((e, i) => i).sort((a, b) => (exact[b].rem > exact[a].rem ? 1 : exact[b].rem < exact[a].rem ? -1 : a - b));
    const out = exact.map((e) => e.floor);
    for (const i of order) {
      if (left === 0n) break;
      out[i] += 1n;
      left -= 1n;
    }
    return out.map(Number);
  }

  // Give each item up to its need; if the money runs short, split what's there in proportion to need.
  function fundTier(availableDollars, needs) {
    const totalNeed = sum(needs, (n) => n);
    if (totalNeed <= availableDollars) return { grants: needs.slice(), short: false };
    return { grants: splitProportional(availableDollars, needs.map((n) => BigInt(n))), short: totalNeed > 0 };
  }

  // Range for one line: its budget over its worst and best month's cost per paid practice.
  function lineRange(data, lineId, leads, rateCents, allocationCents) {
    const rows = data.spend.filter((r) => r.line === lineId);
    const months = [];
    for (const row of rows) {
      const cost = row.media_cents + row.field_cents + (row.founder_hours || 0) * rateCents;
      if (cost <= 0) continue;
      const cohort = leads.filter((l) => l.campaign === lineId && l.paid_date && monthOf(l.first_touch) === row.month);
      const practices = sum(cohort, (l) => l.paid_locations);
      if (practices > 0) months.push({ month: row.month, costPerCents: floorDiv(cost, practices), practices });
    }
    if (!months.length) return { low: 0, high: 0, bestCents: null, worstCents: null, monthsUsed: 0 };
    const best = Math.min(...months.map((m) => m.costPerCents));
    const worst = Math.max(...months.map((m) => m.costPerCents));
    return {
      low: floorDiv(allocationCents, worst),
      high: floorDiv(allocationCents, best),
      bestCents: best,
      worstCents: worst,
      monthsUsed: months.length,
    };
  }

  // ceil(a / b) for BigInt a >= 0, b > 0.
  function ceilDivBig(a, b) {
    return (a + b - 1n) / b;
  }

  // "1.25" style text for a value stored in hundredths (display only).
  function hundredths(n) {
    return `${floorDiv(n, 100)}.${String(n % 100).padStart(2, '0')}`;
  }

  // The budget rules, one sentence each, worded from the live settings.
  function budgetRules(options = {}) {
    const o = { ...BUDGET_DEFAULTS, ...options };
    return [
      { key: 'base', text: "Lines that aren't part of a test keep last month's spend, taken off the top." },
      { key: 'stop', text: 'Tests marked Stop get $0.' },
      { key: 'slice', text: `Tests marked Keep testing or Too few to call each get a test slice of ${o.slicePct}% of the budget, never more than that test's own cap.` },
      { key: 'scale', text: `Tests marked Scale split the rest in proportion to paid practices per dollar, and no channel ends up with more than ${o.maxSharePct}% of the budget.` },
      { key: 'held', text: 'Anything no line can take is held back, so the lines always add up to the budget exactly.' },
    ];
  }

  // Paid practices per dollar as BigInt weights: paid_i / cost_i, scaled by the product of the other costs.
  function perDollarWeights(group) {
    const costs = group.map((l) => BigInt(Math.max(1, l.results.cost.totalCents)));
    const product = costs.reduce((a, b) => a * b, 1n);
    return group.map((l, i) => BigInt(l.results.paidPractices) * (product / costs[i]));
  }

  function planBudget(data, options = {}) {
    const o = { ...BUDGET_DEFAULTS, includeFounder: false, founderRateCents: DEFAULTS.founderRateCents, ...options };
    assertCents(o.budgetCents, 'budget');
    if (o.budgetCents < 0 || o.budgetCents % 100 !== 0) throw new Error('budget must be whole dollars');
    const budget = o.budgetCents / 100; // whole dollars from here on (exact: divisible by 100)
    const rate = founderRate(o);
    const settings = { ...DEFAULTS, countBy: 'practice', includeFounder: o.includeFounder, founderRateCents: o.founderRateCents };
    const { leads } = dedupeLeads(data.leads);
    const dataPaid = funnel(leads).paidPractices;
    const current = o.currentPaidPractices == null ? dataPaid : o.currentPaidPractices;
    const lastMonth = data.period.months[data.period.months.length - 1];

    const lines = [
      ...data.base_lines.map((b) => {
        const cash = sum(data.spend.filter((r) => r.line === b.id && r.month === lastMonth), (r) => r.media_cents + r.field_cents);
        return {
          id: b.id, name: b.name, channel: b.channel, kind: 'base', decision: 'Not a test', tier: 'base',
          need: floorDiv(cash, 100),
          reason: `Not part of a test, so it keeps its ${monthName(lastMonth)} spend (${formatDollars(cash)}), taken off the top.`,
        };
      }),
      ...data.experiments.map((exp) => {
        const results = experimentResults(data, exp, settings);
        const d = decide(exp, results, 'practice');
        const line = { id: exp.id, name: exp.name, channel: exp.channel, kind: 'test', decision: d.decision, decisionReason: d.reason, results };
        if (d.decision === 'Stop') return { ...line, tier: 'stop', need: 0, reason: 'Stopped, so it gets $0.' };
        if (d.decision === 'Scale') return { ...line, tier: 'scale', need: 0, reason: '' };
        const slice = Math.min(floorDiv(budget * o.slicePct, 100), floorDiv(exp.budget_cap_cents, 100));
        return {
          ...line, tier: 'slice', need: slice,
          reason: `${d.decision}, so it gets a capped test slice: ${o.slicePct}% of the budget, never more than its ${formatDollars(exp.budget_cap_cents)} cap.`,
        };
      }),
    ];

    const notes = [];
    let left = budget;
    for (const tier of ['base', 'slice']) {
      const group = lines.filter((l) => l.tier === tier);
      const { grants, short } = fundTier(left, group.map((l) => l.need));
      group.forEach((l, i) => { l.dollars = grants[i]; });
      left -= sum(grants, (g) => g);
      if (short) notes.push(tier === 'base' ? "The budget is smaller than the always-on spend, so those lines were cut in proportion." : 'The budget ran short of the test slices, so they were cut in proportion.');
    }
    for (const l of lines.filter((x) => x.tier === 'stop')) l.dollars = 0;

    // Scale lines split what's left by paid practices per dollar. A channel's total
    // (its always-on line and test slices included) never goes above maxSharePct of
    // the budget; a channel that would, is filled to the limit and the rest is
    // re-split among the other channels.
    const capDollars = floorDiv(budget * o.maxSharePct, 100);
    const used = new Map();
    for (const l of lines) if (l.tier === 'base' || l.tier === 'slice') used.set(l.channel, (used.get(l.channel) || 0) + l.dollars);
    const scale = lines.filter((l) => l.tier === 'scale');
    scale.forEach((l) => { l.dollars = 0; l.capped = false; });
    let active = scale.slice();
    let pool = left;
    while (active.length && pool > 0) {
      const grants = splitProportional(pool, perDollarWeights(active));
      const byChannel = new Map();
      active.forEach((l, i) => byChannel.set(l.channel, (byChannel.get(l.channel) || 0) + grants[i]));
      const over = [...byChannel.keys()].filter((ch) => (used.get(ch) || 0) + byChannel.get(ch) > capDollars);
      if (!over.length) {
        active.forEach((l, i) => { l.dollars = grants[i]; });
        pool = 0;
        break;
      }
      for (const ch of over) {
        const group = active.filter((l) => l.channel === ch);
        const room = Math.max(0, capDollars - (used.get(ch) || 0));
        const split = splitProportional(room, perDollarWeights(group));
        group.forEach((l, i) => { l.dollars = split[i]; l.capped = true; });
        used.set(ch, (used.get(ch) || 0) + room);
        pool -= room;
      }
      active = active.filter((l) => !l.capped);
    }
    const heldBack = pool;
    for (const l of scale) {
      const per1k = floorDiv(l.results.paidPractices * 100000 * 100, Math.max(1, l.results.cost.totalCents));
      l.perThousandHundredths = per1k;
      l.reason = `Scale, so it shares the rest by paid practices per dollar (${hundredths(per1k)} per $1,000 so far)` +
        (l.capped ? `, stopped at the ${o.maxSharePct}% limit for ${lowerFirst(l.channel)}.` : '.');
    }

    for (const l of lines) {
      l.allocationCents = l.dollars * 100;
      l.range = lineRange(data, l.id, leads, rate, l.allocationCents);
      delete l.dollars;
      delete l.need;
    }
    if (heldBack > 0) {
      const why = scale.length
        ? `Every channel with a Scale test is at the ${o.maxSharePct}% limit, so no line can take this.`
        : 'No test earned a Scale decision, so nothing can take this.';
      notes.push(`${formatDollars(heldBack * 100)} is held back. ${why}`);
      lines.push({
        id: 'held', name: 'Held back', channel: null, kind: 'held', decision: '', tier: 'held',
        allocationCents: heldBack * 100, reason: why,
        range: { low: 0, high: 0, bestCents: null, worstCents: null, monthsUsed: 0 },
      });
    }

    const allocated = sum(lines, (l) => l.allocationCents);
    const low = sum(lines, (l) => l.range.low);
    const high = sum(lines, (l) => l.range.high);

    const channels = channelNames(data).map((name) => {
      const own = lines.filter((l) => l.channel === name);
      const cents = sum(own, (l) => l.allocationCents);
      return {
        name,
        allocationCents: cents,
        sharePct: o.budgetCents > 0 ? floorDiv(cents * 100, o.budgetCents) : 0,
        lines: own,
        low: sum(own, (l) => l.range.low),
        high: sum(own, (l) => l.range.high),
      };
    });

    const monthsLeft = data.period.months_left_in_year;
    const remaining = Math.max(0, o.goalPractices - current);
    const pace = remaining === 0 ? 0 : floorDiv(remaining + monthsLeft - 1, monthsLeft);
    // Straight-line arithmetic: the budget that would buy the pace at this plan's own cost per practice.
    const neededCents = (practices) => (practices > 0 ? Number(ceilDivBig(BigInt(pace) * BigInt(budget), BigInt(practices))) * 100 : null);
    const goal = {
      goal: o.goalPractices,
      current,
      dataPaid,
      monthsLeft,
      pace,
      low,
      high,
      gapLow: Math.max(0, pace - high),
      gapHigh: Math.max(0, pace - low),
      neededLowCents: pace > 0 ? neededCents(high) : 0,
      neededHighCents: pace > 0 ? neededCents(low) : 0,
    };

    const tierTotal = (tier) => sum(lines.filter((l) => l.tier === tier), (l) => l.allocationCents);
    const count = (tier) => lines.filter((l) => l.tier === tier).length;
    const nextMonth = formatMonth(data.period.next_month);
    const summary = `${nextMonth}, ${formatDollars(o.budgetCents)}: ` +
      `${formatDollars(tierTotal('scale'))} to the ${plural(count('scale'), 'test')} that passed ${count('scale') === 1 ? 'its' : 'their'} bar, ` +
      `${formatDollars(tierTotal('slice'))} to ${plural(count('slice'), 'capped test slice')}, ` +
      `${formatDollars(tierTotal('base'))} to ${plural(count('base'), 'always-on line')}, ` +
      `and $0 to the ${plural(count('stop'), 'stopped test')}` +
      (heldBack > 0 ? `, with ${formatDollars(heldBack * 100)} held back` : '') +
      `. At past costs that spend could bring in ${low === high ? low : `${low} to ${high}`} paid practices, a range rather than a forecast.`;

    return {
      options: o,
      rules: budgetRules(o),
      lines,
      channels,
      allocatedCents: allocated,
      heldBackCents: heldBack * 100,
      notes,
      goal,
      summary,
    };
  }

  root.ChannelLedger = Object.freeze({
    MODES,
    MODE_LABEL,
    UNKNOWN,
    MIN_TO_CALL,
    DEFAULTS,
    BUDGET_DEFAULTS,
    floorDiv,
    formatDollars,
    formatMonth,
    formatDate,
    monthName,
    plural,
    percent,
    withCommas,
    parseDollarsToCents,
    parseWhole,
    dedupeLeads,
    creditedChannel,
    costOf,
    spendMatrix,
    funnel,
    channelTable,
    experimentResults,
    decide,
    rulesText,
    experimentsTable,
    changeDecomposition,
    findExceptions,
    headline,
    splitProportional,
    budgetRules,
    planBudget,
    costPerText,
    validateData,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
