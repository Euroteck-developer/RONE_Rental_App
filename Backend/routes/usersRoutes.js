// const express = require('express');
// const router  = express.Router();
// const usersController = require('../controllers/usersController');
// const { authenticate, authorize } = require('../middleware/auth'); // your existing auth.js

// router.use(authenticate);

// router.get('/',       usersController.getAllUsers);
// router.get('/:id',    usersController.getUserById);
// router.post('/',      authorize('SUPERADMIN'), usersController.createUser);
// router.put('/:id',    authorize('SUPERADMIN'), usersController.updateUser);
// router.delete('/:id', authorize('SUPERADMIN'), usersController.deleteUser);

// module.exports = router;

const express = require('express');
const router  = express.Router();
const usersController = require('../controllers/usersController');
const { authenticate, authorize } = require('../middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management (SUPERADMIN only for write operations)
 */

router.use(authenticate);

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get all users
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of users
 */
router.get('/', usersController.getAllUsers);

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User found
 *       404:
 *         description: User not found
 */
router.get('/:id', usersController.getUserById);

/**
 * @swagger
 * /api/users:
 *   post:
 *     summary: Create user (SUPERADMIN only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, role]
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [SUPERADMIN, ADMIN, USER]
 *     responses:
 *       201:
 *         description: User created
 *       403:
 *         description: Forbidden
 */
router.post('/', authorize('SUPERADMIN'), usersController.createUser);

/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: Update user (SUPERADMIN only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: User updated
 *       403:
 *         description: Forbidden
 */
router.put('/:id', authorize('SUPERADMIN'), usersController.updateUser);

/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: Delete user (SUPERADMIN only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User deleted
 *       403:
 *         description: Forbidden
 */
router.delete('/:id', authorize('SUPERADMIN'), usersController.deleteUser);

module.exports = router;