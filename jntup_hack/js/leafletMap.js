/**
 * ResQ-AI — Leaflet Map Module
 * Replaces the SVG fake map with a real OpenStreetMap-backed Leaflet map.
 * Requires Leaflet CSS + JS loaded before this file.
 */
'use strict';

const LeafletMap = (() => {

  /* Type → icon emoji + color */
  const TYPE_ICONS = {
    Fire:     { emoji: '🔥', color: '#ff6b35', bg: '#3d1a00' },
    Flood:    { emoji: '🌊', color: '#38b2ff', bg: '#001e3d' },
    Medical:  { emoji: '🏥', color: '#ff4d6d', bg: '#3d0010' },
    Rescue:   { emoji: '🚤', color: '#b76bff', bg: '#1e0033' },
    Electrical:{ emoji: '⚡', color: '#ffe066', bg: '#33290a' },
    Other:    { emoji: '📦', color: '#a0aec0', bg: '#1a1a2e' },
    audio:    { emoji: '📞', color: '#a0aec0', bg: '#1a1a2e' },
    noise:    { emoji: '🚫', color: '#666',    bg: '#111' },
  };

  const URGENCY_RING = {
    critical: '#ff4757',
    high:     '#ff8c42',
    medium:   '#f5c842',
    low:      '#4ec9b0',
  };

  function _typeKey(emergencyType) {
    const t = (emergencyType || '').toLowerCase();
    if (t.includes('fire'))     return 'Fire';
    if (t.includes('flood'))    return 'Flood';
    if (t.includes('medical'))  return 'Medical';
    if (t.includes('rescue'))   return 'Rescue';
    if (t.includes('electric')) return 'Electrical';
    return 'Other';
  }

  function _makeIcon(inc) {
    const key    = _typeKey(inc.emergencyType);
    const info   = TYPE_ICONS[key] || TYPE_ICONS.Other;
    const ring   = URGENCY_RING[inc.urgency] || '#58a6ff';
    const pulse  = inc.status !== 'resolved'
      ? `<div style="position:absolute;inset:-6px;border-radius:50%;border:2px solid ${ring};animation:resq-pulse 2s infinite;opacity:.6;"></div>` : '';
    const html = `
      <div style="position:relative;width:36px;height:36px;">
        ${pulse}
        <div style="width:36px;height:36px;border-radius:50%;background:${info.bg};
                    border:2.5px solid ${ring};display:flex;align-items:center;
                    justify-content:center;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,.6);">
          ${info.emoji}
        </div>
        <div style="position:absolute;bottom:-16px;left:50%;transform:translateX(-50%);
                    white-space:nowrap;font-size:9px;font-weight:700;color:${ring};
                    text-shadow:0 0 4px rgba(0,0,0,.9);">
          ${inc.incidentId}
        </div>
      </div>`;
    return L.divIcon({
      html,
      iconSize:   [36, 52],
      iconAnchor: [18, 18],
      className:  '',
    });
  }

  /* Keep track of active map instances by container ID */
  const _maps = {};

  /**
   * Render (or refresh) a Leaflet map inside the given DOM element.
   * @param {HTMLElement} container  - The target DOM element
   * @param {number}      height     - Pixel height
   * @param {boolean}     showFilters - Whether to render filter chips
   */
  function renderLeafletMap(container, height = 420, showFilters = false) {
    if (!container) return;
    if (typeof L === 'undefined') {
      container.innerHTML = `<div class="empty-state" style="height:${height}px;"><div class="empty-state-icon">🗺</div>
        <p>Map library not loaded. Check internet connection.</p></div>`;
      return;
    }

    const uid = 'lmap_' + Math.random().toString(36).slice(2, 7);
    container.style.minHeight = height + 'px';

    /* Filter bar */
    let filterHTML = '';
    if (showFilters) {
      filterHTML = `
        <div class="filter-bar mb-3" id="${uid}_filters">
          <button class="filter-chip active" data-lf="all">All</button>
          <button class="filter-chip" data-lf="Fire">🔥 Fire</button>
          <button class="filter-chip" data-lf="Flood">🌊 Flood</button>
          <button class="filter-chip" data-lf="Medical">🏥 Medical</button>
          <button class="filter-chip" data-lf="Rescue">🚤 Rescue</button>
          <button class="filter-chip" data-lf="Electrical">⚡ Electrical</button>
          <button class="filter-chip" data-lf="active">Active</button>
          <button class="filter-chip" data-lf="resolved">Resolved</button>
        </div>`;
    }

    container.innerHTML = filterHTML + `<div id="${uid}" style="height:${height}px;border-radius:8px;overflow:hidden;"></div>`;

    /* Init Leaflet */
    const map = L.map(uid, {
      center:     [13.0827, 80.2707],   // Chennai
      zoom:       11,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    /* Style overrides for dark theme */
    const mapEl = document.getElementById(uid);
    if (mapEl) {
      mapEl.style.filter = 'brightness(0.82) saturate(1.1)';
      mapEl.style.background = '#1a2233';
    }

    _maps[uid] = { map, markers: L.layerGroup().addTo(map), filter: 'all' };

    function getFiltered(filt) {
      const all = DataService.getIncidents();
      if (filt === 'all') return all;
      if (filt === 'active')   return all.filter(i => i.status === 'active');
      if (filt === 'resolved') return all.filter(i => i.status === 'resolved');
      // type filter
      return all.filter(i => _typeKey(i.emergencyType) === filt);
    }

    function redraw(filt = 'all') {
      _maps[uid].markers.clearLayers();
      const list = getFiltered(filt);
      list.forEach(inc => {
        if (!inc.coordinates || !inc.coordinates.lat) return;
        const marker = L.marker([inc.coordinates.lat, inc.coordinates.lng], {
          icon: _makeIcon(inc),
          title: `${inc.incidentId} — ${inc.emergencyType}`,
        });

        const ring = URGENCY_RING[inc.urgency] || '#58a6ff';
        const popupHTML = `
          <div style="font-family:system-ui,sans-serif;min-width:220px;">
            <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap;">
              <code style="font-size:11px;color:#a0aec0;">${inc.incidentId}</code>
              <span style="font-size:10px;padding:2px 7px;border-radius:4px;background:${ring}22;color:${ring};font-weight:700;">
                ${(inc.urgency||'').toUpperCase()}
              </span>
              <span style="font-size:10px;padding:2px 7px;border-radius:4px;background:#2a3a4a;color:#ccc;">
                ${inc.status}
              </span>
            </div>
            <div style="font-size:14px;font-weight:700;margin-bottom:3px;">${escapeHtml(inc.emergencyType)}</div>
            <div style="font-size:11px;color:#8899aa;margin-bottom:8px;">📍 ${escapeHtml(inc.location)}</div>
            <div style="font-size:11px;display:flex;gap:12px;margin-bottom:10px;">
              <span>👥 ${inc.peopleAffected ?? '?'} people</span>
              <span>🕐 ${formatTime(inc.lastUpdated)}</span>
            </div>
            <button onclick="Router.navigate('incidents',{incidentId:'${inc.incidentId}'});this.closest('.leaflet-popup').querySelector('.leaflet-popup-close-button').click();"
              style="width:100%;padding:7px;background:#58a6ff;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">
              View Details →
            </button>
          </div>`;

        marker.bindPopup(popupHTML, { maxWidth: 260, className: 'resq-popup' });
        _maps[uid].markers.addLayer(marker);
      });

      /* If no markers, show city centre reference */
      if (list.length === 0) {
        L.marker([13.0827, 80.2707], {
          icon: L.divIcon({
            html: '<div style="background:#2d3748;border:1px solid #4a5568;padding:4px 8px;border-radius:4px;font-size:10px;color:#a0aec0;white-space:nowrap;">Chennai, Tamil Nadu</div>',
            className: '',
          }),
        }).addTo(_maps[uid].markers);
      }
    }

    redraw('all');

    /* Filter chips */
    if (showFilters) {
      const filterBar = document.getElementById(`${uid}_filters`);
      if (filterBar) {
        filterBar.querySelectorAll('[data-lf]').forEach(chip => {
          chip.addEventListener('click', () => {
            filterBar.querySelectorAll('[data-lf]').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            redraw(chip.dataset.lf);
          });
        });
      }
    }

    /* Reactive: DataService subscription */
    const unsub = DataService.subscribe(() => redraw(_maps[uid]?.filter || 'all'));
    /* Clean up on next navigation (map container will be replaced) */
    const obs = new MutationObserver(() => {
      if (!document.getElementById(uid)) {
        unsub();
        if (_maps[uid]) { _maps[uid].map.remove(); delete _maps[uid]; }
        obs.disconnect();
      }
    });
    if (container.parentElement) obs.observe(container.parentElement, { childList: true, subtree: true });
  }

  return { renderLeafletMap };
})();

window.LeafletMap = LeafletMap;
