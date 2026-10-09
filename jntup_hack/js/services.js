/**
 * DATA SERVICE LAYER
 * ─────────────────────────────────────────────────────────────────────────────
 * Abstraction between the UI and the data source.
 * Currently backed by MockData. Replace getIncidents(), getReports(), etc.
 * with API calls when connecting to a real backend — zero UI changes needed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const DataService = (() => {
  /* ── Internal state (mirrors what a database would hold) ── */
  let _incidents = JSON.parse(JSON.stringify(window.MockData.INCIDENTS));
  let _reports   = JSON.parse(JSON.stringify(window.MockData.REPORTS));
  let _nextIncidentNum = 6;
  let _nextReportNum   = 15;
  let _dataMode = 'mock';   // 'mock' | 'real'

  /* ─────────────────────────────────────────────
     INCIDENTS
     ───────────────────────────────────────────── */
  function getIncidents() {
    return [..._incidents];
  }

  function getIncidentById(id) {
    return _incidents.find(i => i.incidentId === id) || null;
  }

  function getIncidentStats() {
    const total    = _incidents.length;
    const active   = _incidents.filter(i => i.status === 'active').length;
    const highPri  = _incidents.filter(i => i.urgency === 'high' || i.urgency === 'critical').length;
    const rescue   = _incidents.filter(i => i.status === 'rescue-in-progress').length;
    const resolved = _incidents.filter(i => i.status === 'resolved').length;
    return { total, active, highPri, rescue, resolved };
  }

  function addIncident(incident) {
    _incidents.push(incident);
    _nextIncidentNum++;
    _notifyListeners('incidents');
  }

  /** Add incident from DataLoader — no counter bump, ID already set */
  function addIncidentRaw(incident) {
    if (_incidents.find(i => i.incidentId === incident.incidentId)) return; // dedup
    _incidents.push(incident);
    _notifyListeners('incidents');
  }

  function updateIncident(id, patch) {
    const idx = _incidents.findIndex(i => i.incidentId === id);
    if (idx === -1) return false;
    _incidents[idx] = { ..._incidents[idx], ...patch, lastUpdated: new Date().toISOString() };
    _notifyListeners('incidents');
    return true;
  }

  function nextIncidentId() {
    return `INC-${String(_nextIncidentNum).padStart(3, '0')}`;
  }

  /* ─────────────────────────────────────────────
     REPORTS
     ───────────────────────────────────────────── */
  function getReports() {
    return [..._reports].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  function getReportsByIncident(incidentId) {
    return _reports.filter(r => r.incidentId === incidentId);
  }

  function addReport(report) {
    _reports.push(report);
    _nextReportNum++;
    _notifyListeners('reports');
  }

  /** Add report from DataLoader — ID already set, no counter bump */
  function addReportRaw(report) {
    if (_reports.find(r => r.reportId === report.reportId)) return; // dedup
    _reports.push(report);
    _notifyListeners('reports');
  }

  function nextReportId() {
    return `RPT-${String(_nextReportNum).padStart(3, '0')}`;
  }

  /* ─────────────────────────────────────────────
     ANALYTICS
     ───────────────────────────────────────────── */
  function getAnalytics() {
    // Derive fresh analytics from live state
    const byType = {};
    const byStatus = {};
    const byUrgency = {};
    const bySource = {};

    _incidents.forEach(inc => {
      const t = inc.emergencyType.split(' ')[0].split('+')[0].trim();
      byType[t] = (byType[t] || 0) + 1;
      byStatus[inc.status] = (byStatus[inc.status] || 0) + 1;
      byUrgency[inc.urgency] = (byUrgency[inc.urgency] || 0) + 1;
    });

    _reports.filter(r => !r.isNoise).forEach(r => {
      bySource[r.source] = (bySource[r.source] || 0) + 1;
    });

    return {
      incidentsByType: Object.entries(byType).map(([label, count]) => ({ label, count })),
      incidentsByStatus: Object.entries(byStatus).map(([label, count]) => ({ label: _statusLabel(label), count })),
      urgencyDistribution: Object.entries(byUrgency).map(([label, count]) => ({ label: _capitalize(label), count })),
      reportsBySource: Object.entries(bySource).map(([label, count]) => ({ label: _sourceLabel(label), count })),
      peopleAffected: _incidents.map(i => ({ label: i.incidentId, count: i.peopleAffected || 0 })),
      noiseVsEmergency: {
        noise: _reports.filter(r => r.isNoise).length,
        emergency: _reports.filter(r => !r.isNoise).length,
      },
      updatesOverTime: window.MockData.ANALYTICS.updatesOverTime,
    };
  }

  /* ─────────────────────────────────────────────
     OBSERVER PATTERN  (reactive updates)
     ───────────────────────────────────────────── */
  const _listeners = [];

  function subscribe(fn) {
    _listeners.push(fn);
    return () => { const i = _listeners.indexOf(fn); if (i > -1) _listeners.splice(i, 1); };
  }

  function _notifyListeners(type) {
    _listeners.forEach(fn => fn(type));
  }

  /* ─────────────────────────────────────────────
     HELPERS
     ───────────────────────────────────────────── */
  function _statusLabel(s) {
    const map = { active: 'Active', 'rescue-in-progress': 'Rescue in Progress', resolved: 'Resolved' };
    return map[s] || s;
  }

  function _sourceLabel(s) {
    const map = { audio: 'Audio Call', whatsapp: 'WhatsApp', sms: 'SMS', social: 'Social Media' };
    return map[s] || s;
  }

  function _capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  /* ─────────────────────────────────────────────
     DATA MODE MANAGEMENT
     ───────────────────────────────────────────── */

  /** Clear all incidents and reports (called before loading real dataset) */
  function clearAll() {
    _incidents = [];
    _reports = [];
    _dataMode = 'real';
    _notifyListeners('incidents');
    _notifyListeners('reports');
  }

  /** Restore mock data (fallback / demo reset) */
  function resetToMock() {
    _incidents = JSON.parse(JSON.stringify(window.MockData.INCIDENTS));
    _reports   = JSON.parse(JSON.stringify(window.MockData.REPORTS));
    _nextIncidentNum = 6;
    _nextReportNum   = 15;
    _dataMode = 'mock';
    if (window.DataLoader) DataLoader.reset();
    _notifyListeners('incidents');
    _notifyListeners('reports');
  }

  function getDataMode() { return _dataMode; }

  /* ─────────────────────────────────────────────
     PUBLIC API
     ───────────────────────────────────────────── */
  return {
    getIncidents,
    getIncidentById,
    getIncidentStats,
    addIncident,
    addIncidentRaw,
    updateIncident,
    nextIncidentId,
    getReports,
    getReportsByIncident,
    addReport,
    addReportRaw,
    nextReportId,
    getAnalytics,
    subscribe,
    clearAll,
    resetToMock,
    getDataMode,
  };
})();

window.DataService = DataService;
