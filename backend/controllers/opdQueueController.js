import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_OPD_QUEUE = [
  { id: 'mock-1', token_number: 1, patient_name: 'Naseem', patient_age: 53, age: 53, patient_gender: 'Male', gender: 'Male', patient_type: 'FOLLOW_UP', fee_status: 'FREE', payment_mode: 'FREE', reference_id: 'REF-213/2026', patient_phone: '9876543210', phone: '9876543210', status: 'COMPLETED', chief_complaints: 'ANXIETY , RESTLESSNESS, DYSPNEA, BODY PAINS, INTERMITTENT PANIC ATTACKS', diagnosis: 'PANIC DISORDER WITH MILD AGORAPHOBIA', created_at: '2026-11-11T10:00:00.000Z' },
  { id: 'mock-2', token_number: 2, patient_name: 'Shabana Begum', patient_age: 48, age: 48, patient_gender: 'Female', gender: 'Female', patient_type: 'FOLLOW_UP', fee_status: 'PAID', payment_mode: 'CASH', reference_id: 'REF-218/2026', patient_phone: '9876543210', phone: '9876543210', status: 'COMPLETED', chief_complaints: 'CHRONIC NECK STIFFNESS, BILATERAL TEMPLE HEADACHE', diagnosis: 'TENSION-TYPE HEADACHE & SOMATOFORM PAIN', created_at: '2026-11-11T10:30:00.000Z' },
  { id: 'mock-3', token_number: 3, patient_name: 'Rupali Yadav', patient_age: 21, age: 21, patient_gender: 'Female', gender: 'Female', patient_type: 'NEW', fee_status: 'PAID', payment_mode: 'CASH', reference_id: 'REF-214/2026', patient_phone: '9876543211', phone: '9876543211', status: 'COMPLETED', chief_complaints: 'Throbbing headache', diagnosis: 'Episodic Migraine', created_at: '2026-11-11T11:00:00.000Z' },
  { id: 'mock-4', token_number: 4, patient_name: 'Kartik', patient_age: 15, age: 15, patient_gender: 'Male', gender: 'Male', patient_type: 'NEW', fee_status: 'PAID', payment_mode: 'CASH', reference_id: 'REF-215/2026', patient_phone: '9876543212', phone: '9876543212', status: 'COMPLETED', chief_complaints: 'Exam stress', diagnosis: 'Adjustment reaction', created_at: '2026-11-11T11:30:00.000Z' },
  { id: 'mock-5', token_number: 5, patient_name: 'Maksood Ali', patient_age: 40, age: 40, patient_gender: 'Male', gender: 'Male', patient_type: 'NEW', fee_status: 'PAID', payment_mode: 'CASH', reference_id: 'REF-216/2026', patient_phone: '9876543213', phone: '9876543213', status: 'COMPLETED', chief_complaints: 'Tension headaches', diagnosis: 'Tension headache', created_at: '2026-11-11T12:00:00.000Z' },
  { id: 'mock-6', token_number: 6, patient_name: 'Sunita Sharma', patient_age: 36, age: 36, patient_gender: 'Female', gender: 'Female', patient_type: 'FOLLOW_UP', fee_status: 'PAID', payment_mode: 'UPI', reference_id: 'REF-217/2026', patient_phone: '9876543214', phone: '9876543214', status: 'COMPLETED', chief_complaints: 'Low mood', diagnosis: 'Depressive episode', created_at: '2026-11-11T12:30:00.000Z' }
];

let inMemoryOpdQueue = [...DEFAULT_OPD_QUEUE];

/**
 * Mark a patient in the in-memory OPD queue as COMPLETED based on queueId or the first WAITING patient matching referenceId/patientName.
 */
export function markQueuePatientCompletedInMemory({ queueId, referenceId, patientName, prescriptionId }) {
  const refClean = referenceId ? String(referenceId).replace(/^ref-?/i, '').trim().toLowerCase() : '';
  const nameClean = patientName ? String(patientName).trim().toLowerCase() : '';
  let updatedItem = null;
  let matchedOne = false;

  inMemoryOpdQueue = inMemoryOpdQueue.map(item => {
    if (queueId && item.id === queueId) {
      updatedItem = { ...item, status: 'COMPLETED', prescription_id: prescriptionId || item.prescription_id };
      return updatedItem;
    }
    if (!queueId && !matchedOne && item.status === 'WAITING') {
      const itemRef = String(item.reference_id || item.referenceId || '').replace(/^ref-?/i, '').trim().toLowerCase();
      const itemName = String(item.patient_name || item.name || '').trim().toLowerCase();
      if ((refClean && itemRef && refClean === itemRef) || (nameClean && itemName && nameClean === itemName)) {
        matchedOne = true;
        updatedItem = { ...item, status: 'COMPLETED', prescription_id: prescriptionId || item.prescription_id };
        return updatedItem;
      }
    }
    return item;
  });

  return updatedItem;
}

let tableChecked = false;
export async function ensureOpdQueueTable() {
  if (tableChecked) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "opd_queue" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "token_number" SERIAL,
        "patient_name" TEXT NOT NULL,
        "patient_phone" TEXT,
        "patient_age" INTEGER NOT NULL,
        "patient_gender" TEXT NOT NULL,
        "reference_id" TEXT,
        "bp" TEXT,
        "pulse" TEXT,
        "weight" TEXT,
        "sugar" TEXT,
        "temperature" TEXT,
        "chief_complaints" TEXT,
        "private_notes" TEXT,
        "patient_type" TEXT NOT NULL DEFAULT 'NEW',
        "fee_status" TEXT NOT NULL DEFAULT 'PAID',
        "fee_amount" NUMERIC NOT NULL DEFAULT 700,
        "payment_mode" TEXT NOT NULL DEFAULT 'CASH',
        "status" TEXT NOT NULL DEFAULT 'WAITING',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  } catch (err) {
    console.warn('ensureOpdQueueTable create notice:', err.message);
  }

  // Execute each ALTER TABLE independently so PostgreSQL accepts the statements
  const alterColumns = [
    `ALTER TABLE "opd_queue" ADD COLUMN IF NOT EXISTS "patient_phone" TEXT;`,
    `ALTER TABLE "opd_queue" ADD COLUMN IF NOT EXISTS "reference_id" TEXT;`,
    `ALTER TABLE "opd_queue" ADD COLUMN IF NOT EXISTS "bp" TEXT;`,
    `ALTER TABLE "opd_queue" ADD COLUMN IF NOT EXISTS "pulse" TEXT;`,
    `ALTER TABLE "opd_queue" ADD COLUMN IF NOT EXISTS "weight" TEXT;`,
    `ALTER TABLE "opd_queue" ADD COLUMN IF NOT EXISTS "sugar" TEXT;`,
    `ALTER TABLE "opd_queue" ADD COLUMN IF NOT EXISTS "temperature" TEXT;`,
    `ALTER TABLE "opd_queue" ADD COLUMN IF NOT EXISTS "chief_complaints" TEXT;`,
    `ALTER TABLE "opd_queue" ADD COLUMN IF NOT EXISTS "private_notes" TEXT;`,
    `ALTER TABLE "opd_queue" ADD COLUMN IF NOT EXISTS "patient_type" TEXT NOT NULL DEFAULT 'NEW';`,
    `ALTER TABLE "opd_queue" ADD COLUMN IF NOT EXISTS "fee_status" TEXT NOT NULL DEFAULT 'PAID';`,
    `ALTER TABLE "opd_queue" ADD COLUMN IF NOT EXISTS "fee_amount" NUMERIC NOT NULL DEFAULT 700;`,
    `ALTER TABLE "opd_queue" ADD COLUMN IF NOT EXISTS "payment_mode" TEXT NOT NULL DEFAULT 'CASH';`,
    `ALTER TABLE "opd_queue" ADD COLUMN IF NOT EXISTS "prescription_id" TEXT;`
  ];

  for (const query of alterColumns) {
    try {
      await prisma.$executeRawUnsafe(query);
    } catch (err) {
      console.warn('ensureOpdQueueTable alter notice:', err.message);
    }
  }

  tableChecked = true;
}

/**
 * Check in a patient at the front desk / reception into the live OPD queue.
 */
export async function checkInPatient(req, res) {
  await ensureOpdQueueTable();

  const {
    patientName,
    patientPhone,
    patientAge,
    patientGender,
    referenceId,
    bp,
    pulse,
    weight,
    sugar,
    temperature,
    chiefComplaints,
    privateNotes,
    patientType,
    feeStatus,
    feeAmount,
    paymentMode
  } = req.body;

  if (!patientName || !patientName.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Please provide the patient name.'
    });
  }

  const ageNum = parseInt(patientAge, 10);
  if (isNaN(ageNum) || ageNum <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid patient age.'
    });
  }

  try {
    const finalPatientType = patientType === 'FOLLOW_UP' ? 'FOLLOW_UP' : 'NEW';
    const finalFeeStatus = ['PAID', 'PENDING', 'FREE'].includes(feeStatus) ? feeStatus : (finalPatientType === 'FOLLOW_UP' ? 'FREE' : 'PAID');
    const finalPaymentMode = ['CASH', 'UPI', 'FREE'].includes(paymentMode) ? paymentMode : (finalFeeStatus === 'FREE' ? 'FREE' : 'CASH');
    const parsedFee = parseFloat(feeAmount);
    const finalFeeAmount = !isNaN(parsedFee) ? parsedFee : (finalFeeStatus === 'FREE' ? 0 : 700);

    // Generate or reuse Reference ID
    let finalReferenceId = referenceId ? referenceId.trim() : null;
    if (!finalReferenceId) {
      const currentYear = new Date().getFullYear();
      // Look up max serial in offline prescriptions and current queue
      const existingRefs = await prisma.$queryRawUnsafe(`
        SELECT reference_id FROM "offline_prescriptions"
        WHERE reference_id IS NOT NULL AND reference_id LIKE '%/' || $1
        UNION
        SELECT reference_id FROM "opd_queue"
        WHERE reference_id IS NOT NULL AND reference_id LIKE '%/' || $1
      `, currentYear.toString());

      let maxSerial = 0;
      for (const row of existingRefs) {
        if (row.reference_id) {
          const num = parseInt(row.reference_id.split('/')[0], 10);
          if (!isNaN(num) && num > maxSerial) {
            maxSerial = num;
          }
        }
      }
      finalReferenceId = `${maxSerial + 1}/${currentYear}`;
    }

    // Get today's token number (starts fresh from 1 each day)
    let todayTokenNum = 1;
    try {
      const todayTokens = await prisma.$queryRawUnsafe(`
        SELECT COALESCE(MAX(token_number), 0)::int AS max_token FROM "opd_queue"
        WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
      `);
      todayTokenNum = (todayTokens[0]?.max_token || 0) + 1;
    } catch (tzErr) {
      const todayTokens = await prisma.$queryRawUnsafe(`
        SELECT COALESCE(MAX(token_number), 0)::int AS max_token FROM "opd_queue"
        WHERE "created_at" >= CURRENT_DATE
      `);
      todayTokenNum = (todayTokens[0]?.max_token || 0) + 1;
    }

    // Insert new OPD check-in record
    const result = await prisma.$queryRawUnsafe(`
      INSERT INTO "opd_queue" (
        "token_number",
        "patient_name",
        "patient_phone",
        "patient_age",
        "patient_gender",
        "reference_id",
        "bp",
        "pulse",
        "weight",
        "sugar",
        "temperature",
        "chief_complaints",
        "private_notes",
        "patient_type",
        "fee_status",
        "fee_amount",
        "payment_mode",
        "status",
        "created_at",
        "updated_at"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'WAITING', NOW(), NOW()
      ) RETURNING *;
    `,
      todayTokenNum,
      patientName.trim(),
      patientPhone ? patientPhone.trim() : null,
      ageNum,
      patientGender || 'Male',
      finalReferenceId,
      bp ? bp.trim() : null,
      pulse ? pulse.trim() : null,
      weight ? weight.trim() : null,
      sugar ? sugar.trim() : null,
      temperature ? temperature.trim() : null,
      chiefComplaints ? chiefComplaints.trim() : null,
      privateNotes ? privateNotes.trim() : null,
      finalPatientType,
      finalFeeStatus,
      finalFeeAmount,
      finalPaymentMode
    );

    const checkinRecord = result[0];

    // Emit live real-time update via Socket.IO if attached to express app
    try {
      const io = req.app.get('io');
      if (io) {
        io.emit('opd_queue_updated', {
          action: 'CHECKED_IN',
          patient: checkinRecord
        });
      }
    } catch (socketErr) {
      console.warn('Socket emit notice for opd checkin:', socketErr.message);
    }

    return res.status(201).json({
      success: true,
      message: `Patient ${patientName.trim()} checked in successfully. Token #${todayTokenNum}.`,
      item: checkinRecord
    });
  } catch (error) {
    console.warn('Database offline, storing checkin in memory queue fallback:', error.message);
    const todayTokenNum = inMemoryOpdQueue.length + 1;
    const currentYear = new Date().getFullYear();
    const finalRef = referenceId ? referenceId.trim() : `${220 + todayTokenNum}/${currentYear}`;
    const checkinRecord = {
      id: `queue-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      token_number: todayTokenNum,
      patient_name: patientName.trim(),
      patient_phone: patientPhone ? patientPhone.trim() : null,
      phone: patientPhone ? patientPhone.trim() : null,
      patient_age: parseInt(patientAge, 10),
      age: parseInt(patientAge, 10),
      patient_gender: patientGender,
      gender: patientGender,
      reference_id: finalRef,
      bp: bp ? bp.trim() : null,
      pulse: pulse ? pulse.trim() : null,
      weight: weight ? weight.trim() : null,
      sugar: sugar ? sugar.trim() : null,
      temperature: temperature ? temperature.trim() : null,
      chief_complaints: chiefComplaints ? chiefComplaints.trim() : null,
      private_notes: privateNotes ? privateNotes.trim() : null,
      patient_type: patientType === 'FOLLOW_UP' ? 'FOLLOW_UP' : 'NEW',
      fee_status: feeStatus || 'PAID',
      fee_amount: feeAmount || 700,
      payment_mode: paymentMode || 'CASH',
      status: 'WAITING',
      created_at: new Date().toISOString()
    };
    inMemoryOpdQueue.push(checkinRecord);
    if (inMemoryOpdQueue.length > 25) {
      inMemoryOpdQueue = inMemoryOpdQueue.slice(-20);
    }
    try {
      const io = req.app.get('io');
      if (io) {
        io.emit('opd_queue_updated', { action: 'CHECKED_IN', patient: checkinRecord });
      }
    } catch (e) {}

    return res.status(201).json({
      success: true,
      message: `Patient ${patientName.trim()} checked in successfully. Token #${todayTokenNum}.`,
      item: checkinRecord
    });
  }
}

/**
 * Fetch current active OPD queue (today's waiting, in consultation, and completed).
 */
export async function getOpdQueue(req, res) {
  await ensureOpdQueueTable();

  try {
    const targetDate = req.query.date ? String(req.query.date).trim() : null;
    let queue;

    try {
      if (targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
        queue = await prisma.$queryRawUnsafe(`
          SELECT * FROM "opd_queue"
          WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::date = $1::date
          ORDER BY
            CASE 
              WHEN "status" = 'WAITING' THEN 1
              WHEN "status" = 'IN_CONSULTATION' THEN 2
              WHEN "status" = 'COMPLETED' THEN 3
              ELSE 4
            END,
            "token_number" ASC;
        `, targetDate);
      } else {
        queue = await prisma.$queryRawUnsafe(`
          SELECT * FROM "opd_queue"
          WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
          ORDER BY
            CASE 
              WHEN "status" = 'WAITING' THEN 1
              WHEN "status" = 'IN_CONSULTATION' THEN 2
              WHEN "status" = 'COMPLETED' THEN 3
              ELSE 4
            END,
            "token_number" ASC;
        `);
      }
    } catch (tzErr) {
      // Fallback query if timezone conversion is unsupported in underlying database
      if (targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
        queue = await prisma.$queryRawUnsafe(`
          SELECT * FROM "opd_queue"
          WHERE created_at::date = $1::date
          ORDER BY
            CASE 
              WHEN "status" = 'WAITING' THEN 1
              WHEN "status" = 'IN_CONSULTATION' THEN 2
              WHEN "status" = 'COMPLETED' THEN 3
              ELSE 4
            END,
            "token_number" ASC;
        `, targetDate);
      } else {
        queue = await prisma.$queryRawUnsafe(`
          SELECT * FROM "opd_queue"
          WHERE created_at >= CURRENT_DATE
          ORDER BY
            CASE 
              WHEN "status" = 'WAITING' THEN 1
              WHEN "status" = 'IN_CONSULTATION' THEN 2
              WHEN "status" = 'COMPLETED' THEN 3
              ELSE 4
            END,
            "token_number" ASC;
        `);
      }
    }

    return res.status(200).json({
      success: true,
      queue: queue || []
    });
  } catch (error) {
    console.warn('Database offline, serving memory queue fallback:', error.message);
    const targetDate = req.query.date ? String(req.query.date).trim() : null;
    const filterDay = targetDate || new Date().toISOString().split('T')[0];

    const todayItems = inMemoryOpdQueue.filter(item => {
      if (!item.created_at) return false;
      const itemDate = new Date(item.created_at).toISOString().split('T')[0];
      return itemDate === filterDay;
    });

    const sortedMemoryQueue = [...todayItems].sort((a, b) => {
      const aDone = a.status === 'COMPLETED' || a.status === 'CONSULTED';
      const bDone = b.status === 'COMPLETED' || b.status === 'CONSULTED';
      if (aDone !== bDone) return aDone ? 1 : -1;
      const aToken = parseInt(a.token_number, 10) || 0;
      const bToken = parseInt(b.token_number, 10) || 0;
      if (!aDone && !bDone) return bToken - aToken;
      return aToken - bToken;
    });
    return res.status(200).json({
      success: true,
      queue: sortedMemoryQueue
    });
  }
}

/**
 * Update patient status in queue (e.g. IN_CONSULTATION, COMPLETED, CANCELLED).
 */
export async function updateQueueStatus(req, res) {
  await ensureOpdQueueTable();

  const { id } = req.params;
  const { status, feeStatus, paymentMode, feeAmount, patientType } = req.body;

  try {
    const fields = [];
    const values = [];
    let idx = 1;

    if (status !== undefined) {
      fields.push(`"status" = $${idx++}`);
      values.push(status);
    }
    if (feeStatus !== undefined) {
      fields.push(`"fee_status" = $${idx++}`);
      values.push(feeStatus);
    }
    if (paymentMode !== undefined) {
      fields.push(`"payment_mode" = $${idx++}`);
      values.push(paymentMode);
    }
    if (feeAmount !== undefined) {
      fields.push(`"fee_amount" = $${idx++}`);
      values.push(parseFloat(feeAmount) || 0);
    }
    if (patientType !== undefined) {
      fields.push(`"patient_type" = $${idx++}`);
      values.push(patientType);
    }

    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields provided for update.'
      });
    }

    fields.push(`"updated_at" = NOW()`);
    values.push(id);

    const query = `
      UPDATE "opd_queue"
      SET ${fields.join(', ')}
      WHERE "id" = $${idx}::uuid
      RETURNING *;
    `;

    const result = await prisma.$queryRawUnsafe(query, ...values);

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Queue item not found.'
      });
    }

    // Emit live socket event
    try {
      const io = req.app.get('io');
      if (io) {
        io.emit('opd_queue_updated', {
          action: 'STATUS_UPDATED',
          patient: result[0]
        });
      }
    } catch (socketErr) {
      console.warn('Socket emit notice for queue status:', socketErr.message);
    }

    return res.status(200).json({
      success: true,
      item: result[0]
    });
  } catch (error) {
    console.warn('Database offline, updating memory queue fallback:', error.message);
    const item = inMemoryOpdQueue.find(p => String(p.id) === String(id));
    if (item) {
      if (status !== undefined) item.status = status;
      if (feeStatus !== undefined) item.fee_status = feeStatus;
      if (paymentMode !== undefined) item.payment_mode = paymentMode;
      if (feeAmount !== undefined) item.fee_amount = parseFloat(feeAmount) || item.fee_amount;
      if (patientType !== undefined) item.patient_type = patientType;
      try {
        const io = req.app.get('io');
        if (io) {
          io.emit('opd_queue_updated', {
            action: 'STATUS_UPDATED',
            patient: item
          });
        }
      } catch (e) {}
      return res.status(200).json({
        success: true,
        item
      });
    }
    return res.status(200).json({
      success: true
    });
  }
}

/**
 * Delete / Remove item from OPD queue.
 */
export async function deleteQueueItem(req, res) {
  await ensureOpdQueueTable();

  const { id } = req.params;

  try {
    await prisma.$queryRawUnsafe(`
      DELETE FROM "opd_queue" WHERE "id" = $1::uuid;
    `, id);

    try {
      const io = req.app.get('io');
      if (io) {
        io.emit('opd_queue_updated', {
          action: 'DELETED',
          id
        });
      }
    } catch (socketErr) {
      console.warn('Socket emit notice:', socketErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Queue item deleted.'
    });
  } catch (error) {
    console.error('Error in deleteQueueItem:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete queue item.'
    });
  }
}

/**
 * Search existing patients by phone number, name, or reference ID.
 * Groups by patient name + reference ID so all family members registered under a phone number are cleanly returned!
 */
export async function searchPatients(req, res) {
  const query = (req.query.q || '').trim();

  if (!query || query.length < 1) {
    return res.status(200).json({
      success: true,
      patients: []
    });
  }

  try {
    const serial = query.split('/')[0].trim();

    const prescriptions = await prisma.offlinePrescription.findMany({
      where: {
        OR: [
          { referenceId: { contains: query, mode: 'insensitive' } },
          { referenceId: { startsWith: `${serial}/` } },
          { referenceId: { equals: query, mode: 'insensitive' } },
          { patientName: { contains: query, mode: 'insensitive' } },
          { patientPhone: { contains: query, mode: 'insensitive' } }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 30
    });

    const seen = new Set();
    const patients = [];
    for (const rx of prescriptions) {
      const key = `${(rx.patientName || '').toLowerCase().trim()}_${(rx.referenceId || '').trim()}`;
      if (!seen.has(key)) {
        seen.add(key);
        patients.push({
          referenceId: rx.referenceId,
          patientName: rx.patientName,
          patientPhone: rx.patientPhone,
          patientAge: rx.patientAge,
          patientGender: rx.patientGender,
          chiefComplaints: rx.chiefComplaints,
          bp: rx.bp,
          pulse: rx.pulse,
          weight: rx.weight,
          createdAt: rx.createdAt,
          consultDate: rx.consultDate
        });
      }
    }

    return res.status(200).json({
      success: true,
      patients: patients.slice(0, 12)
    });
  } catch (error) {
    console.error('Error in searchPatients:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to search patients.'
    });
  }
}
