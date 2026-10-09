/**
 * ResQ-AI — Report Emergency Modal
 * User-facing report submission form with AI processing + Supabase save.
 */
'use strict';

const ReportModal = (() => {

  let _counter = 1;
  const TYPES = [
    'Auto-detect (AI)',
    'Fire',
    'Flood',
    'Medical Emergency',
    'Rescue Required',
    'Electrical Hazard',
    'Other Emergency',
  ];


  /* ── Open / Close ── */
  function open() {
    const modal = document.getElementById('report-modal');
    if (!modal) { _inject(); return open(); }
    modal.classList.add('visible');
    document.getElementById('rpt-desc')?.focus();
    _reset();
  }

  function close() {
    const modal = document.getElementById('report-modal');
    if (modal) modal.classList.remove('visible');
  }

  function _reset() {
    const f = document.getElementById('report-form');
    if (f) f.reset();
    const res = document.getElementById('rpt-result');
    if (res) { res.style.display = 'none'; res.innerHTML = ''; }
    const btn = document.getElementById('rpt-submit-btn');
    if (btn) { btn.disabled = false; btn.textContent = '🚀 Submit Report'; }
  }

  /* ── Inject modal DOM if missing ── */
  function _inject() {
    if (document.getElementById('report-modal')) return;
    const el = document.createElement('div');
    el.id = 'report-modal';
    el.className = 'report-modal-overlay';
    el.innerHTML = `
      <div class="report-modal-box" role="dialog" aria-modal="true" aria-labelledby="rpt-modal-title">
        <div class="report-modal-header">
          <h2 id="rpt-modal-title">🆘 Report an Emergency</h2>
          <button class="report-modal-close" onclick="ReportModal.close()" aria-label="Close">✕</button>
        </div>

        <div class="human-loop-banner" style="margin-bottom:16px;">
          🧑‍💻 Reports are reviewed by trained responders. AI assists — humans decide.
        </div>

        <form id="report-form" autocomplete="off">
          <!-- Description -->
          <div class="form-group">
            <label class="form-label" for="rpt-desc">
              Emergency Description <span class="form-required">*</span>
            </label>
            <textarea id="rpt-desc" class="form-textarea" rows="3"
              placeholder="Describe what is happening, e.g. 'Water level rising near Velachery MRTS west gate. 6 people trapped.'"
              required></textarea>
          </div>

          <!-- Location -->
          <div class="form-group">
            <label class="form-label" for="rpt-location">
              Location <span class="form-required">*</span>
            </label>
            <input id="rpt-location" class="input" type="text"
              placeholder="e.g. Velachery MRTS West Gate, Chennai"
              required />
          </div>

          <!-- Two-column row -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group">
              <label class="form-label" for="rpt-type">Emergency Type (optional)</label>
              <select id="rpt-type" class="input">
                ${TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="rpt-people">People Affected (optional)</label>
              <input id="rpt-people" class="input" type="number" min="0" placeholder="e.g. 5" />
            </div>
          </div>

          <!-- Attachment -->
          <div class="form-group">
            <label class="form-label" for="rpt-file">
              Image or Audio Attachment (optional)
            </label>
            <input id="rpt-file" class="input" type="file"
              accept="image/*,audio/*"
              style="padding:6px;" />
            <div class="text-xs text-muted mt-1">Attachment stored securely. AI cannot process attachments at this time.</div>
          </div>

          <!-- Actions -->
          <div style="display:flex;gap:10px;margin-top:18px;">
            <button type="submit" id="rpt-submit-btn" class="btn btn-primary" style="flex:1;">
              🚀 Submit Report
            </button>
            <button type="button" class="btn btn-ghost" onclick="ReportModal.close()">Cancel</button>
          </div>
        </form>

        <!-- Result area -->
        <div id="rpt-result" style="display:none;margin-top:16px;"></div>
      </div>`;

    document.body.appendChild(el);

    /* Close on overlay click */
    el.addEventListener('click', e => { if (e.target === el) close(); });

    /* Form submit */
    document.getElementById('report-form').addEventListener('submit', async e => {
      e.preventDefault();
      await _submit();
    });
  }

  /* ── Submit ── */
  async function _submit() {
    const desc     = document.getElementById('rpt-desc')?.value.trim();
    const location = document.getElementById('rpt-location')?.value.trim();
    const typeVal  = document.getElementById('rpt-type')?.value;
    const people   = parseInt(document.getElementById('rpt-people')?.value) || null;
    const fileEl   = document.getElementById('rpt-file');

    if (!desc || !location) {
      showToast('Description and Location are required.', 'warning');
      return;
    }

    const btn = document.getElementById('rpt-submit-btn');
    btn.disabled = true;
    btn.textContent = '⏳ Processing…';

    /* Build text for AI */
    const text = `${desc} Location: ${location}. ${people ? `${people} people affected.` : ''}`;
    const reportId = `USER-${Date.now()}-${_counter++}`;

    /* Run AI pipeline */
    const processed = AIPipeline.processMessage({
      id:       reportId,
      source:   'user',
      timestamp: new Date().toISOString(),
      text,
      stageNum: null,
    });

    /* Override type if user specified */
    if (typeVal && typeVal !== 'Auto-detect (AI)') {
      processed.emergencyType = typeVal.replace(' Emergency', '').replace(' Required', '');
    }
    if (people) processed.peopleAffected = people;
    processed.location = processed.location || location;

    /* Persist to DataService */
    DataService.addReportRaw(processed);

    /* Match and update or create incident */
    let linkedIncident = null;
    if (!processed.isNoise && processed.incidentId) {
      const existing = DataService.getIncidentById(processed.incidentId);
      if (existing) {
        linkedIncident = existing;
        const patch = {
          sourceCount: (existing.sourceCount || 0) + 1,
          lastUpdated: new Date().toISOString(),
        };
        if (people && people > (existing.peopleAffected || 0)) patch.peopleAffected = people;
        DataService.updateIncident(processed.incidentId, patch);

        /* Save to Supabase */
        SupabaseService.updateIncidentDB(processed.incidentId, patch);
        SupabaseService.addIncidentUpdate({
          incidentId:     processed.incidentId,
          event:          `User report submitted: "${desc.substring(0, 80)}…"`,
          detail:         processed.aiInterpretation,
          sourceReportId: reportId,
          type:           'update',
        });
      }
    }

    /* Save report to Supabase */
    await SupabaseService.saveReport(processed);

    /* Show result */
    _showResult(processed, linkedIncident);
    btn.disabled = false;
    btn.textContent = '🚀 Submit Another';
    showToast('Report submitted and processed by AI.', 'success');
  }

  /* ── Result Card ── */
  function _showResult(report, linked) {
    const res = document.getElementById('rpt-result');
    if (!res) return;

    const isNoise    = report.isNoise;
    const conf       = report.confidence || 0;
    const confColor  = conf >= 80 ? '#4ec9b0' : conf >= 60 ? '#f5c842' : '#ff8c42';

    const statusSection = linked
      ? `<div class="success-box" style="margin-top:10px;">
           ✅ Matched to existing incident <strong>${linked.incidentId}</strong> — ${escapeHtml(linked.location)}.
           <button class="btn btn-sm btn-ghost mt-2" onclick="Router.navigate('incidents',{incidentId:'${linked.incidentId}'});ReportModal.close();">
             View Incident →
           </button>
         </div>`
      : (!isNoise && report.incidentId)
        ? `<div class="info-box" style="margin-top:10px;">⚠️ AI suggests incident ${report.incidentId} but no existing record found. Report flagged for responder review.</div>`
        : '';

    const uncert = isNoise
      ? '<div class="uncertainty-box" style="margin-top:10px;">🚫 Report classified as <strong>noise / non-emergency</strong>. Not dispatched to responders.</div>'
      : conf < 60
        ? '<div class="uncertainty-box" style="margin-top:10px;">⚠️ <strong>Unverified</strong> — insufficient information to confirm. Flagged for human review.</div>'
        : '';

    res.style.display = 'block';
    res.innerHTML = `
      <div style="border:1px solid var(--bg-border);border-radius:8px;padding:14px;background:var(--bg-surface2);">
        <div style="font-size:13px;font-weight:700;margin-bottom:10px;color:var(--text-primary);">
          🤖 AI Processing Result
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
          <span class="badge badge-${isNoise ? 'noise' : 'active'}">${isNoise ? '🚫 Noise / Non-Emergency' : '🚨 ' + escapeHtml(report.emergencyType || 'Emergency')}</span>
          ${report.urgency ? `<span class="badge badge-${report.urgency}">${report.urgency.charAt(0).toUpperCase()+report.urgency.slice(1)} Urgency</span>` : ''}
          ${report.location ? `<span class="text-xs text-muted">📍 ${escapeHtml(report.location)}</span>` : ''}
        </div>
        ${report.aiInterpretation ? `<div class="report-ai" style="margin-bottom:8px;">${escapeHtml(report.aiInterpretation)}</div>` : ''}
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="text-xs text-muted">Confidence:</span>
          <div style="flex:1;height:5px;background:var(--bg-border);border-radius:3px;overflow:hidden;">
            <div style="height:100%;width:${conf}%;background:${confColor};border-radius:3px;"></div>
          </div>
          <span style="font-size:11px;font-weight:700;color:${confColor};">${conf}%</span>
        </div>
        ${uncert}
        ${statusSection}
      </div>`;
  }

  /* Inject on first script load */
  document.addEventListener('DOMContentLoaded', _inject);

  return { open, close };
})();

window.ReportModal = ReportModal;
