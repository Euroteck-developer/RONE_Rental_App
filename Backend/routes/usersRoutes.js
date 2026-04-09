const express = require('express');
const router  = express.Router();
const usersController = require('../controllers/usersController');
const { authenticate, authorize } = require('../middleware/auth'); // your existing auth.js

router.use(authenticate);

router.get('/',       usersController.getAllUsers);
router.get('/:id',    usersController.getUserById);
router.post('/',      authorize('SUPERADMIN'), usersController.createUser);
router.put('/:id',    authorize('SUPERADMIN'), usersController.updateUser);
router.delete('/:id', authorize('SUPERADMIN'), usersController.deleteUser);

module.exports = router;