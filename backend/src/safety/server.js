/**
 * Safe Night Home — Safety Compute Service
 *
 * CPU-intensive service that handles:
 * - A* pathfinding with safety-weighted cost function
 * - Overpass API data fetching (roads, lights, CCTV, transit)
 * - UK Police crime data with severity weighting
 * - Pre-computed coverage maps (lighting, crime density)
 * - K-diverse route computation with iterative penalty
 *
 * This service is CPU-bound and benefits from running on a
 * dedicated instance separate from the lightweight API gateway.
 *
 * Optimisations:
 * - Request coalescing (identical concurrent requests share computation)
 * - 5-minute route cache
 * - 30-minute Overpass data cache
 * - 24-hour crime data cache
 * - Spatial grid indexing with O(1) lookups
 * - Float32Array coverage maps (~25m cell resolution)
 */

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');

const { createCorsMiddleware } = require('../shared/middleware/cors');
const { createRateLimiter } = require('../shared/middleware/rateLimiter');
const { errorHandler } = require('../shared/middleware/errorHandler');
const { healthCheck } = require('../shared/middleware/healthCheck');

const safeRoutesRouter = require('./routes/safeRoutes');

const app = express();
const PORT = process.env.PORT || 3002;

// ─── Security headers ───────────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ────────────────────────────────────────────────────────────────────
app.use(createCorsMiddleware());

// ─── Rate limiting — 60 req / 15 min (lower: expensive operations) ──────────
app.use('/api/', createRateLimiter({ windowMs: 15 * 60 * 1000, max: 60 }));

// ─── Body parser ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/safe-routes', safeRoutesRouter);

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/api/health', healthCheck('safety-service'));

// ─── Error handler ───────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[safety] Safety Compute Service running on http://0.0.0.0:${PORT}`);
  console.log(`[safety] Routes: safe-routes (A* pathfinding)`);
  console.log(`[safety] Rate limit: 60 req / 15 min per IP`);
});
