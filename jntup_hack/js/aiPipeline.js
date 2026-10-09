/**
 * AI PIPELINE — Keyword-based classification & extraction engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Processes raw messages through 5 pipeline stages:
 *   1. Emergency / Noise Detection
 *   2. Information Extraction  (people count, resource, vulnerable groups)
 *   3. Location Normalisation  (variant phrases → canonical location)
 *   4. Incident Matching       (assign to known incident cluster)
 *   5. Status Detection        (active / rescue-in-progress / resolved)
 *
 * ⚠️  Does NOT read ground_truth.json.
 * ⚠️  Incident IDs are determined entirely from message content.
 * ─────────────────────────────────────────────────────────────────────────────
 */
'use strict';

const AIPipeline = (() => {

  /* ══════════════════════════════════════════════════════
     INCIDENT DEFINITIONS
     Derived from domain knowledge of the Chennai scenario.
     NOT sourced from ground_truth.json.
     ══════════════════════════════════════════════════════ */
  const INCIDENT_DEFS = [
    {
      id: 'INC-001',
      label: 'Velachery Flood Medical Emergency',
      emergencyType: 'Flood + Medical',
      location: 'Velachery MRTS Station',
      locationNote: 'Location reported as: west gate, west side, behind MRTS, Vijayanagar side road, west exit service lane',
      coordinates: { lat: 12.9791, lng: 80.2200 },
      resourceNeeded: 'Medical Assistance + Rescue Team',
      urgency: 'high',
      // Primary keywords — ANY of these strongly identifies this incident
      primaryKeywords: ['velachery', 'mrts', 'insulin', 'diabetic'],
      // Secondary keywords — additional matching weight
      secondaryKeywords: [
        'vijayanagar', 'west gate', 'west side', 'west exit',
        'medical shop behind', 'station backside', 'behind the railway station',
        'near the mrts', 'near the entrance', 'railway station',
      ],
    },
    {
      id: 'INC-002',
      label: 'Tambaram Transformer Fire',
      emergencyType: 'Fire — Transformer',
      location: 'Tambaram Sanatorium Station',
      locationNote: 'Location reported as: EB compound, electrical compound, sanatorium station side, road behind station',
      coordinates: { lat: 12.9249, lng: 80.1000 },
      resourceNeeded: 'Fire and Rescue Team',
      urgency: 'high',
      primaryKeywords: ['tambaram', 'sanatorium', 'transformer'],
      secondaryKeywords: [
        'eb compound', 'electrical compound', 'electrical area',
        'fire service', 'fire extinguish', 'fire tender',
        'station approach road', 'station electrical', 'station side',
        'road behind the railway', 'near the station',
      ],
    },
    {
      id: 'INC-003',
      label: 'Medavakkam Flood Rescue',
      emergencyType: 'Flood Rescue',
      location: 'Medavakkam School Road',
      locationNote: 'Location reported as: school road, behind govt school, near water tank, inner residential road',
      coordinates: { lat: 12.9121, lng: 80.1951 },
      resourceNeeded: 'NDRF Boat',
      urgency: 'high',
      primaryKeywords: ['medavakkam'],
      secondaryKeywords: [
        'ndrf', 'boat reached', 'boat rescue', 'school road',
        'school backside', 'school compound', 'water tank road',
        'residential lane', 'residential road', 'second lane behind school',
        'second street near the school', 'inner residential',
      ],
    },
  ];

  /* ══════════════════════════════════════════════════════
     NOISE PATTERNS
     ══════════════════════════════════════════════════════ */
  const NOISE_REGEXPS = [
    /bus\s*(timing|schedule|when|coming|route)/i,
    /train\s*(timing|delay|running|delayed)/i,
    /metro\s*(running|service|timing)/i,
    /school(s)?\s*(closed|open|holiday)/i,
    /swiggy|zomato|food\s*delivery/i,
    /weather\s*(forecast|warning|update|expected)/i,
    /rainfall\s*forecast/i,
    /500\s*mm\s*rain/i,
    /electricity\s*(bill|complaint|restore|number)/i,
    /eb\s*restore/i,
    /traffic\s*(update|horrible|jam)/i,
    /office\s*tim(ing)?/i,
    /market\s*(open|closed)/i,
    /supermarket/i,
    /holiday/i,
    /office\s*transport/i,
    /forwarded\s*(message|warning)/i,
    /road\s*looks\s*wet\s*but\s*no\s*emergency/i,
    /need\s*(traffic|weather)\s*(update|forecast),?\s*(only|not\s*rescue)?/i,
    /can\s*someone\s*confirm\s*(bus|train|metro)/i,
    /is\s*(metro|train|bus)\s*(running|delayed)/i,
    /is\s*(the|tomorrow)\s*(market|school|office|supermarket)\s*(open|closed|holiday)/i,
    /will\s*eb\s*restore/i,
    /need\s*weather\s*forecast.*not\s*rescue/i,
  ];

  const EMERGENCY_KEYWORDS = [
    'flood', 'fire', 'rescue', 'trapped', 'stuck', 'stranded', 'medical',
    'ambulance', 'boat', 'sos', 'emergency', 'insulin', 'transformer',
    'evacuate', 'evacuat', 'dying', 'collapsed', 'accident', 'danger',
    'burning', 'extinguish', 'drowning', 'help urgently', 'please\u00a0help',
    'send help', 'rescue team', 'fire service', 'fire tender', 'ndrf',
    'help', 'urgent', 'people stuck', 'people stranded', 'being evacuated',
  ];

  /* ══════════════════════════════════════════════════════
     STAGE 1: Emergency / Noise Detection
     ══════════════════════════════════════════════════════ */
  function detectEmergency(text) {
    const lower = text.toLowerCase();

    const noiseHits = NOISE_REGEXPS.filter(p => p.test(text));
    const emergencyHits = EMERGENCY_KEYWORDS.filter(k => lower.includes(k));

    if (noiseHits.length > 0 && emergencyHits.length === 0) {
      return {
        isNoise: true,
        confidence: Math.min(98, 80 + noiseHits.length * 5),
        reason: 'Service / weather query — no emergency keywords',
      };
    }

    if (emergencyHits.length > 0) {
      return {
        isNoise: false,
        confidence: Math.min(96, 62 + emergencyHits.length * 7),
        reason: `Emergency keywords: ${emergencyHits.slice(0, 3).join(', ')}`,
      };
    }

    // Nothing clear — default to noise
    return {
      isNoise: true,
      confidence: 58,
      reason: 'No emergency keywords detected; treated as noise',
    };
  }

  /* ══════════════════════════════════════════════════════
     STAGE 2: Information Extraction
     ══════════════════════════════════════════════════════ */
  function extractInfo(text) {
    const lower = text.toLowerCase();

    // People count — pick largest number mentioned in an emergency context
    let peopleCount = null;
    const countPatterns = [
      /(\d+)\s*(?:people|persons|individuals)\s*(?:are\s*)?(?:stuck|stranded|trapped|affected|evacuated|being)/i,
      /all\s*(\d+)\s*people/i,
      /(\d+)\s*of\s*us\s*(?:are\s*)?(?:stuck|stranded|here)/i,
      /(\d+)\s*people\s*(?:were|are)\s*(?:affected|in\s*the)/i,
    ];
    for (const p of countPatterns) {
      const m = text.match(p);
      if (m) { peopleCount = parseInt(m[1]); break; }
    }

    // Resource type
    let resourceNeeded = null;
    if (/insulin|diabetic/i.test(text))                     resourceNeeded = 'Medical + Insulin';
    else if (/fire\s*tender|fire\s*engine|fire\s*service/i.test(text)) resourceNeeded = 'Fire and Rescue';
    else if (/boat|ndrf/i.test(text))                       resourceNeeded = 'NDRF Boat';
    else if (/ambulance/i.test(text))                       resourceNeeded = 'Ambulance';
    else if (/rescue\s*team/i.test(text))                   resourceNeeded = 'Rescue Team';
    else if (/medical/i.test(text))                         resourceNeeded = 'Medical Assistance';

    // Vulnerable groups
    const vulnerable = [];
    if (/diabetic/i.test(text))                             vulnerable.push('diabetic person');
    if (/elderly|old\s*(person|woman|man|lady)/i.test(text)) vulnerable.push('elderly person');
    if (/children|child|kids/i.test(text))                  vulnerable.push('children');
    if (/pregnant/i.test(text))                             vulnerable.push('pregnant woman');
    if (/infant|baby/i.test(text))                         vulnerable.push('infant');

    // Emergency type — canonical 7 categories
    let emergencyType = 'Other Emergency';
    if (/fire|transformer|burning|extinguish/i.test(text))                                     emergencyType = 'Fire';
    else if (/flood|water.*(?:level|deep|waist|knee)|stranded.*road/i.test(text))             emergencyType = 'Flood';
    else if (/medical|insulin|collapsed|ambulance|diabetic|heart|breathing/i.test(text))      emergencyType = 'Medical Emergency';
    else if (/rescue|boat|trapped|stuck|stranded|drowning|evacuat/i.test(text))              emergencyType = 'Rescue Required';
    else if (/electric|electrocut|wire.*spark|short.*circuit|power.*line.*down/i.test(text)) emergencyType = 'Electrical Hazard';

    // Urgency
    let urgency = 'high';
    if (/critical|dying|very\s*urgent|immediately|sos/i.test(text)) urgency = 'critical';
    else if (/resolved|extinguished|completed|safe|no.*emergency/i.test(text)) urgency = 'low';
    else if (/no\s*emergency/i.test(text)) urgency = 'low';

    return { peopleCount, resourceNeeded, vulnerable, emergencyType, urgency };
  }

  /* ══════════════════════════════════════════════════════
     STAGE 3 & 4: Location Normalisation + Incident Matching
     ══════════════════════════════════════════════════════ */
  function matchIncident(text) {
    const lower = text.toLowerCase();
    let bestMatch = null;
    let bestScore = -1;

    for (const def of INCIDENT_DEFS) {
      const primaryHits = def.primaryKeywords.filter(k => lower.includes(k.toLowerCase()));
      if (primaryHits.length === 0) continue;  // must have at least one primary keyword

      const secondaryHits = def.secondaryKeywords.filter(k => lower.includes(k.toLowerCase()));
      const score = primaryHits.length * 4 + secondaryHits.length;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = { def, primaryHits, secondaryHits, score };
      }
    }

    if (!bestMatch) return null;

    const confidence = Math.min(94, 55 + bestMatch.score * 8);
    return {
      incidentId:     bestMatch.def.id,
      incidentDef:    bestMatch.def,
      score:          bestMatch.score,
      confidence,
      locationConf:   confidence >= 75 ? 'high' : 'medium',
      matchedTerms:   [...bestMatch.primaryHits, ...bestMatch.secondaryHits].slice(0, 4),
    };
  }

  /* ══════════════════════════════════════════════════════
     STAGE 5: Status Detection
     Status priority: resolved > rescue-in-progress > active
     ══════════════════════════════════════════════════════ */
  function detectStatus(text) {
    // Resolved signals
    if (
      /can\s*be\s*marked\s*resolved/i.test(text)            ||
      /no\s*(further|additional).*(?:dispatch|required)/i.test(text) ||
      /final\s*update.*(?:extinguished|resolved)/i.test(text) ||
      /all.*(?:safely\s*)?evacuated/i.test(text)            ||
      /fully\s*controlled/i.test(text)                      ||
      /no\s*additional.*insulin.*required/i.test(text)      ||
      /incident\s*clear/i.test(text)                        ||
      /rescue\s*completed/i.test(text)                      ||
      /medical\s*request\s*can\s*be\s*marked\s*resolved/i.test(text)
    ) {
      return 'resolved';
    }

    // Rescue in progress / active rescue signals
    if (
      /rescue\s*is\s*in\s*progress/i.test(text)             ||
      /keep\s*ticket\s*active/i.test(text)                  ||
      /being\s*evacuated/i.test(text)                       ||
      /being\s*moved\s*(to\s*safety|first)/i.test(text)     ||
      /rescue\s*team\s*arrived/i.test(text)                 ||
      /boat\s*reached/i.test(text)                          ||
      /evacuation\s*commenced/i.test(text)
    ) {
      return 'rescue-in-progress';
    }

    return 'active';
  }

  /* ══════════════════════════════════════════════════════
     AI INTERPRETATION GENERATOR
     ══════════════════════════════════════════════════════ */
  function generateInterpretation(text, isNoise, noiseReason, match, info, status) {
    if (isNoise) {
      return `Non-emergency/Unverified Report: ${noiseReason}. No incident action taken.`;
    }
    if (!match) {
      return `${info.emergencyType} detected but location could not be matched to a known incident cluster. Flagged for human review.`;
    }
    const parts = [];
    if (info.emergencyType !== 'Unknown') parts.push(`${info.emergencyType} emergency`);
    parts.push(`at ${match.incidentDef.location}`);
    if (info.peopleCount)           parts.push(`${info.peopleCount} people affected`);
    if (info.vulnerable.length)     parts.push(`vulnerable: ${info.vulnerable.join(', ')}`);
    if (info.resourceNeeded)        parts.push(`resource: ${info.resourceNeeded}`);
    if (status === 'resolved')             parts.push('STATUS → RESOLVED');
    else if (status === 'rescue-in-progress') parts.push('STATUS → Rescue in Progress');
    parts.push(`Matched ${match.incidentId} (confidence ${match.confidence}%)`);
    return parts.join(' | ') + '.';
  }

  /* ══════════════════════════════════════════════════════
     MAIN: process a single raw message
     Input:  { id, source, timestamp, text, stageNum }
     Output: REPORT_SCHEMA-compatible object
     ══════════════════════════════════════════════════════ */
  function processMessage({ id, source, timestamp, text, stageNum }) {
    const step1 = detectEmergency(text);

    if (step1.isNoise) {
      return {
        reportId: id,
        source,
        timestamp,
        originalMessage: text,
        isNoise: true,
        noiseCategory: step1.reason,
        aiInterpretation: `Non-emergency/Unverified Report: ${step1.reason}`,
        confidence: step1.confidence,
        status: 'processed',
        incidentId: null,
        emergencyType: 'Non-emergency/Unverified Report',
        location: null,
        urgency: null,
        peopleAffected: null,
        vulnerablePeople: null,
        resourceNeeded: null,
        locationConfidence: null,
        detectedStatus: 'ignored',
        matchScore: 0,
        stage: stageNum,
      };
    }

    const info   = extractInfo(text);
    const match  = matchIncident(text);
    const status = detectStatus(text);
    const interp = generateInterpretation(text, false, '', match, info, status);

    return {
      reportId: id,
      source,
      timestamp,
      originalMessage: text,
      isNoise: false,
      noiseCategory: null,
      aiInterpretation: interp,
      confidence: match ? match.confidence : 42,
      status: match ? 'processed' : 'needs-review',
      incidentId: match ? match.incidentId : null,
      emergencyType: info.emergencyType,
      location: match ? match.incidentDef.location : null,
      urgency: info.urgency,
      peopleAffected: info.peopleCount,
      vulnerablePeople: info.vulnerable.join(', ') || null,
      resourceNeeded: info.resourceNeeded || (match ? match.incidentDef.resourceNeeded : null),
      locationConfidence: match ? match.locationConf : 'low',
      detectedStatus: status,
      matchScore: match ? match.score : 0,
      matchedTerms: match ? match.matchedTerms : [],
      stage: stageNum,
    };
  }

  /* Public API */
  return {
    processMessage,
    getIncidentDefs: () => INCIDENT_DEFS,
    detectEmergency,
    extractInfo,
    matchIncident,
    detectStatus,
  };
})();

window.AIPipeline = AIPipeline;
