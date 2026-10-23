import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

let tableChecked = false;
async function ensureOpdQueueTable() {
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
        "status" TEXT NOT NULL DEFAULT 'WAITING',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    tableChecked = true;
  } catch (err) {
    console.warn('ensureOpdQueueTable notice:', err.message);
  }
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
    privateNotes
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
        "status",
        "created_at",
        "updated_at"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'WAITING', NOW(), NOW()
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
      privateNotes ? privateNotes.trim() : null
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
    console.error('Error in checkInPatient:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to check in patient.'
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
    console.error('Error in getOpdQueue:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch OPD queue.'
    });
  }
}

/**
 * Update patient status in queue (e.g. IN_CONSULTATION, COMPLETED, CANCELLED).
 */
export async function updateQueueStatus(req, res) {
  await ensureOpdQueueTable();

  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({
      success: false,
      message: 'Status is required.'
    });
  }

  try {
    const result = await prisma.$queryRawUnsafe(`
      UPDATE "opd_queue"
      SET "status" = $1, "updated_at" = NOW()
      WHERE "id" = $2::uuid
      RETURNING *;
    `, status, id);

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
    console.error('Error in updateQueueStatus:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update queue status.'
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
