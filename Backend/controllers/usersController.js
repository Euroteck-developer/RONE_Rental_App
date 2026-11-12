// const bcrypt = require('bcryptjs');
// const { v4: uuidv4 } = require('uuid');
// const { query } = require('../config/database');

// const VALID_ROLES = ['ADMIN', 'USER'];
// const VALID_DEPARTMENTS = ['R-ONE ACCOUNTS', 'R-ONE CRM', 'R-ONE AUDIT'];

// const sanitize = (val) => (typeof val === 'string' ? val.trim() : val);

// // ── GET /api/users ────────────────────────────────────────────
// exports.getAllUsers = async (req, res) => {
//   try {
//     const {
//       search, role, department, is_active,
//       page = 1, limit = 50,
//     } = req.query;

//     const params = [];
//     let idx = 1;
//     let where = `WHERE deleted_at IS NULL`;

//     if (search) {
//       where += ` AND (name ILIKE $${idx} OR email ILIKE $${idx} OR department ILIKE $${idx})`;
//       params.push(`%${sanitize(search)}%`);
//       idx++;
//     }
//     // getAllUsers intentionally includes SUPERADMIN in results (list view)
//     if (role && [...VALID_ROLES, 'SUPERADMIN'].includes(role)) {
//       where += ` AND role = $${idx}`;
//       params.push(role);
//       idx++;
//     }
//     if (department && VALID_DEPARTMENTS.includes(department)) {
//       where += ` AND department = $${idx}`;
//       params.push(department);
//       idx++;
//     }
//     if (is_active !== undefined) {
//       where += ` AND is_active = $${idx}`;
//       params.push(is_active === 'true');
//       idx++;
//     }

//     const countResult = await query(`SELECT COUNT(*) FROM users ${where}`, params);
//     const total = parseInt(countResult.rows[0].count, 10);

//     const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
//     const dataResult = await query(
//       `SELECT id, name, email, phone, role, department,
//               is_active, is_email_verified, last_login_at, created_at, updated_at
//        FROM users ${where}
//        ORDER BY created_at DESC
//        LIMIT $${idx} OFFSET $${idx + 1}`,
//       [...params, parseInt(limit, 10), offset]
//     );

//     return res.status(200).json({
//       success: true,
//       data: dataResult.rows,
//       pagination: {
//         total,
//         page: parseInt(page, 10),
//         limit: parseInt(limit, 10),
//         total_pages: Math.ceil(total / parseInt(limit, 10)),
//       },
//     });
//   } catch (error) {
//     console.error('getAllUsers error:', error);
//     return res.status(500).json({ success: false, error: 'Internal server error' });
//   }
// };

// // ── GET /api/users/:id ────────────────────────────────────────
// exports.getUserById = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const result = await query(
//       `SELECT id, name, email, phone, role, department,
//               is_active, is_email_verified, last_login_at, created_at, updated_at
//        FROM users WHERE id = $1 AND deleted_at IS NULL`,
//       [id]
//     );
//     if (!result.rows.length)
//       return res.status(404).json({ success: false, error: 'User not found' });

//     return res.status(200).json({ success: true, data: result.rows[0] });
//   } catch (error) {
//     console.error('getUserById error:', error);
//     return res.status(500).json({ success: false, error: 'Internal server error' });
//   }
// };

// // ── POST /api/users ───────────────────────────────────────────
// exports.createUser = async (req, res) => {
//   try {
//     let { name, email, phone, role, department, password } = req.body;

//     name       = sanitize(name);
//     email      = sanitize(email)?.toLowerCase();
//     phone      = sanitize(phone) || null;
//     role       = sanitize(role);
//     department = sanitize(department) || null;

//     const errors = {};

//     if (!name || name.length < 2)
//       errors.name = 'Full name must be at least 2 characters.';
//     if (!email)
//       errors.email = 'Email address is required.';
//     else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
//       errors.email = 'Invalid email format.';
//     if (phone && !/^\+?[\d\s\-()\\.]{7,20}$/.test(phone))
//       errors.phone = 'Invalid mobile number format.';
//     if (!role || !VALID_ROLES.includes(role))
//       errors.role = `Role must be one of: ${VALID_ROLES.join(', ')}.`;
//     if (department && !VALID_DEPARTMENTS.includes(department))
//       errors.department = 'Invalid department selected.';
//     if (!password)
//       errors.password = 'Password is required.';
//     else if (password.length < 8)
//       errors.password = 'Password must be at least 8 characters.';
//     else if (!/[A-Z]/.test(password))
//       errors.password = 'Password must contain at least one uppercase letter.';
//     else if (!/[a-z]/.test(password))
//       errors.password = 'Password must contain at least one lowercase letter.';
//     else if (!/\d/.test(password))
//       errors.password = 'Password must contain at least one number.';
//     else if (!/[!@#$%^&*(),.?":{}|<>]/.test(password))
//       errors.password = 'Password must contain at least one special character.';

//     if (Object.keys(errors).length)
//       return res.status(422).json({ success: false, error: 'Validation failed', errors });

//     const existing = await query(
//       `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`,
//       [email]
//     );
//     if (existing.rows.length)
//       return res.status(409).json({ success: false, error: 'Email address is already in use' });

//     const password_hash = await bcrypt.hash(password, 12);
//     const result = await query(
//       `INSERT INTO users
//          (id, name, email, phone, role, department, password_hash,
//           is_active, is_email_verified, created_at, updated_at)
//        VALUES ($1,$2,$3,$4,$5,$6,$7, true, false, NOW(), NOW())
//        RETURNING id, name, email, phone, role, department, is_active, created_at`,
//       [uuidv4(), name, email, phone, role, department, password_hash]
//     );

//     return res.status(201).json({
//       success: true,
//       message: 'User created successfully',
//       data: result.rows[0],
//     });
//   } catch (error) {
//     console.error('createUser error:', error);
//     return res.status(500).json({ success: false, error: 'Internal server error' });
//   }
// };

// // ── PUT /api/users/:id ────────────────────────────────────────
// // ── PUT /api/users/:id ────────────────────────────────────────
// exports.updateUser = async (req, res) => {
//   try {
//     const { id }        = req.params;
//     const requesterId   = req.user.id;
//     const requesterRole = req.user.role;
//     const isSelfEdit    = id === requesterId;

//     // ── Fetch the target user — MUST include is_active ────────
//     // BUG WAS HERE: previous query only selected `id, role`
//     // so existing.rows[0].is_active was undefined, causing
//     // the account to be deactivated on every self-edit save.
//     const existing = await query(
//       `SELECT id, role, is_active FROM users WHERE id = $1 AND deleted_at IS NULL`,
//       [id]
//     );
//     if (!existing.rows.length)
//       return res.status(404).json({ success: false, error: 'User not found' });

//     const targetRole     = existing.rows[0].role;
//     const currentActive  = existing.rows[0].is_active; // now correctly populated

//     // ── Permission guard ──────────────────────────────────────
//     // SUPERADMIN cannot edit another SUPERADMIN (only themselves)
//     if (targetRole === 'SUPERADMIN' && !isSelfEdit) {
//       return res.status(403).json({
//         success: false,
//         error: 'You cannot modify another Super Admin account',
//       });
//     }

//     let { name, email, phone, department, role, is_active } = req.body;

//     name       = sanitize(name);
//     email      = sanitize(email)?.toLowerCase();
//     phone      = sanitize(phone) || null;
//     department = sanitize(department) || null;

//     // ── Validation ────────────────────────────────────────────
//     const errors = {};

//     if (!name || name.length < 2)
//       errors.name = 'Full name must be at least 2 characters.';

//     if (!email)
//       errors.email = 'Email address is required.';
//     else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
//       errors.email = 'Invalid email format.';

//     if (phone && !/^\+?[\d\s\-()\\.]{7,20}$/.test(phone))
//       errors.phone = 'Invalid mobile number format.';

//     if (department && !VALID_DEPARTMENTS.includes(department))
//       errors.department = 'Invalid department selected.';

//     /*
//      * Role validation ONLY when all three conditions are met:
//      *   1. Not editing self         — nobody can change their own role
//      *   2. Target is not SUPERADMIN — cannot reassign superadmin role
//      *   3. Requester is SUPERADMIN  — only SA can change roles
//      */
//     const allowRoleChange =
//       !isSelfEdit &&
//       targetRole !== 'SUPERADMIN' &&
//       requesterRole === 'SUPERADMIN';

//     if (allowRoleChange) {
//       role = sanitize(role);
//       if (!role || !VALID_ROLES.includes(role))
//         errors.role = `Role must be one of: ${VALID_ROLES.join(', ')}.`;
//     }

//     if (Object.keys(errors).length)
//       return res.status(422).json({ success: false, error: 'Validation failed', errors });

//     // ── Duplicate email check (exclude self) ──────────────────
//     const dup = await query(
//       `SELECT id FROM users WHERE email = $1 AND id <> $2 AND deleted_at IS NULL`,
//       [email, id]
//     );
//     if (dup.rows.length)
//       return res.status(409).json({ success: false, error: 'Email address is already in use' });

//     /*
//      * Determine final role and is_active values:
//      *
//      * Self-edit (any role including SUPERADMIN):
//      *   → finalRole     = current DB value  (unchanged)
//      *   → finalIsActive = current DB value  (unchanged — was undefined before fix)
//      *
//      * SUPERADMIN editing ADMIN/USER:
//      *   → finalRole     = validated role from payload
//      *   → finalIsActive = is_active from payload (default true if omitted)
//      */
//     const finalRole     = allowRoleChange ? role        : targetRole;
//     const finalIsActive = allowRoleChange ? (is_active ?? true) : currentActive;

//     // ── Update ────────────────────────────────────────────────
//     const result = await query(
//       `UPDATE users
//        SET name       = $1,
//            email      = $2,
//            phone      = $3,
//            department = $4,
//            role       = $5,
//            is_active  = $6,
//            updated_at = NOW()
//        WHERE id = $7 AND deleted_at IS NULL
//        RETURNING id, name, email, phone, role, department, is_active, updated_at`,
//       [name, email, phone, department, finalRole, finalIsActive, id]
//     );

//     return res.status(200).json({
//       success: true,
//       message: 'User updated successfully',
//       data: result.rows[0],
//     });
//   } catch (error) {
//     console.error('updateUser error:', error);
//     return res.status(500).json({ success: false, error: 'Internal server error' });
//   }
// };

// // ── DELETE /api/users/:id ─────────────────────────────────────
// exports.deleteUser = async (req, res) => {
//   try {
//     const { id }      = req.params;
//     const requesterId = req.user.id;

//     if (id === requesterId)
//       return res.status(400).json({ success: false, error: 'You cannot delete your own account' });

//     // Prevent deleting another SUPERADMIN
//     const target = await query(
//       `SELECT role FROM users WHERE id = $1 AND deleted_at IS NULL`,
//       [id]
//     );
//     if (!target.rows.length)
//       return res.status(404).json({ success: false, error: 'User not found' });
//     if (target.rows[0].role === 'SUPERADMIN')
//       return res.status(403).json({ success: false, error: 'Cannot delete a Super Admin account' });

//     await query(
//       `UPDATE users SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
//       [id]
//     );

//     return res.status(200).json({ success: true, message: 'User deleted successfully' });
//   } catch (error) {
//     console.error('deleteUser error:', error);
//     return res.status(500).json({ success: false, error: 'Internal server error' });
//   }
// };

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('../config/database');
const {
  sendWelcomeEmail,
} = require('../config/emailService');

const VALID_ROLES       = ['ADMIN', 'USER'];
const VALID_DEPARTMENTS = ['R-ONE ACCOUNTS', 'R-ONE CRM', 'R-ONE AUDIT'];

const sanitize = (val) => (typeof val === 'string' ? val.trim() : val);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Quote a SQL identifier (names come from pg_catalog, never from user input)
const qi = (name) => `"${String(name).replace(/"/g, '""')}"`;

// Tables whose rows belong to the user's login session / password reset
const AUTH_TABLES = new Set(['refresh_tokens', 'password_reset_otps', 'password_reset_tokens']);
// Log tables — detached (user_id = NULL) on hard delete
const LOG_TABLES  = new Set(['audit_logs', 'security_events']);

/*
 * Discover every FK column that references users(id) straight from the live
 * database, so the delete logic stays correct even if prod schema drifts from
 * schema.sql. Cached for the process lifetime.
 */
let userFkCache = null;
const getUserForeignKeys = async (client) => {
  if (userFkCache) return userFkCache;
  const r = await client.query(
    `SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
     FROM pg_constraint c
     JOIN pg_attribute a
       ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.contype = 'f'
       AND c.confrelid = 'users'::regclass
       AND c.conrelid <> 'users'::regclass`
  );
  const groups = { auth: [], logs: [], business: [] };
  for (const row of r.rows) {
    const tbl = row.tbl.replace(/^public\./, '').replace(/"/g, '');
    const entry = { tbl, col: row.col };
    if (AUTH_TABLES.has(tbl))     groups.auth.push(entry);
    else if (LOG_TABLES.has(tbl)) groups.logs.push(entry);
    else                          groups.business.push(entry);
  }
  userFkCache = groups;
  return groups;
};


// ── GET /api/users ─────────────────────────────────────────────────────────────
exports.getAllUsers = async (req, res) => {
  try {
    const {
      search, role, department, is_active,
      page = 1, limit = 50,
    } = req.query;

    const params = [];
    let idx   = 1;
    let where = `WHERE deleted_at IS NULL`;

    if (search) {
      where += ` AND (name ILIKE $${idx} OR email ILIKE $${idx} OR department ILIKE $${idx})`;
      params.push(`%${sanitize(search)}%`);
      idx++;
    }
    // getAllUsers intentionally includes SUPERADMIN in results (list view)
    if (role && [...VALID_ROLES, 'SUPERADMIN'].includes(role)) {
      where += ` AND role = $${idx}`;
      params.push(role);
      idx++;
    }
    if (department && VALID_DEPARTMENTS.includes(department)) {
      where += ` AND department = $${idx}`;
      params.push(department);
      idx++;
    }
    if (is_active !== undefined) {
      where += ` AND is_active = $${idx}`;
      params.push(is_active === 'true');
      idx++;
    }

    const countResult = await query(
      `SELECT COUNT(*) FROM users ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const dataResult = await query(
      `SELECT id, name, email, phone, role, department,
              is_active, is_email_verified, last_login_at, created_at, updated_at
       FROM users ${where}
       ORDER BY created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, parseInt(limit, 10), offset]
    );

    return res.status(200).json({
      success: true,
      data: dataResult.rows,
      pagination: {
        total,
        page:        parseInt(page,  10),
        limit:       parseInt(limit, 10),
        total_pages: Math.ceil(total / parseInt(limit, 10)),
      },
    });
  } catch (error) {
    console.error('getAllUsers error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};


// ── GET /api/users/:id ─────────────────────────────────────────────────────────
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT id, name, email, phone, role, department,
              is_active, is_email_verified, last_login_at, created_at, updated_at
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (!result.rows.length)
      return res.status(404).json({ success: false, error: 'User not found' });

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('getUserById error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};


// ── POST /api/users ────────────────────────────────────────────────────────────
exports.createUser = async (req, res) => {
  try {
    let { name, email, phone, role, department, password } = req.body;

    name       = sanitize(name);
    email      = sanitize(email)?.toLowerCase();
    phone      = sanitize(phone) || null;
    role       = sanitize(role);
    department = sanitize(department) || null;

    // ── Validation ──────────────────────────────────────────────────────────
    const errors = {};

    if (!name || name.length < 2)
      errors.name = 'Full name must be at least 2 characters.';

    if (!email)
      errors.email = 'Email address is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errors.email = 'Invalid email format.';

    if (phone && !/^\+?[\d\s\-()\\.]{7,20}$/.test(phone))
      errors.phone = 'Invalid mobile number format.';

    if (!role || !VALID_ROLES.includes(role))
      errors.role = `Role must be one of: ${VALID_ROLES.join(', ')}.`;

    if (department && !VALID_DEPARTMENTS.includes(department))
      errors.department = 'Invalid department selected.';

    if (!password)
      errors.password = 'Password is required.';
    else if (password.length < 8)
      errors.password = 'Password must be at least 8 characters.';
    else if (!/[A-Z]/.test(password))
      errors.password = 'Password must contain at least one uppercase letter.';
    else if (!/[a-z]/.test(password))
      errors.password = 'Password must contain at least one lowercase letter.';
    else if (!/\d/.test(password))
      errors.password = 'Password must contain at least one number.';
    else if (!/[!@#$%^&*(),.?":{}|<>]/.test(password))
      errors.password = 'Password must contain at least one special character.';

    if (Object.keys(errors).length)
      return res.status(422).json({ success: false, error: 'Validation failed', errors });

    // ── Duplicate email check ───────────────────────────────────────────────
    const existing = await query(
      `SELECT id FROM users WHERE LOWER(TRIM(email)) = $1 AND deleted_at IS NULL`,
      [email]
    );
    if (existing.rows.length)
      return res.status(409).json({ success: false, error: 'Email address is already in use' });

    // ── Insert ──────────────────────────────────────────────────────────────
    // IMPORTANT: capture plain password BEFORE hashing — needed for welcome email
    const plainPassword = password;
    const password_hash = await bcrypt.hash(password, 12);

    const result = await query(
      `INSERT INTO users
         (id, name, email, phone, role, department, password_hash,
          is_active, is_email_verified, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, true, false, NOW(), NOW())
       RETURNING id, name, email, phone, role, department, is_active, created_at`,
      [uuidv4(), name, email, phone, role, department, password_hash]
    );

    // ── Send welcome email ──────────────────────────────────────────────────
    // Non-blocking: a mail failure must NOT cause the API to return 500.
    // The user is already created in DB; we just log the email error.
    sendWelcomeEmail({
      to:         email,
      name,
      email,
      password:   plainPassword,
      role,
      department,
    }).catch((err) => {
      console.error('[createUser] Welcome email failed (non-fatal):', err.message);
      // Persist the failure so it is visible outside the server console
      query(
        `INSERT INTO security_events (event_type, severity, user_id, ip_address, details)
         VALUES ('WELCOME_EMAIL_FAILED', 'MEDIUM', $1, $2, $3)`,
        [result.rows[0].id, req.ip || null, JSON.stringify({ email, error: err.message })]
      ).catch(() => {});
    });

    return res.status(201).json({
      success: true,
      message: 'User created successfully',
      data:    result.rows[0],
    });
  } catch (error) {
    console.error('createUser error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};


// ── PUT /api/users/:id ─────────────────────────────────────────────────────────
exports.updateUser = async (req, res) => {
  try {
    const { id }        = req.params;
    const requesterId   = req.user.id;
    const requesterRole = req.user.role;
    const isSelfEdit    = id === requesterId;

    // ── Fetch target user — must include is_active ──────────────────────────
    // BUG FIX: old query only selected `id, role`, so is_active came back as
    // undefined and the account was silently deactivated on every self-edit save.
    const existing = await query(
      `SELECT id, role, is_active FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (!existing.rows.length)
      return res.status(404).json({ success: false, error: 'User not found' });

    const targetRole    = existing.rows[0].role;
    const currentActive = existing.rows[0].is_active; // now correctly populated

    // ── Permission guard ────────────────────────────────────────────────────
    if (targetRole === 'SUPERADMIN' && !isSelfEdit) {
      return res.status(403).json({
        success: false,
        error:   'You cannot modify another Super Admin account',
      });
    }

    let { name, email, phone, department, role, is_active } = req.body;

    name       = sanitize(name);
    email      = sanitize(email)?.toLowerCase();
    phone      = sanitize(phone) || null;
    department = sanitize(department) || null;

    // ── Validation ──────────────────────────────────────────────────────────
    const errors = {};

    if (!name || name.length < 2)
      errors.name = 'Full name must be at least 2 characters.';

    if (!email)
      errors.email = 'Email address is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errors.email = 'Invalid email format.';

    if (phone && !/^\+?[\d\s\-()\\.]{7,20}$/.test(phone))
      errors.phone = 'Invalid mobile number format.';

    if (department && !VALID_DEPARTMENTS.includes(department))
      errors.department = 'Invalid department selected.';

    /*
     * Role can only be changed when ALL three conditions are true:
     *   1. Not a self-edit — nobody can change their own role
     *   2. Target is not SUPERADMIN — that role is immutable
     *   3. Requester is SUPERADMIN — only SA may reassign roles
     */
    const allowRoleChange =
      !isSelfEdit &&
      targetRole !== 'SUPERADMIN' &&
      requesterRole === 'SUPERADMIN';

    if (allowRoleChange) {
      role = sanitize(role);
      if (!role || !VALID_ROLES.includes(role))
        errors.role = `Role must be one of: ${VALID_ROLES.join(', ')}.`;
    }

    if (Object.keys(errors).length)
      return res.status(422).json({ success: false, error: 'Validation failed', errors });

    // ── Duplicate email check (exclude current user) ────────────────────────
    const dup = await query(
      `SELECT id FROM users WHERE LOWER(TRIM(email)) = $1 AND id <> $2 AND deleted_at IS NULL`,
      [email, id]
    );
    if (dup.rows.length)
      return res.status(409).json({ success: false, error: 'Email address is already in use' });

    /*
     * Final field resolution:
     *
     *  Self-edit  →  role & is_active stay exactly as they are in DB
     *  SA editing ADMIN/USER  →  role & is_active come from the request payload
     */
    const finalRole     = allowRoleChange ? role               : targetRole;
    const finalIsActive = allowRoleChange ? (is_active ?? true): currentActive;

    // ── Update ───────────────────────────────────────────────────────────────
    const result = await query(
      `UPDATE users
       SET name       = $1,
           email      = $2,
           phone      = $3,
           department = $4,
           role       = $5,
           is_active  = $6,
           updated_at = NOW()
       WHERE id = $7 AND deleted_at IS NULL
       RETURNING id, name, email, phone, role, department, is_active, updated_at`,
      [name, email, phone, department, finalRole, finalIsActive, id]
    );

    return res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data:    result.rows[0],
    });
  } catch (error) {
    console.error('updateUser error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};


// ── DELETE /api/users/:id ──────────────────────────────────────────────────────
exports.deleteUser = async (req, res) => {
  try {
    const { id }      = req.params;
    const requesterId = req.user.id;

    if (id === requesterId)
      return res.status(400).json({
        success: false,
        error:   'You cannot delete your own account',
      });

    if (!UUID_RE.test(id))
      return res.status(404).json({ success: false, error: 'User not found' });

    /*
     * Hybrid delete (safe for prod):
     *   - Auth data (OTPs, reset tokens, refresh tokens) is always removed,
     *     so the user is logged out immediately and no FK blocks the delete.
     *   - If the user owns business records (customers, payments, ...), the row
     *     is SOFT-deleted to keep the audit trail; the email is renamed so the
     *     address can be reused for a new account.
     *   - Otherwise the row is HARD-deleted.
     */
    const outcome = await transaction(async (client) => {
      const target = await client.query(
        `SELECT id, role, email FROM users
         WHERE id = $1 AND deleted_at IS NULL
         FOR UPDATE`,
        [id]
      );
      if (!target.rows.length) return { status: 404 };
      if (target.rows[0].role === 'SUPERADMIN') return { status: 403 };

      const fks = await getUserForeignKeys(client);

      // 1. Remove auth data
      for (const { tbl, col } of fks.auth) {
        await client.query(`DELETE FROM ${qi(tbl)} WHERE ${qi(col)} = $1`, [id]);
      }

      // 2. Does the user own any business records?
      let hasBusinessRefs = false;
      if (fks.business.length) {
        const existsSql = fks.business
          .map(({ tbl, col }) => `EXISTS (SELECT 1 FROM ${qi(tbl)} WHERE ${qi(col)} = $1)`)
          .join(' OR ');
        const r = await client.query(`SELECT (${existsSql}) AS has_refs`, [id]);
        hasBusinessRefs = r.rows[0].has_refs;
      }

      let mode;
      if (hasBusinessRefs) {
        // 3a. Soft delete + free the email address
        await client.query(
          `UPDATE users
           SET deleted_at = NOW(),
               updated_at = NOW(),
               is_active  = false,
               email      = LEFT(email, 200) || '#deleted#' || id::text
           WHERE id = $1`,
          [id]
        );
        mode = 'soft';
      } else {
        // 3b. Hard delete — detach log rows first (works even if prod FKs
        //     are not yet ON DELETE SET NULL)
        for (const { tbl, col } of fks.logs) {
          await client.query(`UPDATE ${qi(tbl)} SET ${qi(col)} = NULL WHERE ${qi(col)} = $1`, [id]);
        }
        await client.query(`DELETE FROM users WHERE id = $1`, [id]);
        mode = 'hard';
      }

      // 4. Audit (attributed to the admin who performed the delete)
      await client.query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, changes, ip_address, user_agent, status)
         VALUES ($1, 'USER_DELETED', 'users', $2, $3, $4, $5, 'SUCCESS')`,
        [
          requesterId, id,
          JSON.stringify({ mode, email: target.rows[0].email }),
          req.ip || null, req.get('user-agent') || null,
        ]
      );

      return { status: 200, mode };
    });

    if (outcome.status === 404)
      return res.status(404).json({ success: false, error: 'User not found' });
    if (outcome.status === 403)
      return res.status(403).json({ success: false, error: 'Cannot delete a Super Admin account' });

    return res.status(200).json({
      success: true,
      message: 'User deleted successfully',
      data:    { id, mode: outcome.mode },
    });
  } catch (error) {
    console.error('deleteUser error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};