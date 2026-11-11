import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedClinicalRecords() {
  console.log('Seeding clinical offline prescriptions into PostgreSQL...');

  const doctorProfile = await prisma.doctorProfile.findFirst();
  if (!doctorProfile) {
    console.error('No doctor profile found in database.');
    process.exit(1);
  }

  const docId = doctorProfile.id;

  const corePatients = [
    // 1. Naseem (Historic visits + Today's visit)
    {
      referenceId: '104/2026',
      patientName: 'Naseem',
      patientAge: 53,
      patientGender: 'Male',
      patientPhone: '9876543210',
      consultDate: new Date('2026-08-15T10:30:00Z'),
      diagnosis: 'Generalised Anxiety Disorder with Insomnia',
      chiefComplaints: 'Severe anxiety, chest heaviness, sleep onset insomnia',
      bp: '140/92',
      pulse: '90',
      weight: '51',
      medications: [
        { name: 'Tab. Nexito 10mg', composition: 'Escitalopram 10mg', dosage: '1 Tab', frequency: '1-0-0 (सुबह नाश्ते के बाद)' },
        { name: 'Tab. Zapiz 0.5mg', composition: 'Clonazepam 0.5mg', dosage: '1 Tab', frequency: '0-0-1 (रात को सोते समय)' },
        { name: 'Tab. Pantop 40mg', composition: 'Pantoprazole 40mg', dosage: '1 Tab', frequency: '1-0-0 (सुबह खाली पेट)' }
      ],
      advice: 'Deep breathing exercises 15 mins daily, reduce caffeine, 20 min morning walk.',
      requiredTests: 'CBC, Thyroid Profile (TSH), ECG',
      followUpDate: new Date('2026-09-15T00:00:00Z'),
      privateNotes: 'Initial psychiatric evaluation. Sleep hygiene discussed.'
    },
    {
      referenceId: '148/2026',
      patientName: 'Naseem',
      patientAge: 53,
      patientGender: 'Male',
      patientPhone: '9876543210',
      consultDate: new Date('2026-09-15T11:00:00Z'),
      diagnosis: 'GAD in Partial Remission',
      chiefComplaints: 'Anxiety reduced by 60%, sleep improved, occasional restlessness',
      bp: '132/86',
      pulse: '82',
      weight: '49',
      medications: [
        { name: 'Tab. Nexito 10mg', composition: 'Escitalopram 10mg', dosage: '1 Tab', frequency: '1-0-0 (सुबह नाश्ते के बाद)' },
        { name: 'Tab. Zapiz 0.25mg', composition: 'Clonazepam 0.25mg', dosage: '0.5 Tab', frequency: '0-0-1 (रात को सोते समय)' }
      ],
      advice: 'Continue morning routine, regular meditation, follow-up in 1 month.',
      requiredTests: 'Lipid profile, Serum Creatinine',
      followUpDate: new Date('2026-10-18T00:00:00Z'),
      privateNotes: 'Good response to SSRI. Tapering benzodiazepine dose.'
    },
    {
      referenceId: '189/2026',
      patientName: 'Naseem',
      patientAge: 53,
      patientGender: 'Male',
      patientPhone: '9876543210',
      consultDate: new Date('2026-10-18T11:30:00Z'),
      diagnosis: 'GAD in Clinical Remission',
      chiefComplaints: 'Sleep sound, minimal anxiety symptoms, mild muscle ache',
      bp: '128/82',
      pulse: '76',
      weight: '50',
      medications: [
        { name: 'Tab. Exitrace', composition: 'Flupenthixole 0.5mg + Melitracen 10mg', dosage: '1 Tab', frequency: '0-0-1 (रात को)' },
        { name: 'Tab. Clonam Pro DS', composition: 'Clonazepam 0.5mg + Propranolol 20mg', dosage: '1 Tab', frequency: 'SOS (ज़रूरत पड़ने पर)' }
      ],
      advice: 'Progressive muscle relaxation, avoid heavy dinner late night, follow up in 3 weeks.',
      requiredTests: 'LFT, Serum Electrolytes',
      followUpDate: new Date('2026-11-10T00:00:00Z'),
      privateNotes: 'Switched to Exitrace + Clonam combo. Patient feeling stable.'
    },
    {
      referenceId: '213/2026',
      patientName: 'Naseem',
      patientAge: 53,
      patientGender: 'Male',
      patientPhone: '9876543210',
      consultDate: new Date('2026-11-11T12:00:00Z'),
      diagnosis: 'PANIC DISORDER WITH MILD AGORAPHOBIA',
      chiefComplaints: 'ANXIETY, RESTLESSNESS, DYSPNEA, BODY PAINS, INTERMITTENT PANIC ATTACKS',
      bp: '131/89',
      pulse: '85',
      weight: '48',
      medications: [
        { name: 'EXITRACE', composition: 'FLUPENTHIXOLE', dosage: '1MG', frequency: '0-0-1 (रात को सोने से पहले / At bedtime)' },
        { name: 'CLONAM PRO DS', composition: 'CLONAZEPAM 0.5 MG + PROPRANOLOL 20 MG', dosage: '1TAB', frequency: 'SOS (ज़रूरत पड़ने पर / As needed) FOR ANXIETY ATTACKS' },
        { name: 'NEXITO PLUS', composition: 'ESCITALOPRAM 10 MG + CLONAZEPAM 0.5 MG', dosage: '1TAB', frequency: '1-0-0 (सुबह नाश्ते के बाद)' }
      ],
      advice: 'Follow-up: Visit within 17 days (Date: 27/11/2026). Deep breathing exercises and cognitive grounding.',
      requiredTests: 'CBC, THYROID PROFILE',
      followUpDate: new Date('2026-11-27T00:00:00Z'),
      privateNotes: 'Regular follow-up. Monitored for anticipatory panic symptoms.'
    },

    // 2. Shabana Begum
    {
      referenceId: '165/2026',
      patientName: 'Shabana Begum',
      patientAge: 48,
      patientGender: 'Female',
      patientPhone: '9876543210',
      consultDate: new Date('2026-10-02T10:00:00Z'),
      diagnosis: 'Tension-Type Headache & Somatoform Pain',
      chiefComplaints: 'Chronic temple pain, neck tightness, disturbed sleep',
      bp: '136/88',
      pulse: '84',
      weight: '62',
      medications: [
        { name: 'Tab. Amitriptyline 10mg', composition: 'Amitriptyline 10mg', dosage: '1 Tab', frequency: '0-0-1 (रात को)' },
        { name: 'Tab. Pantop 40mg', composition: 'Pantoprazole 40mg', dosage: '1 Tab', frequency: '1-0-0 (सुबह खाली पेट)' }
      ],
      advice: 'Neck posture exercises, hot fomentation, reduce screen time.',
      requiredTests: 'CBC, Serum B12, Vit D3',
      followUpDate: new Date('2026-11-02T00:00:00Z'),
      privateNotes: 'Referred by family. Needs follow-up in 1 month.'
    },

    // 3. Shaheen
    {
      referenceId: '223/2026',
      patientName: 'Shaheen',
      patientAge: 50,
      patientGender: 'Female',
      patientPhone: '9559887094',
      consultDate: new Date('2026-11-11T12:15:00Z'),
      diagnosis: 'Major Depressive Episode with Psychomotor Agitation',
      chiefComplaints: 'Low mood, early morning awakening, psychomotor restlessness',
      bp: '136/88',
      pulse: '84',
      weight: '64',
      medications: [
        { name: 'Tab. Duloxetine 30mg', composition: 'Duloxetine 30mg', dosage: '1 Tab', frequency: '1-0-0 (सुबह नाश्ते के बाद)' },
        { name: 'Tab. Clonazepam 0.5mg', composition: 'Clonazepam 0.5mg', dosage: '0.5 Tab', frequency: '0-0-1 (रात को)' },
        { name: 'Tab. Pantop 40mg', composition: 'Pantoprazole 40mg', dosage: '1 Tab', frequency: '1-0-0 (BBF)' }
      ],
      advice: 'Morning sunlight exposure 20 mins, mild walking, avoid isolation.',
      requiredTests: 'Thyroid Panel, Serum Electrolytes, LFT',
      followUpDate: new Date('2026-11-25T00:00:00Z'),
      privateNotes: 'Patient supported by daughter. Follow up in 2 weeks.'
    },

    // 4. Sakina
    {
      referenceId: '217/2026',
      patientName: 'Sakina',
      patientAge: 26,
      patientGender: 'Female',
      patientPhone: '7525090696',
      consultDate: new Date('2026-11-11T12:20:00Z'),
      diagnosis: 'Social Anxiety Disorder & Palpitations',
      chiefComplaints: 'Intense social fear, workplace trembling, performance anxiety',
      bp: '118/76',
      pulse: '82',
      weight: '52',
      medications: [
        { name: 'Tab. Nexito Plus', composition: 'Escitalopram 10mg + Clonazepam 0.5mg', dosage: '1 Tab', frequency: '1-0-0 (सुबह)' },
        { name: 'Tab. Propranolol 20mg', composition: 'Propranolol 20mg', dosage: '1 Tab', frequency: 'SOS (ज़रूरत पड़ने पर)' }
      ],
      advice: 'Grounding techniques, 4-7-8 breathing exercises before meetings.',
      requiredTests: 'ECG, CBC, TSH',
      followUpDate: new Date('2026-11-28T00:00:00Z'),
      privateNotes: 'Follow-up consultation. Reports gradual improvement.'
    },

    // 5. Munni
    {
      referenceId: '206/2026',
      patientName: 'Munni',
      patientAge: 42,
      patientGender: 'Female',
      patientPhone: '9554554519',
      consultDate: new Date('2026-11-11T12:25:00Z'),
      diagnosis: 'Chronic Migraine with Sleep Disturbances',
      chiefComplaints: 'Bilateral throbbing headache, photophobia, insomnia',
      bp: '130/84',
      pulse: '76',
      weight: '58',
      medications: [
        { name: 'Tab. Amitriptyline 10mg', composition: 'Amitriptyline 10mg', dosage: '1 Tab', frequency: '0-0-1 (रात को सोने से पहले)' },
        { name: 'Tab. Naproxen 500mg', composition: 'Naproxen 500mg', dosage: '1 Tab', frequency: 'SOS (दर्द होने पर)' },
        { name: 'Tab. Pantop 40mg', composition: 'Pantoprazole 40mg', dosage: '1 Tab', frequency: '1-0-0 (सुबह खाली पेट)' }
      ],
      advice: 'Maintain regular sleep schedule, avoid dietary triggers (aged cheese, excessive tea).',
      requiredTests: 'MRI Brain (if unremitting), CBC, ESR',
      followUpDate: new Date('2026-11-26T00:00:00Z'),
      privateNotes: 'Regular monthly patient. Response to prophylactic tricyclics good.'
    },

    // 6. Amir
    {
      referenceId: '222/2026',
      patientName: 'Amir',
      patientAge: 30,
      patientGender: 'Male',
      patientPhone: '9119631330',
      consultDate: new Date('2026-11-11T12:30:00Z'),
      diagnosis: 'Generalized Anxiety Disorder & Stress Fatigue',
      chiefComplaints: 'Persistent muscle tension, nervous apprehension, disturbed sleep',
      bp: '124/80',
      pulse: '78',
      weight: '66',
      medications: [
        { name: 'Tab. Nexito 10mg', composition: 'Escitalopram 10mg', dosage: '1 Tab', frequency: '1-0-0 (सुबह नाश्ते के बाद)' },
        { name: 'Tab. Zapiz 0.25mg', composition: 'Clonazepam 0.25mg', dosage: '1 Tab', frequency: '0-0-1 (रात को)' }
      ],
      advice: 'Daily 30 min brisk walk, limit caffeine after 4 PM, progressive relaxation.',
      requiredTests: 'CBC, Lipid Profile, TSH',
      followUpDate: new Date('2026-11-25T00:00:00Z'),
      privateNotes: 'Corporate tech employee. High workload anxiety.'
    },

    // 7. Peeyush
    {
      referenceId: '221/2026',
      patientName: 'Peeyush',
      patientAge: 37,
      patientGender: 'Male',
      patientPhone: '9984020882',
      consultDate: new Date('2026-11-11T12:35:00Z'),
      diagnosis: 'Health Anxiety & Somatization',
      chiefComplaints: 'Constant health worry, frequent chest checking, tension headache',
      bp: '122/80',
      pulse: '74',
      weight: '70',
      medications: [
        { name: 'Tab. Nexito Plus', composition: 'Escitalopram 10mg + Clonazepam 0.5mg', dosage: '1 Tab', frequency: '1-0-0 (सुबह)' },
        { name: 'Tab. Dolo 650', composition: 'Paracetamol 650mg', dosage: '1 Tab', frequency: 'SOS (सिरदर्द पर)' }
      ],
      advice: 'Avoid checking vitals repeatedly. Reassurance and cognitive restructuring.',
      requiredTests: 'ECG, Serum Ferritin, Vit D3',
      followUpDate: new Date('2026-11-26T00:00:00Z'),
      privateNotes: 'Reassured regarding normal ECG and vitals.'
    }
  ];

  for (const p of corePatients) {
    try {
      const existing = await prisma.offlinePrescription.findFirst({
        where: {
          doctorId: docId,
          referenceId: p.referenceId
        }
      });

      if (!existing) {
        await prisma.offlinePrescription.create({
          data: {
            doctorId: docId,
            referenceId: p.referenceId,
            patientName: p.patientName,
            patientAge: p.patientAge,
            patientGender: p.patientGender,
            patientPhone: p.patientPhone,
            consultDate: p.consultDate,
            diagnosis: p.diagnosis,
            chiefComplaints: p.chiefComplaints,
            bp: p.bp,
            pulse: p.pulse,
            weight: p.weight,
            medications: p.medications,
            advice: p.advice,
            requiredTests: p.requiredTests,
            followUpDate: p.followUpDate,
            privateNotes: p.privateNotes,
            useLetterhead: false
          }
        });
        console.log(`Created prescription for ${p.patientName} (Ref: ${p.referenceId})`);
      } else {
        await prisma.offlinePrescription.update({
          where: { id: existing.id },
          data: {
            medications: p.medications,
            diagnosis: p.diagnosis,
            chiefComplaints: p.chiefComplaints,
            bp: p.bp,
            pulse: p.pulse,
            weight: p.weight,
            advice: p.advice,
            requiredTests: p.requiredTests,
            privateNotes: p.privateNotes
          }
        });
        console.log(`Updated prescription for ${p.patientName} (Ref: ${p.referenceId})`);
      }
    } catch (err) {
      console.error(`Error saving ${p.patientName}:`, err.message);
    }
  }

  const total = await prisma.offlinePrescription.count({ where: { doctorId: docId } });
  console.log(`Seeding complete! Total offline prescriptions in database: ${total}`);
  process.exit(0);
}

seedClinicalRecords().catch(err => {
  console.error('Fatal error in seed:', err);
  process.exit(1);
});
