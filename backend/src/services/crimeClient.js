/**
 * crimeClient.js — UK Police API client with crime-type weighting.
 *
 * ACCURACY IMPROVEMENTS:
 *   • Categorises crimes by severity (violent > property > nuisance)
 *   • Returns severity weight with each crime for distance-weighted scoring
 *   • 24-hour cache — crime data only updates monthly
 *   • Handles API limits gracefully
 */

const POLICE_API_BASE = 'https://data.police.uk/api';

// ── Crime severity weights ──────────────────────────────────────────────────
// Higher = more impact on safety score. Violent crimes matter MUCH more.
const CRIME_SEVERITY = {
  'violent-crime':          1.0,   // Most dangerous
  'robbery':                1.0,
  'sexual-offences':        1.0,
  'possession-of-weapons':  0.9,
  'public-order':           0.7,
  'criminal-damage-arson':  0.6,
  'burglary':               0.5,
  'vehicle-crime':          0.4,
  'drugs':                  0.4,
  'theft-from-the-person':  0.8,   // Direct threat to pedestrians
  'bicycle-theft':          0.3,
  'shoplifting':            0.2,
  'other-theft':            0.3,
  'anti-social-behaviour':  0.3,
  'other-crime':            0.4,
  'unknown':                0.4,
};

// ── Crime data cache (24h — data updates monthly) ───────────────────────────
const crimeCache = new Map();
const CRIME_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function crimeCacheKey(bbox) {
  const r = (v) => Math.round(v * 200) / 200; // ~550m grid
  return `crime:${r(bbox.south)},${r(bbox.west)},${r(bbox.north)},${r(bbox.east)}`;
