/**
 * ResQ-AI — Emergency Response System
 * ─────────────────────────────────────────────────────────────────────────────
 * Real-time emergency coordination with AI classification and Supabase storage.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

/* ════════════════════════════════════════════════
   UTILITY HELPERS
   ════════════════════════════════════════════════ */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
window.$ = $;
window.$$ = $$;

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function urgencyBadge(u) {
  if (!u) return '<span class="badge badge-noise">Unknown</span>';
  const label = u.charAt(0).toUpperCase() + u.slice(1);
  return `<span class="badge badge-${u}">${label}</span>`;
}

function statusBadge(s) {
  const labels  = { active: 'Active', 'rescue-in-progress': 'Rescue in Progress', resolved: 'Resolved', new: 'New' };
  const classes = { active: 'active', 'rescue-in-progress': 'rescue', resolved: 'resolved', new: 'new' };
  return `<span class="badge badge-${classes[s] || 'active'}">${labels[s] || s}</span>`;
}

function sourceBadge(s) {
  const labels = { whatsapp: '💬 WhatsApp', audio: '📞 Audio', sms: '📱 SMS', social: '🐦 Social' };
  return `<span class="badge badge-${s}">${labels[s] || s}</span>`;
}

function confidenceBar(val) {
  const color = val >= 80 ? '#4ec9b0' : val >= 60 ? '#f5c842' : '#ff8c42';
  return `<div class="confidence-bar">
    <span class="text-muted text-xs">Confidence</span>
    <div class="confidence-track">
      <div class="confidence-fill" style="width:${val}%;background:${color}"></div>
    </div>
    <span style="color:${color};font-size:11px;font-weight:600;">${val}%</span>
  </div>`;
}

function showToast(msg, type = 'info') {
  const icons = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌', new: '🆕', update: '🔄' };
  const container = $('#toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(120%)';
    toast.style.transition = '.3s';
  }, 3500);
  setTimeout(() => toast.remove(), 3900);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function timelineDotColor(type) {
  const map = {
    new: 'var(--status-new)',
    escalation: 'var(--color-critical)',
    update: 'var(--status-active)',
    resource: 'var(--status-rescue)',
    resolved: 'var(--status-resolved)',
  };
  return map[type] || 'var(--text-muted)';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ════════════════════════════════════════════════
   ROUTER
   ════════════════════════════════════════════════ */
const Router = (() => {
  let _current = 'dashboard';
  const _pages = {};

  function register(name, fn) { _pages[name] = fn; }

  function navigate(page, params = {}) {
    _current = page;

    // Nav highlight
    $$('.nav-item').forEach(el =>
      el.classList.toggle('active', el.dataset.page === page));

    // Page title
    const titles = {
      dashboard: '📊 Dashboard', incidents: '🗂 Incidents',
      reports: '📡 Live Reports', processing: '🤖 AI Processing',
      map: '🗺 Incident Map', analytics: '📈 Analytics', settings: '⚙️ Settings',
    };
    const titleEl = $('#page-title');
    if (titleEl) titleEl.textContent = titles[page] || page;

    // Close mobile nav
    closeMobileNav();

    // Render
    const area = $('#page-area');
    if (!area) return;
    area.innerHTML = '';
    if (_pages[page]) _pages[page](area, params);
    else area.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🚧</div><p>Page not found.</p></div>';
  }

  function current() { return _current; }
  return { register, navigate, current };
})();
window.Router = Router;

/* ════════════════════════════════════════════════
   MOBILE NAV
   ════════════════════════════════════════════════ */
function openMobileNav() {
  $('#sidebar').classList.add('mobile-open');
  $('#mobile-nav-overlay').classList.add('visible');
}
function closeMobileNav() {
  const s = $('#sidebar');
  const o = $('#mobile-nav-overlay');
  if (s) s.classList.remove('mobile-open');
  if (o) o.classList.remove('visible');
}

/* ════════════════════════════════════════════════
   STAT CARDS (reusable)
   ════════════════════════════════════════════════ */
function renderStatCards(stats, gridId = 'stat-grid', isLoading = false) {
  const grid = document.getElementById(gridId);
  if (!grid) return;

  if (isLoading) {
    grid.innerHTML = Array(5).fill(0).map(() => `
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(88,166,255,.08);color:var(--text-muted);">⏳</div>
        <div class="stat-value" style="color:var(--text-muted);font-size:18px;">…</div>
        <div class="stat-label">Loading</div>
      </div>`).join('');
    return;
  }

  const v = (n) => (n === null || n === undefined) ? '—' : n;
  const cards = [
    { icon: '📋', label: 'Total Incidents',   value: v(stats.total),   color: '#58a6ff', bg: 'rgba(88,166,255,.12)' },
    { icon: '⚡', label: 'Active',             value: v(stats.active),  color: '#58a6ff', bg: 'rgba(88,166,255,.12)' },
    { icon: '🔴', label: 'High Priority',      value: v(stats.highPri), color: '#ff8c42', bg: 'rgba(255,140,66,.12)' },
    { icon: '🚤', label: 'Rescue in Progress', value: v(stats.rescue),  color: '#ff8c42', bg: 'rgba(255,140,66,.12)' },
    { icon: '✅', label: 'Resolved',           value: v(stats.resolved),color: '#4ec9b0', bg: 'rgba(78,201,176,.12)' },
  ];
  grid.innerHTML = cards.map(c => `
    <div class="stat-card">
      <div class="stat-icon" style="background:${c.bg};color:${c.color};">${c.icon}</div>
      <div class="stat-value" style="color:${c.color};">${c.value}</div>
      <div class="stat-label">${c.label}</div>
    </div>`).join('');
}


/* ════════════════════════════════════════════════
   INCIDENT CARD (priority list)
   ════════════════════════════════════════════════ */
function buildIncidentCard(inc) {
  const div = document.createElement('div');
  div.className = `incident-card urgency-${inc.urgency}`;
  div.innerHTML = `
    <div class="incident-card-top">
      <div>
        <div class="incident-id">${inc.incidentId}</div>
        <div class="incident-type">${escapeHtml(inc.emergencyType)}</div>
        <div class="incident-location">📍 ${escapeHtml(inc.location)}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end;">
        ${urgencyBadge(inc.urgency)}
        ${statusBadge(inc.status)}
      </div>
    </div>
    <div class="incident-meta">
      <div class="incident-meta-item">
        <span class="meta-label">People</span>
        <span class="meta-value">👥 ${inc.peopleAffected ?? '?'}</span>
      </div>
      <div class="incident-meta-item">
        <span class="meta-label">Resource</span>
        <span class="meta-value" style="font-size:12px;">${escapeHtml(inc.resourceNeeded)}</span>
      </div>
      <div class="incident-meta-item">
        <span class="meta-label">Updated</span>
        <span class="meta-value" style="font-size:11px;">${formatTime(inc.lastUpdated)}</span>
      </div>
    </div>`;
  div.addEventListener('click', () => Router.navigate('incidents', { incidentId: inc.incidentId }));
  return div;
}

/* ════════════════════════════════════════════════
   MAP RENDERER (shared — unique IDs per call)
   ════════════════════════════════════════════════ */
function renderMapInContainer(container, height = 420, showFilters = false) {
  const LAT_MIN = 12.88, LAT_MAX = 13.05;
  const LNG_MIN = 80.08, LNG_MAX = 80.28;
  const W = 700;
  const URGENCY_COLORS = { critical: '#ff4757', high: '#ff8c42', medium: '#f5c842', low: '#4ec9b0' };

  // Each invocation gets a unique prefix so IDs never clash
  const uid = 'mp' + Math.random().toString(36).slice(2, 6);
  let filterState = 'all';

  function toXY(lat, lng) {
    return {
      x: ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * (W - 60) + 30,
      y: ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * (height - 60) + 30,
    };
  }

  function getFiltered() {
    const all = DataService.getIncidents();
    if (filterState === 'all') return all;
    if (filterState === 'high') return all.filter(i => i.urgency === 'high' || i.urgency === 'critical');
    return all.filter(i => i.status === filterState);
  }

  function buildSVG(list) {
    const markers = list.map(inc => {
      const p = toXY(inc.coordinates.lat, inc.coordinates.lng);
      const color = URGENCY_COLORS[inc.urgency] || '#58a6ff';
      const pulse = inc.status !== 'resolved' ? `
        <circle cx="${p.x}" cy="${p.y}" r="18" fill="${color}" opacity="0.12">
          <animate attributeName="r" values="14;22;14" dur="2.2s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.12;0.03;0.12" dur="2.2s" repeatCount="indefinite"/>
        </circle>` : '';
      return `
        <g style="cursor:pointer" onclick="window['${uid}_pop']('${inc.incidentId}')">
          ${pulse}
          <circle cx="${p.x}" cy="${p.y}" r="14" fill="${color}" opacity="0.9"
                  stroke="#1e2530" stroke-width="1.5"/>
          <text x="${p.x}" y="${p.y + 5}" text-anchor="middle"
                fill="#fff" font-size="10" font-weight="700" font-family="sans-serif">
            ${inc.incidentId.replace('INC-', '')}
          </text>
          <text x="${p.x}" y="${p.y + 26}" text-anchor="middle"
                fill="${color}" font-size="9" font-weight="600" font-family="sans-serif">
            ${escapeHtml(inc.emergencyType.split(/[+\/]/)[0].trim().substring(0, 11))}
          </text>
        </g>`;
    });

    const a = toXY(13.01, 80.17);
    const b = toXY(12.97, 80.24);
    const c = toXY(12.93, 80.16);

    return `<svg viewBox="0 0 ${W} ${height}" width="100%" height="${height}"
              style="display:block;background:#161b22;border-radius:8px;">
      <rect width="${W}" height="${height}" fill="#161b22" rx="8"/>
      <line x1="30" y1="${height/2}" x2="${W-30}" y2="${height/2}"
            stroke="#252e3d" stroke-width="2"/>
      <line x1="${W/2}" y1="30" x2="${W/2}" y2="${height-30}"
            stroke="#252e3d" stroke-width="2"/>
      <line x1="30" y1="${height*0.32}" x2="${W-30}" y2="${height*0.68}"
            stroke="#252e3d" stroke-width="1" stroke-dasharray="6,4"/>
      <line x1="30" y1="${height*0.68}" x2="${W-30}" y2="${height*0.32}"
            stroke="#252e3d" stroke-width="1" stroke-dasharray="6,4"/>
      <text x="40" y="20" fill="#3a4d5c" font-size="9" font-family="sans-serif">N ↑ Chennai, Tamil Nadu</text>
      <text x="40" y="${height-10}" fill="#2a3a4a" font-size="9" font-family="sans-serif">
        ⚠ Demo Mode — Approximate mock locations only
      </text>
      <text x="${a.x}" y="${a.y}" fill="#2d3f52" font-size="10"
            text-anchor="middle" font-family="sans-serif">Anna Nagar</text>
      <text x="${b.x}" y="${b.y}" fill="#2d3f52" font-size="10"
            text-anchor="middle" font-family="sans-serif">Perungudi</text>
      <text x="${c.x}" y="${c.y}" fill="#2d3f52" font-size="10"
            text-anchor="middle" font-family="sans-serif">Pallikaranai</text>
      ${markers.join('')}
    </svg>`;
  }

  // Build DOM skeleton
  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  wrapper.innerHTML = `
    ${showFilters ? `
    <div class="filter-bar mb-3">
      <button class="filter-chip active" data-mf="all">All</button>
      <button class="filter-chip" data-mf="high">High Priority</button>
      <button class="filter-chip" data-mf="active">Active</button>
      <button class="filter-chip" data-mf="rescue-in-progress">Rescue in Progress</button>
      <button class="filter-chip" data-mf="resolved">Resolved</button>
    </div>` : ''}
    <div class="map-container" style="min-height:${height}px;">
      <div id="${uid}_svg" style="min-height:${height}px;"></div>
      <div class="map-overlay">
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);
                    margin-bottom:6px;letter-spacing:.5px;">LEGEND</div>
        <div class="map-legend-item">
          <div class="map-legend-dot" style="background:#ff4757;"></div> Critical
        </div>
        <div class="map-legend-item">
          <div class="map-legend-dot" style="background:#ff8c42;"></div> High
        </div>
        <div class="map-legend-item">
          <div class="map-legend-dot" style="background:#f5c842;"></div> Medium
        </div>
        <div class="map-legend-item">
          <div class="map-legend-dot" style="background:#4ec9b0;"></div> Resolved
        </div>
      </div>
      <div class="map-popup" id="${uid}_popup">
        <button class="map-popup-close"
          onclick="document.getElementById('${uid}_popup').classList.remove('visible')">✕</button>
        <div id="${uid}_pcont"></div>
      </div>
    </div>`;
  container.appendChild(wrapper);

  // Initial draw
  function redraw() {
    const el = document.getElementById(`${uid}_svg`);
    if (el) el.innerHTML = buildSVG(getFiltered());
  }
  redraw();

  // Filter listeners
  if (showFilters) {
    wrapper.querySelectorAll('[data-mf]').forEach(chip => {
      chip.addEventListener('click', () => {
        wrapper.querySelectorAll('[data-mf]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        filterState = chip.dataset.mf;
        redraw();
      });
    });
  }

  // Popup — registered as a global so SVG onclick strings can reach it
  window[`${uid}_pop`] = function(incidentId) {
    const inc = DataService.getIncidentById(incidentId);
    if (!inc) return;
    const popup = document.getElementById(`${uid}_popup`);
    const pcont = document.getElementById(`${uid}_pcont`);
    if (!popup || !pcont) return;
    pcont.innerHTML = `
      <div class="flex gap-2 items-center mb-2" style="flex-wrap:wrap;">
        <span class="font-mono text-xs text-muted">${inc.incidentId}</span>
        ${urgencyBadge(inc.urgency)}
        ${statusBadge(inc.status)}
      </div>
      <div style="font-size:14px;font-weight:600;margin-bottom:4px;">
        ${escapeHtml(inc.emergencyType)}
      </div>
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">
        📍 ${escapeHtml(inc.location)}
      </div>
      <div class="flex gap-3 mb-3" style="flex-wrap:wrap;">
        <span class="text-xs text-muted">👥 ${inc.peopleAffected ?? '?'} people</span>
        <span class="text-xs text-muted">🕐 ${formatTime(inc.lastUpdated)}</span>
      </div>
      <button class="btn btn-primary btn-sm w-full"
        onclick="Router.navigate('incidents',{incidentId:'${inc.incidentId}'});
                 document.getElementById('${uid}_popup').classList.remove('visible');">
        View Details →
      </button>`;
    popup.style.top = '60px';
    popup.style.left = '20px';
    popup.classList.add('visible');
  };
}

/* ════════════════════════════════════════════════
   INCIDENT DETAIL RENDERER
   ════════════════════════════════════════════════ */
function renderIncidentDetail(container, inc) {
  const reports = DataService.getReportsByIncident(inc.incidentId).filter(r => !r.isNoise);

  container.innerHTML = `
    <div class="card">
      <!-- Header -->
      <div class="detail-header">
        <div>
          <div class="flex gap-3 items-center mb-3">
            <span class="font-mono text-muted" style="font-size:13px;">${inc.incidentId}</span>
            ${urgencyBadge(inc.urgency)}
            ${statusBadge(inc.status)}
          </div>
          <h2 style="font-size:20px;font-weight:700;color:var(--text-primary);">
            ${escapeHtml(inc.emergencyType)}
          </h2>
          <p style="color:var(--text-secondary);font-size:13px;margin-top:4px;">
            📍 ${escapeHtml(inc.location)}
          </p>
          ${inc.locationNote ? `
          <p style="font-size:11px;color:var(--text-muted);margin-top:3px;">
            ℹ️ ${escapeHtml(inc.locationNote)}
          </p>` : ''}
        </div>
        <button class="btn btn-ghost btn-sm"
          onclick="document.getElementById('incident-detail-panel').classList.remove('visible');
                   document.getElementById('incident-detail-panel').innerHTML='';">
          ✕ Close
        </button>
      </div>

      <!-- Info grid -->
      <div class="detail-info-grid">
        <div class="detail-info-item">
          <div class="detail-info-label">People Affected</div>
          <div class="detail-info-value">👥 ${inc.peopleAffected ?? 'Unknown'}</div>
        </div>
        <div class="detail-info-item">
          <div class="detail-info-label">Vulnerable People</div>
          <div class="detail-info-value" style="font-size:13px;">
            ${escapeHtml(inc.vulnerablePeople) || 'None reported'}
          </div>
        </div>
        <div class="detail-info-item">
          <div class="detail-info-label">Primary Resource</div>
          <div class="detail-info-value" style="font-size:13px;">
            ${escapeHtml(inc.resourceNeeded)}
          </div>
        </div>
        <div class="detail-info-item">
          <div class="detail-info-label">Confidence</div>
          <div class="detail-info-value">${inc.confidence}%</div>
        </div>
        <div class="detail-info-item">
          <div class="detail-info-label">Source Reports</div>
          <div class="detail-info-value">${inc.sourceCount}</div>
        </div>
        <div class="detail-info-item">
          <div class="detail-info-label">Created</div>
          <div class="detail-info-value" style="font-size:12px;">${formatTime(inc.createdAt)}</div>
        </div>
        <div class="detail-info-item">
          <div class="detail-info-label">Last Updated</div>
          <div class="detail-info-value" style="font-size:12px;">${formatTime(inc.lastUpdated)}</div>
        </div>
      </div>

      <!-- Human-in-the-loop -->
      <div class="human-loop-banner mb-4">
        🧑‍💻 AI assists responders. Human responders make all final operational decisions.
      </div>

      <!-- Status change actions -->
      <div id="status-actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
        <span class="text-xs text-muted" style="align-self:center;">Change Status:</span>
        <button class="btn btn-sm ${inc.status === 'active' ? 'btn-primary' : 'btn-ghost'}" data-set-status="active"
          ${inc.status === 'active' ? 'disabled' : ''}>⚡ Active</button>
        <button class="btn btn-sm ${inc.status === 'rescue-in-progress' ? 'btn-primary' : 'btn-ghost'}" data-set-status="rescue-in-progress"
          ${inc.status === 'rescue-in-progress' ? 'disabled' : ''}>🚤 Rescue in Progress</button>
        <button class="btn btn-sm ${inc.status === 'resolved' ? 'btn-primary' : 'btn-ghost'}" data-set-status="resolved"
          ${inc.status === 'resolved' ? 'disabled' : ''}>✅ Resolved</button>
      </div>

      <!-- Tabs -->
      <div class="tabs" id="inc-tabs">
        <button class="tab-btn active" data-tab="summary">Summary</button>
        <button class="tab-btn" data-tab="timeline">Timeline (${inc.timeline ? inc.timeline.length : 0})</button>
        <button class="tab-btn" data-tab="evidence">Source Reports (${reports.length})</button>
        ${inc.uncertainty && inc.uncertainty.length
          ? '<button class="tab-btn" data-tab="uncertainty">⚠️ Uncertainty</button>'
          : ''}
      </div>

      <!-- Tab: Summary -->
      <div class="tab-content active" id="dtab-summary">
        <div class="info-box mb-4">
          🤖 <strong>AI-Generated Summary</strong> — Based on ${reports.length} verified source report(s).
        </div>
        <p style="font-size:14px;color:var(--text-secondary);line-height:1.8;">
          ${escapeHtml(inc.summary)}
        </p>
      </div>

      <!-- Tab: Timeline -->
      <div class="tab-content" id="dtab-timeline">
        <div class="timeline" id="dtl-timeline"></div>
      </div>

      <!-- Tab: Evidence -->
      <div class="tab-content" id="dtab-evidence">
        <div id="dtl-evidence" style="display:flex;flex-direction:column;gap:var(--sp-3);"></div>
      </div>

      <!-- Tab: Uncertainty -->
      ${inc.uncertainty && inc.uncertainty.length ? `
      <div class="tab-content" id="dtab-uncertainty">
        <div class="uncertainty-box">
          <strong>⚠️ Uncertain or Unverified Information</strong>
          <ul style="margin-top:8px;padding-left:20px;list-style:disc;">
            ${inc.uncertainty.map(u => `<li style="color:var(--text-secondary);font-size:13px;">${escapeHtml(u)}</li>`).join('')}
          </ul>
        </div>
        <div class="info-box mt-3">
          The system never presents uncertain information as confirmed. Responders should verify before acting on unconfirmed details.
        </div>
      </div>` : ''}
    </div>`;

  // Tab switching
  container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      container.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
      btn.classList.add('active');
      const tc = container.querySelector(`#dtab-${btn.dataset.tab}`);
      if (tc) tc.classList.add('active');
    });
  });

  // Status change buttons
  container.querySelectorAll('[data-set-status]').forEach(btn => {
    btn.addEventListener('click', () => {
      const newStatus = btn.dataset.setStatus;
      const statusLabels = { active: 'Active', 'rescue-in-progress': 'Rescue in Progress', resolved: 'Resolved' };
      const now = new Date().toISOString();
      const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
      const tl = [...(inc.timeline || []), {
        time: now,
        event: `Status manually changed to ${statusLabels[newStatus]}.`,
        detail: `Responder updated incident status from ${statusLabels[inc.status]} to ${statusLabels[newStatus]}.`,
        source: 'SYSTEM',
        type: newStatus === 'resolved' ? 'resolved' : newStatus === 'rescue-in-progress' ? 'resource' : 'update',
      }];
      DataService.updateIncident(inc.incidentId, { status: newStatus, timeline: tl });
      // ── Sync status change to Supabase ──
      SupabaseService.updateIncidentDB(inc.incidentId, {
        status: newStatus,
        last_updated: new Date().toISOString(),
      });
      SupabaseService.addIncidentUpdate({
        incidentId:     inc.incidentId,
        event:          `Status manually changed to ${statusLabels[newStatus]}`,
        detail:         `Responder updated status from ${statusLabels[inc.status]} to ${statusLabels[newStatus]}`,
        sourceReportId: 'SYSTEM',
        type:           newStatus === 'resolved' ? 'resolved' : newStatus === 'rescue-in-progress' ? 'resource' : 'update',
        time:           now,
      });
      pushLiveUpdate({
        time: timeStr,
        event: `${inc.incidentId} status → ${statusLabels[newStatus]}`,
        incidentId: inc.incidentId,
        type: newStatus === 'resolved' ? 'resolved' : 'update',
      });
      showToast(`${inc.incidentId}: Status set to ${statusLabels[newStatus]}`, newStatus === 'resolved' ? 'success' : 'update');
      // Re-render detail panel with fresh data
      const fresh = DataService.getIncidentById(inc.incidentId);
      if (fresh) renderIncidentDetail(container, fresh);
    });
  });

  // Timeline
  const tl = container.querySelector('#dtl-timeline');
  if (tl && inc.timeline && inc.timeline.length) {
    tl.innerHTML = inc.timeline.map(t => `
      <div class="timeline-item">
        <div class="timeline-dot ${t.type}"></div>
        <div class="timeline-body">
          <div class="timeline-time">${formatTime(t.time)}</div>
          <div class="timeline-event">${escapeHtml(t.event)}</div>
          <div class="timeline-detail">"${escapeHtml(t.detail)}"</div>
          ${t.source !== 'SYSTEM'
            ? `<div class="text-xs text-muted mt-2">Source: ${t.source}</div>`
            : ''}
        </div>
      </div>`).join('');
  } else if (tl) {
    tl.innerHTML = '<div class="empty-state" style="padding:20px;"><p>No timeline events yet.</p></div>';
  }

  // Evidence
  const ev = container.querySelector('#dtl-evidence');
  if (ev) {
    if (!reports.length) {
      ev.innerHTML = '<div class="empty-state" style="padding:20px;"><p>No source reports available.</p></div>';
    } else {
      ev.innerHTML = reports.map(r => `
        <div class="report-card">
          <div class="report-card-header">
            ${sourceBadge(r.source)}
            <span class="text-xs text-muted">${formatTime(r.timestamp)}</span>
            <span class="font-mono text-xs text-muted">${r.reportId}</span>
            ${r.status === 'needs-review'
              ? '<span class="badge badge-medium">⚠️ Needs Review</span>'
              : '<span class="badge badge-resolved" style="font-size:10px;">✓ Processed</span>'}
          </div>
          <div class="report-message">"${escapeHtml(r.originalMessage)}"</div>
          <div class="report-ai-label">🤖 AI Interpretation</div>
          <div class="report-ai">${escapeHtml(r.aiInterpretation)}</div>
          <div class="report-meta-row">
            ${confidenceBar(r.confidence)}
            ${r.locationConfidence
              ? `<span class="badge badge-noise">Location: ${r.locationConfidence} confidence</span>`
              : ''}
          </div>
        </div>`).join('');
    }
  }
}

/* ════════════════════════════════════════════════
   PAGE: DASHBOARD
   ════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════
   LIVE RECENT-UPDATES FEED
   (static seed + runtime appends from simulations)
   ════════════════════════════════════════════════ */
if (!window._liveUpdates) {
  // Deep-copy seed so re-navigating doesn't re-seed
  window._liveUpdates = [...window.MockData.RECENT_UPDATES];
}
function pushLiveUpdate(entry) {
  window._liveUpdates.push(entry);
  // If dashboard is currently visible, refresh its updates list
  if (Router.current() === 'dashboard') {
    renderDashboardUpdates();
    renderDashboardPriority();
    renderStatCards(DataService.getIncidentStats());
  }
}
function renderDashboardUpdates() {
  const ru = document.getElementById('recent-updates');
  if (!ru) return;
  const list = window._liveUpdates.slice(-10).reverse();
  ru.innerHTML = list.map(u => `
    <div style="display:flex;gap:12px;align-items:flex-start;padding:7px 0;
                border-bottom:1px solid var(--bg-border);cursor:pointer;"
         onclick="Router.navigate('incidents',{incidentId:'${u.incidentId || ''}'})"
    >
      <span class="font-mono text-xs text-muted" style="width:44px;flex-shrink:0;padding-top:2px;">${u.time}</span>
      <span style="font-size:11px;color:${timelineDotColor(u.type)};padding-top:3px;">●</span>
      <span class="text-sm" style="flex:1;">${escapeHtml(u.event)}</span>
    </div>`).join('');
}
function renderDashboardPriority() {
  const pl = document.getElementById('priority-list');
  if (!pl) return;
  const sorted = DataService.getIncidents()
    .filter(i => i.status !== 'resolved')
    .sort((a, b) => {
      const o = { critical: 0, high: 1, medium: 2, low: 3 };
      return (o[a.urgency] ?? 9) - (o[b.urgency] ?? 9);
    });
  pl.innerHTML = '';
  sorted.slice(0, 4).forEach(i => pl.appendChild(buildIncidentCard(i)));
}

Router.register('dashboard', (area) => {
  area.innerHTML = `
    <div class="stat-grid" id="stat-grid"></div>

    <div class="dashboard-grid">
      <!-- Left -->
      <div style="display:flex;flex-direction:column;gap:var(--sp-5);">
        <div class="card">
          <div class="card-header">
            <span class="card-title">🗺 Incident Map — Chennai</span>
            <button class="btn btn-ghost btn-sm" onclick="Router.navigate('map')">Full Map →</button>
          </div>
          <div id="db-map" style="min-height:280px;"></div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">🚨 Priority Incidents</span>
            <button class="btn btn-ghost btn-sm" onclick="Router.navigate('incidents')">All →</button>
          </div>
          <div id="priority-list" style="display:flex;flex-direction:column;gap:var(--sp-3);"></div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">📦 Category Summary</span>
            <span id="cat-sum-src" class="text-xs text-muted"></span>
          </div>
          <div id="cat-summary-grid" class="cat-summary-grid"></div>
        </div>
      </div>

      <!-- Right -->
      <div style="display:flex;flex-direction:column;gap:var(--sp-5);">
        <div class="card">
          <div class="card-header">
            <span class="card-title">🕐 Recent Updates</span>
          </div>
          <div id="recent-updates"></div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">🖥 System Status</span>
          </div>
          <div class="status-grid" id="db-system-status">
            <div class="stat-loading"><div class="spinner"></div>Checking…</div>
          </div>
          <div class="human-loop-banner mt-4">
            🧑‍💻 ResQ-AI assists responders. Human responders make all final decisions.
          </div>
        </div>
      </div>
    </div>`;

  // Show loading stat cards immediately
  renderStatCards({}, 'stat-grid', true);
  LeafletMap.renderLeafletMap($('#db-map'), 280, false);
  renderDashboardPriority();
  renderDashboardUpdates();
  renderCategorySummary(DataService.getIncidents());

  // Fetch live Supabase stats — always prefer DB counts over local mock
  SupabaseService.getDashboardStats().then(live => {
    if (live && live.fromDB) {
      // DB is live — show real counts
      renderStatCards(live, 'stat-grid', false);
      renderCategorySummaryFromDB(live.byType);
      const el = document.getElementById('cat-sum-src');
      if (el) { el.textContent = '● Live from Supabase'; el.style.color = 'var(--color-low)'; }
    } else {
      // Fallback to local counts with clear label
      const localStats = DataService.getIncidentStats();
      renderStatCards(localStats, 'stat-grid', false);
      const el = document.getElementById('cat-sum-src');
      if (el) { el.textContent = '⚠ Local data — Supabase offline'; el.style.color = 'var(--color-medium)'; }
    }
    // System status
    const sg = document.getElementById('db-system-status');
    if (!sg) return;
    const sbOk = SupabaseClient.isReady() && (live !== null);
    sg.innerHTML = [
      ['AI Pipeline',     'Online'],
      ['Data Ingestion',  'Ready'],
      ['Supabase',        sbOk ? 'Connected' : 'Local Mode'],
      ['Incident Track',  'Online'],
    ].map(([l, v]) => `
      <div class="status-item">
        <div class="status-dot ${v === 'Connected' || v === 'Online' || v === 'Ready' ? 'online' : 'warning'}"></div>
        <div class="status-item-info">
          <div class="status-item-label">${l}</div>
          <div class="status-item-value">${v}</div>
        </div>
      </div>`).join('');
  });
});

function renderCategorySummary(incidents) {
  const CAT_META = [
    { key: 'Fire',              icon: '🔥', label: 'Fire' },
    { key: 'Flood',             icon: '🌊', label: 'Flood' },
    { key: 'Medical Emergency', icon: '🏥', label: 'Medical' },
    { key: 'Rescue Required',   icon: '🚤', label: 'Rescue' },
    { key: 'Electrical Hazard', icon: '⚡', label: 'Electrical' },
    { key: 'Other Emergency',   icon: '📦', label: 'Other' },
  ];
  const counts = {};
  incidents.forEach(i => {
    const t = (i.emergencyType || '');
    const match = CAT_META.find(c => t.toLowerCase().includes(c.key.toLowerCase().split(' ')[0]));
    const key = match ? match.key : 'Other Emergency';
    counts[key] = (counts[key] || 0) + 1;
  });
  const grid = document.getElementById('cat-summary-grid');
  if (!grid) return;
  grid.innerHTML = CAT_META.map(c => `
    <div class="cat-summary-card" onclick="Router.navigate('incidents')" style="cursor:pointer;">
      <div class="cat-summary-icon">${c.icon}</div>
      <div class="cat-summary-count">${counts[c.key] || 0}</div>
      <div class="cat-summary-label">${c.label}</div>
    </div>`).join('');
}


function renderCategorySummaryFromDB(byType) {
  const CAT_META = [
    { key: 'Fire',              icon: '🔥', label: 'Fire' },
    { key: 'Flood',             icon: '🌊', label: 'Flood' },
    { key: 'Medical Emergency', icon: '🏥', label: 'Medical' },
    { key: 'Rescue Required',   icon: '🚤', label: 'Rescue' },
    { key: 'Electrical Hazard', icon: '⚡', label: 'Electrical' },
    { key: 'Other Emergency',   icon: '📦', label: 'Other' },
  ];
  const grid = document.getElementById('cat-summary-grid');
  if (!grid) return;
  grid.innerHTML = CAT_META.map(c => {
    // Match DB emergency_type strings that contain first word of our key
    const firstWord = c.key.split(' ')[0].toLowerCase();
    const count = Object.entries(byType || {}).reduce((s, [k, v]) =>
      k.toLowerCase().includes(firstWord) ? s + v : s, 0);
    return `<div class="cat-summary-card" onclick="Router.navigate('incidents')" style="cursor:pointer;">
      <div class="cat-summary-icon">${c.icon}</div>
      <div class="cat-summary-count">${count}</div>
      <div class="cat-summary-label">${c.label}</div>
    </div>`;
  }).join('');
}


/* ════════════════════════════════════════════════
   PAGE: INCIDENTS
   ════════════════════════════════════════════════ */
Router.register('incidents', (area, params) => {
  const CAT_TABS = [
    { id: 'all',         label: 'All',         icon: '🗂' },
    { id: 'Fire',        label: 'Fire',        icon: '🔥' },
    { id: 'Flood',       label: 'Flood',       icon: '🌊' },
    { id: 'Medical',     label: 'Medical',     icon: '🏥' },
    { id: 'Rescue',      label: 'Rescue',      icon: '🚤' },
    { id: 'Electrical',  label: 'Electrical',  icon: '⚡' },
    { id: 'Other',       label: 'Other',       icon: '📦' },
    { id: 'noise',       label: 'Noise / Rumor', icon: '🚫' },
  ];

  area.innerHTML = `
    <div id="inc-list-panel">
      <!-- Category tabs -->
      <div class="category-tabs" id="cat-tabs-row">
        ${CAT_TABS.map(t => `<button class="cat-tab${t.id==='all'?' active':''}" data-cat="${t.id}">${t.icon} ${t.label}<span class="tab-count" id="tabcount-${t.id}">…</span></button>`).join('')}
      </div>
      <!-- Status/search filter bar -->
      <div class="filter-bar mb-4">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input class="input" id="inc-search" placeholder="Search ID, location, type…" />
        </div>
        <button class="filter-chip active" data-fi="all">All Status</button>
        <button class="filter-chip" data-fi="active">Active</button>
        <button class="filter-chip" data-fi="high">High Priority</button>
        <button class="filter-chip" data-fi="rescue-in-progress">Rescue in Progress</button>
        <button class="filter-chip" data-fi="resolved">Resolved</button>
      </div>

      <div class="data-table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>ID</th><th>Type</th><th>Location</th><th>People</th>
              <th>Vulnerable</th><th>Resource</th><th>Urgency</th>
              <th>Status</th><th>Updated</th>
            </tr>
          </thead>
          <tbody id="inc-tbody"></tbody>
        </table>
      </div>
    </div>
    <div id="incident-detail-panel" class="detail-panel mt-4"></div>`;

  let filt = 'all', catFilt = 'all', search = '';

  // Populate tab counts
  function updateTabCounts() {
    const all = DataService.getIncidents();
    CAT_TABS.forEach(t => {
      const el = document.getElementById(`tabcount-${t.id}`);
      if (!el) return;
      if (t.id === 'all')   { el.textContent = all.length; return; }
      if (t.id === 'noise') { el.textContent = DataService.getReports().filter(r => r.isNoise).length; return; }
      el.textContent = all.filter(i => (i.emergencyType||'').toLowerCase().includes(t.id.toLowerCase())).length;
    });
  }
  updateTabCounts();

  function render() {
    const list = DataService.getIncidents().filter(inc => {
      // Category filter
      const mc = catFilt === 'all' ? true
        : catFilt === 'noise' ? false  // noise shown separately below
        : (inc.emergencyType||'').toLowerCase().includes(catFilt.toLowerCase());
      const mf = filt === 'all' ? true
        : filt === 'high' ? (inc.urgency === 'high' || inc.urgency === 'critical')
        : inc.status === filt;
      const q = search.toLowerCase();
      const ms = !q || inc.incidentId.toLowerCase().includes(q)
        || inc.location.toLowerCase().includes(q)
        || inc.emergencyType.toLowerCase().includes(q);
      return mc && mf && ms;
    });

    const tbody = $('#inc-tbody');
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="9">
        <div class="empty-state" style="padding:24px;">
          <div class="empty-state-icon">🔍</div><p>No incidents match.</p>
        </div></td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(inc => `
      <tr data-id="${inc.incidentId}" style="cursor:pointer;">
        <td class="font-mono text-xs">${inc.incidentId}</td>
        <td>${escapeHtml(inc.emergencyType)}</td>
        <td style="max-width:150px;font-size:12px;">${escapeHtml(inc.location)}</td>
        <td>${inc.peopleAffected ?? '<span class="text-muted">?</span>'}</td>
        <td style="max-width:120px;font-size:12px;">
          ${escapeHtml(inc.vulnerablePeople) || '<span class="text-muted">None</span>'}
        </td>
        <td style="max-width:130px;font-size:12px;">${escapeHtml(inc.resourceNeeded)}</td>
        <td>${urgencyBadge(inc.urgency)}</td>
        <td>${statusBadge(inc.status)}</td>
        <td class="text-xs text-muted">${formatTime(inc.lastUpdated)}</td>
      </tr>`).join('');

    tbody.querySelectorAll('tr[data-id]').forEach(row =>
      row.addEventListener('click', () => openDetail(row.dataset.id)));
  }

  // Category tab listeners
  $$('[data-cat]', area).forEach(tab => {
    tab.addEventListener('click', () => {
      $$('[data-cat]', area).forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      catFilt = tab.dataset.cat;
      // Noise tab: show noise reports, not incidents
      if (catFilt === 'noise') {
        const tbody = $('#inc-tbody');
        const noiseRpts = DataService.getReports().filter(r => r.isNoise);
        tbody.innerHTML = noiseRpts.length
          ? noiseRpts.slice(0,50).map(r => `<tr><td class="font-mono text-xs">${r.reportId}</td>
              <td colspan="2"><span class="badge badge-noise">🚫 Noise</span> ${escapeHtml((r.originalMessage||'').substring(0,80))}…</td>
              <td>—</td><td>—</td><td>—</td>
              <td><span class="badge badge-noise">${escapeHtml(r.noiseCategory||'Non-emergency')}</span></td>
              <td>—</td><td class="text-xs text-muted">${formatTime(r.timestamp)}</td></tr>`).join('')
          : `<tr><td colspan="9"><div class="empty-state" style="padding:24px;">
              <div class="empty-state-icon">🚫</div><p>No noise/rumor reports found.</p></div></td></tr>`;
        return;
      }
      render();
    });
  });

  $$('[data-fi]', area).forEach(chip => {
    chip.addEventListener('click', () => {
      $$('[data-fi]', area).forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      filt = chip.dataset.fi;
      render();
    });
  });

  $('#inc-search').addEventListener('input', e => { search = e.target.value; render(); });

  function openDetail(id) {
    const inc = DataService.getIncidentById(id);
    if (!inc) return;
    const panel = document.getElementById('incident-detail-panel');
    panel.classList.add('visible');
    renderIncidentDetail(panel, inc);
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  render();
  if (params.incidentId) setTimeout(() => openDetail(params.incidentId), 60);
});

/* ════════════════════════════════════════════════
   PAGE: LIVE REPORTS
   ════════════════════════════════════════════════ */
Router.register('reports', (area) => {
  area.innerHTML = `
    <div class="filter-bar mb-4" style="flex-wrap:wrap;align-items:center;gap:8px;">
      <div class="search-box" style="min-width:200px;">
        <span class="search-icon">🔍</span>
        <input class="input" id="rpt-search" placeholder="Search reports…" />
      </div>
      <button class="filter-chip active" data-rst="all">All</button>
      <button class="filter-chip" data-rst="whatsapp">💬 WhatsApp</button>
      <button class="filter-chip" data-rst="sms">📱 SMS</button>
      <button class="filter-chip" data-rst="social">🐦 Social</button>
      <button class="filter-chip" data-rst="audio">📞 Audio</button>
      <button class="filter-chip" data-rst="user">📝 User</button>
      <button class="filter-chip" data-rst="noise">🚫 Noise</button>
      <button id="rpt-timeline-toggle" class="btn btn-ghost btn-sm" style="margin-left:auto;">⏱ Timeline View</button>
    </div>
    <div class="flex gap-3 mb-4">
      <div class="badge badge-resolved">
        ✓ ${DataService.getReports().filter(r=>!r.isNoise).length} Emergency Reports
      </div>
      <div class="badge badge-noise">
        🚫 ${DataService.getReports().filter(r=>r.isNoise).length} Noise Filtered
      </div>
    </div>
    <div id="rpt-list-container" style="display:flex;flex-direction:column;gap:var(--sp-3);"></div>`;

  let stF = 'all', q = '';

  function render() {
    const container = document.getElementById('rpt-list-container');
    if (!container) return;
    const list = DataService.getReports().filter(r => {
      const ms = stF === 'all' ? true
        : stF === 'noise' ? r.isNoise
        : stF === 'user' ? r.source === 'user'
        : !r.isNoise && r.source === stF;
      const mq = !q || (r.originalMessage||'').toLowerCase().includes(q.toLowerCase())
        || (r.location || '').toLowerCase().includes(q.toLowerCase())
        || r.reportId.toLowerCase().includes(q.toLowerCase());
      return ms && mq;
    });

    if (!list.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><p>No reports match.</p></div>';
      return;
    }

    container.innerHTML = '';
    list.forEach(r => {
      const div = document.createElement('div');
      div.className = `report-card${r.isNoise ? ' is-noise' : ''}`;

      // Audio player block (only for audio source reports)
      const audioBlock = (r.source === 'audio' && r.audioUrl) ? `
        <div style="background:var(--bg-surface2);border-radius:6px;padding:10px 12px;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="font-size:18px;">📞</span>
            <span class="text-xs font-600">Audio Call — Telugu / Telugu-English</span>
            <span class="badge badge-medium" style="font-size:10px;margin-left:auto;">STT Pending</span>
          </div>
          <audio controls style="width:100%;height:32px;border-radius:4px;" preload="none">
            <source src="${escapeHtml(r.audioUrl)}" type="audio/mpeg">
            Your browser does not support audio playback.
          </audio>
          <div class="text-xs text-muted mt-2">
            🔊 Play to listen. Transcription requires Speech-to-Text API (Telugu). Transcript not yet available.
          </div>
        </div>` : '';

      // Confidence + stage badge
      const stageBadge = r.stage ? `<span class="badge badge-noise" style="font-size:10px;">Stage ${r.stage}</span>` : '';
      const matchBadge = r.matchedTerms && r.matchedTerms.length
        ? `<span class="text-xs text-muted" style="font-size:10px;">🔑 ${r.matchedTerms.join(', ')}</span>` : '';

      div.innerHTML = `
        <div class="report-card-header">
          ${sourceBadge(r.source)}
          <span class="text-xs text-muted">${formatTime(r.timestamp)}</span>
          <span class="font-mono text-xs text-muted">${r.reportId}</span>
          ${stageBadge}
          ${r.isNoise
            ? `<span class="badge badge-noise">🚫 Noise — ${escapeHtml(r.noiseCategory || 'Non-emergency')}</span>`
            : r.source === 'audio'
              ? '<span class="badge badge-medium">📞 Audio — Transcription Pending</span>'
              : r.status === 'needs-review'
                ? '<span class="badge badge-medium">⚠️ Needs Review</span>'
                : '<span class="badge badge-resolved">✓ Processed</span>'}
        </div>
        ${audioBlock}
        <div class="report-message">"${escapeHtml(r.originalMessage)}"</div>
        ${r.aiInterpretation ? `
          <div class="report-ai-label">🤖 AI Interpretation</div>
          <div class="report-ai">${escapeHtml(r.aiInterpretation)}</div>` : ''}
        <div class="report-meta-row">
          ${!r.isNoise && r.emergencyType && r.emergencyType !== 'audio'
            ? `<span class="badge badge-active">${escapeHtml(r.emergencyType)}</span>` : ''}
          ${!r.isNoise && r.location
            ? `<span class="text-xs text-muted">📍 ${escapeHtml(r.location)}</span>` : ''}
          ${!r.isNoise && r.incidentId
            ? `<span class="badge badge-rescue" style="cursor:pointer;"
                onclick="Router.navigate('incidents',{incidentId:'${r.incidentId}'})"
               >🔗 ${r.incidentId}</span>` : ''}
          ${matchBadge}
          ${r.confidence > 0 ? confidenceBar(r.confidence) : ''}
        </div>`;
      container.appendChild(div);
    });
  }

  $$('[data-rst]', area).forEach(chip => {
    chip.addEventListener('click', () => {
      $$('[data-rst]', area).forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      stF = chip.dataset.rst;
      render();
    });
  });

  $('#rpt-search').addEventListener('input', e => { q = e.target.value; render(); });

  render();

  // ── Timeline toggle ──
  const timelineBtn = document.getElementById('rpt-timeline-toggle');
  if (timelineBtn) {
    timelineBtn.addEventListener('click', async () => {
      const cont = document.getElementById('rpt-list-container');
      if (!cont) return;
      timelineBtn.disabled = true;
      timelineBtn.textContent = '⏳ Loading…';
      const groups = await SupabaseService.getTimelineGroups();
      const keys = Object.keys(groups).sort();
      if (!keys.length) {
        // Fallback: group local reports by hour
        const localGroups = {};
        DataService.getReports().filter(r => !r.isNoise).forEach(r => {
          if (!r.timestamp) return;
          const d = new Date(r.timestamp);
          const hr = d.getHours().toString().padStart(2,'0') + ':00';
          if (!localGroups[hr]) localGroups[hr] = { label: d.toLocaleString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:true, timeZone:'Asia/Kolkata' }), records: [] };
          localGroups[hr].records.push(r);
        });
        const lkeys = Object.keys(localGroups).sort();
        if (lkeys.length) {
          cont.innerHTML = lkeys.map(k => {
            const g = localGroups[k];
            return `<div class="timeline-group">
              <div class="timeline-group-header" onclick="this.nextElementSibling.classList.toggle('collapsed')">
                <span class="timeline-group-label">⏰ ${g.label}</span>
                <span class="timeline-group-count">${g.records.length} report${g.records.length!==1?'s':''}</span>
                <span style="margin-left:8px;color:var(--text-muted);">▼</span>
              </div>
              <div class="timeline-group-body">
                ${g.records.slice(0,20).map(r => `<div class="report-card${r.isNoise?' is-noise':''}" style="margin:0;">
                  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                    <span class="font-mono text-xs text-muted">${r.reportId}</span>
                    <span class="badge badge-${r.source}">${r.source}</span>
                    ${r.urgency ? `<span class="badge badge-${r.urgency}">${r.urgency}</span>` : ''}
                  </div>
                  <div class="text-sm mt-1">${escapeHtml((r.originalMessage||'').substring(0,140))}</div>
                </div>`).join('')}
              </div>
            </div>`;
          }).join('');
          timelineBtn.textContent = '🗂 Normal View';
          timelineBtn.disabled = false;
          return;
        }
        cont.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏰</div><p>No timeline data. Load a dataset stage first.</p></div>';
        timelineBtn.textContent = '⏱ Timeline View';
        timelineBtn.disabled = false;
        return;
      }
      cont.innerHTML = keys.map(k => {
        const g = groups[k];
        return `<div class="timeline-group">
          <div class="timeline-group-header" onclick="this.nextElementSibling.classList.toggle('collapsed')">
            <span class="timeline-group-label">⏰ ${g.label}</span>
            <span class="timeline-group-count">${g.records.length} report${g.records.length!==1?'s':''}</span>
            <span style="margin-left:8px;color:var(--text-muted);">▼</span>
          </div>
          <div class="timeline-group-body">
            ${g.records.slice(0,25).map(r => `<div class="report-card${r.is_noise?' is-noise':''}" style="margin:0;">
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <span class="font-mono text-xs text-muted">${r.report_id}</span>
                <span class="badge badge-${r.source}">${r.source}</span>
                ${r.urgency ? `<span class="badge badge-${r.urgency}">${r.urgency}</span>` : ''}
              </div>
              <div class="text-sm mt-1">${escapeHtml((r.original_message||'').substring(0,140))}</div>
            </div>`).join('')}
          </div>
        </div>`;
      }).join('');
      timelineBtn.textContent = '🗂 Normal View';
      timelineBtn.disabled = false;
      timelineBtn.onclick = () => { render(); timelineBtn.textContent = '⏱ Timeline View'; timelineBtn.onclick = null; };
    });
  }
});

/* ════════════════════════════════════════════════
   PAGE: AI PROCESSING
   ════════════════════════════════════════════════ */
Router.register('processing', (area) => {
  const scenarios = window.MockData.DEMO_SCENARIOS;

  const STAGES = [
    { name: 'Incoming Report',        icon: '📥', desc: 'Raw message received from any channel (Audio, WhatsApp, SMS, Social Media).' },
    { name: 'Source Identification',  icon: '🔍', desc: 'Identifies the channel and assesses source credibility.' },
    { name: 'Emergency Detection',    icon: '🚨', desc: 'Is this actually an emergency? Filters noise from actionable reports.' },
    { name: 'Information Extraction', icon: '📋', desc: 'Extracts: location, people affected, vulnerability, resources, urgency.' },
    { name: 'Location Understanding', icon: '📍', desc: 'Interprets human descriptions ("near west gate") into map-ready data.' },
    { name: 'Incident Matching',      icon: '🔗', desc: 'Does this match an existing incident? Prevents duplicate creation.' },
    { name: 'Incident Update',        icon: '🔄', desc: 'Updates existing incident OR creates a new one. Timeline appended.' },
    { name: 'Responder Dashboard',    icon: '📊', desc: 'Updated information is immediately visible to all responders.' },
  ];

  area.innerHTML = `

    <!-- ═══ REAL DATASET STAGE LOADER ═══ -->
    <div class="card mb-5" id="stage-loader-card">
      <div class="card-header" style="flex-wrap:wrap;gap:8px;">
        <span class="card-title">📂 Real Dataset — Stage Loader</span>
        <span id="stage-loader-mode-badge" class="badge ${DataService.getDataMode()==='real'?'badge-resolved':'badge-noise'}"
          style="font-size:10px;">${DataService.getDataMode()==='real'?'✓ Real Data Active':'⚠️ Demo Mode'}</span>
      </div>
      <p class="text-sm text-muted mb-3" style="line-height:1.6;">
        Load the real Chennai emergency dataset stage-by-stage through the AI pipeline.
        Each stage processes <strong>WhatsApp + SMS + Twitter messages</strong> (150 per stage)
        and makes audio files available for playback.
        The AI classifies each message, extracts information, and matches it to one of the
        three real incidents — <em>without reading ground_truth.json</em>.
      </p>

      <div style="background:var(--bg-surface2);border-radius:8px;padding:12px 16px;margin-bottom:14px;">
        <div class="text-xs text-muted mb-2" style="font-weight:600;letter-spacing:.04em;">THREE REAL INCIDENTS IN THE DATASET</div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          <div style="display:flex;gap:8px;align-items:center;">
            <span class="badge badge-active">INC-001</span>
            <span class="text-sm">Velachery Flood Medical Emergency — 6 people, insulin required, diabetic patient</span>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <span class="badge badge-critical">INC-002</span>
            <span class="text-sm">Tambaram Transformer Fire — 18 people affected, fire and rescue</span>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <span class="badge badge-rescue">INC-003</span>
            <span class="text-sm">Medavakkam Flood Rescue — 11 people, NDRF boat, stays ACTIVE in Stage 3</span>
          </div>
        </div>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        <button id="load-stage-1" class="btn btn-secondary" style="flex:1;min-width:140px;"
          ${DataLoader.isStageLoaded(1)?'disabled':''}
        >
          ${DataLoader.isStageLoaded(1)?'✓ Stage 1 Loaded':'📥 Load Stage 1'}
          <div style="font-size:10px;opacity:.75;margin-top:2px;">Initial emergency reports</div>
        </button>
        <button id="load-stage-2" class="btn btn-secondary" style="flex:1;min-width:140px;"
          ${DataLoader.isStageLoaded(2)?'disabled':''}
        >
          ${DataLoader.isStageLoaded(2)?'✓ Stage 2 Loaded':'📈 Load Stage 2'}
          <div style="font-size:10px;opacity:.75;margin-top:2px;">Escalations &amp; updates</div>
        </button>
        <button id="load-stage-3" class="btn btn-secondary" style="flex:1;min-width:140px;"
          ${DataLoader.isStageLoaded(3)?'disabled':''}
        >
          ${DataLoader.isStageLoaded(3)?'✓ Stage 3 Loaded':'✅ Load Stage 3'}
          <div style="font-size:10px;opacity:.75;margin-top:2px;">Resolution &amp; final state</div>
        </button>
        <button id="reset-to-demo" class="btn btn-ghost" style="min-width:130px;color:var(--color-medium);">
          ↺ Reset to Demo Data
        </button>
      </div>

      <!-- Progress bar -->
      <div id="stage-progress-wrap" style="display:none;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span class="text-xs font-600" id="stage-progress-label">Processing…</span>
          <span class="text-xs text-muted" id="stage-progress-pct">0%</span>
        </div>
        <div style="height:6px;background:var(--bg-border);border-radius:3px;overflow:hidden;">
          <div id="stage-progress-bar" style="height:100%;width:0%;background:var(--color-active);border-radius:3px;transition:width .2s;"></div>
        </div>
        <div class="text-xs text-muted mt-1" id="stage-progress-detail"></div>
      </div>

      <!-- Results table -->
      <div id="stage-results" style="display:flex;flex-direction:column;gap:6px;"></div>
    </div>
    <!-- ═══ END STAGE LOADER ═══ -->

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-6);">

      <!-- Pipeline diagram -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">🤖 AI Processing Pipeline</span>
        </div>
        <div class="pipeline-container" id="pipeline-vis">
          ${STAGES.map((s, i) => `
            <div class="pipeline-stage">
              <div class="pipeline-box" id="pstage-${i}">
                <div style="font-size:22px;margin-bottom:4px;">${s.icon}</div>
                <div class="pipeline-stage-name">${s.name}</div>
                <div class="pipeline-stage-desc">${s.desc}</div>
                <div class="pipeline-result" id="pres-${i}" style="display:none;"></div>
              </div>
              ${i < STAGES.length - 1 ? '<div class="pipeline-arrow">↓</div>' : ''}
            </div>`).join('')}
        </div>
      </div>

      <!-- Demo simulator -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">⚡ Demo Simulator</span>
          <span class="badge badge-medium">Mock Data Only</span>
        </div>
        <p class="text-sm text-muted mb-4">
          Select a scenario and run the simulation to watch the AI pipeline process a report.
        </p>

        <div id="scenario-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
          ${scenarios.map(s => `
            <button class="demo-scenario-btn" data-scn="${s.id}">
              <div class="scenario-label">${escapeHtml(s.label)}</div>
              <div class="scenario-desc">${escapeHtml(s.description)}</div>
            </button>`).join('')}
        </div>

        <div id="scn-input-box" style="display:none;margin-bottom:12px;">
          <div class="info-box" id="scn-info-text"></div>
        </div>

        <button id="run-sim-btn" class="btn btn-primary w-full mb-4" disabled>
          ▶ Run Simulation
        </button>

        <div class="demo-output" id="demo-output">
          <p class="text-sm text-muted" style="text-align:center;padding:20px;">
            Select a scenario above, then click Run Simulation.
          </p>
        </div>
      </div>
    </div>`;

  let selectedScn = null;
  let running = false;

  function resetPipeline() {
    STAGES.forEach((_, i) => {
      const box = document.getElementById(`pstage-${i}`);
      const res = document.getElementById(`pres-${i}`);
      if (box) box.className = 'pipeline-box';
      if (res) { res.style.display = 'none'; res.textContent = ''; res.style.color = ''; }
    });
  }

  /* ── Stage loader logic ── */
  function updateStageLoaderBtns() {
    [1,2,3].forEach(n => {
      const btn = document.getElementById(`load-stage-${n}`);
      if (!btn) return;
      if (DataLoader.isStageLoaded(n)) {
        btn.disabled = true;
        btn.innerHTML = `✓ Stage ${n} Loaded<div style="font-size:10px;opacity:.75;margin-top:2px;">${n===1?'Initial emergency reports':n===2?'Escalations & updates':'Resolution & final state'}</div>`;
      }
    });
    const badge = document.getElementById('stage-loader-mode-badge');
    const tb    = document.getElementById('topbar-data-badge');
    const sb    = document.getElementById('data-mode-badge');
    if (DataService.getDataMode() === 'real') {
      if (badge) { badge.textContent = '✓ Real Data Active'; badge.className = 'badge badge-resolved'; }
      if (tb)    { tb.textContent = '🟢 Real Dataset'; tb.className = 'badge badge-resolved'; tb.style.fontSize='10px'; }
      if (sb)    { sb.textContent = 'LIVE'; }
    } else {
      if (badge) { badge.textContent = '⚠️ Demo Mode'; badge.className = 'badge badge-noise'; }
      if (tb)    { tb.textContent = '⚠️ Demo Mode'; tb.className = 'badge badge-noise'; tb.style.fontSize='10px'; }
      if (sb)    { sb.textContent = 'DEMO'; }
    }
  }

  async function runStageLoad(stageNum) {
    // On first real-data load: clear mock data
    if (DataService.getDataMode() === 'mock') {
      DataService.clearAll();
    }

    const wrap   = document.getElementById('stage-progress-wrap');
    const bar    = document.getElementById('stage-progress-bar');
    const label  = document.getElementById('stage-progress-label');
    const pct    = document.getElementById('stage-progress-pct');
    const detail = document.getElementById('stage-progress-detail');
    const resDiv = document.getElementById('stage-results');

    if (wrap) wrap.style.display = 'block';
    [1,2,3].forEach(n => { const b = document.getElementById(`load-stage-${n}`); if(b) b.disabled = true; });
    document.getElementById('reset-to-demo').disabled = true;

    const result = await DataLoader.loadStage(stageNum, ({ step, done, total, detail: msg }) => {
      const p = total > 0 ? Math.round((done / total) * 100) : 0;
      if (label)  label.textContent  = `Stage ${stageNum} — ${step}`;
      if (pct)    pct.textContent    = `${p}%`;
      if (bar)    bar.style.width    = `${p}%`;
      if (detail) detail.textContent = msg || '';
    });

    if (wrap) wrap.style.display = 'none';
    document.getElementById('reset-to-demo').disabled = false;
    updateStageLoaderBtns();

    if (result && !result.error && !result.skipped) {
      // Append result row
      const row = document.createElement('div');
      row.className = 'success-box';
      row.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;align-items:center;font-size:12px;';
      row.innerHTML = `
        <strong>Stage ${stageNum} loaded</strong>
        <span>🚨 ${result.emergency} emergency</span>
        <span>🚫 ${result.noise} noise filtered</span>
        <span>📣 ${result.audio} audio (playable)</span>
        <button class="btn btn-sm btn-secondary" onclick="Router.navigate('incidents')">View Incidents →</button>
        <button class="btn btn-sm btn-ghost" onclick="Router.navigate('reports')">Live Reports →</button>
      `;
      if (resDiv) resDiv.appendChild(row);
      showToast(`Stage ${stageNum} loaded: ${result.emergency} emergency, ${result.noise} noise`, 'new');
    } else if (result && result.error) {
      const errRow = document.createElement('div');
      errRow.className = 'uncertainty-box';
      errRow.textContent = '⚠️ ' + result.error;
      if (resDiv) resDiv.appendChild(errRow);
      showToast(result.error, 'update');
      // Re-enable buttons on error
      [1,2,3].forEach(n => { const b = document.getElementById(`load-stage-${n}`); if(b && !DataLoader.isStageLoaded(n)) b.disabled = false; });
    } else if (result && result.skipped) {
      showToast(`Stage ${stageNum} was already loaded.`, 'update');
    }
  }

  /* ── Wire stage buttons ── */
  document.getElementById('load-stage-1')?.addEventListener('click', () => runStageLoad(1));
  document.getElementById('load-stage-2')?.addEventListener('click', () => runStageLoad(2));
  document.getElementById('load-stage-3')?.addEventListener('click', () => runStageLoad(3));
  document.getElementById('reset-to-demo')?.addEventListener('click', () => {
    DataService.resetToMock();
    updateStageLoaderBtns();
    // Rebuild stage-loader UI to show fresh button states
    Router.navigate('processing');
    showToast('Reset to demo data. Mock incidents restored.', 'update');
  });

  updateStageLoaderBtns();

  /* ── Existing simulator setup ── */
  $$('.demo-scenario-btn', area).forEach(btn => {
    btn.addEventListener('click', () => {
      if (running) return;
      $$('.demo-scenario-btn', area).forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedScn = scenarios.find(s => s.id === btn.dataset.scn);
      document.getElementById('scn-input-box').style.display = 'block';
      document.getElementById('scn-info-text').innerHTML =
        `<strong>Input:</strong> "${escapeHtml(selectedScn.report.originalMessage)}"`;
      document.getElementById('run-sim-btn').disabled = false;
      resetPipeline();
      document.getElementById('demo-output').innerHTML =
        '<p class="text-sm text-muted" style="text-align:center;padding:20px;">Click "Run Simulation" to process this report.</p>';

    });
  });

  document.getElementById('run-sim-btn').addEventListener('click', () => {
    if (!selectedScn || running) return;
    runSim(selectedScn);
  });

  async function runSim(scn) {
    running = true;
    const btn = document.getElementById('run-sim-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="processing-dot"></span><span class="processing-dot"></span><span class="processing-dot"></span> Processing…';
    resetPipeline();

    const out = document.getElementById('demo-output');
    out.innerHTML = `
      <div class="text-sm text-muted mb-2">📥 <strong>Input Report</strong></div>
      <div class="report-message">"${escapeHtml(scn.report.originalMessage)}"</div>
      <div class="text-sm text-muted mt-3">🔄 Processing through AI pipeline…</div>`;

    // Stage 0 — Incoming Report (instant)
    const stage0 = document.getElementById('pstage-0');
    const res0   = document.getElementById('pres-0');
    if (stage0) stage0.className = 'pipeline-box active';
    await sleep(300);
    if (res0) { res0.textContent = `Received via ${scn.report.source}`; res0.style.display = 'block'; res0.style.color = 'var(--status-resolved)'; }
    if (stage0) stage0.className = 'pipeline-box complete';

    const results = [];
    // Stages 1-6 from processingSteps (6 steps → stages 1..6)
    for (let i = 0; i < scn.processingSteps.length; i++) {
      const step = scn.processingSteps[i];
      const stageIdx = i + 1;  // map step 0→stage1, step 1→stage2, …
      const box = document.getElementById(`pstage-${stageIdx}`);
      if (box) box.className = 'pipeline-box active';
      await sleep(step.duration);
      const res = document.getElementById(`pres-${stageIdx}`);
      if (res) {
        res.textContent = step.result;
        res.style.display = 'block';
        res.style.color = step.result.includes('⚠️') ? 'var(--color-medium)' : 'var(--status-resolved)';
      }
      if (box) box.className = 'pipeline-box complete';
      results.push(step);
    }

    applyEffect(scn);

    // Stage 7 — Responder Dashboard (final stage)
    const stage7 = document.getElementById('pstage-7');
    const res7   = document.getElementById('pres-7');
    if (stage7) stage7.className = 'pipeline-box active';
    await sleep(350);
    if (res7) { res7.textContent = '✓ Dashboard & counters updated live'; res7.style.display = 'block'; res7.style.color = 'var(--status-resolved)'; }
    if (stage7) stage7.className = 'pipeline-box complete';

    const actionMap = {
      create:  { icon: '🆕', color: 'var(--status-new)',      label: 'New Incident Created' },
      update:  { icon: '🔄', color: 'var(--status-active)',   label: 'Existing Incident Updated' },
      escalate:{ icon: '⬆️', color: 'var(--color-critical)', label: 'Incident Escalated' },
      resolve: { icon: '✅', color: 'var(--status-resolved)', label: 'Incident Resolved' },
    };
    const action = actionMap[scn.report.expectedAction] || actionMap.update;
    const targetId = scn.report.expectedAction === 'create' && scn.newIncident
      ? scn.newIncident.incidentId
      : scn.report.expectedIncidentId;

    out.innerHTML = `
      <div class="text-sm text-muted mb-2">📥 <strong>Input Report</strong></div>
      <div class="report-message">"${escapeHtml(scn.report.originalMessage)}"</div>
      <hr style="border-color:var(--bg-border);margin:12px 0;">
      <div class="text-sm font-600 mb-3" style="color:${action.color};">
        ${action.icon} ${action.label}
      </div>
      ${results.map(r => `
        <div class="flex gap-2 items-center mb-2">
          <span class="badge badge-resolved" style="font-size:10px;">✓</span>
          <span class="text-xs text-secondary">${escapeHtml(r.result)}</span>
        </div>`).join('')}
      <hr style="border-color:var(--bg-border);margin:12px 0;">
      <div class="success-box">✓ Simulation complete. Dashboard updated live.</div>
      <button class="btn btn-secondary btn-sm mt-3"
              onclick="Router.navigate('incidents',{incidentId:'${targetId}'})">
        View ${targetId} →
      </button>`;

    running = false;
    btn.disabled = false;
    btn.innerHTML = '▶ Run Again';
    showToast(`${action.label}: ${targetId}`, 'new');
  }

  function applyEffect(scn) {
    const now = new Date().toISOString();
    const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    const rptId = DataService.nextReportId();

    if (scn.report.expectedAction === 'create' && scn.newIncident) {
      if (!DataService.getIncidentById(scn.newIncident.incidentId)) {
        const inc = {
          ...scn.newIncident,
          createdAt: now,
          lastUpdated: now,
          timeline: [{
            time: now,
            event: `Initial report received via ${scn.report.source}.`,
            detail: scn.report.originalMessage,
            source: rptId,
            type: 'new',
          }],
        };
        DataService.addIncident(inc);
        DataService.addReport({
          reportId: rptId,
          incidentId: scn.newIncident.incidentId,
          source: scn.report.source,
          timestamp: now,
          originalMessage: scn.report.originalMessage,
          aiInterpretation: 'New emergency detected. New incident created.',
          emergencyType: scn.newIncident.emergencyType || 'Flood',
          location: scn.newIncident.location,
          locationConfidence: 'medium',
          urgency: scn.newIncident.urgency || 'high',
          status: 'processed',
          confidence: 75,
          isNoise: false,
        });
        pushLiveUpdate({ time: timeStr, event: `New incident ${scn.newIncident.incidentId} created — ${scn.newIncident.location}`, incidentId: scn.newIncident.incidentId, type: 'new' });
      }

    } else if (scn.report.expectedAction === 'escalate') {
      const targetId = scn.report.expectedIncidentId || 'INC-002';
      const inc = DataService.getIncidentById(targetId);
      if (inc) {
        const tl = [...(inc.timeline || []), {
          time: now, event: 'Fire spreading — escalated to CRITICAL.',
          detail: scn.report.originalMessage, source: rptId, type: 'escalation',
        }];
        DataService.updateIncident(targetId, { urgency: 'critical', timeline: tl, sourceCount: (inc.sourceCount || 1) + 1 });
        DataService.addReport({ reportId: rptId, incidentId: targetId, source: scn.report.source, timestamp: now, originalMessage: scn.report.originalMessage, aiInterpretation: 'Escalation: fire spreading. Urgency raised to critical.', emergencyType: 'Fire', location: inc.location, locationConfidence: 'high', urgency: 'critical', status: 'processed', confidence: 88, isNoise: false });
        pushLiveUpdate({ time: timeStr, event: `${targetId} escalated → CRITICAL (fire spreading)`, incidentId: targetId, type: 'escalation' });
      }

    } else if (scn.report.expectedAction === 'resolve') {
      const targetId = scn.report.expectedIncidentId || 'INC-003';
      const inc = DataService.getIncidentById(targetId);
      if (inc) {
        const tl = [...(inc.timeline || []), {
          time: now, event: 'All people evacuated safely — incident resolved.',
          detail: scn.report.originalMessage, source: rptId, type: 'resolved',
        }];
        DataService.updateIncident(targetId, { status: 'resolved', timeline: tl, sourceCount: (inc.sourceCount || 1) + 1 });
        DataService.addReport({ reportId: rptId, incidentId: targetId, source: scn.report.source, timestamp: now, originalMessage: scn.report.originalMessage, aiInterpretation: 'Resolution confirmed. All people safe. Incident closed.', emergencyType: inc.emergencyType, location: inc.location, locationConfidence: 'high', urgency: 'low', status: 'processed', confidence: 98, isNoise: false });
        pushLiveUpdate({ time: timeStr, event: `${targetId} resolved — all people evacuated safely`, incidentId: targetId, type: 'resolved' });
      }

    } else {
      // update / rescue-in-progress
      const id = scn.report.expectedIncidentId;
      if (id) {
        const inc = DataService.getIncidentById(id);
        if (inc) {
          const isRescue = scn.id === 'scenario-4';
          const tl = [...(inc.timeline || []), {
            time: now,
            event: isRescue ? 'Rescue team on site — evacuation commenced.' : 'Update report processed.',
            detail: scn.report.originalMessage,
            source: rptId,
            type: isRescue ? 'resource' : 'update',
          }];
          const patch = { timeline: tl, sourceCount: (inc.sourceCount || 1) + 1 };
          if (isRescue) patch.status = 'rescue-in-progress';
          DataService.updateIncident(id, patch);
          DataService.addReport({ reportId: rptId, incidentId: id, source: scn.report.source, timestamp: now, originalMessage: scn.report.originalMessage, aiInterpretation: isRescue ? 'Rescue team confirmed on site. Status updated to Rescue in Progress.' : 'Update report matched to existing incident.', emergencyType: inc.emergencyType, location: inc.location, locationConfidence: 'high', urgency: inc.urgency, status: 'processed', confidence: 85, isNoise: false });
          pushLiveUpdate({ time: timeStr, event: isRescue ? `${id} → Rescue in Progress (team on site)` : `${id} updated — new report processed`, incidentId: id, type: isRescue ? 'resource' : 'update' });
        }
      }
    }
  }
});

/* ════════════════════════════════════════════════
   PAGE: MAP
   ════════════════════════════════════════════════ */
Router.register('map', (area) => {
  area.innerHTML = `
    <div class="card" style="padding:0;overflow:visible;">
      <div class="card-header" style="padding:16px 16px 0;">
        <span class="card-title">🗺 Incident Map — Chennai, Tamil Nadu</span>
        <div style="display:flex;gap:8px;align-items:center;">
          <span class="text-xs text-muted">OpenStreetMap · Leaflet</span>
          <button class="btn btn-ghost btn-sm" onclick="Router.navigate('incidents')">View All Incidents</button>
        </div>
      </div>
      <div id="map-pg-wrap" style="margin-top:12px;border-radius:0 0 10px 10px;overflow:hidden;padding:0 16px 16px;"></div>
    </div>
    <div class="card mt-4">
      <div class="card-header">
        <span class="card-title">🗺 Map Legend</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:14px;">
        ${[['🔥','Fire','#ff6b35'],['🌊','Flood','#38b2ff'],['🏥','Medical','#ff4d6d'],['🚤','Rescue','#b76bff'],['⚡','Electrical','#ffe066'],['📦','Other','#a0aec0']].map(([e,l,c])=>
          `<div style="display:flex;align-items:center;gap:6px;font-size:12px;">
            <span style="font-size:18px;">${e}</span>
            <span style="color:${c};font-weight:600;">${l}</span>
          </div>`).join('')}
        <div style="margin-left:auto;display:flex;gap:12px;">
          ${[['Critical','#ff4757'],['High','#ff8c42'],['Medium','#f5c842'],['Low','#4ec9b0']].map(([l,c])=>
            `<div style="display:flex;align-items:center;gap:4px;font-size:11px;">
              <div style="width:10px;height:10px;border-radius:50%;background:${c};"></div>
              <span style="color:${c};">${l}</span>
            </div>`).join('')}
        </div>
      </div>
    </div>`;
  LeafletMap.renderLeafletMap($('#map-pg-wrap'), 520, true);
});

/* ════════════════════════════════════════════════
   PAGE: ANALYTICS
   ════════════════════════════════════════════════ */
Router.register('analytics', (area) => {
  const an = DataService.getAnalytics();
  const incidents = DataService.getIncidents();
  const reports = DataService.getReports();

  area.innerHTML = `
    <div class="stat-grid mb-5">
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(88,166,255,.12);color:#58a6ff;">📋</div>
        <div class="stat-value" style="color:#58a6ff;">${incidents.length}</div>
        <div class="stat-label">Total Incidents</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(78,201,176,.12);color:#4ec9b0;">📡</div>
        <div class="stat-value" style="color:#4ec9b0;">${reports.filter(r=>!r.isNoise).length}</div>
        <div class="stat-label">Emergency Reports</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(90,100,114,.15);color:var(--text-muted);">🚫</div>
        <div class="stat-value" style="color:var(--text-muted);">${reports.filter(r=>r.isNoise).length}</div>
        <div class="stat-label">Noise Filtered</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(78,201,176,.12);color:#4ec9b0;">✅</div>
        <div class="stat-value" style="color:#4ec9b0;">${incidents.filter(i=>i.status==='resolved').length}</div>
        <div class="stat-label">Resolved</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(255,140,66,.12);color:#ff8c42;">👥</div>
        <div class="stat-value" style="color:#ff8c42;">${incidents.reduce((s,i)=>s+(i.peopleAffected||0),0)}</div>
        <div class="stat-label">Total Affected</div>
      </div>
    </div>

    <div class="analytics-grid">
      <div class="card"><div class="card-title mb-4">📂 Incidents by Type</div>
        <div id="an-type"></div></div>
      <div class="card"><div class="card-title mb-4">🔵 Incidents by Status</div>
        <div id="an-status"></div></div>
      <div class="card"><div class="card-title mb-4">🔴 Urgency Distribution</div>
        <div id="an-urgency"></div></div>
      <div class="card"><div class="card-title mb-4">📡 Reports by Source</div>
        <div id="an-source"></div></div>
      <div class="card"><div class="card-title mb-4">👥 People Affected</div>
        <div id="an-people"></div></div>
      <div class="card"><div class="card-title mb-4">🚫 Emergency vs Noise</div>
        <div id="an-noise"></div></div>
    </div>`;

  const COLORS = ['#58a6ff','#ff8c42','#4ec9b0','#f5c842','#bc8cff','#ff4757','#25d366'];

  function barChart(id, data) {
    const max = Math.max(...data.map(d => d.count), 1);
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `<div class="bar-chart">${data.map((d, i) => `
      <div class="bar-row">
        <div class="bar-label">${escapeHtml(d.label)}</div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${(d.count/max)*100}%;background:${COLORS[i%COLORS.length]};">
            <span class="bar-value">${d.count}</span>
          </div>
        </div>
      </div>`).join('')}</div>`;
  }

  function donutChart(id, data) {
    const total = data.reduce((s,d) => s+d.count, 0);
    const el = document.getElementById(id);
    if (!el || !total) return;
    const R = 60, CX = 70, CY = 70, C = 2 * Math.PI * R;
    let off = 0;
    const segs = data.map((d, i) => {
      const pct = d.count / total;
      const sl = pct * C;
      const dashoff = -(off * C);
      off += pct;
      return `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none"
        stroke="${COLORS[i%COLORS.length]}" stroke-width="24"
        stroke-dasharray="${sl} ${C - sl}"
        stroke-dashoffset="${dashoff}"
        transform="rotate(-90 ${CX} ${CY})"/>`;
    });
    el.innerHTML = `<div class="donut-chart-wrapper">
      <svg width="140" height="140" viewBox="0 0 140 140" style="flex-shrink:0;">
        <circle cx="${CX}" cy="${CY}" r="${R}" fill="none"
                stroke="var(--bg-border)" stroke-width="24"/>
        ${segs.join('')}
        <text x="${CX}" y="${CY+5}" text-anchor="middle"
              fill="var(--text-primary)" font-size="16" font-weight="700">${total}</text>
        <text x="${CX}" y="${CY+20}" text-anchor="middle"
              fill="var(--text-muted)" font-size="9">total</text>
      </svg>
      <div class="donut-legend">
        ${data.map((d, i) => `
          <div class="donut-legend-item">
            <div class="donut-legend-dot" style="background:${COLORS[i%COLORS.length]};"></div>
            <span>${escapeHtml(d.label)}: <strong>${d.count}</strong></span>
          </div>`).join('')}
      </div>
    </div>`;
  }

  barChart('an-type',    an.incidentsByType);
  donutChart('an-status',  an.incidentsByStatus);
  barChart('an-urgency', an.urgencyDistribution);
  barChart('an-source',  an.reportsBySource);
  barChart('an-people',  an.peopleAffected);
  donutChart('an-noise', [
    { label: 'Emergency', count: an.noiseVsEmergency.emergency },
    { label: 'Noise',     count: an.noiseVsEmergency.noise },
  ]);
});

/* ════════════════════════════════════════════════
   PAGE: SETTINGS
   ════════════════════════════════════════════════ */
Router.register('settings', (area) => {
  area.innerHTML = `
    <div style="max-width:700px;display:flex;flex-direction:column;gap:var(--sp-5);">

      <div class="card">
        <div class="card-title mb-4">🎭 Demo Mode</div>
        <div class="uncertainty-box mb-4">
          ⚠️ <strong>Demo Mode — Using Mock Data</strong><br>
          All incidents, reports, and locations shown are fictional and for demonstration purposes only.
          No real emergency data is being processed. To connect real data, replace
          <code>js/mockData.js</code> and update <code>js/services.js</code>.
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Demo Mode</div>
            <div class="settings-desc">Enables all mock data and simulation features</div>
          </div>
          <label class="toggle"><input type="checkbox" checked disabled>
            <span class="toggle-slider"></span></label>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Simulate Incoming Reports</div>
            <div class="settings-desc">Allow demo scenario simulation on AI Processing page</div>
          </div>
          <label class="toggle"><input type="checkbox" checked>
            <span class="toggle-slider"></span></label>
        </div>
      </div>

      <div class="card">
        <div class="card-title mb-4">🤖 AI Processing</div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Confidence Threshold</div>
            <div class="settings-desc">Reports below this value are flagged "Needs Review"</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <input type="range" class="range-input" min="40" max="95" value="65" id="conf-slider"/>
            <span id="conf-val" style="font-size:13px;font-weight:600;
                  color:var(--brand-primary);width:35px;">65%</span>
          </div>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Noise Filtering</div>
            <div class="settings-desc">Automatically classify non-emergency messages as noise</div>
          </div>
          <label class="toggle"><input type="checkbox" checked>
            <span class="toggle-slider"></span></label>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Auto Incident Matching</div>
            <div class="settings-desc">Match new reports to existing incidents automatically</div>
          </div>
          <label class="toggle"><input type="checkbox" checked>
            <span class="toggle-slider"></span></label>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Human Review Required</div>
            <div class="settings-desc">Flag low-confidence reports for human review before acting</div>
          </div>
          <label class="toggle"><input type="checkbox" checked>
            <span class="toggle-slider"></span></label>
        </div>
      </div>

      <div class="card">
        <div class="card-title mb-4">🔔 Notifications</div>
        ${[
          ['New Incident Alert', 'Show toast when a new incident is created', true],
          ['Escalation Alert',   'Show alert when urgency increases',          true],
          ['Resolution Notice',  'Show notification when incident is resolved', true],
        ].map(([l, d, v]) => `
          <div class="settings-row">
            <div>
              <div class="settings-label">${l}</div>
              <div class="settings-desc">${d}</div>
            </div>
            <label class="toggle">
              <input type="checkbox" ${v ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>`).join('')}
      </div>

      <div class="card">
        <div class="card-title mb-4">🖥 System Status</div>
        <div class="status-grid">
          <div class="status-item">
            <div class="status-dot online"></div>
            <div class="status-item-info">
              <div class="status-item-label">AI Processing Engine</div>
              <div class="status-item-value">Online — Demo Mode</div>
            </div>
          </div>
          <div class="status-item">
            <div class="status-dot online"></div>
            <div class="status-item-info">
              <div class="status-item-label">Data Ingestion Layer</div>
              <div class="status-item-value">Ready — Mock source</div>
            </div>
          </div>
          <div class="status-item">
            <div class="status-dot online"></div>
            <div class="status-item-info">
              <div class="status-item-label">Incident Tracker</div>
              <div class="status-item-value">Online</div>
            </div>
          </div>
          <div class="status-item">
            <div class="status-dot warning"></div>
            <div class="status-item-info">
              <div class="status-item-label">Real Data Source</div>
              <div class="status-item-value">Not connected</div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title mb-3">🏗 Architecture Layers</div>
        <div class="bar-chart" style="gap:8px;">
          ${[
            ['Data Ingestion',        'js/services.js'],
            ['AI Processing',         'js/app.js'],
            ['Information Extraction','js/app.js'],
            ['Incident Matching',     'js/app.js'],
            ['Incident State',        'js/services.js'],
            ['Dashboard',             'js/app.js'],
          ].map(([l, f], i) => `
            <div class="bar-row">
              <div class="bar-label" style="font-size:11px;">${l}</div>
              <div class="bar-track" style="height:28px;">
                <div class="bar-fill"
                     style="width:100%;background:rgba(26,110,255,${0.28 + i * 0.12});">
                  <span class="bar-value" style="font-size:11px;">${f}</span>
                </div>
              </div>
            </div>`).join('')}
        </div>
        <p class="text-xs text-muted mt-3">
          Replace <code>js/mockData.js</code> and update <code>DataService</code>
          methods to connect a live backend. Zero UI code changes needed.
        </p>
      </div>

      <div class="human-loop-banner">
        🧑‍💻 <strong>Important:</strong> AI assists responders. Human responders make all final
        operational decisions. The system never automatically dispatches resources.
      </div>
    </div>`;

  const slider = document.getElementById('conf-slider');
  const val    = document.getElementById('conf-val');
  if (slider && val) {
    slider.addEventListener('input', () => { val.textContent = slider.value + '%'; });
  }
});

/* ════════════════════════════════════════════════
   BOOTSTRAP
   ════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Init Supabase
  SupabaseClient.init();

  // Supabase connection check + sidebar indicator
  SupabaseService.checkConnection().then(ok => {
    const dot   = document.getElementById('sb-conn-dot');
    const label = document.getElementById('sb-conn-label');
    const badge = document.getElementById('topbar-data-badge');
    if (dot)   { dot.className   = 'status-dot ' + (ok ? 'online' : 'offline'); }
    if (label) { label.textContent = ok ? 'Supabase Connected' : 'Local Mode'; }
    if (badge) {
      badge.textContent = ok ? '✅ Supabase Live' : '⚠️ Local Mode';
      badge.style.background = ok ? 'rgba(78,201,176,.15)' : '';
      badge.style.color      = ok ? 'var(--color-low)' : '';
    }
  });

  // Nav
  $$('.nav-item').forEach(item =>
    item.addEventListener('click', () => Router.navigate(item.dataset.page)));

  // Mobile nav
  const mBtn = document.getElementById('mobile-menu-btn');
  const mOvl = document.getElementById('mobile-nav-overlay');
  if (mBtn) mBtn.addEventListener('click', openMobileNav);
  if (mOvl) mOvl.addEventListener('click', closeMobileNav);

  // Reactive dashboard refresh on any DataService data change
  // IMPORTANT: Only refresh priority list, updates, and category summary.
  // Stat cards are owned by Supabase. Re-fetching from DB on every local
  // change avoids overwriting real counts with stale local mock counts.
  DataService.subscribe(() => {
    if (Router.current() !== 'dashboard') return;
    renderDashboardPriority();
    renderDashboardUpdates();
    renderCategorySummary(DataService.getIncidents());
    // Re-query Supabase for fresh stat counts
    SupabaseService.getDashboardStats().then(live => {
      if (live && live.fromDB) {
        renderStatCards(live, 'stat-grid', false);
      } else {
        renderStatCards(DataService.getIncidentStats(), 'stat-grid', false);
      }
    });
  });


  // Live clock
  function tick() {
    const el = document.getElementById('topbar-clock');
    if (el) {
      el.textContent = new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', hour12: true,
      });
    }
  }
  tick();
  setInterval(tick, 30000);

  // Boot
  Router.navigate('dashboard');
});
