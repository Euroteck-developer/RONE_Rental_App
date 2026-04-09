const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');

const VALID_ROLES = ['ADMIN', 'USER'];
const VALID_DEPARTMENTS = ['R-ONE ACCOUNTS', 'R-ONE CRM', 'R-ONE AUDIT'];

const sanitize = (val) => (typeof val === 'string' ? val.trim() : val);

// ── GET /api/users ────────────────────────────────────────────
exports.getAllUsers = async (req, res) => {
  try {
    const {
      search, role, department, is_active,
      page = 1, limit = 50,
    } = req.query;

    const params = [];
    let idx = 1;
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

    const countResult = await query(`SELECT COUNT(*) FROM users ${where}`, params);
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
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total_pages: Math.ceil(total / parseInt(limit, 10)),
      },
    });
  } catch (error) {
    console.error('getAllUsers error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ── GET /api/users/:id ────────────────────────────────────────
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

// ── POST /api/users ───────────────────────────────────────────
exports.createUser = async (req, res) => {
  try {
    let { name, email, phone, role, department, password } = req.body;

    name       = sanitize(name);
    email      = sanitize(email)?.toLowerCase();
    phone      = sanitize(phone) || null;
    role       = sanitize(role);
    department = sanitize(department) || null;

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

    const existing = await query(
      `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [email]
    );
    if (existing.rows.length)
      return res.status(409).json({ success: false, error: 'Email address is already in use' });

    const password_hash = await bcrypt.hash(password, 12);
    const result = await query(
      `INSERT INTO users
         (id, name, email, phone, role, department, password_hash,
          is_active, is_email_verified, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, true, false, NOW(), NOW())
       RETURNING id, name, email, phone, role, department, is_active, created_at`,
      [uuidv4(), name, email, phone, role, department, password_hash]
    );

    return res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('createUser error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ── PUT /api/users/:id ────────────────────────────────────────
// ── PUT /api/users/:id ────────────────────────────────────────
exports.updateUser = async (req, res) => {
  try {
    const { id }        = req.params;
    const requesterId   = req.user.id;
    const requesterRole = req.user.role;
    const isSelfEdit    = id === requesterId;

    // ── Fetch the target user — MUST include is_active ────────
    // BUG WAS HERE: previous query only selected `id, role`
    // so existing.rows[0].is_active was undefined, causing
    // the account to be deactivated on every self-edit save.
    const existing = await query(
      `SELECT id, role, is_active FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (!existing.rows.length)
      return res.status(404).json({ success: false, error: 'User not found' });

    const targetRole     = existing.rows[0].role;
    const currentActive  = existing.rows[0].is_active; // now correctly populated

    // ── Permission guard ──────────────────────────────────────
    // SUPERADMIN cannot edit another SUPERADMIN (only themselves)
    if (targetRole === 'SUPERADMIN' && !isSelfEdit) {
      return res.status(403).json({
        success: false,
        error: 'You cannot modify another Super Admin account',
      });
    }

    let { name, email, phone, department, role, is_active } = req.body;

    name       = sanitize(name);
    email      = sanitize(email)?.toLowerCase();
    phone      = sanitize(phone) || null;
    department = sanitize(department) || null;

    // ── Validation ────────────────────────────────────────────
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
     * Role validation ONLY when all three conditions are met:
     *   1. Not editing self         — nobody can change their own role
     *   2. Target is not SUPERADMIN — cannot reassign superadmin role
     *   3. Requester is SUPERADMIN  — only SA can change roles
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

    // ── Duplicate email check (exclude self) ──────────────────
    const dup = await query(
      `SELECT id FROM users WHERE email = $1 AND id <> $2 AND deleted_at IS NULL`,
      [email, id]
    );
    if (dup.rows.length)
      return res.status(409).json({ success: false, error: 'Email address is already in use' });

    /*
     * Determine final role and is_active values:
     *
     * Self-edit (any role including SUPERADMIN):
     *   → finalRole     = current DB value  (unchanged)
     *   → finalIsActive = current DB value  (unchanged — was undefined before fix)
     *
     * SUPERADMIN editing ADMIN/USER:
     *   → finalRole     = validated role from payload
     *   → finalIsActive = is_active from payload (default true if omitted)
     */
    const finalRole     = allowRoleChange ? role        : targetRole;
    const finalIsActive = allowRoleChange ? (is_active ?? true) : currentActive;

    // ── Update ────────────────────────────────────────────────
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
      data: result.rows[0],
    });
  } catch (error) {
    console.error('updateUser error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ── DELETE /api/users/:id ─────────────────────────────────────
exports.deleteUser = async (req, res) => {
  try {
    const { id }      = req.params;
    const requesterId = req.user.id;

    if (id === requesterId)
      return res.status(400).json({ success: false, error: 'You cannot delete your own account' });

    // Prevent deleting another SUPERADMIN
    const target = await query(
      `SELECT role FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (!target.rows.length)
      return res.status(404).json({ success: false, error: 'User not found' });
    if (target.rows[0].role === 'SUPERADMIN')
      return res.status(403).json({ success: false, error: 'Cannot delete a Super Admin account' });

    await query(
      `UPDATE users SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    return res.status(200).json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('deleteUser error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};