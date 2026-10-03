/*
 * Channel CAC Ledger: renders index.html. All numbers come from ledger.mjs;
 * this file only reads the controls and writes HTML.
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

  const BADGE_CLASS = { Scale: 'scale', Stop: 'stop', 'Keep testing': 'keep', 'Too few to call': 'few' };
  const badge = (decision) => `<span class="badge ${BADGE_CLASS[decision] || 'few'}">${esc(decision)}</span>`;

  const MODE_HINT = {
    click: 'Credit goes to the ad or link the booking came from. Mail, events and referrals leave no click, so they get less credit here.',
    self: 'Credit goes to the answer to "How did you hear about us?". Skipped or "Don\'t remember" answers count as Unknown.',
    blend: 'Credit goes to the "How did you hear about us?" answer when it names a channel, otherwise to the click.',
  };
  const COUNT_HINT = {
    practice: 'Each office location that started paying counts once, so a 14-office group counts 14.',
    account: 'Each signed customer counts once, so a 14-office group counts 1.',
  };

  function showError(message) {
    const box = $('error');
    box.textContent = message;
    box.hidden = false;
  }

  if (!L || !DATA) {
    showError('The ledger could not load its data files.');
    return;
  }
  const problems = L.validateData(DATA);
  if (problems.length) showError(`The data file has ${problems.length} problem(s): ${problems.slice(0, 3).join('; ')}.`);

  // ------------------------------------------------------------ settings

  const state = { ...L.DEFAULTS };

  function readSettings() {
    state.mode = document.querySelector('input[name="mode"]:checked').value;
    state.countBy = document.querySelector('input[name="countBy"]:checked').value;
    state.includeFounder = $('founder').checked;
    const rateInput = $('founder-rate');
    rateInput.disabled = !state.includeFounder;
    const dollars = L.parseWhole(rateInput.value, 0, 2000);
    const bad = state.includeFounder && dollars === null;
    rateInput.setAttribute('aria-invalid', bad ? 'true' : 'false');
    $('rate-error').hidden = !bad;
    if (dollars !== null) state.founderRateCents = dollars * 100;
  }

  // ------------------------------------------------------------ channel table

  const ofText = (whole) => `<span class="of">of ${L.withCommas(whole)}</span>`;

  function costCell(row, which) {
    const isFocus = state.countBy === which;
    const cls = isFocus ? ' class="cost-col focus"' : ' class="cost-col"';
    if (row.kind === 'unknown') return `<td${cls}><span class="none-yet">no spend</span></td>`;
    const cents = which === 'account' ? row.costPerAccountCents : row.costPerPracticeCents;
    if (cents == null) return `<td${cls}><span class="none-yet">${esc(L.costPerText(null, which))}</span></td>`;
    const flag = isFocus && row.tooFew ? '<span class="badge few stack">too few to call</span>' : '';
    return `<td${cls}>${esc(L.formatDollars(cents))}${flag}</td>`;
  }

  function paidAccountsCell(r) {
    if (r.paidAccounts === 0) return '<td>0</td>';
    const viaPilot = `${r.paidViaPilot} of ${r.pilots} pilots`;
    const extra = r.offPath ? `, +${r.offPath} no demo` : '';
    return `<td>${r.paidAccounts}<span class="cell-sub">${esc(viaPilot + extra)}</span></td>`;
  }

  function paidPracticesCell(r) {
    const pending = r.expansionPending ? `<span class="cell-sub">${r.pendingLocations} more pending</span>` : '';
    return `<td>${r.paidPractices}${pending}</td>`;
  }

  function spendCell(r) {
    if (!r.cost) return '<td><span class="none-yet">none</span></td>';
    const founder = r.cost.founderCents > 0 ? `<span class="cell-sub">incl. ${esc(L.formatDollars(r.cost.founderCents))} founder time</span>` : '';
    return `<td>${esc(L.formatDollars(r.cost.totalCents))}${founder}</td>`;
  }

  function renderChannels() {
    const t = L.channelTable(DATA, state);
    const unitHead = (which, label) => `<th scope="col"${state.countBy === which ? ' class="focus"' : ''}>${label}</th>`;
    const head = `<thead><tr>
      <th scope="col">Channel</th><th scope="col">Cost</th><th scope="col">Leads</th>
      <th scope="col">Demos booked</th><th scope="col">Demos held</th><th scope="col">Pilots</th>
      <th scope="col">Paid accounts</th><th scope="col">Paid practices</th>
      ${unitHead('account', 'Cost per account')}${unitHead('practice', 'Cost per practice')}
    </tr></thead>`;

    const note = (r) => {
      if (r.kind === 'channel') {
        const ch = DATA.channels.find((c) => c.name === r.name);
        return ch ? `<span class="cell-sub">${esc(ch.note)}</span>` : '';
      }
      if (r.kind === 'unknown') return '<span class="cell-sub">credited to no channel</span>';
      return '<span class="cell-sub">counted straight from every lead</span>';
    };

    const row = (r, cls) => `<tr class="${cls}">
      <th scope="row">${esc(r.name)}${note(r)}</th>
      ${spendCell(r)}
      <td>${r.leads}</td>
      <td>${r.booked}${ofText(r.leads)}</td>
      <td>${r.held}${ofText(r.booked)}</td>
      <td>${r.pilots}${ofText(r.held)}</td>
      ${paidAccountsCell(r)}
      ${paidPracticesCell(r)}
      ${costCell(r, 'account')}
      ${costCell(r, 'practice')}
    </tr>`;

    const body = t.rows.map((r) => row(r, 'channel')).join('') + row(t.unknown, 'unknown') + row(t.total, 'total');
    $('channel-table').innerHTML = `${head}<tbody>${body}</tbody>`;

    const modeLabel = L.MODE_LABEL[state.mode];
    const unitWord = state.countBy === 'account' ? 'signed accounts' : 'paid practices';
    $('channel-lede').textContent = `Credit: ${modeLabel}. Wins counted as ${unitWord}. Each step shows its count against the step before it ("15 of 16" demos held). Under 3 wins gets a "too few to call" badge, and a channel with no wins shows "no paid practices yet" instead of a cost.`;

    const rc = t.reconcile;
    const check = $('reconcile');
    if (rc.ok) {
      check.className = 'check ok';
      check.textContent = `${rc.practices.channels} paid practices across the six channels + ${rc.practices.unknown} Unknown = ${rc.practices.total} in total, and ${rc.accounts.channels} + ${rc.accounts.unknown} = ${rc.accounts.total} signed accounts.`;
    } else {
      check.className = 'check bad';
      check.textContent = `Does not reconcile: channels ${rc.practices.channels} + Unknown ${rc.practices.unknown} is not ${rc.practices.total}.`;
    }
  }

  // ------------------------------------------------------------ experiments

  function monthSpan(months) {
    const [a, b] = months;
    const [ya] = a.split('-');
    const [yb] = b.split('-');
    return ya === yb ? `${L.monthName(a)} to ${L.monthName(b)} ${yb}` : `${L.formatMonth(a)} to ${L.formatMonth(b)}`;
  }

  function renderExperiments() {
    const rows = L.experimentsTable(DATA, state);
    const counts = {};
    for (const r of rows) counts[r.decision.decision] = (counts[r.decision.decision] || 0) + 1;
    $('tally').innerHTML = ['Scale', 'Stop', 'Keep testing', 'Too few to call']
      .filter((d) => counts[d])
      .map((d) => `<span class="badge ${BADGE_CLASS[d]}">${counts[d]} ${esc(d)}</span>`)
      .join('');

    $('exp-grid').innerHTML = rows.map(({ exp, results: r, decision: d, rules }) => {
      const cap = exp.budget_cap_cents;
      const capShare = L.floorDiv(r.cost.cashCents * 100, cap);
      const founder = r.cost.founderCents > 0 ? `<span class="cell-sub">+ ${esc(L.formatDollars(r.cost.founderCents))} founder time (${r.cost.founderHours} h)</span>` : '';
      const unitMany = d.unit === 'account' ? 'accounts' : 'practices';
      const result = d.paid > 0
        ? `${L.plural(d.paid, `paid ${d.unit}`)} at ${L.formatDollars(d.costPerCents)} each`
        : `no paid ${unitMany} yet`;
      const funnel = `${r.held} of ${r.booked} booked demos held, ${L.plural(r.pilots, 'pilot')}, ${L.plural(r.paidAccounts, 'paid account')}`;
      const cls = BADGE_CLASS[d.decision];
      return `<article class="exp">
        <div class="exp-head"><span class="exp-id">${esc(exp.id)}</span><h3>${esc(exp.name)}</h3>${badge(d.decision)}</div>
        <p class="exp-meta">${esc(exp.channel)} &middot; ${esc(monthSpan(exp.months))} &middot; ${exp.window_weeks}-week window &middot; metric: ${esc(exp.metric.toLowerCase())}</p>
        <p class="hyp">${esc(exp.hypothesis)}</p>
        <dl class="facts">
          <div><dt>Budget cap</dt><dd>${esc(L.formatDollars(cap))}</dd></div>
          <div><dt>Spent</dt><dd>${esc(L.formatDollars(r.cost.cashCents))} <span class="of">${capShare}% of cap</span>${founder}</dd></div>
          <div><dt>Result</dt><dd>${esc(result)}</dd></div>
          <div class="wide"><dt>Funnel</dt><dd>${esc(funnel)}</dd></div>
        </dl>
        <ul class="rules" aria-label="Rules set before the test">
          <li>${esc(rules.scale)}</li><li>${esc(rules.stop)}</li><li>${esc(rules.guardrail)}</li>
        </ul>
        <p class="reason ${cls}">${esc(d.reason)}</p>
      </article>`;
    }).join('');
  }

  // ------------------------------------------------------------ what changed

  function renderChange() {
    const c = L.changeDecomposition(DATA, state);
    $('change-sentence').textContent = c.sentence;
    const signed = (n) => (n > 0 ? `+${n}` : String(n));
    const top = c.cells.slice(0, 5);
    const rest = c.cells.slice(5);
    const restFrom = rest.reduce((a, x) => a + x.from, 0);
    const restTo = rest.reduce((a, x) => a + x.to, 0);
    const body = top.map((cell, i) => `<tr class="${i < 2 && c.totalChange !== 0 ? 'top-cell' : ''}">
        <td>${esc(cell.label)}</td><td>${cell.from}</td><td>${cell.to}</td><td>${signed(cell.change)}</td>
      </tr>`).join('') +
      (rest.length ? `<tr class="unknown"><td>${L.plural(rest.length, 'other cell')}</td><td>${restFrom}</td><td>${restTo}</td><td>${signed(restTo - restFrom)}</td></tr>` : '') +
      `<tr class="total"><td>All held demos</td><td>${c.totalFrom}</td><td>${c.totalTo}</td><td>${signed(c.totalChange)}</td></tr>`;
    $('change-table').innerHTML = `<thead><tr><th scope="col">Channel and practice type</th><th scope="col">${esc(L.monthName(c.from))}</th><th scope="col">${esc(L.monthName(c.to))}</th><th scope="col">Change</th></tr></thead><tbody>${body}</tbody>`;
  }

  // ------------------------------------------------------------ exceptions

  function renderExceptions() {
    const list = L.findExceptions(DATA);
    $('exception-list').innerHTML = list.map((e) => `<li>
      <span class="chip">${esc(e.label)}</span><strong>${esc(e.subject)}</strong>
      <p>${esc(e.why)}</p>
    </li>`).join('');
  }

  // ------------------------------------------------------------ wiring

  function renderAll() {
    readSettings();
    $('mode-hint').textContent = MODE_HINT[state.mode];
    $('count-hint').textContent = COUNT_HINT[state.countBy];
    renderChannels();
    renderExperiments();
    renderChange();
  }

  $('result').textContent = L.headline(DATA);
  const unique = L.dedupeLeads(DATA.leads).leads.length;
  const dupes = DATA.leads.length - unique;
  $('n-rows').textContent = `${DATA.leads.length} lead rows (${unique} offices and groups once ${dupes === 1 ? 'one duplicate is' : `${dupes} duplicates are`} merged)`;
  renderExceptions();
  renderAll();

  document.querySelectorAll('input[name="mode"], input[name="countBy"], #founder').forEach((input) => {
    input.addEventListener('change', renderAll);
  });
  $('founder-rate').addEventListener('input', renderAll);
})();
