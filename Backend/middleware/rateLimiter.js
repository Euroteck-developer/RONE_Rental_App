const { query } = require('../config/database');

const getClientIdentifier = (req) => {
  // After login, use user ID. Before login (auth routes), use IP
  if (req.user && req.user.id) return `user:${req.user.id}`;
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? forwarded.split(',')[0].trim() : req.ip;
  return `ip:${ip}`;
};

const rateLimit = (options = {}) => {
  const {
    windowMs    = 900000, // 15 minutes
    maxRequests = 100,
    message     = 'Too many requests',
  } = options;

  return async (req, res, next) => {
    try {
      const identifier  = getClientIdentifier(req);
      const endpoint    = req.path;
      const windowStart = new Date(Date.now() - windowMs);

      // ── Step 1: Check if currently blocked AND still within window ──────────
      // Key fix: only honour blocked_until if the block was set in the current
      // window. If the window has rolled over, the block is stale — ignore it.
      const blockCheck = await query(
        `SELECT blocked_until, window_start
         FROM rate_limits
         WHERE identifier = $1 AND endpoint = $2
           AND blocked_until > NOW()
           AND window_start  > $3`,
        [identifier, endpoint, windowStart]
      );

      if (blockCheck.rows.length > 0) {
        const blockedUntil  = new Date(blockCheck.rows[0].blocked_until);
        const remainingTime = Math.ceil((blockedUntil - Date.now()) / 1000);
        return res.status(429).json({
          success:    false,
          error:      message,
          retryAfter: remainingTime,
        });
      }

      // ── Step 2: Upsert attempts, reset if window has expired ────────────────
      const result = await query(
        `INSERT INTO rate_limits (identifier, endpoint, attempts, window_start, blocked_until)
         VALUES ($1, $2, 1, NOW(), NULL)
         ON CONFLICT (identifier, endpoint)
         DO UPDATE SET
           attempts      = CASE
                             WHEN rate_limits.window_start < $3
                             THEN 1                            -- new window: reset
                             ELSE rate_limits.attempts + 1     -- same window: increment
                           END,
           window_start  = CASE
                             WHEN rate_limits.window_start < $3
                             THEN NOW()
                             ELSE rate_limits.window_start
                           END,
           blocked_until = CASE
                             WHEN rate_limits.window_start < $3
                             THEN NULL                         -- new window: clear block
                             ELSE rate_limits.blocked_until
                           END
         RETURNING attempts, window_start`,
        [identifier, endpoint, windowStart]
      );

      const { attempts } = result.rows[0];

      res.setHeader('X-RateLimit-Limit',     maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - attempts));

      // ── Step 3: Block if over limit ──────────────────────────────────────────
      if (attempts > maxRequests) {
        const blockedUntil = new Date(Date.now() + windowMs);

        await query(
          `UPDATE rate_limits
           SET blocked_until = $1
           WHERE identifier = $2 AND endpoint = $3`,
          [blockedUntil, identifier, endpoint]
        );

        const retryAfter = Math.ceil(windowMs / 1000);
        return res.status(429).json({
          success:    false,
          error:      message,
          retryAfter: retryAfter,
        });
      }

      next();
    } catch (error) {
      console.error('Rate limit error:', error);
      next(); // fail open — don't block users on DB errors
    }
  };
};

const strictRateLimit = rateLimit({
  windowMs:    900000, // 15 minutes
  maxRequests: 5,
  message:     'Too many login attempts. Please try again in 15 minutes.',
});

module.exports = { rateLimit, strictRateLimit };