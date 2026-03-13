const router = require('express').Router();
const authMiddleware = require('../middlewares/auth');
const { getActiveDrivers, updateLocation, toggleAvailability } = require('../controllers/driversController');

router.get('/', authMiddleware, getActiveDrivers);
router.post('/location', authMiddleware, updateLocation);
router.post('/availability', authMiddleware, toggleAvailability);

module.exports = router;
