import express from 'express';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import {
  checkInPatient,
  getOpdQueue,
  updateQueueStatus,
  deleteQueueItem,
  searchPatients
} from '../controllers/opdQueueController.js';

const router = express.Router();

// Allow all authenticated clinic users (Doctor, Receptionist, Admin) to access OPD Queue
router.use(requireAuth);

router.post('/opd/checkin', checkInPatient);
router.get('/opd/queue', getOpdQueue);
router.patch('/opd/queue/:id/status', updateQueueStatus);
router.delete('/opd/queue/:id', deleteQueueItem);
router.get('/opd/search-patients', searchPatients);

export default router;
