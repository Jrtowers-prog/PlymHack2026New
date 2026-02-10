/**
 * routes/nearby.js — Proxy endpoint for nearby places via Overpass (OSM).
 *
 * 100% FREE — no API key needed. Uses Overpass API to find amenities,
 * shops, and leisure places with human activity.
 *
 * Rate limit: 5 requests per minute (enforced server-side).
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  validateLatitude,
  validateLongitude,
  validatePositiveNumber,
} = require('../validate');

const router = express.Router();

const OVERPASS_URL = process.env.OVERPASS_API_URL || 'https://overpass-api.de/api/interpreter';

// ─── Rate limiter: 30 nearby-search requests per minute per IP ─────────
const nearbyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Nearby search rate limit exceeded — max 30 per minute.' },
});

// ─── In-memory cache ─────────────────────────────────────────────────────────
const nearbyCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 200;

let overpassCalls = 0;
let backendCacheHits = 0;
let totalRequests = 0;

const cacheKey = (lat, lng, radius) =>
  `${Number(lat).toFixed(3)},${Number(lng).toFixed(3)},${radius}`;

const pruneCache = () => {
  const now = Date.now();
  for (const [key, entry] of nearbyCache) {
    if (now - entry.timestamp > CACHE_TTL_MS) nearbyCache.delete(key);
  }
  if (nearbyCache.size > MAX_CACHE_SIZE) {
    const entries = [...nearbyCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (let i = 0; i < entries.length / 2; i++) nearbyCache.delete(entries[i][0]);
