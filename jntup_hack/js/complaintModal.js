/**
 * ResQ-AI — Raise a Complaint Modal
 * ─────────────────────────────────────────────────────────────────────────────
 * Separate from the emergency "Report Emergency" form.
 * For complaints that may not be life-threatening emergencies but still need
 * AI classification, incident matching, and Supabase persistence.
 * ─────────────────────────────────────────────────────────────────────────────
 */
'use strict';

const ComplaintModal = (() => {

  let _counter = 1;
  const TYPES = [
    'Auto-detect (AI)',
    'Fire',
    'Flood',
    'Medical Emergency',
    'Rescue Required',
    'Electrical Hazard',
    'Other Emergency',
    'Non-emergency / General Complaint',
  ];

  /* ── Open / Close ── */
  function open() {
    const modal = document.getElementById('complaint-modal');
    if (!modal) { _inject(); return open(); }
    modal.classList.add('visible');
    document.getElementById('cmp-desc')?.focus();
    _reset();
  }

  function close() {
    const modal = document.getElementById('complaint-modal');
    if (modal) modal.classList.remove('visible');
  }

  function _reset() {
    const f = document.getElementById('complaint-form');
    if (f) f.reset();
    const res = document.getElementById('cmp-result');
    if (res) { res.style.display = 'none'; res.innerHTML = ''; }
    const btn = document.getElementById('cmp-submit-btn');
    if (btn) { btn.disabled = false; btn.textContent = '📋 Submit Complaint'; }
  }

  /* ── Inject modal DOM ── */
  function _inject() {
    if (document.getElementById('complaint-modal')) return;
    const el = document.createElement('div');
    el.id = 'complaint-modal';
    el.className = 'report-modal-overlay';
    el.innerHTML = `
      <div class="report-modal-box" role="dialog" aria-modal="true" aria-labelledby="cmp-modal-title">
        <div class="report-modal-header">
          <h2 id="cmp-modal-title">📋 Raise a Complaint</h2>
          <button class="report-modal-close" onclick="ComplaintModal.close()" aria-label="Close">✕</button>
        </div>

        <div class="info-box" style="margin-bottom:16px;font-size:12px;">
          ℹ️ Use this form for concerns or complaints that may not be an active emergency.
          Your complaint will be processed by AI and assigned a reference ID.
          <strong>For immediate life-threatening emergencies, use 🆘 Report Emergency instead.</strong>
        </div>

        <form id="complaint-form" autocomplete="off">

          <!-- Description -->
          <div class="form-group">
            <label class="form-label" for="cmp-desc">
              Complaint Description <span class="form-required">*</span>
            </label>
            <textarea id="cmp-desc" class="form-textarea" rows="3"
              placeholder="Describe the issue, e.g. 'Exposed electrical wire near Medavakkam School Road. No one injured yet but dangerous.'"
              required></textarea>
          </div>

          <!-- Location / Landmark -->
          <div class="form-group">
            <label class="form-label" for="cmp-location">
              Location / Landmark <span class="form-required">*</span>
            </label>
            <input id="cmp-location" class="input" type="text"
              placeholder="e.g. Medavakkam School Road, near water tank"
              required />
          </div>

          <!-- Type + People row -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group">
              <label class="form-label" for="cmp-type">Category (optional — AI will auto-detect)</label>
              <select id="cmp-type" class="input">
                ${TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="cmp-people">People Affected (optional)</label>
              <input id="cmp-people" class="input" type="number" min="0" placeholder="e.g. 3" />
            </div>
          </div>

          <!-- Contact + Audio/Image row -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group">
              <label class="form-label" for="cmp-contact">Your Contact (optional)</label>
              <input id="cmp-contact" class="input" type="text"
                placeholder="Phone / Name (not shared publicly)" />
            </div>
            <div class="form-group">
              <label class="form-label" for="cmp-file">Image or Audio (optional)</label>
              <input id="cmp-file" class="input" type="file"
                accept="image/*,audio/*" style="padding:6px;" />
            </div>
          </div>

          <!-- Actions -->
          <div style="display:flex;gap:10px;margin-top:18px;">
            <button type="submit" id="cmp-submit-btn" class="btn btn-primary" style="flex:1;background:linear-gradient(135deg,#f5c842,#e5a800);border:none;color:#1a1a1a;">
              📋 Submit Complaint
            </button>
            <button type="button" class="btn btn-ghost" onclick="ComplaintModal.close()">Cancel</button>
          </div>
        </form>

        <!-- Result area -->
        <div id="cmp-result" style="display:none;margin-top:16px;"></div>
      </div>`;

    document.body.appendChild(el);

    /* Close on overlay click */
    el.addEventListener('click', e => { if (e.target === el) close(); });

    /* Form submit */
    document.getElementById('complaint-form').addEventListener('submit', async e => {
      e.preventDefault();
      await _submit();
    });
  }

  /* ── Submit ── */
  async function _submit() {
    const desc     = document.getElementById('cmp-desc')?.value.trim();
    const location = document.getElementById('cmp-location')?.value.trim();
    const typeVal  = document.getElementById('cmp-type')?.value;
    const people   = parseInt(document.getElementById('cmp-people')?.value) || null;
    const contact  = document.getElementById('cmp-contact')?.value.trim() || null;

    if (!desc || !location) {
      if (window.showToast) showToast('Description and Location are required.', 'warning');
      return;
    }

    const btn = document.getElementById('cmp-submit-btn');
    btn.disabled = true;
    btn.textContent = '⏳ Processing…';

    /* Build text for AI */
    const text = [
      desc,
      `Location: ${location}.`,
      people ? `${people} people affected.` : '',
    ].filter(Boolean).join(' ');

    const reportId = `CMP-${Date.now()}-${_counter++}`;
    const now = new Date().toISOString();

    /* Run AI pipeline */
    const processed = AIPipeline.processMessage({
      id: reportId, source: 'user', timestamp: now, text, stageNum: null,
    });

    /* Override type if user explicitly chose one */
    if (typeVal && typeVal !== 'Auto-detect (AI)') {
      processed.emergencyType = typeVal;
    }
    if (people)   processed.peopleAffected = people;
    processed.location = processed.location || location;
    if (contact)  processed.contactInfo = contact;

    /* Mark as user complaint */
    processed.isComplaint = true;

    /* Save to DataService (local state) */
    if (window.DataService) DataService.addReportRaw(processed);

    /* Match and update existing incident if found */
    let linkedIncident = null;
    if (!processed.isNoise && processed.incidentId && window.DataService) {
      const existing = DataService.getIncidentById(processed.incidentId);
      if (existing) {
        linkedIncident = existing;
        const patch = {
          sourceCount: (existing.sourceCount || 0) + 1,
          lastUpdated: now,
        };
        if (people && people > (existing.peopleAffected || 0)) patch.peopleAffected = people;
        DataService.updateIncident(processed.incidentId, patch);

        /* Persist update to Supabase */
        if (window.SupabaseService) {
          SupabaseService.updateIncidentDB(processed.incidentId, {
            ...patch, last_updated: now,
          });
          SupabaseService.addIncidentUpdate({
            incidentId:     processed.incidentId,
            event:          `Complaint submitted: "${desc.substring(0, 80)}"`,
            detail:         processed.aiInterpretation,
            sourceReportId: reportId,
            type:           'update',
            time:           now,
          });
        }
      }
    }

    /* Persist complaint report to Supabase */
    let savedToSupabase = false;
    if (window.SupabaseService) {
      const result = await SupabaseService.saveReport({ ...processed, contact_info: contact });
      savedToSupabase = result !== null;
    }

    /* Show result */
    _showResult(processed, linkedIncident, savedToSupabase);
    btn.disabled = false;
    btn.textContent = '📋 Submit Another';
    if (window.showToast) showToast(`Complaint ${reportId} submitted.`, 'success');
  }

  /* ── Result Card ── */
  function _showResult(report, linked, savedToSupabase) {
    const res = document.getElementById('cmp-result');
    if (!res) return;

    const isNoise   = report.isNoise;
    const conf      = report.confidence || 0;
    const confColor = conf >= 80 ? '#4ec9b0' : conf >= 60 ? '#f5c842' : '#ff8c42';

    const linkedSection = linked
      ? `<div class="success-box" style="margin-top:10px;">
           ✅ Matched to existing incident <strong>${linked.incidentId}</strong> — ${escapeHtml ? escapeHtml(linked.location) : linked.location}.
           <button class="btn btn-sm btn-ghost mt-2"
             onclick="Router.navigate('incidents',{incidentId:'${linked.incidentId}'});ComplaintModal.close();">
             View Incident →
           </button>
         </div>`
      : (!isNoise && report.incidentId)
        ? `<div class="warn-box" style="margin-top:10px;">⚠️ AI suggests ${report.incidentId} but no local record found. Flagged for responder review.</div>`
        : '';

    const noiseSection = isNoise
      ? `<div class="warn-box" style="margin-top:10px;">🚫 Classified as <strong>Non-emergency/Unverified</strong>. Complaint is recorded but will not trigger dispatch.</div>`
      : '';

    const dbSection = savedToSupabase
      ? `<div class="success-box" style="margin-top:8px;font-size:11px;">✅ Saved to Supabase database.</div>`
      : `<div class="warn-box" style="margin-top:8px;font-size:11px;">⚠️ Saved locally — Supabase sync pending.</div>`;

    res.style.display = 'block';
    res.innerHTML = `
      <div style="border:1px solid rgba(245,200,66,.3);border-radius:8px;padding:14px;background:rgba(245,200,66,.05);">
        <div style="font-size:12px;font-weight:700;margin-bottom:6px;color:var(--text-muted);letter-spacing:.05em;">
          REFERENCE ID
        </div>
        <div style="font-size:18px;font-weight:800;color:#f5c842;font-family:var(--font-mono);margin-bottom:12px;">
          ${report.reportId}
        </div>
        <div style="font-size:13px;font-weight:700;margin-bottom:8px;color:var(--text-primary);">
          🤖 AI Classification Result
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
          <span class="badge badge-${isNoise ? 'noise' : 'active'}">${isNoise ? '🚫 Non-emergency' : '🚨 ' + (report.emergencyType || 'Emergency')}</span>
          ${report.urgency ? `<span class="badge badge-${report.urgency}">${report.urgency} urgency</span>` : ''}
          ${report.location ? `<span class="text-xs text-muted">📍 ${report.location}</span>` : ''}
        </div>
        ${report.aiInterpretation
          ? `<div style="font-size:12px;color:var(--text-secondary);background:var(--bg-elevated);padding:8px 10px;border-radius:6px;margin-bottom:8px;">${report.aiInterpretation}</div>`
          : ''}
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span class="text-xs text-muted">Confidence:</span>
          <div style="flex:1;height:4px;background:var(--bg-border);border-radius:3px;overflow:hidden;">
            <div style="height:100%;width:${conf}%;background:${confColor};border-radius:3px;"></div>
          </div>
          <span style="font-size:11px;font-weight:700;color:${confColor};">${conf}%</span>
        </div>
        ${linkedSection}
        ${noiseSection}
        ${dbSection}
      </div>`;
  }

  /* Inject on DOM ready */
  document.addEventListener('DOMContentLoaded', _inject);

  return { open, close };
})();

window.ComplaintModal = ComplaintModal;
