/* Digerati Experts · preview B3 · "Start from a situation" + "Describe your own" (Smart match)
 *
 * Pluggable matcher. One interface:   matchSituation(text) -> Promise<{ cards, services, summary, urgent, source }>
 *   cards    : up to 3 situation ids from SITUATIONS (the only cards that exist on this page)
 *   services : ids from SERVICES (only items that appear on this page)
 *   summary  : 1-2 plain-English sentences, built from fixed, reviewed phrases (never free text)
 *
 * Adapters
 *   localMatch(text)   ships now. Runs in the browser, offline. Weighted intents + typo-tolerant token match.
 *   deDeskMatch(text)  for the live site only. Reuses DE Desk's existing AI (the msp-advisor behind
 *                      POST /api/public/advisor/chat). It is NOT called on this preview: GitHub Pages is public,
 *                      there is no key here and there must never be one. See the contract at deDeskMatch below.
 * Whatever an adapter returns is passed through sanitize(): unknown ids are dropped, and the summary is only
 * accepted if it passes the claim filter (no prices, guarantees, certifications, client names, "Digerati" alone).
 */
(function () {
  'use strict';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var BOOK = 'https://meet.digerati-experts.com/';

  /* ---------- the on-page catalog: the ONLY things a match may point to ---------- */
  // Services are named exactly as they appear on this page, with where they appear.
  var SERVICES = {
    'service-desk':   { name: 'Service Desk', where: '#support', at: 'Support', line: 'Included support with every ProActive level.' },
    'co-managed':     { name: 'Co-Managed IT', where: '#faq', at: 'Before the call', line: 'Keep your internal IT and add DE for support, security expertise, and monitoring.' },
    'endpoints':      { name: 'Endpoints & network', where: '#usual', card: 1, at: 'One team owns it', line: 'Patched and monitored before you notice.' },
    'identity':       { name: 'Identity & access', where: '#usual', card: 1, at: 'One team owns it', line: 'MFA, single sign-on, access by role.' },
    'onboarding':     { name: 'On- and offboarding', where: '#usual', card: 1, at: 'One team owns it', line: 'Ready on day one. Locked out on the last.' },
    'security-levels':{ name: 'Security levels', where: '#usual', card: 1, at: 'One team owns it', line: 'Protection matched to each user\u2019s risk.' },
    'backup':         { name: 'Backup & recovery', where: '#usual', card: 1, at: 'One team owns it', line: 'Restores we test, not hope for.' },
    'vcio':           { name: 'Fractional vCIO', where: '#usual', card: 2, at: 'Someone plans ahead', line: 'One advisor owning your IT roadmap.' },
    'compliance':     { name: 'Regulatory compliance', where: '#usual', card: 2, at: 'Someone plans ahead', line: 'Controls mapped to the rules you answer to.' },
    'budgeting':      { name: 'IT budgeting', where: '#usual', card: 2, at: 'Someone plans ahead', line: 'A real plan. No surprise invoices.' },
    'vendors':        { name: 'Vendor management', where: '#usual', card: 2, at: 'Someone plans ahead', line: 'We call the ISP. You don\u2019t.' },
    'reviews':        { name: 'Quarterly reviews', where: '#usual', card: 2, at: 'Someone plans ahead', line: 'Policies, risks, and progress, in plain English.' },
    'managed-network':{ name: 'Managed network', where: '#levels', level: 1, chip: 'Managed network', at: 'ProActive Office', line: 'Part of ProActive Office.' },
    'anti-phishing':  { name: 'Email anti-phishing', where: '#levels', level: 1, chip: 'Email anti-phishing', at: 'ProActive Office', line: 'Part of ProActive Office.' },
    'threat-detection':{ name: 'Threat detection', where: '#levels', level: 2, chip: 'Threat detection', at: 'ProActive Business', line: 'Part of ProActive Business.' },
    'training':       { name: 'Awareness training', where: '#levels', level: 2, chip: 'Awareness training', at: 'ProActive Business', line: 'Part of ProActive Business.' },
    'baseline':       { name: 'Documented baseline', where: '#levels', level: 0, chip: 'Documented baseline', at: 'ProActive IT', line: 'Part of ProActive IT.' }
  };
  // Situations: the public situation list from digeratiexperts.com (/solutions), same titles and groups.
  var GROUPS = [
    { id: 'all', label: 'All situations' },
    { id: 'now', label: 'Something just happened' },
    { id: 'change', label: 'We\u2019re growing or changing' },
    { id: 'prove', label: 'We have to prove it or keep up' }
  ];
  var SITUATIONS = [
    { id: 'phishing-close-call', group: 'now', title: 'A phishing or spoofed email got through', pressure: 'Someone clicked, or a client got mail pretending to be us.', services: ['training', 'anti-phishing', 'identity'] },
    { id: 'ransomware-recovery', group: 'now', title: 'We don\u2019t know if we\u2019d recover from ransomware', pressure: 'There is a backup somewhere; nobody has restored from it.', services: ['backup', 'threat-detection', 'endpoints'] },
    { id: 'it-person-left', group: 'now', title: 'Our only IT person just left', pressure: 'The passwords, the diagrams and the vendor logins walked out with them.', services: ['service-desk', 'baseline', 'endpoints'] },
    { id: 'second-location', group: 'change', title: 'We\u2019re opening a second office', pressure: 'Day one needs internet, phones and working computers, and nobody has done this before.', services: ['managed-network', 'vendors', 'endpoints'] },
    { id: 'new-hires-fast', group: 'change', title: 'New hires need laptops and accounts fast', pressure: 'People start Monday and the last onboarding took two weeks and three vendors.', services: ['onboarding', 'endpoints', 'identity'] },
    { id: 'hybrid-byod', group: 'change', title: 'Half the team works from home on their own devices', pressure: 'Company data lives on personal laptops and phones nobody manages.', services: ['endpoints', 'identity', 'security-levels'] },
    { id: 'phone-contract-ending', group: 'change', title: 'Our phone system is old and the contract is ending', pressure: 'Numbers have to move without dropping a call, and the network has to carry them.', services: ['vendors', 'managed-network'] },
    { id: 'insurance-questionnaire', group: 'prove', title: 'Cyber-insurance renewal sent a questionnaire we can\u2019t answer', pressure: 'The form asks about MFA, backups and evidence, and the answers have to be true.', services: ['compliance', 'identity', 'backup'] },
    { id: 'auditor-evidence', group: 'prove', title: 'A client or auditor asked for our policies and evidence', pressure: 'A contract or an audit wants documents that do not exist yet.', services: ['compliance', 'baseline', 'vcio'] },
    { id: 'internal-it-stretched', group: 'prove', title: 'Our internal IT team is stretched thin', pressure: 'Tickets pile up, patches slip, and security is whoever has time this week.', services: ['co-managed', 'threat-detection', 'endpoints'] }
  ];
  var SIT = {}; SITUATIONS.forEach(function (s) { SIT[s.id] = s; });

  /* ---------- local matcher: intents with phrases, weights, and the cards/services they point to ---------- */
  // phrases are matched on normalised text; single words are typo-tolerant (edit distance 1 for 5+ letters).
  var INTENTS = [
    { id: 'phish', w: 3, p: ['phish', 'phishing', 'spoof', 'spoofed', 'clicked a link', 'clicked', 'fake email', 'suspicious email', 'scam email', 'gift card', 'pretending to be', 'invoice fraud', 'wire fraud', 'compromised email', 'email hacked'],
      cards: { 'phishing-close-call': 3 }, svc: { training: 2, 'anti-phishing': 2, identity: 1 }, urgent: true,
      read: 'a bad email got through, and the next one needs to be easier to spot and harder to act on' },
    { id: 'incident', w: 3, p: ['ransomware', 'hacked', 'breach', 'breached', 'virus', 'malware', 'encrypted', 'locked out of', 'attack', 'compromised', 'pop up', 'popup', 'ransom'],
      cards: { 'ransomware-recovery': 3, 'phishing-close-call': 1 }, svc: { backup: 2, 'threat-detection': 2, endpoints: 1 }, urgent: true,
      read: 'a security scare, where what matters first is containing it and knowing you can restore' },
    { id: 'backup', w: 2, p: ['backup', 'backups', 'restore', 'recover', 'recovery', 'disaster', 'lost files', 'deleted', 'server died', 'flood', 'fire'],
      cards: { 'ransomware-recovery': 2 }, svc: { backup: 3 },
      read: 'nobody is sure the backups would actually bring you back' },
    { id: 'it-left', w: 3, p: ['it guy', 'it person', 'it left', 'only it', 'our it person', 'tech left', 'admin left', 'nephew', 'no it', 'nobody knows the password', 'no one knows', 'passwords walked', 'retired', 'moved away', 'part time it'],
      cards: { 'it-person-left': 3 }, svc: { 'service-desk': 2, baseline: 2, vendors: 1 },
      read: 'the knowledge of how things are set up lives with one person, or left with them' },
    { id: 'onboard', w: 3, p: ['new hire', 'new hires', 'new employee', 'new staff', 'starts monday', 'starting monday', 'first day', 'day one', 'onboarding', 'onboard', 'hiring', 'hires', 'employees', 'need laptops', 'new laptop', 'new laptops', 'laptops for', 'accounts set up', 'set up accounts', 'new people'],
      cards: { 'new-hires-fast': 3 }, svc: { onboarding: 3, endpoints: 1, identity: 1 },
      read: 'people are starting and need a working laptop and accounts on day one' },
    { id: 'offboard', w: 3, p: ['quit', 'fired', 'let go', 'last day', 'leaving', 'left the company', 'terminated', 'offboarding', 'offboard', 'still has access', 'ex employee', 'former employee', 'resigned'],
      cards: { 'new-hires-fast': 2, 'it-person-left': 1 }, svc: { onboarding: 3, identity: 2 },
      read: 'someone is leaving and their access has to close cleanly on their last day' },
    { id: 'growth', w: 3, p: ['second office', 'new office', 'another office', 'second location', 'new location', 'opening', 'expanding', 'expansion', 'moving', 'move offices', 'relocating', 'new building', 'growing', 'acquired', 'merger'],
      cards: { 'second-location': 3, 'new-hires-fast': 1 }, svc: { 'managed-network': 2, vendors: 2, endpoints: 1 },
      read: 'the business is growing into a new space, and day one there has to just work' },
    { id: 'remote', w: 3, p: ['work from home', 'remote', 'wfh', 'hybrid', 'personal device', 'personal laptop', 'own device', 'own laptop', 'byod', 'home office', 'phones for work', 'their phones'],
      cards: { 'hybrid-byod': 3 }, svc: { endpoints: 2, identity: 2, 'security-levels': 1 },
      read: 'company data now lives on laptops and phones nobody manages' },
    { id: 'phones', w: 3, p: ['phone system', 'phones', 'voip', 'phone contract', 'pbx', 'call', 'calls', 'port numbers', 'phone number', 'landline', 'ringcentral'],
      cards: { 'phone-contract-ending': 3 }, svc: { vendors: 2, 'managed-network': 1 },
      read: 'the phones need to move without anyone missing a call' },
    { id: 'network', w: 2, p: ['wifi', 'wi fi', 'internet', 'slow internet', 'network', 'router', 'firewall', 'keeps dropping', 'outage', 'isp', 'printer', 'printers', 'copier'],
      cards: { 'second-location': 1, 'phone-contract-ending': 1 }, svc: { 'managed-network': 2, vendors: 2, endpoints: 1 },
      read: 'the network keeps letting people down, and nobody owns fixing it' },
    { id: 'insurance', w: 3, p: ['insurance', 'insurer', 'cyber insurance', 'questionnaire', 'renewal form', 'policy renewal', 'underwriter', 'premium'],
      cards: { 'insurance-questionnaire': 3 }, svc: { compliance: 2, identity: 2, backup: 1 },
      read: 'an insurer is asking questions that need true answers, with evidence behind them' },
    { id: 'compliance', w: 3, p: ['hipaa', 'audit', 'auditor', 'compliance', 'compliant', 'pci', 'soc 2', 'soc2', 'ftc safeguards', 'regulation', 'regulator', 'policies', 'evidence', 'security questionnaire', 'vendor questionnaire', 'client asked', 'contract requires', 'cmmc', 'state bar', 'patient data'],
      cards: { 'auditor-evidence': 3, 'insurance-questionnaire': 1 }, svc: { compliance: 3, baseline: 1, reviews: 1 },
      read: 'someone needs proof (policies, controls, evidence) that doesn\u2019t exist on paper yet' },
    { id: 'stretched', w: 3, p: ['stretched', 'overwhelmed', 'swamped', 'our it team', 'internal it', 'in house it', 'it department', 'it manager', 'tickets pile', 'backlog', 'cant keep up', 'need help', 'after hours', 'extra hands', 'co managed'],
      cards: { 'internal-it-stretched': 3 }, svc: { 'co-managed': 3, 'threat-detection': 1, 'service-desk': 1 },
      read: 'you have IT people, and they need backup rather than replacing' },
    { id: 'patching', w: 2, p: ['patch', 'patches', 'updates', 'windows 10', 'old computers', 'slow computers', 'outdated', 'end of life', 'antivirus'],
      cards: { 'internal-it-stretched': 1, 'ransomware-recovery': 1 }, svc: { endpoints: 3 },
      read: 'the computers are behind on updates and nobody is watching them' },
    { id: 'identity', w: 2, p: ['mfa', '2fa', 'two factor', 'password', 'passwords', 'login', 'logins', 'single sign on', 'sso', 'shared password', 'access'],
      cards: { 'insurance-questionnaire': 1, 'it-person-left': 1 }, svc: { identity: 3, 'security-levels': 1 },
      read: 'logins and passwords are doing too much of the security work' },
    { id: 'budget', w: 3, p: ['budget', 'budgeting', 'license renewals', 'software renewals', 'renewals every', 'surprise invoices', 'surprise invoice', 'surprise bill', 'costs', 'spend', 'too expensive', 'subscriptions', 'licenses', 'licences', 'plan for next year'],
      cards: {}, svc: { budgeting: 3, vcio: 2, vendors: 1 },
      read: 'IT spending arrives as surprises instead of a plan' },
    { id: 'strategy', w: 2, p: ['roadmap', 'strategy', 'plan', 'planning', 'advice', 'advisor', 'cio', 'vcio', 'big picture', 'where to start', 'dont know where to start', 'no plan'],
      cards: { 'auditor-evidence': 1 }, svc: { vcio: 3, reviews: 2, budgeting: 1 },
      read: 'you want someone to own the IT plan, not just the next ticket' },
    { id: 'vendors', w: 2, p: ['vendor', 'vendors', 'nobody owns', 'finger pointing', 'pointing fingers', 'too many vendors', 'who to call', 'not our end', 'not on our end'],
      cards: { 'it-person-left': 1, 'phone-contract-ending': 1 }, svc: { vendors: 3, 'service-desk': 1 },
      read: 'every vendor handles a piece, and nobody handles the whole' }
  ];

  var STOP = /^(the|a|an|and|or|to|of|in|on|for|we|our|us|is|are|was|it|its|i|my|me|at|be|with|that|this|have|has|had|just|so|do|dont|but|they|them|their|what|how|all|from|get|got|can|cant|need|not|no|any|some|there|been|will|would|should|could|very|really|about|out|up|new)$/;
  function norm(t) { return (' ' + String(t || '').toLowerCase().replace(/[\u2019']/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim() + ' '); }
  function stem(w) { return w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w; }
  function ed1(a, b) { // true if edit distance <= 1
    if (a === b) return true; var la = a.length, lb = b.length; if (Math.abs(la - lb) > 1) return false;
    var i = 0, j = 0, d = 0;
    while (i < la && j < lb) { if (a[i] === b[j]) { i++; j++; continue; } if (++d > 1) return false; if (la > lb) i++; else if (lb > la) j++; else { i++; j++; } }
    return d + (la - i) + (lb - j) <= 1;
  }
  function tokens(n) { return n.trim().split(' ').filter(function (w) { return w && !STOP.test(w); }); }

  function localMatch(text) {
    var n = norm(text), toks = tokens(n), stems = toks.map(stem);
    var hits = [], cardS = {}, svcS = {}, urgent = false;
    INTENTS.forEach(function (it) {
      var best = 0;
      it.p.forEach(function (ph) {
        var pn = norm(ph);
        if (pn.trim().indexOf(' ') > -1) { if (n.indexOf(pn) > -1) best = Math.max(best, 1.25); return; } // phrase: exact, weighs more
        var w = pn.trim(), sw = stem(w);
        if (n.indexOf(' ' + w + ' ') > -1 || stems.indexOf(sw) > -1) { best = Math.max(best, 1); return; }
        if (w.length >= 5 && stems.some(function (t) { return t.length >= 4 && ed1(t, sw); })) best = Math.max(best, .7); // typo-tolerant
      });
      if (best) {
        var s = best * it.w; hits.push({ it: it, s: s }); if (it.urgent) urgent = true;
        for (var c in it.cards) cardS[c] = (cardS[c] || 0) + s * it.cards[c];
        for (var v in it.svc) svcS[v] = (svcS[v] || 0) + s * it.svc[v];
      }
    });
    hits.sort(function (a, b) { return b.s - a.s; });
    var cards = Object.keys(cardS).sort(function (a, b) { return cardS[b] - cardS[a]; });
    var top = cards.length ? cardS[cards[0]] : 0;
    cards = cards.filter(function (c) { return cardS[c] >= top * .34; }).slice(0, 3);
    // services: what the intents asked for, then the top card's own list
    cards.slice(0, 1).forEach(function (c) { SIT[c].services.forEach(function (v, k) { svcS[v] = (svcS[v] || 0) + 1.5 - k * .3; }); });
    var services = Object.keys(svcS).sort(function (a, b) { return svcS[b] - svcS[a]; }).slice(0, 4);
    var reads = hits.slice(0, 2).map(function (h) { return h.it.read; });
    if (reads.length === 2 && hits[1].s < hits[0].s * .5) reads.length = 1;
    return Promise.resolve({ cards: cards, services: services, summary: composeRead(reads), urgent: urgent, source: 'local', confident: hits.length > 0 });
  }

  // reads are reviewed fragments; the page composes them so two never stack as "It sounds like... It sounds like..."
  function composeRead(reads) {
    if (!reads.length) return '';
    var a = 'It sounds like ' + reads[0] + '.';
    return reads[1] ? a + ' Also, ' + reads[1] + '.' : a;
  }

  /* ---------- DE Desk adapter (live site only; not called on this preview) ----------
   * DE Desk already runs the site's AI: POST /api/public/advisor/chat -> handleAdvisorChat() in
   * server/services/msp-advisor (rate limited, prompt-injection check, OpenAI guard, internal-leak check,
   * turns persisted to the Desk session the Intelligence Hub sees). The live version adds ONE structured mode
   * to that same service rather than a second AI:
   *
   *   POST /api/public/advisor/situation-match      (same advisorChatRateLimiter + validateInput)
   *   body  { text: string (<= 1000 chars), sessionId?: string, catalogVersion: CATALOG_VERSION }
   *   server: reuse msp-advisor's guards and model client; system prompt = DE Desk's prompt + the catalog below
   *           (ids + names + lines only); the model must answer JSON { cards: id[], services: id[], summaryIds: intentId[] }.
   *           The server drops any id not in the catalog, and builds the summary from the reviewed INTENT reads
   *           (summaryIds), so the model can never put a price, guarantee, certification or client on the page.
   *           Nothing is stored unless the visitor presses "Keep talking with DE Desk" (then it is a normal Desk turn).
   *   reply { cards, services, summaryIds, urgent, sessionId }
   * On any error or timeout (2.5s) the page falls back to localMatch, so the feature never breaks.
   */
  var CATALOG_VERSION = 'b3-1';
  function deDeskMatch(text) {
    var ep = window.DE_DESK && window.DE_DESK.situationMatchEndpoint;   // set only by the live site
    if (!ep) return Promise.reject(new Error('DE Desk matching runs on digeratiexperts.com only'));
    var ctl = 'AbortController' in window ? new AbortController() : null, to = setTimeout(function () { if (ctl) ctl.abort(); }, 2500);
    return fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', signal: ctl && ctl.signal,
      body: JSON.stringify({ text: String(text).slice(0, 1000), catalogVersion: CATALOG_VERSION }) })
      .then(function (r) { clearTimeout(to); if (!r.ok) throw new Error('DE Desk ' + r.status); return r.json(); })
      .then(function (j) {
        var reads = {}; INTENTS.forEach(function (it) { reads[it.id] = it.read; });
        return { cards: j.cards || [], services: j.services || [], summary: composeRead((j.summaryIds || []).map(function (k) { return reads[k]; }).filter(Boolean).slice(0, 2)),
          urgent: !!j.urgent, source: 'de-desk', confident: (j.cards || []).length > 0 };
      });
  }
  // claim filter + id whitelist, applied to every adapter's output
  var BANNED = /(\$|\bprice[sd]?\b|\bguarantee|\bcertified|\bcertification|\b24\/7\b|\bclients? like\b|\bDigerati\b(?!\s+Experts))/i;
  function sanitize(r) {
    var cards = (r.cards || []).filter(function (c) { return SIT[c]; }).slice(0, 3);
    var services = (r.services || []).filter(function (s) { return SERVICES[s]; }).slice(0, 5);
    var summary = BANNED.test(r.summary || '') ? '' : (r.summary || '');
    return { cards: cards, services: services, summary: summary, urgent: !!r.urgent, source: r.source, confident: !!r.confident && (cards.length > 0 || services.length > 0) };
  }
  function matchSituation(text) {
    var go = (window.DE_DESK && window.DE_DESK.situationMatchEndpoint) ? deDeskMatch(text).catch(function () { return localMatch(text); }) : localMatch(text);
    return go.then(sanitize);
  }
  window.DE_SITUATIONS = { matchSituation: matchSituation, localMatch: localMatch, deDeskMatch: deDeskMatch, catalog: { situations: SITUATIONS, services: SERVICES, version: CATALOG_VERSION } };

  /* ---------- UI ---------- */
  var sec = $('#situations'); if (!sec) return;
  var grid = $('#sitGrid', sec), filters = $('#sitFilters', sec), panel = $('#sitOwn', sec), form = $('#sitForm', sec), ta = $('#sitText', sec), out = $('#sitResult', sec), urgentLine = $('#sitUrgent', sec);
  var filter = 'all';
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function groupLabel(g) { for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i].id === g) return GROUPS[i].label; return ''; }

  GROUPS.forEach(function (g) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'sitf'; b.textContent = g.label; b.dataset.g = g.id;
    b.setAttribute('aria-pressed', String(g.id === 'all'));
    b.addEventListener('click', function () { setFilter(g.id); });
    filters.appendChild(b);
  });
  SITUATIONS.forEach(function (s) {
    var li = document.createElement('li'); li.className = 'sit'; li.id = 'sit-' + s.id; li.dataset.g = s.group;
    li.innerHTML = '<button type="button" class="sit__btn" aria-describedby="sit-' + s.id + '-p">' +
      '<span class="sit__g sit__g--' + s.group + '">' + esc(groupLabel(s.group)) + '</span>' +
      '<b class="sit__t">' + esc(s.title) + '</b>' +
      '<span class="sit__p" id="sit-' + s.id + '-p">' + esc(s.pressure) + '</span>' +
      '<span class="sit__svc"><span class="sr-only">Starts with: </span>' + s.services.map(function (v) { return '<i>' + esc(SERVICES[v].name) + '</i>'; }).join('') + '</span>' +
      '<span class="sit__match" aria-hidden="true">Closest match</span></button>';
    $('button', li).addEventListener('click', function () { pick(s.id); });
    grid.appendChild(li);
  });
  var own = document.createElement('li'); own.className = 'sit sit--own'; own.dataset.g = 'any';
  own.innerHTML = '<button type="button" class="sit__btn" aria-expanded="false" aria-controls="sitOwn">' +
    '<span class="sit__g sit__g--own"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.6 2.6l2.8 2.8-7.7 7.7-3.4.6.6-3.4z"/><path d="M9.2 4l2.8 2.8"/></svg>None of these?</span>' +
    '<b class="sit__t">Describe your own</b><span class="sit__p">Say it in your words. Smart match finds the closest situation and what Digerati&nbsp;Experts would look at.</span>' +
    '<span class="sit__go" aria-hidden="true">Write it down \u2192</span></button>';
  grid.appendChild(own);
  var ownBtn = $('button', own);
  ownBtn.addEventListener('click', function () { openOwn(true); });

  function setFilter(g) {
    filter = g;
    $$('.sitf', filters).forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.g === g)); });
    $$('.sit', grid).forEach(function (li) { li.hidden = !(g === 'all' || li.dataset.g === g || li.dataset.g === 'any'); });
    urgentLine.hidden = g !== 'now';
  }
  function openOwn(focus) {
    panel.hidden = false; ownBtn.setAttribute('aria-expanded', 'true'); own.classList.add('is-open');
    if (focus) { ta.focus({ preventScroll: true }); panel.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' }); }
  }
  $('#sitClose', sec).addEventListener('click', function () { panel.hidden = true; ownBtn.setAttribute('aria-expanded', 'false'); own.classList.remove('is-open'); ownBtn.focus(); });
  $$('.sit__ex', sec).forEach(function (b) { b.addEventListener('click', function () { ta.value = b.textContent.replace(/^\u201c|\u201d$/g, ''); ta.focus(); }); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var t = ta.value.trim();
    if (t.replace(/[^a-z]/gi, '').length < 4) { renderMore(); return; }
    matchSituation(t).then(function (r) { if (!r.confident) renderMore(); else render(r, t, 'typed'); });
  });
  function pick(id) { // choosing a card gives the same read-out, from that card
    var s = SIT[id];
    openOwn(false);
    render({ cards: [id], services: s.services.slice(), summary: '', urgent: s.group === 'now', source: 'card' }, s.title, 'picked');
    panel.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
  }
  function clearMarks() {
    $$('.sit.is-match', grid).forEach(function (li) { li.classList.remove('is-match'); });
    $$('.is-yours').forEach(function (n) { n.classList.remove('is-yours'); });
    document.body.classList.remove('has-match');
  }
  function renderMore() {
    clearMarks(); setFilter('all');
    out.innerHTML = '<div class="res res--more"><p class="res__read"><b>Tell us a bit more.</b> A sentence or two about what\u2019s happening (who it affects, what broke or what\u2019s changing) is plenty. Or pick the closest situation above.</p></div>';
    out.hidden = false;
  }
  function plan(r, text) {
    var lines = ['Our IT situation, in brief', ''];
    lines.push('What\u2019s going on: ' + text);
    if (r.summary) lines.push('Read: ' + r.summary);
    if (r.cards.length) lines.push('Closest situation' + (r.cards.length > 1 ? 's' : '') + ': ' + r.cards.map(function (c) { return SIT[c].title; }).join('; '));
    lines.push('What Digerati Experts would look at: ' + r.services.map(function (v) { return SERVICES[v].name; }).join(', '));
    lines.push('', 'Next step: a 30-minute Fit Call with Digerati Experts, then an assessment of what we run today. Pricing is published per ProActive level and confirmed after the assessment.');
    lines.push('Book: ' + BOOK);
    return lines.join('\n');
  }
  function render(r, text, how) {
    clearMarks();
    // the page below now leans toward this visitor: matching cards, deck rows, and ring chips are marked
    r.cards.forEach(function (c) { var li = $('#sit-' + c); if (li) li.classList.add('is-match'); });
    var names = r.services.map(function (v) { return SERVICES[v].name; });
    $$('.callcard__list .vn b, .chip').forEach(function (n) { if (names.indexOf(n.textContent.trim().replace(/&amp;/g, '&')) > -1) (n.closest('li') || n).classList.add('is-yours'); });
    document.body.classList.add('has-match');
    if (filter !== 'all' && r.cards.some(function (c) { return SIT[c].group !== filter; })) setFilter('all');
    var summary = r.summary || (how === 'picked' ? SIT[r.cards[0]].pressure : '');
    var seed = 'From the homepage: ' + text + (r.cards.length ? ' (closest: ' + SIT[r.cards[0]].title + ')' : '');
    out.innerHTML =
      '<div class="res">' +
      '<p class="res__k">' + (how === 'picked' ? 'You picked' : 'Smart match') + '</p>' +
      (summary ? '<p class="res__read">' + esc(summary) + '</p>' : '') +
      (r.urgent ? '<p class="res__urgent"><b>Happening right now?</b> Don\u2019t wait for a Fit Call. Open DE Desk and say so.</p>' : '') +
      (how === 'typed' && r.cards.length ? '<div class="res__blk"><h4>Closest situation' + (r.cards.length > 1 ? 's' : '') + '</h4><ul class="res__cards">' + r.cards.map(function (c) { return '<li><a href="#sit-' + c + '" data-to="' + c + '">' + esc(SIT[c].title) + '</a></li>'; }).join('') + '</ul></div>' : '') +
      '<div class="res__blk"><h4>What Digerati&nbsp;Experts would look at</h4><ul class="res__svc">' + r.services.map(function (v) { var s = SERVICES[v]; return '<li><a href="' + s.where + '" data-svc="' + v + '"><b>' + esc(s.name) + '</b><small>' + esc(s.line) + ' <em>' + esc(s.at) + '</em></small></a></li>'; }).join('') + '</ul></div>' +
      '<div class="res__blk"><h4>What happens next</h4><ol class="res__next"><li><b>Fit Call.</b> 30 minutes on exactly this, and whether DE is the right fit.</li><li><b>Assessment.</b> What you actually run, measured, not guessed.</li><li><b>Your price, confirmed.</b> From the published floor for your level.</li></ol></div>' +
      '<div class="res__acts">' +
        '<a class="btn" href="' + BOOK + '" target="_blank" rel="noopener">Book a Fit Call <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5"/></svg></a>' +
        '<button type="button" class="btn btn--ghost" data-act="desk">Keep talking with DE Desk</button>' +
        '<button type="button" class="btn btn--ghost" data-act="copy">Copy your IT plan</button>' +
      '</div>' +
      '<p class="res__note" data-note hidden></p>' +
      '<p class="res__src">' + (r.source === 'de-desk' ? 'Matched by DE Desk, using only what\u2019s on this page.' : 'Matched in your browser, using only what\u2019s on this page. Nothing you type is sent anywhere.') + '</p>' +
      '</div>';
    out.hidden = false;
    var note = $('[data-note]', out);
    $$('[data-to]', out).forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); var li = $('#sit-' + a.dataset.to); li.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }); $('button', li).focus({ preventScroll: true }); }); });
    $$('[data-svc]', out).forEach(function (a) { a.addEventListener('click', function () { var s = SERVICES[a.dataset.svc]; if (s.card !== undefined && window.__deckGo) window.__deckGo(s.card); }); });
    $('[data-act=copy]', out).addEventListener('click', function () {
      var txt = plan(r, text);
      var done = function () { note.hidden = false; note.textContent = 'Copied. Paste it into an email to whoever signs off on IT.'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt); done(); }); else { fallbackCopy(txt); done(); }
    });
    $('[data-act=desk]', out).addEventListener('click', function () {
      var detail = { seedMessage: seed, context: 'home', tab: 'chat' };
      // the live site's own contract (client/src/lib/openMspAdvisor.ts): park the request, then fire the event
      window.__deDeskPendingOpen = detail;
      window.dispatchEvent(new CustomEvent('de-open-msp-advisor', { detail: detail }));
      if (!/(^|\.)digeratiexperts\.com$/.test(location.hostname)) {
        note.hidden = false;
        note.innerHTML = '<b>Preview:</b> on digeratiexperts.com this opens DE Desk with your words and this match already in the chat, so you don\u2019t have to repeat yourself. It would send: <q>' + esc(seed) + '</q>';
      }
    });
  }
  function fallbackCopy(t) { var x = document.createElement('textarea'); x.value = t; x.setAttribute('readonly', ''); x.style.position = 'fixed'; x.style.opacity = '0'; document.body.appendChild(x); x.select(); try { document.execCommand('copy'); } catch (e) {} x.remove(); }
  setFilter('all');
})();
