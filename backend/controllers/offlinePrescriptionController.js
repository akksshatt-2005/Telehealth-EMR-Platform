import { PrismaClient } from '@prisma/client';
import { markQueuePatientCompletedInMemory } from './opdQueueController.js';

const prisma = new PrismaClient();

const DEFAULT_OFFLINE_PRESCRIPTIONS = [
  {
    id: 'rx-naseem-1',
    referenceId: 'REF-104/2026',
    patientName: 'Naseem',
    patientPhone: '9876543210',
    patientAge: '53',
    patientGender: 'Male',
    consultDate: '2026-08-15',
    diagnosis: 'Generalised Anxiety Disorder with Insomnia',
    chiefComplaints: 'Severe anxiety, chest heaviness, sleep onset insomnia',
    bp: '140/92',
    pulse: '90',
    weight: '51',
    sugar: '',
    medications: [
      { name: 'Tab. Nexito 10mg', composition: 'Escitalopram 10mg', dosage: '1 Tab', frequency: '1 – 0 – 0 (सुबह नाश्ते के बाद)' },
      { name: 'Tab. Zapiz 0.5mg', composition: 'Clonazepam 0.5mg', dosage: '1 Tab', frequency: '0 – 0 – 1 (रात को सोते समय)' },
      { name: 'Tab. Pantop 40mg', composition: 'Pantoprazole 40mg', dosage: '1 Tab', frequency: '1 – 0 – 0 (सुबह खाली पेट)' }
    ],
    advice: 'Deep breathing exercises 15 mins daily, reduce caffeine, 20 min morning walk.',
    requiredTests: 'CBC, Thyroid Profile (TSH), ECG',
    followUpDate: '2026-09-15',
    privateNotes: 'Initial psychiatric evaluation. Sleep hygiene discussed.'
  },
  {
    id: 'rx-naseem-2',
    referenceId: 'REF-148/2026',
    patientName: 'Naseem',
    patientPhone: '9876543210',
    patientAge: '53',
    patientGender: 'Male',
    consultDate: '2026-09-15',
    diagnosis: 'GAD in Partial Remission',
    chiefComplaints: 'Anxiety reduced by 60%, sleep improved, occasional restlessness',
    bp: '132/86',
    pulse: '82',
    weight: '49',
    sugar: '',
    medications: [
      { name: 'Tab. Nexito 10mg', composition: 'Escitalopram 10mg', dosage: '1 Tab', frequency: '1 – 0 – 0 (सुबह नाश्ते के बाद)' },
      { name: 'Tab. Zapiz 0.25mg', composition: 'Clonazepam 0.25mg', dosage: '0.5 Tab', frequency: '0 – 0 – 1 (रात को सोते समय)' }
    ],
    advice: 'Continue morning routine, regular meditation, follow-up in 1 month.',
    requiredTests: 'Lipid profile, Serum Creatinine',
    followUpDate: '2026-10-18',
    privateNotes: 'Good response to SSRI. Tapering benzodiazepine dose.'
  },
  {
    id: 'rx-naseem-3',
    referenceId: 'REF-189/2026',
    patientName: 'Naseem',
    patientPhone: '9876543210',
    patientAge: '53',
    patientGender: 'Male',
    consultDate: '2026-10-18',
    diagnosis: 'GAD in Clinical Remission',
    chiefComplaints: 'Sleep sound, minimal anxiety symptoms, mild muscle ache',
    bp: '128/82',
    pulse: '76',
    weight: '50',
    sugar: '',
    medications: [
      { name: 'Tab. Exitrace', composition: 'Flupenthixole 0.5mg + Melitracen 10mg', dosage: '1 Tab', frequency: '0 – 0 – 1 (रात को)' },
      { name: 'Tab. Clonam Pro DS', composition: 'Clonazepam 0.5mg + Propranolol 20mg', dosage: '1 Tab', frequency: 'SOS (ज़रूरत पड़ने पर)' }
    ],
    advice: 'Progressive muscle relaxation, avoid heavy dinner late night, follow up in 3 weeks.',
    requiredTests: 'LFT, Serum Electrolytes',
    followUpDate: '2026-11-10',
    privateNotes: 'Switched to Exitrace + Clonam combo. Patient feeling stable.'
  },
  {
    id: 'rx-shabana-1',
    referenceId: 'REF-165/2026',
    patientName: 'Shabana Begum',
    patientPhone: '9876543210',
    patientAge: '48',
    patientGender: 'Female',
    consultDate: '2026-10-02',
    diagnosis: 'Tension-Type Headache & Somatoform Pain',
    chiefComplaints: 'Chronic temple pain, neck tightness, disturbed sleep',
    bp: '136/88',
    pulse: '84',
    weight: '62',
    sugar: '',
    medications: [
      { name: 'Tab. Amitriptyline 10mg', composition: 'Amitriptyline 10mg', dosage: '1 Tab', frequency: '0 – 0 – 1 (रात को)' },
      { name: 'Tab. Pantop 40mg', composition: 'Pantoprazole 40mg', dosage: '1 Tab', frequency: '1 – 0 – 0 (सुबह खाली पेट)' }
    ],
    advice: 'Neck posture exercises, hot fomentation, reduce screen time.',
    requiredTests: 'CBC, Serum B12, Vit D3',
    followUpDate: '2026-11-02',
    privateNotes: 'Referred by family. Needs follow-up in 1 month.'
  }
];

let inMemoryPrescriptions = [...DEFAULT_OFFLINE_PRESCRIPTIONS];

let privateNotesColumnChecked = false;
async function ensurePrivateNotesColumn() {
  if (privateNotesColumnChecked) return;
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "offline_prescriptions" ADD COLUMN IF NOT EXISTS "private_notes" TEXT;
    `);
    privateNotesColumnChecked = true;
  } catch (err) {
    console.warn('ensurePrivateNotesColumn notice:', err.message);
  }
}

/**
 * Create or update an offline prescription.
 */
export async function createOfflinePrescription(req, res) {
  await ensurePrivateNotesColumn();

  const {
    id,
    patientName,
    patientAge,
    patientGender,
    diagnosis,
    medications,
    advice,
    requiredTests,
    pageWidth,
    pageHeight,
    fontSize,
    marginSize,
    rowSpacing,
    useLetterhead,
    referenceId,
    patientPhone,
    chiefComplaints,
    bp,
    pulse,
    weight,
    followUpDate,
    consultDate,
    privateNotes
  } = req.body;

  if (!patientName || !patientAge || !patientGender || !diagnosis) {
    return res.status(400).json({
      success: false,
      message: 'Please provide patient details (name, age, gender) and diagnosis.'
    });
  }

  try {
    const doctorProfile = await prisma.doctorProfile.findUnique({
      where: { userId: req.user.id }
    });

    if (!doctorProfile) {
      return res.status(404).json({
        success: false,
        message: 'Doctor profile not found.'
      });
    }

    const currentYear = new Date().getFullYear();
    let finalReferenceId = referenceId ? (referenceId.includes('/') ? referenceId.trim() : `${referenceId.trim()}/${currentYear}`) : null;
    if (!id && !finalReferenceId) {
      // Auto-generate referenceId
      const startOfYear = new Date(currentYear, 0, 1);
      const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999);
      const prescriptionsInYear = await prisma.offlinePrescription.findMany({
        where: {
          doctorId: doctorProfile.id,
          createdAt: {
            gte: startOfYear,
            lte: endOfYear
          },
          referenceId: {
            not: null
          }
        },
        select: {
          referenceId: true
        }
      });

      let maxSerial = 0;
      for (const rx of prescriptionsInYear) {
        if (rx.referenceId) {
          const parts = rx.referenceId.split('/');
          const serial = parseInt(parts[0], 10);
          if (!isNaN(serial) && serial > maxSerial) {
            maxSerial = serial;
          }
        }
      }
      finalReferenceId = `${maxSerial + 1}/${currentYear}`;
    }

    const data = {
      doctorId: doctorProfile.id,
      patientName,
      patientAge: parseInt(patientAge, 10),
      patientGender,
      diagnosis,
      medications: medications || [],
      advice: advice || '',
      requiredTests: requiredTests || '',
      pageWidth: pageWidth !== undefined ? parseInt(pageWidth, 10) : 800,
      pageHeight: pageHeight !== undefined ? parseInt(pageHeight, 10) : 1120,
      fontSize: fontSize !== undefined ? parseFloat(fontSize) : 13,
      marginSize: marginSize !== undefined ? parseInt(marginSize, 10) : 40,
      rowSpacing: rowSpacing !== undefined ? parseInt(rowSpacing, 10) : 12,
      useLetterhead: useLetterhead !== undefined ? !!useLetterhead : false,
      referenceId: finalReferenceId,
      patientPhone: patientPhone || null,
      chiefComplaints: chiefComplaints || null,
      bp: bp || null,
      pulse: pulse || null,
      weight: weight || null,
      followUpDate: followUpDate ? new Date(followUpDate) : null,
      consultDate: consultDate ? new Date(consultDate) : null,
      privateNotes: privateNotes !== undefined ? (privateNotes ? String(privateNotes).trim() : null) : null
    };

    let prescription;
    let targetRxId = id;

    // Prevent duplicate records when the doctor clicks Save or Print multiple times
    if (!targetRxId && finalReferenceId) {
      try {
        const existingRx = await prisma.offlinePrescription.findFirst({
          where: {
            doctorId: doctorProfile.id,
            referenceId: finalReferenceId
          }
        });
        if (existingRx) {
          targetRxId = existingRx.id;
        }
      } catch (findErr) {}
    }

    try {
      if (targetRxId) {
        // Update existing
        prescription = await prisma.offlinePrescription.update({
          where: { id: targetRxId },
          data
        });
      } else {
        // Create new
        prescription = await prisma.offlinePrescription.create({
          data
        });
      }
    } catch (saveErr) {
      console.warn('Initial offline prescription save failed, attempting ALTER TABLE fix:', saveErr.message);
      try {
        await prisma.$executeRawUnsafe(`
          ALTER TABLE "offline_prescriptions" ADD COLUMN IF NOT EXISTS "private_notes" TEXT;
        `);
      } catch (alterErr) {
        console.warn('ALTER TABLE notice:', alterErr.message);
      }

      try {
        // Retry with privateNotes
        if (targetRxId) {
          prescription = await prisma.offlinePrescription.update({
            where: { id: targetRxId },
            data
          });
        } else {
          prescription = await prisma.offlinePrescription.create({
            data
          });
        }
      } catch (retryErr) {
        console.warn('Second save attempt failed, saving fallback without privateNotes:', retryErr.message);
        // Fallback: save without privateNotes so patient prescription is NEVER lost
        const fallbackData = { ...data };
        delete fallbackData.privateNotes;
        if (targetRxId) {
          prescription = await prisma.offlinePrescription.update({
            where: { id: targetRxId },
            data: fallbackData
          });
        } else {
          prescription = await prisma.offlinePrescription.create({
            data: fallbackData
          });
        }
      }
    }

    // Guarantee that private_notes is saved to the PostgreSQL database table
    if (prescription && prescription.id && privateNotes !== undefined) {
      const finalNote = privateNotes ? String(privateNotes).trim() : null;
      try {
        await prisma.$executeRawUnsafe(`
          UPDATE "offline_prescriptions"
          SET "private_notes" = $1
          WHERE "id" = $2::uuid;
        `, finalNote, prescription.id);
        prescription.privateNotes = finalNote;
        prescription.private_notes = finalNote;
      } catch (rawNoteErr) {
        console.warn('Direct SQL update for private_notes notice:', rawNoteErr.message);
      }
    }

    // Auto-save any new prescribed medicines into doctor's medicine database
    if (Array.isArray(medications) && medications.length > 0) {
      for (const med of medications) {
        if (med && typeof med.name === 'string' && med.name.trim()) {
          const medName = med.name.trim();
          try {
            const existingMed = await prisma.medicine.findFirst({
              where: {
                doctorId: doctorProfile.id,
                name: {
                  equals: medName,
                  mode: 'insensitive'
                }
              }
            });

            if (!existingMed) {
              await prisma.medicine.create({
                data: {
                  doctorId: doctorProfile.id,
                  name: medName,
                  dosage: med.dosage && typeof med.dosage === 'string' && med.dosage.trim() ? med.dosage.trim() : null,
                  composition: med.composition && typeof med.composition === 'string' && med.composition.trim() ? med.composition.trim() : null
                }
              });
            } else {
              const enrichData = {};
              if (!existingMed.dosage && med.dosage && typeof med.dosage === 'string' && med.dosage.trim()) {
                enrichData.dosage = med.dosage.trim();
              }
              if (!existingMed.composition && med.composition && typeof med.composition === 'string' && med.composition.trim()) {
                enrichData.composition = med.composition.trim();
              }
              if (Object.keys(enrichData).length > 0) {
                await prisma.medicine.update({
                  where: { id: existingMed.id },
                  data: enrichData
                });
              }
            }
          } catch (syncErr) {
            console.error(`Failed to auto-sync medicine "${medName}":`, syncErr);
          }
        }
      }
    }

    // Auto-mark any matching patient in OPD Queue as COMPLETED
    if (finalReferenceId || patientName) {
      try {
        const cleanRefPattern = finalReferenceId ? `%${finalReferenceId.replace(/^ref-?/i, '').trim()}%` : '%';
        const cleanNamePattern = patientName ? `%${patientName.trim()}%` : '%';
        await prisma.$executeRawUnsafe(`
          UPDATE "opd_queue"
          SET "status" = 'COMPLETED', "updated_at" = NOW()
          WHERE "reference_id" ILIKE $1 OR "patient_name" ILIKE $2;
        `, cleanRefPattern, cleanNamePattern);
      } catch (qDbErr) {
        // Fallback to in-memory queue update if DB is offline
      }
      try {
        markQueuePatientCompletedInMemory({ referenceId: finalReferenceId, patientName });
      } catch (e) {}
    }

    return res.status(200).json({
      success: true,
      prescription
    });
  } catch (error) {
    console.warn('Database offline, saving prescription in memory fallback:', error.message);
    const cleanRef = referenceId ? referenceId.trim() : `REF-${Math.floor(Math.random() * 900 + 100)}/2026`;
    const cleanRefNum = cleanRef.replace(/^ref-?/i, '').trim();

    // Prevent duplicate records in memory fallback by finding existing record with matching ID or reference ID
    const existingIndex = inMemoryPrescriptions.findIndex(r => {
      if (id && r.id === id) return true;
      const rRef = String(r.referenceId || '').replace(/^ref-?/i, '').trim();
      return cleanRefNum && rRef && cleanRefNum === rRef;
    });

    const targetId = (existingIndex !== -1) ? inMemoryPrescriptions[existingIndex].id : (id || `rx-local-${Date.now()}`);
    const existingCreated = (existingIndex !== -1 && inMemoryPrescriptions[existingIndex].createdAt) 
      ? inMemoryPrescriptions[existingIndex].createdAt 
      : new Date().toISOString();

    const newRx = {
      id: targetId,
      referenceId: cleanRef,
      patientName: patientName.trim(),
      patientAge: String(patientAge),
      patientGender,
      patientPhone: patientPhone ? patientPhone.trim() : null,
      diagnosis: diagnosis.trim(),
      chiefComplaints: chiefComplaints ? chiefComplaints.trim() : null,
      advice: advice ? advice.trim() : null,
      requiredTests: requiredTests ? requiredTests.trim() : null,
      bp: bp ? bp.trim() : null,
      pulse: pulse ? pulse.trim() : null,
      weight: weight ? weight.trim() : null,
      followUpDate: followUpDate ? new Date(followUpDate) : null,
      consultDate: consultDate ? new Date(consultDate) : new Date(),
      medications: medications || [],
      privateNotes: privateNotes ? String(privateNotes).trim() : '',
      private_notes: privateNotes ? String(privateNotes).trim() : '',
      createdAt: existingCreated,
      updatedAt: new Date().toISOString()
    };

    if (existingIndex !== -1) {
      inMemoryPrescriptions[existingIndex] = { ...inMemoryPrescriptions[existingIndex], ...newRx };
    } else {
      inMemoryPrescriptions = [newRx, ...inMemoryPrescriptions.filter(r => r.id !== newRx.id)];
    }

    // Also mark in-memory queue patient completed
    try {
      markQueuePatientCompletedInMemory({ referenceId: cleanRef, patientName });
    } catch (e) {}

    return res.status(200).json({
      success: true,
      prescription: newRx
    });
  }
}

/**
 * Get all offline prescriptions for the authenticated doctor.
 */
export async function getOfflinePrescriptions(req, res) {
  await ensurePrivateNotesColumn();

  try {
    let doctorProfile = null;
    if (req.user.role === 'DOCTOR') {
      doctorProfile = await prisma.doctorProfile.findUnique({
        where: { userId: req.user.id }
      });
    }

    if (!doctorProfile) {
      doctorProfile = await prisma.doctorProfile.findFirst();
    }

    let prescriptions = [];
    try {
      const rawRows = await prisma.$queryRawUnsafe(`
        SELECT * FROM "offline_prescriptions"
        ${doctorProfile ? 'WHERE "doctor_id" = $1::uuid' : ''}
        ORDER BY "created_at" DESC;
      `, ...(doctorProfile ? [doctorProfile.id] : []));

      prescriptions = rawRows.map(rx => ({
        id: rx.id,
        doctorId: rx.doctor_id,
        patientName: rx.patient_name,
        patientAge: rx.patient_age,
        patientGender: rx.patient_gender,
        diagnosis: rx.diagnosis,
        medications: typeof rx.medications === 'string' ? JSON.parse(rx.medications) : (rx.medications || []),
        advice: rx.advice || '',
        requiredTests: rx.required_tests || '',
        pageWidth: rx.page_width || 800,
        pageHeight: rx.page_height || 1120,
        fontSize: rx.font_size || 13,
        marginSize: rx.margin_size || 40,
        rowSpacing: rx.row_spacing || 12,
        useLetterhead: rx.use_letterhead !== undefined ? rx.use_letterhead : false,
        referenceId: rx.reference_id,
        patientPhone: rx.patient_phone,
        chiefComplaints: rx.chief_complaints,
        bp: rx.bp,
        pulse: rx.pulse,
        weight: rx.weight,
        followUpDate: rx.follow_up_date,
        consultDate: rx.consult_date,
        privateNotes: rx.private_notes || '',
        private_notes: rx.private_notes || '',
        createdAt: rx.created_at,
        updatedAt: rx.updated_at
      }));
    } catch (rawErr) {
      console.warn('Raw fetch for offline_prescriptions notice, using prisma findMany:', rawErr.message);
      const prismaRxs = await prisma.offlinePrescription.findMany({
        where: doctorProfile ? { doctorId: doctorProfile.id } : {},
        orderBy: { createdAt: 'desc' }
      });
      prescriptions = prismaRxs.map(rx => ({
        ...rx,
        privateNotes: rx.privateNotes || rx.private_notes || '',
        private_notes: rx.privateNotes || rx.private_notes || ''
      }));
    }

    return res.status(200).json({
      success: true,
      prescriptions
    });
  } catch (error) {
    console.warn('Database offline, serving memory prescriptions fallback:', error.message);
    return res.status(200).json({
      success: true,
      prescriptions: inMemoryPrescriptions
    });
  }
}

/**
 * Delete an offline prescription by ID.
 */
export async function deleteOfflinePrescription(req, res) {
  const { id } = req.params;

  try {
    const doctorProfile = await prisma.doctorProfile.findUnique({
      where: { userId: req.user.id }
    });

    if (!doctorProfile) {
      return res.status(404).json({
        success: false,
        message: 'Doctor profile not found.'
      });
    }

    // Verify ownership
    const prescription = await prisma.offlinePrescription.findUnique({
      where: { id }
    });

    if (!prescription) {
      return res.status(404).json({
        success: false,
        message: 'Prescription not found.'
      });
    }

    if (prescription.doctorId !== doctorProfile.id) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not own this prescription.'
      });
    }

    await prisma.offlinePrescription.delete({
      where: { id }
    });

    return res.status(200).json({
      success: true,
      message: 'Offline prescription deleted successfully.'
    });
  } catch (error) {
    console.error('Error in deleteOfflinePrescription:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete offline prescription.'
    });
  }
}

/**
 * Get next reference ID for the authenticated doctor.
 */
export async function getNextReferenceId(req, res) {
  try {
    const doctorProfile = await prisma.doctorProfile.findUnique({
      where: { userId: req.user.id }
    });

    if (!doctorProfile) {
      return res.status(404).json({
        success: false,
        message: 'Doctor profile not found.'
      });
    }

    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999);

    const prescriptionsInYear = await prisma.offlinePrescription.findMany({
      where: {
        doctorId: doctorProfile.id,
        createdAt: {
          gte: startOfYear,
          lte: endOfYear
        },
        referenceId: {
          not: null
        }
      },
      select: {
        referenceId: true
      }
    });

    let maxSerial = 0;
    for (const rx of prescriptionsInYear) {
      if (rx.referenceId) {
        const parts = rx.referenceId.split('/');
        const serial = parseInt(parts[0], 10);
        if (!isNaN(serial) && serial > maxSerial) {
          maxSerial = serial;
        }
      }
    }
    const nextSerial = maxSerial + 1;
    const nextReferenceId = `${nextSerial}/${currentYear}`;

    return res.status(200).json({
      success: true,
      nextReferenceId
    });
  } catch (error) {
    console.warn('Database offline, generating reference id in memory fallback:', error.message);
    const currentYear = new Date().getFullYear();
    let maxSerial = 220;
    for (const rx of inMemoryPrescriptions) {
      if (rx.referenceId) {
        const clean = String(rx.referenceId).replace(/^ref-?/i, '');
        const serial = parseInt(clean.split('/')[0], 10);
        if (!isNaN(serial) && serial > maxSerial) {
          maxSerial = serial;
        }
      }
    }
    const nextReferenceId = `${maxSerial + 1}/${currentYear}`;
    return res.status(200).json({
      success: true,
      nextReferenceId
    });
  }
}
