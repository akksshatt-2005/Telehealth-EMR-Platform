import express from 'express';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import {
  createOfflinePrescription,
  getOfflinePrescriptions,
  deleteOfflinePrescription,
  getNextReferenceId
} from '../controllers/offlinePrescriptionController.js';

const router = express.Router();

// Require authentication and DOCTOR or RECEPTIONIST role for offline prescription endpoints
router.use(requireAuth, requireRole('DOCTOR', 'RECEPTIONIST'));

router.get('/doctor/offline-prescriptions/next-reference', getNextReferenceId);
router.post('/doctor/offline-prescriptions', createOfflinePrescription);
router.get('/doctor/offline-prescriptions', getOfflinePrescriptions);
router.delete('/doctor/offline-prescriptions/:id', deleteOfflinePrescription);

export default router;
