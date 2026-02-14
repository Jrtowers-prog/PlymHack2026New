/**
 * usage.js — Usage tracking routes.
 *
 * POST /api/usage/track        — Log a usage event
 * GET  /api/usage/stats        — Get user's usage summary
 * GET  /api/usage/history      — Get recent usage events
 *
 * Event types:
 *   app_open             — value_text: app_version
 *   route_search         — value_num: distance_km, value_text: safety_score
 *   navigation_start     — value_num: distance_km, value_text: safety_score
 *   navigation_complete  — value_num: distance_km, value_text: duration_seconds
 *   navigation_abandon   — value_num: distance_completed_km, value_text: reason
 */

const express = require('express');
const { supabase } = require('../lib/supabase');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

// All usage routes require authentication
router.use(requireAuth);

const VALID_EVENTS = [
  'account_created',
  'app_open',
  'route_search',
  'navigation_start',
  'navigation_complete',
  'navigation_abandon',
  'subscription_upgrade',
  'subscription_cancel',
  'live_session',
];

// ─── POST /api/usage/track ──────────────────────────────────────────────────
router.post('/track', async (req, res, next) => {
  try {
    const { event_type, value_num, value_text } = req.body;

    if (!event_type || !VALID_EVENTS.includes(event_type)) {
      return res.status(400).json({
        error: `Invalid event_type. Must be one of: ${VALID_EVENTS.join(', ')}`,
      });
    }

    // Validate numeric value
    const numVal =
      value_num !== undefined && value_num !== null
        ? parseFloat(value_num)
        : null;
    if (numVal !== null && isNaN(numVal)) {
      return res.status(400).json({ error: 'value_num must be a number' });
    }

    // Validate text value (max 200 chars to keep rows tiny)
    const textVal =
      typeof value_text === 'string'
        ? value_text.trim().slice(0, 200)
        : null;

    const { error } = await supabase.from('usage_events').insert({
      user_id: req.user.id,
      event_type,
      value_num: numVal,
      value_text: textVal,
    });

    if (error) {
      console.error('[usage] Track error:', error.message);
      return res.status(500).json({ error: 'Failed to track event' });
    }

    // Update last_seen on profile
    await supabase
      .from('profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', req.user.id);

    res.json({ message: 'Event tracked' });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/usage/stats ───────────────────────────────────────────────────
// Returns aggregated usage counts for the authenticated user.
router.get('/stats', async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Count each event type
    const { data: events, error } = await supabase
      .from('usage_events')
      .select('event_type, value_num')
      .eq('user_id', userId);

    if (error) {
      console.error('[usage] Stats error:', error.message);
      return res.status(500).json({ error: 'Failed to fetch stats' });
    }

    const stats = {
      total_app_opens: 0,
      total_route_searches: 0,
      total_navigations_started: 0,
      total_navigations_completed: 0,
      total_navigations_abandoned: 0,
      total_distance_km: 0,
      completion_rate: 0,
    };

    for (const e of events) {
      switch (e.event_type) {
        case 'app_open':
          stats.total_app_opens++;
          break;
        case 'route_search':
          stats.total_route_searches++;
          break;
        case 'navigation_start':
          stats.total_navigations_started++;
          break;
        case 'navigation_complete':
          stats.total_navigations_completed++;
          if (e.value_num) stats.total_distance_km += e.value_num;
          break;
        case 'navigation_abandon':
          stats.total_navigations_abandoned++;
          break;
      }
    }

    // Completion rate
    const totalNav = stats.total_navigations_completed + stats.total_navigations_abandoned;
    stats.completion_rate =
      totalNav > 0
        ? Math.round((stats.total_navigations_completed / totalNav) * 100)
        : 0;

    // Round distance
    stats.total_distance_km = Math.round(stats.total_distance_km * 100) / 100;

    res.json(stats);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/usage/history ─────────────────────────────────────────────────
// Returns last 50 usage events for the authenticated user.
router.get('/history', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('usage_events')
      .select('id, event_type, value_num, value_text, created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[usage] History error:', error.message);
      return res.status(500).json({ error: 'Failed to fetch history' });
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
