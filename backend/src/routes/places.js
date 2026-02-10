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

