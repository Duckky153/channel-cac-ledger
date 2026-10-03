/*
 * Next month's budget: renders budget.html. The plan itself comes from
 * ChannelLedger.planBudget in ledger.mjs; this file reads the inputs and writes HTML.
 */
(function () {
  'use strict';

  const L = globalThis.ChannelLedger;
  const DATA = globalThis.LEDGER_DATA;
  const $ = (id) => document.getElementById(id);

  const esc = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const BADGE_CLASS = { Scale: 'scale', Stop: 'stop', 'Keep testing': 'keep', 'Too few to call': 'few', 'Not a test': 'base' };

  function showError(message) {
    const box = $('error');
    box.textContent = message;
    box.hidden = false;
  }

  if (!L || !DATA) {
    showError('The plan could not load its data files.');
    return;
  }
  const problems = L.validateData(DATA);
  if (problems.length) showError(`The data file has ${problems.length} problem(s): ${problems.slice(0, 3).join('; ')}.`);

  const dataPaid = L.funnel(L.dedupeLeads(DATA.leads).leads).paidPractices;
  $('current').value = L.withCommas(dataPaid);
  $('current-hint').textContent = `From the data: ${L.withCommas(dataPaid)} paid practices by September 30.`;

  // Last valid value for each input, so a half-typed number never blanks the page.
  const last = {
    budgetCents: L.BUDGET_DEFAULTS.budgetCents,
    goalPractices: L.BUDGET_DEFAULTS.goalPractices,
    currentPaidPractices: dataPaid,
    founderRateCents: L.DEFAULTS.founderRateCents,
  };

  function readWhole(id, errorId, min, max) {
    const input = $(id);
    const value = L.parseWhole(input.value, min, max);
    const bad = value === null && !input.disabled;
    input.setAttribute('aria-invalid', bad ? 'true' : 'false');
    $(errorId).hidden = !bad;
    return value;
  }

  function readOptions() {
    const budget = readWhole('budget', 'budget-error', 0, 10000000);
    if (budget !== null) last.budgetCents = budget * 100;
    const goal = readWhole('goal', 'goal-error', 0, 1000000);
    if (goal !== null) last.goalPractices = goal;
    const current = readWhole('current', 'current-error', 0, 1000000);
    if (current !== null) last.currentPaidPractices = current;
    const includeFounder = $('founder').checked;
    $('founder-rate').disabled = !includeFounder;
    const rate = readWhole('founder-rate', 'rate-error', 0, 2000);
    if (rate !== null) last.founderRateCents = rate * 100;
    return { ...last, includeFounder };
  }

  function rangeText(line) {
    const range = line.range;
    if (line.allocationCents === 0) return '0';
    if (!range.monthsUsed) return '<span class="none-yet">no paid month yet</span>';
    const span = range.low === range.high ? `${range.low}` : `${range.low} to ${range.high}`;
    const basis = range.monthsUsed === 1 ? 'from 1 month' : `from ${range.monthsUsed} months`;
    return `${span}<span class="cell-sub">${basis}</span>`;
  }

  function render() {
    const o = readOptions();
    const plan = L.planBudget(DATA, o);

    $('summary').textContent = plan.summary;
    $('rules').innerHTML = plan.rules.map((r) => `<li>${esc(r.text)}</li>`).join('');

    const share = (cents) => {
      if (o.budgetCents === 0 || cents === 0) return '0%';
      const pct = L.floorDiv(cents * 100, o.budgetCents);
      return pct === 0 ? 'under 1%' : `${pct}%`;
    };
    let body = '';
    for (const ch of plan.channels) {
      body += `<tr class="group-row">
        <th scope="rowgroup">${esc(ch.name)}</th><td></td>
        <td>${esc(L.formatDollars(ch.allocationCents))}</td><td>${share(ch.allocationCents)}</td>
        <td>${ch.low === ch.high ? ch.low : `${ch.low} to ${ch.high}`}</td><td class="wrap-cell"></td>
      </tr>`;
      for (const line of ch.lines) {
        const label = line.kind === 'test' ? `${line.id} ${line.name}` : line.name;
        body += `<tr>
          <td class="indent">${esc(label)}</td>
          <td><span class="badge ${BADGE_CLASS[line.decision] || 'few'}">${esc(line.decision)}</span></td>
          <td>${esc(L.formatDollars(line.allocationCents))}</td>
          <td>${share(line.allocationCents)}</td>
          <td>${rangeText(line)}</td>
          <td class="wrap-cell">${esc(line.reason)}</td>
        </tr>`;
      }
    }
    const held = plan.lines.find((l) => l.tier === 'held');
    if (held) {
      body += `<tr class="unknown"><th scope="row">Held back</th><td></td>
        <td>${esc(L.formatDollars(held.allocationCents))}</td><td>${share(held.allocationCents)}</td><td>0</td>
        <td class="wrap-cell">${esc(held.reason)}</td></tr>`;
    }
    body += `<tr class="total"><th scope="row">Total</th><td></td>
      <td>${esc(L.formatDollars(plan.allocatedCents))}</td><td>${share(plan.allocatedCents)}</td>
      <td>${plan.goal.low} to ${plan.goal.high}</td><td class="wrap-cell">Paid practices from next month's spend, as a range.</td></tr>`;

    $('alloc-table').innerHTML = `<thead><tr>
        <th scope="col">Channel and line</th><th scope="col">Decision</th><th scope="col">Budget</th>
        <th scope="col">Share</th><th scope="col">Paid practices</th><th scope="col" class="left">Why</th>
      </tr></thead><tbody>${body}</tbody>`;

    const check = $('sum-check');
    if (plan.allocatedCents === o.budgetCents) {
      check.className = 'check ok';
      check.textContent = `the lines add up to ${L.formatDollars(plan.allocatedCents)}, exactly the budget.`;
    } else {
      check.className = 'check bad';
      check.textContent = `The lines add up to ${L.formatDollars(plan.allocatedCents)}, not ${L.formatDollars(o.budgetCents)}.`;
    }
    $('notes').innerHTML = plan.notes.map((n) => `<li>${esc(n)}</li>`).join('');

    const g = plan.goal;
    const stat = (label, value, detail) => `<div class="stat"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div><div class="detail">${esc(detail)}</div></div>`;
    if (g.pace === 0) {
      $('goal-stats').innerHTML = stat('Goal', L.withCommas(g.goal), `${L.withCommas(g.current)} paid today`) +
        stat('This plan', `${g.low} to ${g.high}`, 'paid practices from next month\'s spend');
      $('goal-text').textContent = 'The goal is already met at today\'s count, so there is no monthly pace to hit.';
      return;
    }
    const gap = g.gapLow === g.gapHigh ? L.withCommas(g.gapLow) : `${L.withCommas(g.gapLow)} to ${L.withCommas(g.gapHigh)}`;
    $('goal-stats').innerHTML =
      stat('Pace the goal needs', `${L.withCommas(g.pace)} a month`, `${L.withCommas(g.goal - g.current)} more practices over ${g.monthsLeft} months`) +
      stat('This plan', `${g.low} to ${g.high}`, 'paid practices from next month\'s spend') +
      stat('Gap', `${gap} a month`, g.gapHigh === 0 ? 'the plan covers the pace' : 'practices short of the pace');
    let text = `Going from ${L.withCommas(g.current)} to ${L.withCommas(g.goal)} paid practices by December 31 takes ${L.withCommas(g.pace)} a month.`;
    if (g.neededLowCents != null && g.neededHighCents != null) {
      text += ` At this plan's own cost per practice, that pace would take about ${L.formatDollars(g.neededLowCents)} to ${L.formatDollars(g.neededHighCents)} a month. That is straight-line arithmetic, and cost per practice usually rises as spend grows.`;
    } else {
      text += ' This plan has no range yet, so the money that pace would take can\'t be worked out.';
    }
    $('goal-text').textContent = text;
  }

  render();
  ['budget', 'goal', 'current', 'founder-rate'].forEach((id) => $(id).addEventListener('input', render));
  $('founder').addEventListener('change', render);
})();
