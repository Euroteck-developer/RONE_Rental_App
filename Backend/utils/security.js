const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
require('dotenv').config();

const SALT_ROUNDS = 12;

// Password hashing
const hashPassword = async (password) => {
  return await bcrypt.hash(password, SALT_ROUNDS);
};

const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

const validatePasswordStrength = (password) => {
  const minLength = parseInt(process.env.PASSWORD_MIN_LENGTH);
  const errors = [];

  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters`);
  }
  if (process.env.PASSWORD_REQUIRE_UPPERCASE === 'true' && !/[A-Z]/.test(password)) {
    errors.push('Must contain uppercase letter');
  }
  if (process.env.PASSWORD_REQUIRE_LOWERCASE === 'true' && !/[a-z]/.test(password)) {
    errors.push('Must contain lowercase letter');
  }
  if (process.env.PASSWORD_REQUIRE_NUMBERS === 'true' && !/\d/.test(password)) {
    errors.push('Must contain number');
  }
  if (process.env.PASSWORD_REQUIRE_SPECIAL === 'true' && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Must contain special character');
  }

  return { isValid: errors.length === 0, errors };
};

// JWT tokens
const generateAccessToken = (userId, email, role) => {
  return jwt.sign(
    { userId, email, role, type: 'access' },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
  );
};

const generateRefreshToken = (userId) => {
  return jwt.sign(
    { userId, type: 'refresh', tokenId: crypto.randomBytes(16).toString('hex') },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' }
  );
};

const verifyAccessToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    if (decoded.type !== 'access') throw new Error('Invalid token type');
    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') throw new Error('Token expired');
    throw new Error('Invalid token');
  }
};

const verifyRefreshToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    if (decoded.type !== 'refresh') throw new Error('Invalid token type');
    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') throw new Error('Refresh token expired');
    throw new Error('Invalid refresh token');
  }
};

// Token hashing
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

const generateSecureToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

// Encryption
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;

const encrypt = (text) => {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = crypto.pbkdf2Sync(process.env.ENCRYPTION_KEY, salt, 10000, 32, 'sha256');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  
  return Buffer.concat([salt, iv, tag, Buffer.from(encrypted, 'hex')]).toString('base64');
};

const decrypt = (encryptedData) => {
  const buffer = Buffer.from(encryptedData, 'base64');
  const salt = buffer.subarray(0, SALT_LENGTH);
  const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = buffer.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const encrypted = buffer.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  
  const key = crypto.pbkdf2Sync(process.env.ENCRYPTION_KEY, salt, 10000, 32, 'sha256');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  
  let decrypted = decipher.update(encrypted, undefined, 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

module.exports = {
  hashPassword,
  comparePassword,
  validatePasswordStrength,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  generateSecureToken,
  encrypt,
  decrypt
};