/**
 * Safe Night Home — Backend Proxy Server
 *
 * This Express server acts as a secure proxy for Google Maps API calls.
 *
 * Security measures:
 * 1. Google API key is stored ONLY on the server (never sent to the client)
 * 2. Helmet — sets security HTTP headers (XSS, Content-Type sniffing, etc.)
 * 3. CORS — only allows requests from whitelisted origins
 * 4. Rate limiting — prevents abuse (100 req/15 min per IP)
 * 5. Input validation — all query params are validated before forwarding
 * 6. No key in responses — API key is stripped; clients never see it
 */

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const placesRouter = require('./routes/places');
const directionsRouter = require('./routes/directions');
const staticmapRouter = require('./routes/staticmap');
const safeRoutesRouter = require('./routes/safeRoutes');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── 1. Security headers ────────────────────────────────────────────────────
app.use(helmet());

// ─── 2. CORS — restrict to allowed origins ──────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
