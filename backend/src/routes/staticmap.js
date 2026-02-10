/**
 * routes/staticmap.js — Static map endpoint using OSM tiles (100% free).
 *
 * Generates a simple redirect to an OSM-based static map service.
 * No API key needed. Uses the free staticmap.openstreetmap.de service.
 */

const express = require('express');
const {
  validateLatitude,
  validateLongitude,
  validatePositiveNumber,
} = require('../validate');

const router = express.Router();

// ─── API call tracking ───────────────────────────────────────────────────────
let staticmapCalls = 0;

// ─── GET /api/staticmap ──────────────────────────────────────────────────────
// Query params: width, height, scale?, origin_lat?, origin_lng?, dest_lat?, dest_lng?, polyline?
router.get('/', async (req, res) => {
  try {
    // Validate dimensions
    const widthResult = validatePositiveNumber(req.query.width, 'width', 2048);
    const heightResult = validatePositiveNumber(req.query.height, 'height', 2048);
    if (!widthResult.valid) return res.status(400).json({ error: widthResult.error });
    if (!heightResult.valid) return res.status(400).json({ error: heightResult.error });

    const width = Math.round(widthResult.value);
    const height = Math.round(heightResult.value);

    // Determine center from origin or destination
    let centerLat = 51.5072;
    let centerLng = -0.1276;
    let zoom = 14;

    if (req.query.origin_lat && req.query.origin_lng) {
      const oLat = validateLatitude(req.query.origin_lat);
      const oLng = validateLongitude(req.query.origin_lng);
      if (oLat.valid && oLng.valid) {
        centerLat = oLat.value;
        centerLng = oLng.value;
      }
    }

    if (req.query.dest_lat && req.query.dest_lng) {
      const dLat = validateLatitude(req.query.dest_lat);
      const dLng = validateLongitude(req.query.dest_lng);
      if (dLat.valid && dLng.valid) {
        // If we have both origin and destination, center between them
        if (req.query.origin_lat) {
          const oLat = parseFloat(req.query.origin_lat);
          const oLng = parseFloat(req.query.origin_lng);
          centerLat = (oLat + dLat.value) / 2;
          centerLng = (oLng + dLng.value) / 2;
          // Estimate zoom based on distance
          const latDiff = Math.abs(oLat - dLat.value);
          const lngDiff = Math.abs(oLng - dLng.value);
          const maxDiff = Math.max(latDiff, lngDiff);
          if (maxDiff > 0.1) zoom = 12;
          else if (maxDiff > 0.05) zoom = 13;
          else zoom = 14;
        } else {
          centerLat = dLat.value;
          centerLng = dLng.value;
        }
      }
    }

    // Build URL for OSM static map service
    const url = `https://staticmap.openstreetmap.de/staticmap.php?center=${centerLat},${centerLng}&zoom=${zoom}&size=${width}x${height}&maptype=mapnik`;

    staticmapCalls++;
    console.log(`[staticmap] 🌐 OSM static map call #${staticmapCalls} → ${width}x${height} zoom=${zoom}`);

    const response = await fetch(url);
    console.log(`[staticmap] 📦 Response: status=${response.status}, content-type=${response.headers.get('content-type')}`);

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Static map request failed' });
    }

    // Stream the image back to the client
    res.set('Content-Type', response.headers.get('content-type') || 'image/png');
    res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24h
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('[staticmap] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
