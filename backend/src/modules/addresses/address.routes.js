const router = require('express').Router();
const controller = require('./address.controller');
const schemas = require('./address.validation');
const validate = require('../../middlewares/validate.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');

router.use(authenticate);

router.get('/', controller.list);
router.post('/', validate(schemas.create), controller.create);
router.patch('/:id', validate(schemas.update), controller.update);
router.post('/:id/default', validate(schemas.idOnly), controller.setDefault);
router.delete('/:id', validate(schemas.idOnly), controller.remove);

module.exports = router;
