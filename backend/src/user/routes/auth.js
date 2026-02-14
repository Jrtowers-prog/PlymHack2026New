/**
 * auth.js — Authentication routes (magic link / passwordless).
 *
 * POST /api/auth/magic-link   — Send magic link email
 * POST /api/auth/verify       — Exchange OTP token for session
 * POST /api/auth/refresh       — Refresh expired access token
 * GET  /api/auth/me            — Get current user profile
 * POST /api/auth/update-profile — Update user name/platform/version
 * POST /api/auth/logout        — Sign out (invalidate token)
 */

const express = require('express');
const { supabase } = require('../lib/supabase');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

// ─── Validation helpers ──────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME = 100;
const VALID_PLATFORMS = ['android', 'ios', 'web'];

function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return EMAIL_RE.test(email.trim().toLowerCase());
}

// ─── POST /api/auth/magic-link ───────────────────────────────────────────────
// Send a passwordless magic link to the user's email.
// If the user doesn't exist, Supabase creates them automatically.
router.post('/magic-link', async (req, res, next) => {
  try {
    const { email, name } = req.body;

    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = typeof name === 'string' ? name.trim().slice(0, MAX_NAME) : '';

    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        data: { name: cleanName },
        shouldCreateUser: true,
      },
    });

    if (error) {
      console.error('[auth] Magic link error:', error.message);
      return res.status(400).json({ error: 'Failed to send magic link' });
    }

    res.json({ message: 'Magic link sent — check your email' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/verify ──────────────────────────────────────────────────
// Exchange OTP token (from magic link URL) for a session.
router.post('/verify', async (req, res, next) => {
  try {
    const { token, email } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token is required' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    const cleanEmail = email.trim().toLowerCase();

    const { data, error } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token,
      type: 'email',
    });

    if (error || !data.session) {
      console.error('[auth] Verify OTP error:', error?.message);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Update last_seen
    await supabase
      .from('profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', data.user.id);

    res.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      user: {
        id: data.user.id,
        email: data.user.email,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/refresh ─────────────────────────────────────────────────
// Refresh an expired access token using a refresh token.
router.post('/refresh', async (req, res, next) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token || typeof refresh_token !== 'string') {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token,
    });

    if (error || !data.session) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    res.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/auth/me ────────────────────────────────────────────────────────
// Get the current user's profile (requires auth).
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, platform, app_version, created_at, last_seen_at')
      .eq('id', req.user.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Update last_seen
    await supabase
      .from('profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', req.user.id);

    res.json({
      ...data,
      email: req.user.email,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/update-profile ──────────────────────────────────────────
// Update name, platform, app_version.
router.post('/update-profile', requireAuth, async (req, res, next) => {
  try {
    const updates = {};
    const { name, platform, app_version } = req.body;

    if (typeof name === 'string') {
      updates.name = name.trim().slice(0, MAX_NAME);
    }
    if (typeof platform === 'string' && VALID_PLATFORMS.includes(platform)) {
      updates.platform = platform;
    }
    if (typeof app_version === 'string' && app_version.length <= 20) {
      updates.app_version = app_version;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.last_seen_at = new Date().toISOString();

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', req.user.id);

    if (error) {
      console.error('[auth] Profile update error:', error.message);
      return res.status(500).json({ error: 'Failed to update profile' });
    }

    res.json({ message: 'Profile updated' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/logout ──────────────────────────────────────────────────
router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    // Server-side sign out — invalidates the user's session
    const { error } = await supabase.auth.admin.signOut(req.user.id);

    if (error) {
      console.error('[auth] Logout error:', error.message);
    }

    res.json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
