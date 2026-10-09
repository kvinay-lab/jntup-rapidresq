/**
 * ResQ-AI — Supabase Service Layer
 * All database operations. Falls back silently when Supabase is offline.
 */
'use strict';

const SupabaseService = (() => {

  /* ── helpers ── */
  function db() { return SupabaseClient.get(); }

  function _ok()  { return SupabaseClient.isReady(); }

  async function _safe(fn, fallback = null) {
    if (!_ok()) return fallback;
    try {
      return await fn();
    } catch (e) {
      console.warn('[SupabaseService]', e.message);
      return fallback;
    }
  }

  /* ══════════════════════════════════════════
     REPORTS
     ══════════════════════════════════════════ */

  /**
   * Insert a processed report.
   * Uses ON CONFLICT DO NOTHING to prevent duplicates when re-running stages.
   */
  async function saveReport(report) {
    return _safe(async () => {
      const row = {
        report_id:          report.reportId,
        source:             report.source,
        original_message:   report.originalMessage,
        timestamp:          report.timestamp || new Date().toISOString(),
        stage:              report.stage || null,
        is_user_submitted:  report.source === 'user' || !!report.isComplaint,
        is_noise:           report.isNoise || false,
        noise_category:     report.noiseCategory || null,
        emergency_type:     report.emergencyType || null,
        location:           report.location || null,
        location_confidence: report.locationConfidence || null,
        people_affected:    report.peopleAffected || null,
        vulnerable_people:  report.vulnerablePeople || null,
        resource_needed:    report.resourceNeeded || null,
        urgency:            report.urgency || null,
        ai_interpretation:  report.aiInterpretation || null,
        confidence:         report.confidence || 0,
        status:             report.status || 'processed',
        incident_id:        report.incidentId || null,
        matched_terms:      report.matchedTerms || [],
        ai_detected_status: report.detectedStatus || null,
        audio_url:          report.audioUrl || null,
        contact_info:       report.contact_info || report.contactInfo || null,
      };
      const { error } = await db()
        .from('reports')
        .upsert(row, { onConflict: 'report_id', ignoreDuplicates: true });
      if (error) console.warn('[saveReport]', error.message);
      return !error;
    }, false);
  }


  async function getReports({ source, status, isNoise, fromTs, toTs, incidentId, limit = 200 } = {}) {
    return _safe(async () => {
      let q = db().from('reports').select('*').order('timestamp', { ascending: false }).limit(limit);
      if (source)     q = q.eq('source', source);
      if (isNoise !== undefined) q = q.eq('is_noise', isNoise);
      if (status)     q = q.eq('status', status);
      if (incidentId) q = q.eq('incident_id', incidentId);
      if (fromTs)     q = q.gte('timestamp', fromTs);
      if (toTs)       q = q.lte('timestamp', toTs);
      const { data, error } = await q;
      if (error) { console.warn('[getReports]', error.message); return []; }
      return data || [];
    }, []);
  }

  /* ══════════════════════════════════════════
     INCIDENTS
     ══════════════════════════════════════════ */

  async function saveIncident(inc) {
    return _safe(async () => {
      const row = {
        incident_id:      inc.incidentId,
        emergency_type:   inc.emergencyType,
        location:         inc.location,
        location_note:    inc.locationNote || null,
        coordinates:      inc.coordinates || null,
        people_affected:  inc.peopleAffected || null,
        vulnerable_people: inc.vulnerablePeople || null,
        resource_needed:  inc.resourceNeeded || null,
        urgency:          inc.urgency || 'high',
        status:           inc.status || 'active',
        confidence:       inc.confidence || 0,
        source_count:     inc.sourceCount || 0,
        summary:          inc.summary || null,
        uncertainty:      inc.uncertainty || [],
        last_updated:     new Date().toISOString(),
      };
      const { error } = await db()
        .from('incidents')
        .upsert(row, { onConflict: 'incident_id' });
      if (error) console.warn('[saveIncident]', error.message);
    });
  }

  async function updateIncidentDB(incidentId, patch) {
    return _safe(async () => {
      const { error } = await db()
        .from('incidents')
        .update({ ...patch, last_updated: new Date().toISOString() })
        .eq('incident_id', incidentId);
      if (error) console.warn('[updateIncident]', error.message);
    });
  }

  async function getIncidents({ status, emergencyType, limit = 100 } = {}) {
    return _safe(async () => {
      let q = db().from('incidents').select('*').order('last_updated', { ascending: false }).limit(limit);
      if (status)        q = q.eq('status', status);
      if (emergencyType) q = q.ilike('emergency_type', `%${emergencyType}%`);
      const { data, error } = await q;
      if (error) { console.warn('[getIncidents]', error.message); return []; }
      return data || [];
    }, []);
  }

  /* ══════════════════════════════════════════
     INCIDENT UPDATES (timeline)
     ══════════════════════════════════════════ */

  async function addIncidentUpdate(update) {
    return _safe(async () => {
      const { error } = await db().from('incident_updates').insert({
        incident_id:      update.incidentId,
        event:            update.event,
        detail:           update.detail || null,
        source_report_id: update.sourceReportId || null,
        update_type:      update.type || 'update',
        timestamp:        update.time || new Date().toISOString(),
      });
      if (error) console.warn('[addIncidentUpdate]', error.message);
    });
  }

  async function getIncidentTimeline(incidentId) {
    return _safe(async () => {
      const { data, error } = await db()
        .from('incident_updates')
        .select('*')
        .eq('incident_id', incidentId)
        .order('timestamp', { ascending: true });
      if (error) { console.warn('[getTimeline]', error.message); return []; }
      return data || [];
    }, []);
  }

  /* ══════════════════════════════════════════
     DASHBOARD STATS
     ══════════════════════════════════════════ */

  async function getDashboardStats() {
    return _safe(async () => {
      const [incRes, rptRes] = await Promise.all([
        db().from('incidents').select('incident_id, status, urgency, emergency_type'),
        db().from('reports').select('is_noise, source, timestamp'),
      ]);
      if (incRes.error || rptRes.error) return null;

      const incs = incRes.data || [];
      const rpts = rptRes.data || [];

      // Normalize status: DB may store 'rescue-in-progress', 'rescue_in_progress', or 'Rescue in Progress'
      const normStatus = (s) => {
        if (!s) return 'active';
        const lower = s.toLowerCase().replace(/[\s_]/g, '-');
        if (lower.includes('rescue')) return 'rescue-in-progress';
        if (lower.includes('resolv')) return 'resolved';
        return 'active';
      };

      // Count unique incidents
      const seenIds = new Set();
      const statusCounts = { 'active': 0, 'rescue-in-progress': 0, 'resolved': 0 };
      let highPri = 0;
      const byType = {};

      for (const i of incs) {
        if (seenIds.has(i.incident_id)) continue;
        seenIds.add(i.incident_id);
        const ns = normStatus(i.status);
        statusCounts[ns] = (statusCounts[ns] || 0) + 1;
        const urg = (i.urgency || '').toLowerCase();
        if (urg === 'high' || urg === 'critical') highPri++;
        const t = (i.emergency_type || 'Other').split(/[\s+]/)[0];
        byType[t] = (byType[t] || 0) + 1;
      }

      const total    = seenIds.size;
      const active   = statusCounts['active'];
      const rescue   = statusCounts['rescue-in-progress'];
      const resolved = statusCounts['resolved'];

      const emergency = rpts.filter(r => !r.is_noise).length;
      const noise     = rpts.filter(r => r.is_noise).length;

      const now = Date.now();
      const hourly = {};
      rpts.forEach(r => {
        if (!r.timestamp) return;
        const d = new Date(r.timestamp);
        if (now - d.getTime() > 24 * 3600 * 1000) return;
        const hr = d.toLocaleTimeString('en-IN', { hour: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
        hourly[hr] = (hourly[hr] || 0) + 1;
      });

      return { total, active, rescue, resolved, highPri, byType, emergency, noise, hourly, fromDB: true };
    }, null);
  }


  /* ══════════════════════════════════════════
     TIMELINE GROUPS (for reports page)
     ══════════════════════════════════════════ */

  async function getTimelineGroups() {
    return _safe(async () => {
      const { data, error } = await db()
        .from('reports')
        .select('report_id, source, timestamp, is_noise, emergency_type, incident_id, original_message, ai_interpretation, location, urgency, status, confidence, stage')
        .order('timestamp', { ascending: true })
        .limit(500);
      if (error) { console.warn('[getTimelineGroups]', error.message); return {}; }
      const groups = {};
      (data || []).forEach(r => {
        const d = new Date(r.timestamp);
        const hr = d.toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
        const hrKey = d.toLocaleString('en-IN', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }) + ':00';
        if (!groups[hrKey]) groups[hrKey] = { label: hr.replace(':00 ', ' ').trim(), records: [] };
        groups[hrKey].records.push(r);
      });
      return groups;
    }, {});
  }

  /* ══════════════════════════════════════════
     CONNECTION CHECK
     ══════════════════════════════════════════ */

  async function checkConnection() {
    return _safe(async () => {
      const { error } = await db().from('incidents').select('incident_id').limit(1);
      return !error;
    }, false);
  }

  return {
    saveReport,
    getReports,
    saveIncident,
    updateIncidentDB,
    getIncidents,
    addIncidentUpdate,
    getIncidentTimeline,
    getDashboardStats,
    getTimelineGroups,
    checkConnection,
    isReady: _ok,
  };
})();

window.SupabaseService = SupabaseService;
