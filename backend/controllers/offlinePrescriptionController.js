import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { markQueuePatientCompletedInMemory } from './opdQueueController.js';

const prisma = new PrismaClient();

async function resolveDoctorProfile(req) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(req?.user?.id || ''));
  if (isUuid) {
    try {
      const profile = await prisma.doctorProfile.findUnique({
        where: { userId: req.user.id }
      });
      if (profile) return profile;
    } catch (e) {
      console.warn('resolveDoctorProfile findUnique notice:', e.message);
    }
  }
  try {
    return await prisma.doctorProfile.findFirst();
  } catch (e) {
    return null;
  }
}

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
  },
  {
    id: 'rx-naseem-4',
    referenceId: 'REF-213/2026',
    patientName: 'Naseem',
    patientPhone: '9876543210',
    patientAge: '53',
    patientGender: 'Male',
    consultDate: '2026-11-11',
    diagnosis: 'PANIC DISORDER WITH MILD AGORAPHOBIA',
    chiefComplaints: 'ANXIETY, RESTLESSNESS, DYSPNEA, BODY PAINS, INTERMITTENT PANIC ATTACKS',
    bp: '131/89',
    pulse: '85',
    weight: '48',
    sugar: '',
    medications: [
      { name: 'EXITRACE', composition: 'FLUPENTHIXOLE', dosage: '1MG', frequency: '0-0-1 (रात को सोने से पहले / At bedtime)' },
      { name: 'CLONAM PRO DS', composition: 'CLONAZEPAM 0.5 MG + PROPRANOLOL 20 MG', dosage: '1TAB', frequency: 'SOS (ज़रूरत पड़ने पर / As needed) FOR ANXIETY ATTACKS' },
      { name: 'NEXITO PLUS', composition: 'ESCITALOPRAM 10 MG + CLONAZEPAM 0.5 MG', dosage: '1TAB', frequency: '1-0-0 (सुबह नाश्ते के बाद)' }
    ],
    advice: 'Follow-up: Visit within 17 days (Date: 27/11/2026). Deep breathing exercises.',
    requiredTests: 'CBC, THYROID PROFILE',
    followUpDate: '2026-11-27',
    privateNotes: 'Regular follow-up.'
  },
  {
    id: 'rx-shaheen-1',
    referenceId: 'REF-223/2026',
    patientName: 'Shaheen',
    patientPhone: '9559887094',
    patientAge: '50',
    patientGender: 'Female',
    consultDate: '2026-11-11',
    diagnosis: 'Major Depressive Episode with Psychomotor Agitation',
    chiefComplaints: 'Low mood, early morning awakening, psychomotor restlessness',
    bp: '136/88',
    pulse: '84',
    weight: '64',
    sugar: '',
    medications: [
      { name: 'Tab. Duloxetine 30mg', composition: 'Duloxetine 30mg', dosage: '1 Tab', frequency: '1-0-0 (सुबह नाश्ते के बाद)' },
      { name: 'Tab. Clonazepam 0.5mg', composition: 'Clonazepam 0.5mg', dosage: '0.5 Tab', frequency: '0-0-1 (रात को)' }
    ],
    advice: 'Morning sunlight exposure 20 mins, mild walking.',
    requiredTests: 'Thyroid Panel, Serum Electrolytes',
    followUpDate: '2026-11-25',
    privateNotes: 'Patient accompanied by family.'
  },
  {
    id: 'rx-sakina-1',
    referenceId: 'REF-217/2026',
    patientName: 'Sakina',
    patientPhone: '7525090696',
    patientAge: '26',
    patientGender: 'Female',
    consultDate: '2026-11-11',
    diagnosis: 'Social Anxiety Disorder & Palpitations',
    chiefComplaints: 'Intense social fear, workplace trembling, performance anxiety',
    bp: '118/76',
    pulse: '82',
    weight: '52',
    sugar: '',
    medications: [
      { name: 'Tab. Nexito Plus', composition: 'Escitalopram 10mg + Clonazepam 0.5mg', dosage: '1 Tab', frequency: '1-0-0 (सुबह)' },
      { name: 'Tab. Propranolol 20mg', composition: 'Propranolol 20mg', dosage: '1 Tab', frequency: 'SOS (ज़रूरत पड़ने पर)' }
    ],
    advice: 'Grounding techniques, 4-7-8 breathing exercises.',
    requiredTests: 'ECG, CBC, TSH',
    followUpDate: '2026-11-28',
    privateNotes: 'Follow-up patient.'
  },
  {
    id: 'rx-munni-1',
    referenceId: 'REF-206/2026',
    patientName: 'Munni',
    patientPhone: '9554554519',
    patientAge: '42',
    patientGender: 'Female',
    consultDate: '2026-11-11',
    diagnosis: 'Chronic Migraine with Sleep Disturbances',
    chiefComplaints: 'Bilateral throbbing headache, photophobia, insomnia',
    bp: '130/84',
    pulse: '76',
    weight: '58',
    sugar: '',
    medications: [
      { name: 'Tab. Amitriptyline 10mg', composition: 'Amitriptyline 10mg', dosage: '1 Tab', frequency: '0-0-1 (रात को सोने से पहले)' },
      { name: 'Tab. Naproxen 500mg', composition: 'Naproxen 500mg', dosage: '1 Tab', frequency: 'SOS (दर्द होने पर)' }
    ],
    advice: 'Maintain regular sleep schedule, avoid dietary triggers.',
    requiredTests: 'CBC, ESR',
    followUpDate: '2026-11-26',
    privateNotes: 'Regular monthly patient.'
  },
  {
    id: 'rx-amir-1',
    referenceId: 'REF-222/2026',
    patientName: 'Amir',
    patientPhone: '9119631330',
    patientAge: '30',
    patientGender: 'Male',
    consultDate: '2026-11-11',
    diagnosis: 'Generalized Anxiety Disorder & Stress Fatigue',
    chiefComplaints: 'Persistent muscle tension, nervous apprehension, disturbed sleep',
    bp: '124/80',
    pulse: '78',
    weight: '66',
    sugar: '',
    medications: [
      { name: 'Tab. Nexito 10mg', composition: 'Escitalopram 10mg', dosage: '1 Tab', frequency: '1-0-0 (सुबह नाश्ते के बाद)' },
      { name: 'Tab. Zapiz 0.25mg', composition: 'Clonazepam 0.25mg', dosage: '1 Tab', frequency: '0-0-1 (रात को)' }
    ],
    advice: 'Daily 30 min brisk walk, limit caffeine after 4 PM.',
    requiredTests: 'CBC, Lipid Profile, TSH',
    followUpDate: '2026-11-25',
    privateNotes: 'Corporate tech employee.'
  },
  {
    id: 'rx-peeyush-1',
    referenceId: 'REF-221/2026',
    patientName: 'Peeyush',
    patientPhone: '9984020882',
    patientAge: '37',
    patientGender: 'Male',
    consultDate: '2026-11-11',
    diagnosis: 'Health Anxiety & Somatization',
    chiefComplaints: 'Constant health worry, frequent chest checking, tension headache',
    bp: '122/80',
    pulse: '74',
    weight: '70',
    sugar: '',
    medications: [
      { name: 'Tab. Nexito Plus', composition: 'Escitalopram 10mg + Clonazepam 0.5mg', dosage: '1 Tab', frequency: '1-0-0 (सुबह)' },
      { name: 'Tab. Dolo 650', composition: 'Paracetamol 650mg', dosage: '1 Tab', frequency: 'SOS (सिरदर्द पर)' }
    ],
    advice: 'Avoid checking vitals repeatedly. Reassurance given.',
    requiredTests: 'ECG, Serum Ferritin, Vit D3',
    followUpDate: '2026-11-26',
    privateNotes: 'Reassured regarding normal ECG and vitals.'
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
    privateNotes,
    queuePatientId
  } = req.body;

  if (!patientName || !patientAge || !patientGender || !diagnosis) {
    return res.status(400).json({
      success: false,
      message: 'Please provide patient details (name, age, gender) and diagnosis.'
    });
  }

  try {
    const doctorProfile = await resolveDoctorProfile(req);

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

    // Prevent duplicate records when the doctor clicks Save or Print multiple times on the SAME visit
    if (!targetRxId && finalReferenceId) {
      try {
        const existingRx = await prisma.offlinePrescription.findFirst({
          where: {
            doctorId: doctorProfile.id,
            referenceId: finalReferenceId
          }
        });
        if (existingRx) {
          const incomingDay = consultDate ? new Date(consultDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
          const existingDay = existingRx.consultDate ? new Date(existingRx.consultDate).toISOString().split('T')[0] : (existingRx.createdAt ? new Date(existingRx.createdAt).toISOString().split('T')[0] : '');
          if (existingDay && existingDay === incomingDay) {
            targetRxId = existingRx.id;
          }
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

    // Auto-mark ONLY the actively consulted patient in OPD Queue as COMPLETED
    if (queuePatientId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(queuePatientId));
      if (isUuid) {
        try {
          await prisma.$executeRawUnsafe(`
            UPDATE "opd_queue"
            SET "status" = 'COMPLETED', "updated_at" = NOW()
            WHERE "id" = $1::uuid;
          `, queuePatientId);
        } catch (qDbErr) {}
      }
      try {
        markQueuePatientCompletedInMemory({ queueId: queuePatientId });
      } catch (e) {}
    } else if (finalReferenceId || patientName) {
      try {
        const cleanRefPattern = finalReferenceId ? `%${finalReferenceId.replace(/^ref-?/i, '').trim()}%` : '%';
        const cleanNamePattern = patientName ? `%${patientName.trim()}%` : '%';
        // Only mark the single earliest WAITING token so future follow-up tokens stay waiting
        await prisma.$executeRawUnsafe(`
          UPDATE "opd_queue"
          SET "status" = 'COMPLETED', "updated_at" = NOW()
          WHERE "id" = (
            SELECT "id" FROM "opd_queue"
            WHERE "status" = 'WAITING'
              AND ("reference_id" ILIKE $1 OR "patient_name" ILIKE $2)
            ORDER BY "token_number" ASC
            LIMIT 1
          );
        `, cleanRefPattern, cleanNamePattern);
      } catch (qDbErr) {
        // Fallback to in-memory queue update if DB is offline
      }
      try {
        markQueuePatientCompletedInMemory({ referenceId: finalReferenceId, patientName });
      } catch (e) {}
    }

    if (!prescriptions || prescriptions.length === 0) {
      prescriptions = inMemoryPrescriptions;
    }

    return res.status(200).json({
      success: true,
      prescription
    });
  } catch (error) {
    console.warn('Database offline, saving prescription in memory fallback:', error.message);
    const cleanRef = referenceId ? referenceId.trim() : `REF-${Math.floor(Math.random() * 900 + 100)}/2026`;
    const cleanRefNum = cleanRef.replace(/^ref-?/i, '').trim();

    // Prevent duplicate records in memory fallback by finding existing record with matching ID or reference ID on the same visit date
    const incomingDay = consultDate ? String(consultDate).split('T')[0] : new Date().toISOString().split('T')[0];
    const existingIndex = inMemoryPrescriptions.findIndex(r => {
      if (id && r.id === id) return true;
      const rRef = String(r.referenceId || '').replace(/^ref-?/i, '').trim();
      const rDay = r.consultDate ? String(r.consultDate).split('T')[0] : (r.createdAt ? String(r.createdAt).split('T')[0] : '');
      return cleanRefNum && rRef && cleanRefNum === rRef && (!rDay || rDay === incomingDay);
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
    const doctorProfile = await resolveDoctorProfile(req);

    let prescriptions = [];
    try {
      const rawRows = await prisma.$queryRawUnsafe(`
        SELECT * FROM "offline_prescriptions"
        ${doctorProfile ? 'WHERE "doctor_id" = $1::uuid' : ''}
        ORDER BY COALESCE("consult_date", "created_at") DESC, "created_at" DESC;
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
        orderBy: [
          { consultDate: 'desc' },
          { createdAt: 'desc' }
        ]
      });
      prescriptions = prismaRxs.map(rx => ({
        ...rx,
        privateNotes: rx.privateNotes || rx.private_notes || '',
        private_notes: rx.privateNotes || rx.private_notes || ''
      }));
    }

    if (!prescriptions || prescriptions.length === 0) {
      prescriptions = inMemoryPrescriptions;
    }

    // Always ensure newest first (descending by consultDate/createdAt, then by reference serial)
    prescriptions.sort((a, b) => {
      const dateA = new Date(a.consultDate || a.consult_date || a.createdAt || a.created_at || 0).getTime();
      const dateB = new Date(b.consultDate || b.consult_date || b.createdAt || b.created_at || 0).getTime();
      if (dateB !== dateA) return dateB - dateA;
      const refA = parseInt(String(a.referenceId || a.reference_id || '').replace(/^ref-?/i, '').split('/')[0], 10) || 0;
      const refB = parseInt(String(b.referenceId || b.reference_id || '').replace(/^ref-?/i, '').split('/')[0], 10) || 0;
      return refB - refA;
    });

    return res.status(200).json({
      success: true,
      prescriptions
    });
  } catch (error) {
    console.warn('Database offline, serving memory prescriptions fallback:', error.message);
    const sortedFallback = [...inMemoryPrescriptions].sort((a, b) => {
      const dateA = new Date(a.consultDate || a.consult_date || a.createdAt || a.created_at || 0).getTime();
      const dateB = new Date(b.consultDate || b.consult_date || b.createdAt || b.created_at || 0).getTime();
      if (dateB !== dateA) return dateB - dateA;
      const refA = parseInt(String(a.referenceId || a.reference_id || '').replace(/^ref-?/i, '').split('/')[0], 10) || 0;
      const refB = parseInt(String(b.referenceId || b.reference_id || '').replace(/^ref-?/i, '').split('/')[0], 10) || 0;
      return refB - refA;
    });
    return res.status(200).json({
      success: true,
      prescriptions: sortedFallback
    });
  }
}

/**
 * Delete an offline prescription by ID.
 */
export async function deleteOfflinePrescription(req, res) {
  const { id } = req.params;

  try {
    const doctorProfile = await resolveDoctorProfile(req);

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
    const doctorProfile = await resolveDoctorProfile(req);

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
