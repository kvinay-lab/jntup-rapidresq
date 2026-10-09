/**
 * DATA LOADER
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches real emergency_dataset files stage by stage,
 * runs them through AIPipeline, and feeds results into DataService.
 *
 * ⚠️  Does NOT read ground_truth.json — ever.
 * ⚠️  Incident IDs are assigned entirely from message content via AIPipeline.
 *
 * Usage:
 *   DataLoader.loadStage(1, onProgressCallback)   → loads stage_1
 *   DataLoader.loadStage(2, onProgressCallback)   → loads stage_2
 *   DataLoader.loadStage(3, onProgressCallback)   → loads stage_3
 *   DataLoader.getLoadedStages()                  → [1, 2, ...]
 *   DataLoader.reset()                            → clear loaded-stage tracking
 * ─────────────────────────────────────────────────────────────────────────────
 */
'use strict';

const DataLoader = (() => {

  const BASE = 'data/emergency_dataset';
  const _loaded = new Set();   // which stage numbers have been loaded
  let _rptCounter = 100;       // unique counter for report IDs assigned here

  /* ──────────────────────────────────────────────────
     HELPERS
  ────────────────────────────────────────────────── */
  async function _fetchJSON(url) {
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      return r.json();
    } catch { return null; }
  }

  async function _fetchText(url) {
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      return r.text();
    } catch { return null; }
  }

  /** Minimal CSV parser: handles comma-separated rows with optional quoting */
  function _parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    return lines.slice(1).map(line => {
      const vals = [];
      let cur = '', inQ = false;
      for (const ch of line) {
        if (ch === '"') { inQ = !inQ; continue; }
        if (ch === ',' && !inQ) { vals.push(cur); cur = ''; continue; }
        cur += ch;
      }
      vals.push(cur);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
      return obj;
    });
  }

  /** Yield to the UI so progress bars update */
  function _tick() { return new Promise(r => setTimeout(r, 0)); }

  /** Map source string for SMS/Social → app source labels */
  function _normaliseSource(raw) {
    if (raw === 'whatsapp') return 'whatsapp';
    if (raw === 'sms')      return 'sms';
    if (raw === 'social')   return 'social';
    if (raw === 'audio')    return 'audio';
    return raw;
  }

  /* ──────────────────────────────────────────────────
     AUDIO REPORT BUILDER
     MPs are served as files, not transcribed.
     Shows audio player + "Transcription pending" state.
  ────────────────────────────────────────────────── */
  function _buildAudioReports(stageNum) {
    // Rough timestamps spread across the stage window
    const stageTimes = {
      1: '2026-10-07T08',
      2: '2026-10-07T08',
      3: '2026-10-07T10',
    };
    const prefix = stageTimes[stageNum] || '2026-10-07T08';

    return Array.from({ length: 7 }, (_, i) => {
      const n = String(i + 1).padStart(3, '0');
      const fn = `stage_${stageNum}_call_${n}`;
      const url = `${BASE}/stage_${stageNum}/audio_calls/${fn}.mp3`;
      const min = String(i * 4).padStart(2, '0');
      return {
        reportId: fn,
        source: 'audio',
        timestamp: `${prefix}:${min}:00`,
        originalMessage: `[Audio Call — ${fn}.mp3]`,
        audioUrl: url,
        transcriptStatus: 'pending',
        aiInterpretation: 'Transcription pending — audio playback available. Telugu/Telugu-English. Run STT to extract transcript.',
        isNoise: false,
        noiseCategory: null,
        confidence: 0,
        status: 'needs-review',
        incidentId: null,
        emergencyType: 'audio',
        location: null,
        urgency: null,
        peopleAffected: null,
        vulnerablePeople: null,
        resourceNeeded: null,
        locationConfidence: null,
        detectedStatus: null,
        matchScore: 0,
        stage: stageNum,
      };
    });
  }

  /* ──────────────────────────────────────────────────
     INCIDENT UPDATER
     Takes processed emergency reports and merges
     them into DataService incidents.
  ────────────────────────────────────────────────── */
  function _updateIncidents(emergencyReports, stageNum) {
    // Group by matched incident ID
    const byIncident = {};
    for (const r of emergencyReports) {
      if (!r.incidentId) continue;
      (byIncident[r.incidentId] = byIncident[r.incidentId] || []).push(r);
    }

    const now = new Date().toISOString();
    const statusOrder = { active: 0, 'rescue-in-progress': 1, resolved: 2 };

    for (const [incId, reports] of Object.entries(byIncident)) {
      // -- Status: take highest-priority status seen in this batch --
      const detectedStatuses = reports.map(r => r.detectedStatus).filter(Boolean);
      let batchStatus = 'active';
      for (const s of detectedStatuses) {
        if ((statusOrder[s] ?? -1) > (statusOrder[batchStatus] ?? -1)) batchStatus = s;
      }

      // -- People count: take the maximum seen (later stages are authoritative) --
      const counts = reports.map(r => r.peopleAffected).filter(v => v && v > 0);
      const maxCount = counts.length ? Math.max(...counts) : null;

      // -- Confidence: average --
      const avgConf = Math.round(reports.reduce((s, r) => s + r.confidence, 0) / reports.length);

      // -- Vulnerable: union of all mentions --
      const allVul = [...new Set(
        reports.flatMap(r => (r.vulnerablePeople || '').split(', ')).filter(Boolean)
      )];

      // -- Representative report for timeline entry --
      const rep = reports.find(r => r.peopleAffected) || reports[0];
      const tEntry = {
        time: rep.timestamp || now,
        event: stageNum === 1
          ? `Initial reports — ${reports.length} messages received.`
          : `Stage ${stageNum} update — ${reports.length} corroborating message(s).`,
        detail: rep.aiInterpretation || rep.originalMessage,
        source: rep.reportId,
        type: batchStatus === 'resolved' ? 'resolved'
            : batchStatus === 'rescue-in-progress' ? 'resource'
            : stageNum === 1 ? 'new' : 'update',
      };

      const existing = DataService.getIncidentById(incId);

      if (!existing) {
        /* ── Create new incident ── */
        const def = AIPipeline.getIncidentDefs().find(d => d.id === incId);
        if (!def) continue;

        DataService.addIncidentRaw({
          incidentId: incId,
          emergencyType: def.emergencyType,
          location: def.location,
          locationNote: def.locationNote,
          coordinates: def.coordinates,
          peopleAffected: maxCount || 0,
          vulnerablePeople: allVul.join(', ') || 'Unknown',
          resourceNeeded: def.resourceNeeded,
          urgency: def.urgency,
          status: batchStatus,
          confidence: avgConf,
          sourceCount: reports.length,
          summary: `${def.label}. Detected from ${reports.length} report(s) in Stage ${stageNum}. ${rep.aiInterpretation}`,
          uncertainty: maxCount ? [] : ['People count could not be extracted from reports.'],
          createdAt: rep.timestamp || now,
          lastUpdated: now,
          timeline: [tEntry],
        });
      } else {
        /* ── Update existing incident ── */
        const patch = {
          sourceCount: (existing.sourceCount || 0) + reports.length,
          lastUpdated: now,
          confidence: Math.max(existing.confidence || 0, avgConf),
          timeline: [...(existing.timeline || []), tEntry],
        };

        // People count — only increase, never decrease
        if (maxCount && maxCount > (existing.peopleAffected || 0)) {
          patch.peopleAffected = maxCount;
        }

        // Status — only advance forward (active → rescue-in-progress → resolved)
        if ((statusOrder[batchStatus] ?? -1) > (statusOrder[existing.status] ?? -1)) {
          patch.status = batchStatus;
        }

        // Vulnerable — accumulate unique
        if (allVul.length) {
          const existing_vul = (existing.vulnerablePeople || '').split(', ').filter(Boolean);
          patch.vulnerablePeople = [...new Set([...existing_vul, ...allVul])].join(', ');
        }

        // Update resource if we now know it better
        const newRes = reports.find(r => r.resourceNeeded);
        if (newRes && !existing.resourceNeeded) patch.resourceNeeded = newRes.resourceNeeded;

        DataService.updateIncident(incId, patch);
      }
    }
  }

  /* ──────────────────────────────────────────────────
     LOAD STAGE  (main public method)
  ────────────────────────────────────────────────── */
  async function loadStage(stageNum, onProgress) {
    const progress = (step, done, total, detail) => {
      onProgress && onProgress({ stage: stageNum, step, done, total, detail });
    };

    if (_loaded.has(stageNum)) {
      progress('skipped', 1, 1, `Stage ${stageNum} already loaded.`);
      return { skipped: true };
    }

    const stageDir = `${BASE}/stage_${stageNum}/social_and_sms`;
    progress('fetch', 0, 3, 'Fetching source files…');

    const [waData, smsTxt, twTxt] = await Promise.all([
      _fetchJSON(`${stageDir}/whatsapp_community.json`),
      _fetchText(`${stageDir}/sms_helpline.csv`),
      _fetchText(`${stageDir}/twitter_feed.csv`),
    ]);

    if (!waData && !smsTxt && !twTxt) {
      return { error: `Stage ${stageNum} data files not found. Make sure emergency_dataset is in jntup_hack/data/.` };
    }

    progress('fetch', 3, 3, 'Files loaded. Parsing…');
    await _tick();

    /* Collect raw messages */
    const raw = [];

    if (waData && Array.isArray(waData.messages)) {
      for (const m of waData.messages) {
        raw.push({ id: m.message_id, source: 'whatsapp', timestamp: m.timestamp, text: m.text });
      }
    }

    if (smsTxt) {
      for (const row of _parseCSV(smsTxt)) {
        if (!row.message) continue;
        raw.push({ id: row.sms_id, source: 'sms', timestamp: row.timestamp, text: row.message });
      }
    }

    if (twTxt) {
      for (const row of _parseCSV(twTxt)) {
        if (!row.text) continue;
        raw.push({ id: row.tweet_id, source: 'social', timestamp: row.timestamp, text: row.text });
      }
    }

    // Sort by timestamp so timeline entries are chronological
    raw.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    progress('pipeline', 0, raw.length, `Processing ${raw.length} messages through AI pipeline…`);

    /* Run AI pipeline */
    const processed = [];
    for (let i = 0; i < raw.length; i++) {
      processed.push(AIPipeline.processMessage({ ...raw[i], stageNum }));
      if (i % 25 === 0) {
        progress('pipeline', i, raw.length, `${i}/${raw.length} messages classified…`);
        await _tick();
      }
    }

    /* Add audio reports */
    const audioReports = _buildAudioReports(stageNum);

    /* Update incidents first */
    _updateIncidents(processed.filter(r => !r.isNoise && r.incidentId), stageNum);

    /* Add all reports to DataService */
    const allReports = [...processed, ...audioReports];
    for (const r of allReports) {
      DataService.addReportRaw(r);
    }

    const emergencyCount = processed.filter(r => !r.isNoise).length;
    const noiseCount = processed.filter(r => r.isNoise).length;
    _loaded.add(stageNum);

    progress('done', raw.length, raw.length,
      `Stage ${stageNum} complete: ${emergencyCount} emergency, ${noiseCount} noise, ${audioReports.length} audio.`);

    /* ── Persist to Supabase (non-blocking, fire-and-forget) ── */
    if (window.SupabaseService && SupabaseService.isReady()) {
      progress('supabase', 0, 1, 'Saving to Supabase…');
      // Save reports in batches to avoid rate limits
      (async () => {
        for (const r of allReports) {
          await SupabaseService.saveReport({ ...r, stage: stageNum });
        }
        // Save / upsert incidents
        for (const inc of DataService.getIncidents()) {
          await SupabaseService.saveIncident(inc);
        }
        progress('supabase', 1, 1, `Supabase sync complete for Stage ${stageNum}.`);
      })().catch(e => console.warn('[DataLoader] Supabase sync error:', e));
    }

    return {
      total: raw.length,
      emergency: emergencyCount,
      noise: noiseCount,
      audio: audioReports.length,
    };

  }

  /* Public API */
  function getLoadedStages() { return [..._loaded].sort(); }
  function isStageLoaded(n)  { return _loaded.has(n); }
  function reset()           { _loaded.clear(); }

  return { loadStage, getLoadedStages, isStageLoaded, reset };
})();

window.DataLoader = DataLoader;
