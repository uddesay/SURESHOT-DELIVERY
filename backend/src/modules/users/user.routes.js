const router = require('express').Router();
const controller = require('./user.controller');
const schemas = require('./user.validation');
const validate = require('../../middlewares/validate.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');

router.use(authenticate);

router.get('/profile', controller.getProfile);
router.patch('/profile', validate(schemas.updateProfile), controller.updateProfile);
router.post('/devices', validate(schemas.registerDevice), controller.registerDevice);
router.delete('/account', validate(schemas.deleteAccount), controller.deleteAccount);

module.exports = router;
