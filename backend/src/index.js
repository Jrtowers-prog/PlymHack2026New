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
const explainRouter = require('./routes/explain');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── 1. Security headers ────────────────────────────────────────────────────
app.use(helmet());

// ─── 2. CORS — restrict to allowed origins ──────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    methods: ['GET'],
    optionsSuccessStatus: 200,
  })
);

// ─── 3. Rate limiting — 100 requests per 15 minutes per IP ─────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again later.' },
});
app.use('/api/', limiter);

// ─── 4. Body parser (not strictly needed for GET-only, but good practice) ───
app.use(express.json({ limit: '10kb' }));

// ─── 5. Routes ──────────────────────────────────────────────────────────────
app.use('/api/places', placesRouter);
app.use('/api/directions', directionsRouter);
app.use('/api/staticmap', staticmapRouter);
app.use('/api/safe-routes', safeRoutesRouter);
app.use('/api', explainRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── 6. Global error handler ────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[server] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Backend proxy running on http://0.0.0.0:${PORT}`);
  console.log(`   CORS origins: ${allowedOrigins.length > 0 ? allowedOrigins.join(', ') : '(any)'}`);
  console.log(`   Rate limit: 100 req / 15 min per IP`);
});
