/**
 * reviews.js — App review routes.
 *
 * POST /api/reviews           — Submit a review (1-5 rating + comment)
 * GET  /api/reviews           — Get all reviews (public)
 * GET  /api/reviews/summary   — Get average rating and count
 * GET  /api/reviews/mine      — Get current user's review
 * PUT  /api/reviews/:id       — Update own review
 * DELETE /api/reviews/:id     — Delete own review
 */

const express = require('express');
const { supabase } = require('../lib/supabase');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

const MAX_COMMENT = 1000;

// ─── POST /api/reviews ──────────────────────────────────────────────────────
// Submit a new review. One review per user (enforced).
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { rating, comment } = req.body;

    const ratingN = parseInt(rating);
    if (isNaN(ratingN) || ratingN < 1 || ratingN > 5) {
      return res.status(400).json({ error: 'Rating must be 1-5' });
    }

    const cleanComment =
      typeof comment === 'string'
        ? comment.trim().slice(0, MAX_COMMENT)
        : '';

    // Check for existing review
    const { data: existing } = await supabase
      .from('reviews')
      .select('id')
      .eq('user_id', req.user.id)
      .single();

    if (existing) {
      return res.status(409).json({
        error: 'You already have a review. Use PUT to update it.',
        review_id: existing.id,
      });
    }

    const { data, error } = await supabase
      .from('reviews')
      .insert({
        user_id: req.user.id,
        rating: ratingN,
        comment: cleanComment,
      })
      .select('id, rating, comment, created_at')
      .single();

    if (error) {
      console.error('[reviews] Insert error:', error.message);
      return res.status(500).json({ error: 'Failed to submit review' });
    }

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/reviews ───────────────────────────────────────────────────────
// Get all reviews (public). Includes user name from profiles.
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('id, rating, comment, created_at, profiles(name)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('[reviews] Fetch error:', error.message);
      return res.status(500).json({ error: 'Failed to fetch reviews' });
    }

    // Flatten profile name
    const reviews = data.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      created_at: r.created_at,
      user_name: r.profiles?.name || 'Anonymous',
    }));

    res.json(reviews);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/reviews/summary ───────────────────────────────────────────────
// Get average rating and total count.
router.get('/summary', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('reviews').select('rating');

    if (error) {
      console.error('[reviews] Summary error:', error.message);
      return res.status(500).json({ error: 'Failed to fetch summary' });
    }

    const count = data.length;
    const avg =
      count > 0
        ? Math.round((data.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10
        : 0;

    res.json({ average_rating: avg, total_reviews: count });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/reviews/mine ──────────────────────────────────────────────────
router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('id, rating, comment, created_at')
      .eq('user_id', req.user.id)
      .single();

    if (error || !data) {
      return res.json(null);
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/reviews/:id ───────────────────────────────────────────────────
// Update own review.
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;

    // Verify ownership
    const { data: existing } = await supabase
      .from('reviews')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!existing) {
      return res.status(404).json({ error: 'Review not found' });
    }
    if (existing.user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only update your own review' });
    }

    const updates = {};
    if (rating !== undefined) {
      const ratingN = parseInt(rating);
      if (isNaN(ratingN) || ratingN < 1 || ratingN > 5) {
        return res.status(400).json({ error: 'Rating must be 1-5' });
      }
      updates.rating = ratingN;
    }
    if (comment !== undefined) {
      updates.comment =
        typeof comment === 'string'
          ? comment.trim().slice(0, MAX_COMMENT)
          : '';
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const { data, error } = await supabase
      .from('reviews')
      .update(updates)
      .eq('id', id)
      .select('id, rating, comment, created_at')
      .single();

    if (error) {
      console.error('[reviews] Update error:', error.message);
      return res.status(500).json({ error: 'Failed to update review' });
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/reviews/:id ────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: existing } = await supabase
      .from('reviews')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!existing) {
      return res.status(404).json({ error: 'Review not found' });
    }
    if (existing.user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own review' });
    }

    const { error } = await supabase.from('reviews').delete().eq('id', id);

    if (error) {
      console.error('[reviews] Delete error:', error.message);
      return res.status(500).json({ error: 'Failed to delete review' });
    }

    res.json({ message: 'Review deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
