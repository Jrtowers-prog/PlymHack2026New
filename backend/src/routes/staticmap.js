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
