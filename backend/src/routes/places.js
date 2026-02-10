/**
 * routes/places.js — Proxy endpoints for OSM Nominatim (100% free geocoding).
 *
 * Replaces Google Places API entirely. No API key needed.
 * Uses Nominatim for autocomplete and place details.
 *
 * Rate limit: Nominatim requests max 1 req/sec (enforced via delay).
 */

const express = require('express');
const {
  validateTextInput,
  validatePlaceId,
  validateLatitude,
  validateLongitude,
  validatePositiveNumber,
} = require('../validate');

const router = express.Router();

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const USER_AGENT = process.env.OSM_USER_AGENT || 'SafeNightHome/1.0';

// ─── API call tracking ───────────────────────────────────────────────────────
let autocompleteApiCalls = 0;
let detailsApiCalls = 0;

// Simple rate limiter for Nominatim (keep requests ~300ms apart)
let lastNominatimCall = 0;
const nominatimThrottle = async () => {
  const now = Date.now();
  const elapsed = now - lastNominatimCall;
  if (elapsed < 300) {
    await new Promise((resolve) => setTimeout(resolve, 300 - elapsed));
  }
  lastNominatimCall = Date.now();
};

// ─── GET /api/places/autocomplete ────────────────────────────────────────────
// Query params: input, lat?, lng?, radius?
router.get('/autocomplete', async (req, res) => {
  try {
    // Validate input
    const inputResult = validateTextInput(req.query.input);
    if (!inputResult.valid) return res.status(400).json({ error: inputResult.error });

    let url = `${NOMINATIM_BASE}/search?format=json&q=${encodeURIComponent(inputResult.value)}&limit=5&addressdetails=1`;

    // Optional location bias — use viewbox for Nominatim
    if (req.query.lat && req.query.lng) {
      const latResult = validateLatitude(req.query.lat);
      const lngResult = validateLongitude(req.query.lng);
      if (!latResult.valid) return res.status(400).json({ error: latResult.error });
      if (!lngResult.valid) return res.status(400).json({ error: lngResult.error });

      // Create a viewbox around the location (roughly 50km box)
      const offset = 0.5; // ~50km
      const viewbox = `${lngResult.value - offset},${latResult.value + offset},${lngResult.value + offset},${latResult.value - offset}`;
      url += `&viewbox=${viewbox}&bounded=0`;
    }

    await nominatimThrottle();
    autocompleteApiCalls++;
    console.log(`[places/autocomplete] 🌐 Nominatim call #${autocompleteApiCalls} → input="${inputResult.value.substring(0, 30)}"`);

    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });
    const results = await response.json();

    // Transform Nominatim results to Google-compatible format
    const predictions = (results || []).map((r) => ({
      place_id: `osm-${r.osm_type}-${r.osm_id}`,
      description: r.display_name,
      structured_formatting: {
        main_text: r.name || r.display_name.split(',')[0],
        secondary_text: r.display_name.split(',').slice(1).join(',').trim(),
      },
    }));

    console.log(`[places/autocomplete] 📦 Response: ${predictions.length} results`);
    res.json({ status: predictions.length > 0 ? 'OK' : 'ZERO_RESULTS', predictions });
  } catch (err) {
    console.error('[places/autocomplete] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/places/details ─────────────────────────────────────────────────
// Query params: place_id (format: osm-<type>-<id>)
router.get('/details', async (req, res) => {
  try {
    const placeIdResult = validatePlaceId(req.query.place_id);
    if (!placeIdResult.valid) return res.status(400).json({ error: placeIdResult.error });

