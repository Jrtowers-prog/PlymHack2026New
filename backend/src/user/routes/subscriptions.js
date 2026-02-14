/**
 * subscriptions.js — Subscription management routes.
 *
 * GET  /api/subscriptions/tiers       — Get all tier info + features (public, for pricing page)
 * GET  /api/subscriptions/my-tier     — Get current user's tier + all feature limits
 * GET  /api/subscriptions/check/:feature — Check a specific feature's limit + usage
 * POST /api/subscriptions/upgrade     — Upgrade subscription (placeholder for payment)
 * POST /api/subscriptions/cancel      — Cancel subscription
 * POST /api/subscriptions/webhook     — Payment provider webhook (Stripe / RevenueCat)
 */

const express = require('express');
const { supabase } = require('../lib/supabase');
const { requireAuth } = require('../middleware/authMiddleware');
const { attachSubscription } = require('../middleware/subscriptionMiddleware');
const {
  getAllTiers,
  getTierFeatures,
  getFeatureLimit,
  getWindowStart,
  FEATURE_LIMITS,
  TIER_RANK,
} = require('../lib/subscriptionConfig');

const router = express.Router();

// ─── GET /api/subscriptions/tiers ────────────────────────────────────────────
// Public — returns all tier definitions + feature limits for pricing page.
router.get('/tiers', (_req, res) => {
  res.json(getAllTiers());
});

// ─── GET /api/subscriptions/my-tier ──────────────────────────────────────────
// Returns the user's current tier, subscription details, and all feature
// limits with current usage counts.
router.get('/my-tier', requireAuth, attachSubscription, async (req, res, next) => {
  try {
    const tier = req.subscription.tier;
    const features = getTierFeatures(tier);

    // Enrich each feature with current usage count
    const enriched = {};
    for (const [key, feat] of Object.entries(features)) {
      let used = 0;

      if (!feat.enabled || feat.unlimited) {
        enriched[key] = { ...feat, used, remaining: feat.unlimited ? -1 : 0 };
        continue;
      }

      // Count usage for this feature
      try {
        used = await countUsage(req.user.id, key, feat);
      } catch {
        // If count fails, report 0
      }

      enriched[key] = {
        ...feat,
        used,
        remaining: Math.max(0, feat.limit - used),
      };
    }

    // Get subscription record details
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('id, tier, status, started_at, expires_at, cancelled_at')
      .eq('user_id', req.user.id)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    res.json({
      tier,
      rank: TIER_RANK[tier] ?? 0,
      subscription: sub || { tier: 'free', status: 'active' },
      features: enriched,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/subscriptions/check/:feature ───────────────────────────────────
// Quick single-feature check — returns limit, used, remaining, and whether
// the action is allowed. Frontend calls this before gated actions.
router.get('/check/:feature', requireAuth, attachSubscription, async (req, res, next) => {
  try {
    const { feature } = req.params;
    const tier = req.subscription.tier;
    const config = getFeatureLimit(feature, tier);

    if (!config) {
      return res.status(404).json({ error: `Unknown feature: ${feature}` });
    }

    if (config.limit === 0) {
      return res.json({
        feature,
        tier,
        allowed: false,
        limit: 0,
        used: 0,
        remaining: 0,
        reason: 'upgrade_required',
      });
    }

    if (config.limit === -1) {
      return res.json({
        feature,
        tier,
        allowed: true,
        limit: -1,
        used: 0,
        remaining: -1,
        unlimited: true,
      });
    }

    const featureInfo = FEATURE_LIMITS[feature];
    const used = await countUsage(req.user.id, feature, {
      limit: config.limit,
      per: config.per || null,
    });

    const remaining = Math.max(0, config.limit - used);

    res.json({
      feature,
      tier,
      allowed: remaining > 0,
      limit: config.limit,
      used,
      remaining,
      per: config.per || null,
      resets_at: config.per ? getNextReset(config.per) : null,
      description: featureInfo?.description || feature,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/subscriptions/upgrade ─────────────────────────────────────────
// Upgrade the user's subscription tier.
// In production, this would verify payment with Stripe/RevenueCat first.
// For now, accepts a tier + payment_ref and upgrades immediately.
router.post('/upgrade', requireAuth, async (req, res, next) => {
  try {
    const { tier, payment_ref } = req.body;

    if (!tier || !['pro', 'premium'].includes(tier)) {
      return res.status(400).json({ error: 'Tier must be "pro" or "premium"' });
    }

    // Expire current active subscription
    await supabase
      .from('subscriptions')
      .update({
        status: 'expired',
        cancelled_at: new Date().toISOString(),
      })
      .eq('user_id', req.user.id)
      .eq('status', 'active');

    // Calculate expiry (30 days from now for monthly)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Create new subscription
    const { data: newSub, error } = await supabase
      .from('subscriptions')
      .insert({
        user_id: req.user.id,
        tier,
        status: 'active',
        started_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        payment_ref: payment_ref || null,
      })
      .select()
      .single();

    if (error) throw error;

    // Update denormalized field on profile
    await supabase
      .from('profiles')
      .update({ subscription: tier })
      .eq('id', req.user.id);

    // Log upgrade event
    await supabase.from('usage_events').insert({
      user_id: req.user.id,
      event_type: 'subscription_upgrade',
      value_text: tier,
    });

    res.json({
      message: `Upgraded to ${tier}`,
      subscription: newSub,
      features: getTierFeatures(tier),
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/subscriptions/cancel ──────────────────────────────────────────
// Cancel the active subscription. Reverts to free at end of billing period.
router.post('/cancel', requireAuth, async (req, res, next) => {
  try {
    const { data: activeSub } = await supabase
      .from('subscriptions')
      .select('id, tier, expires_at')
      .eq('user_id', req.user.id)
      .eq('status', 'active')
      .neq('tier', 'free')
      .maybeSingle();

    if (!activeSub) {
      return res.status(400).json({ error: 'No active paid subscription to cancel' });
    }

    // Mark as cancelled (still active until expires_at)
    await supabase
      .from('subscriptions')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', activeSub.id);

    // Revert to free immediately (or at expiry — your choice)
    // For now: revert immediately
    await supabase
      .from('profiles')
      .update({ subscription: 'free' })
      .eq('id', req.user.id);

    // Create a new free subscription
    await supabase.from('subscriptions').insert({
      user_id: req.user.id,
      tier: 'free',
      status: 'active',
    });

    // Log cancellation
    await supabase.from('usage_events').insert({
      user_id: req.user.id,
      event_type: 'subscription_cancel',
      value_text: activeSub.tier,
    });

    res.json({ message: 'Subscription cancelled. Reverted to free plan.' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/subscriptions/webhook ─────────────────────────────────────────
// Payment provider webhook (Stripe / RevenueCat).
// Placeholder — implement verification + signature checking for your provider.
router.post('/webhook', async (req, res, next) => {
  try {
    // TODO: Verify webhook signature from payment provider
    // TODO: Handle events: payment_succeeded, subscription_renewed,
    //       subscription_expired, payment_failed, refund
    const { event, user_id, tier, payment_ref } = req.body;

    console.log(`[subscriptions] Webhook received: ${event} for user ${user_id}`);

    // For now, just acknowledge
    res.json({ received: true });
  } catch (err) {
    next(err);
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function countUsage(userId, feature, config) {
  const featureConfig = FEATURE_LIMITS[feature];
  const windowStart = config.per ? getWindowStart(config.per) : null;

  if (featureConfig?.count_table === 'emergency_contacts') {
    const { count } = await supabase
      .from('emergency_contacts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'accepted')
      .or(`user_id.eq.${userId},contact_id.eq.${userId}`);
    return count || 0;
  }

  if (featureConfig?.count_table === 'live_sessions') {
    let query = supabase
      .from('live_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (windowStart) query = query.gte('started_at', windowStart);
    const { count } = await query;
    return count || 0;
  }

  if (featureConfig?.count_table === 'safety_reports') {
    let query = supabase
      .from('safety_reports')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (windowStart) query = query.gte('created_at', windowStart);
    const { count } = await query;
    return count || 0;
  }

  const eventType = featureConfig?.usage_event || feature;
  let query = supabase
    .from('usage_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('event_type', eventType);
  if (windowStart) query = query.gte('created_at', windowStart);
  const { count } = await query;
  return count || 0;
}

function getNextReset(per) {
  const now = new Date();
  switch (per) {
    case 'day':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
    case 'month':
      return new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    case 'year':
      return new Date(now.getFullYear() + 1, 0, 1).toISOString();
    default:
      return null;
  }
}

module.exports = router;
