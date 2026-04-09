const { query, transaction } = require('../config/database');
const {
  hashPassword,
  comparePassword,
  validatePasswordStrength,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashToken,
  generateSecureToken
} = require('../utils/security');
const crypto = require('crypto');
const emailService  = require('../config/emailService');


const register = async (req, res) => {
  try {
    const { email, password, name, role = 'TENANT' } = req.body;

    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: 'Password requirements not met',
        details: passwordValidation.errors
      });
    }

    const existingUser = await query(
      'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'Email already exists' });
    }

    const passwordHash = await hashPassword(password);

    const result = await query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, role, created_at`,
      [email.toLowerCase(), passwordHash, name, role]
    );

    const user = result.rows[0];

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: { id: user.id, email: user.email, name: user.name, role: user.role }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const ipAddress = req.ip;

    const result = await query(
      `SELECT id, email, password_hash, name, role, is_active, failed_login_attempts, account_locked_until
       FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      await query(
        `INSERT INTO security_events (event_type, severity, ip_address, details)
         VALUES ($1, $2, $3, $4)`,
        ['FAILED_LOGIN', 'MEDIUM', ipAddress, JSON.stringify({ email })]
      );
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    if (user.account_locked_until && new Date(user.account_locked_until) > new Date()) {
      return res.status(403).json({ success: false, error: 'Account locked' });
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, error: 'Account deactivated' });
    }

    const isPasswordValid = await comparePassword(password, user.password_hash);

    if (!isPasswordValid) {
      const failedAttempts = user.failed_login_attempts + 1;
      const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5');

      if (failedAttempts >= maxAttempts) {
        const lockoutDuration = parseInt(process.env.ACCOUNT_LOCKOUT_DURATION_MINUTES || '30');
        const lockUntil = new Date(Date.now() + lockoutDuration * 60000);
        
        await query(
          `UPDATE users SET failed_login_attempts = $1, account_locked_until = $2 WHERE id = $3`,
          [failedAttempts, lockUntil, user.id]
        );

        return res.status(403).json({ success: false, error: 'Account locked due to failed attempts' });
      }

      await query('UPDATE users SET failed_login_attempts = $1 WHERE id = $2', [failedAttempts, user.id]);
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const accessToken = generateAccessToken(user.id, user.email, user.role);
    const refreshToken = generateRefreshToken(user.id);
    const refreshTokenHash = hashToken(refreshToken);

    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days')`,
      [user.id, refreshTokenHash, ipAddress, req.headers['user-agent']]
    );

    await query(
      `UPDATE users SET failed_login_attempts = 0, account_locked_until = NULL, 
       last_login_at = NOW(), last_login_ip = $1 WHERE id = $2`,
      [ipAddress, user.id]
    );

    res.json({
      success: true,
      data: {
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
};

const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, error: 'Refresh token required' });
    }

    const decoded = verifyRefreshToken(refreshToken);
    const tokenHash = hashToken(refreshToken);

    const result = await query(
      `SELECT rt.user_id, u.email, u.role, u.is_active
       FROM refresh_tokens rt
       JOIN users u ON rt.user_id = u.id
       WHERE rt.token_hash = $1 AND rt.expires_at > NOW() AND rt.revoked_at IS NULL`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid refresh token' });
    }

    const { user_id, email, role, is_active } = result.rows[0];

    if (!is_active) {
      return res.status(403).json({ success: false, error: 'Account deactivated' });
    }

    const newAccessToken = generateAccessToken(user_id, email, role);

    res.json({ success: true, data: { accessToken: newAccessToken } });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({ success: false, error: 'Token refresh failed' });
  }
};

// ── POST /api/auth/forgot-password ────────────────────────────
// Generates a 6-digit OTP, stores hash + expiry, sends via email
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string')
      return res.status(400).json({ success: false, error: 'Email is required' });

    const normalizedEmail = email.toLowerCase().trim();

    // ✅ NOW returns real error instead of generic response
    const userResult = await query(
      `SELECT id, name, email, is_active FROM users
       WHERE email = $1 AND deleted_at IS NULL`,
      [normalizedEmail]
    );

    if (!userResult.rows.length) {
      return res.status(404).json({
        success: false,
        error: 'No account found with this email address. Please check and try again.',
      });
    }

    const user = userResult.rows[0];

    if (!user.is_active)
      return res.status(403).json({
        success: false,
        error: 'Account deactivated. Please contact your administrator.',
      });

    // Rate-limit: max 3 OTP requests per 10 minutes per email
    const rateLimitResult = await query(
      `SELECT COUNT(*) FROM password_reset_otps
       WHERE email = $1 AND created_at > NOW() - INTERVAL '10 minutes'`,
      [normalizedEmail]
    );
    if (parseInt(rateLimitResult.rows[0].count, 10) >= 3) {
      return res.status(429).json({
        success: false,
        error: 'Too many OTP requests. Please wait 10 minutes before trying again.',
      });
    }

    const otpNumber = 100000 + crypto.randomInt(900000);
    const otp       = String(otpNumber);
    const otpHash   = crypto.createHash('sha256').update(otp).digest('hex');
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000);

    await query(
      `UPDATE password_reset_otps SET used = true WHERE email = $1 AND used = false`,
      [normalizedEmail]
    );

    await query(
      `INSERT INTO password_reset_otps (email, otp_hash, expires_at, user_id)
       VALUES ($1, $2, $3, $4)`,
      [normalizedEmail, otpHash, expiresAt, user.id]
    );

    try {
      await emailService.sendOTPEmail({
        to:            user.email,
        name:          user.name,
        otp,
        expiryMinutes: 2,
        ipAddress:     req.ip || null,
      });
    } catch (emailErr) {
      console.error('[forgotPassword] Email send failed:', emailErr.message);
      await query(
        `UPDATE password_reset_otps SET used = true WHERE email = $1 AND used = false`,
        [normalizedEmail]
      );
      return res.status(500).json({
        success: false,
        error: 'Failed to send OTP email. Please try again in a few minutes.',
      });
    }

    return res.json({
      success: true,
      message: 'OTP sent successfully. Please check your inbox.',
    });

  } catch (error) {
    console.error('forgotPassword error:', error);
    return res.status(500).json({ success: false, error: 'Failed to process request' });
  }
};

// ── POST /api/auth/verify-otp ─────────────────────────────────
// Verifies OTP and returns a short-lived reset token
const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp)
      return res.status(400).json({ success: false, error: 'Email and OTP are required' });

    const otpHash = crypto.createHash('sha256').update(String(otp)).digest('hex');

    const result = await query(
      `SELECT id, user_id FROM password_reset_otps
       WHERE email = $1
         AND otp_hash = $2
         AND expires_at > NOW()
         AND used = false
       ORDER BY created_at DESC
       LIMIT 1`,
      [email.toLowerCase().trim(), otpHash]
    );

    if (!result.rows.length) {
      // Track failed OTP attempts
      await query(
        `UPDATE password_reset_otps
         SET failed_attempts = COALESCE(failed_attempts, 0) + 1
         WHERE email = $1 AND used = false`,
        [email.toLowerCase()]
      );
      return res.status(400).json({ success: false, error: 'Invalid or expired OTP' });
    }

    const record = result.rows[0];

    // Mark OTP as used
    await query(
      `UPDATE password_reset_otps SET used = true WHERE id = $1`,
      [record.id]
    );

    // Generate a short-lived reset token (valid for 10 minutes)
    const resetToken     = generateSecureToken(32);
    const resetTokenHash = hashToken(resetToken);
    const resetExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, email, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [record.user_id, resetTokenHash, email.toLowerCase(), resetExpiresAt]
    );

    return res.json({
      success: true,
      message: 'OTP verified successfully',
      data: { resetToken },
    });
  } catch (error) {
    console.error('verifyOTP error:', error);
    return res.status(500).json({ success: false, error: 'OTP verification failed' });
  }
};

// ── POST /api/auth/reset-password ─────────────────────────────
// Validates reset token and updates password
const resetPassword = async (req, res) => {
  try {
    const { email, resetToken, newPassword } = req.body;
    if (!email || !resetToken || !newPassword)
      return res.status(400).json({ success: false, error: 'All fields are required' });

    // Validate password strength
    const validation = validatePasswordStrength(newPassword);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: 'Password requirements not met',
        details: validation.errors,
      });
    }

    const tokenHash = hashToken(resetToken);

    const tokenResult = await query(
      `SELECT prt.user_id, prt.id
       FROM password_reset_tokens prt
       WHERE prt.token_hash = $1
         AND prt.email      = $2
         AND prt.expires_at > NOW()
         AND prt.used       = false`,
      [tokenHash, email.toLowerCase().trim()]
    );

    if (!tokenResult.rows.length) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset session. Please start over.',
      });
    }

    const { user_id, id: tokenId } = tokenResult.rows[0];

    const passwordHash = await hashPassword(newPassword);

    // Update password + clear lockout
    await query(
      `UPDATE users
       SET password_hash          = $1,
           password_changed_at    = NOW(),
           failed_login_attempts  = 0,
           account_locked_until   = NULL,
           updated_at             = NOW()
       WHERE id = $2 AND deleted_at IS NULL`,
      [passwordHash, user_id]
    );

    // Mark reset token as used
    await query(
      `UPDATE password_reset_tokens SET used = true WHERE id = $1`,
      [tokenId]
    );

    // Revoke all existing refresh tokens (force re-login everywhere)
    await query(
      `UPDATE refresh_tokens SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [user_id]
    );

    return res.json({
      success: true,
      message: 'Password reset successfully. Please sign in with your new password.',
    });
  } catch (error) {
    console.error('resetPassword error:', error);
    return res.status(500).json({ success: false, error: 'Password reset failed' });
  }
};

const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1', [tokenHash]);
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, error: 'Logout failed' });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    const result = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const isValid = await comparePassword(currentPassword, result.rows[0].password_hash);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Current password incorrect' });
    }

    const validation = validatePasswordStrength(newPassword);
    if (!validation.isValid) {
      return res.status(400).json({ success: false, error: 'Password requirements not met', details: validation.errors });
    }

    const passwordHash = await hashPassword(newPassword);
    await query('UPDATE users SET password_hash = $1, password_changed_at = NOW() WHERE id = $2', [passwordHash, userId]);

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, error: 'Password change failed' });
  }
};

module.exports = { register, login, refreshAccessToken, logout, changePassword, forgotPassword, verifyOTP, resetPassword,  };