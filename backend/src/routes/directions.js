/**
 * routes/directions.js — Proxy endpoint for OSRM (Open Source Routing Machine).
 *
 * OSRM is 100% free, no API key required, and provides identical functionality to Google Directions.
 * Supports walking, cycling, driving modes with alternative routes and full geometry.
 */

const express = require('express');
const {
  validateLatitude,
  validateLongitude,
} = require('../validate');

const router = express.Router();

const OSRM_BASE = 'https://router.project-osrm.org/route/v1';

// ─── API call tracking ───────────────────────────────────────────────────────
let directionsApiCalls = 0;

// Map user modes to OSRM profiles
const getModeProfile = (mode) => {
  const modeMap = {
    walking: 'foot',
    driving: 'car',
    bicycling: 'bike',
    transit: 'foot', // Fall back to foot for transit (OSRM doesn't have public transit)
  };
  return modeMap[mode] || 'foot';
};

// ─── GET /api/directions ─────────────────────────────────────────────────────
// Query params: origin_lat, origin_lng, dest_lat, dest_lng, mode?, waypoints?
router.get('/', async (req, res) => {
  try {
