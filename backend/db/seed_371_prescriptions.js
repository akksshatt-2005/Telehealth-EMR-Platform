import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

const FIRST_NAMES_MALE = [
  'Naseem', 'Amir', 'Peeyush', 'Ramesh', 'Vikram', 'Rajesh', 'Suresh', 'Manoj',
  'Deepak', 'Sanjay', 'Arun', 'Alok', 'Sunil', 'Vijay', 'Pankaj', 'Anil',
  'Kishore', 'Gopal', 'Mahesh', 'Dinesh', 'Vinod', 'Pramod', 'Santosh', 'Ashok',
  'Rohit', 'Sumit', 'Amit', 'Sachin', 'Rahul', 'Naveen', 'Pradeep', 'Ajay',
  'Mohit', 'Vikas', 'Gaurav', 'Tarun', 'Anand', 'Hemant', 'Vivek', 'Harish',
  'Kartik', 'Maksood Ali', 'Tariq', 'Farhan', 'Imran', 'Rashid', 'Salman', 'Javed'
];

const FIRST_NAMES_FEMALE = [
  'Shaheen', 'Sakina', 'Munni', 'Shabana Begum', 'Pooja', 'Ayesha', 'Sunita', 'Anita',
  'Rekha', 'Geeta', 'Suman', 'Kavita', 'Manju', 'Meena', 'Shobha', 'Usha',
  'Seema', 'Sarita', 'Kamlesh', 'Mamta', 'Neelam', 'Asha', 'Pushpa', 'Madhu',
  'Priyanka', 'Neha', 'Ritu', 'Swati', 'Pooja', 'Divya', 'Anjali', 'Archana',
  'Rupali Yadav', 'Farida', 'Nasreen', 'Zareena', 'Fatima', 'Parveen', 'Sultana', 'Shazia'
];

const LAST_NAMES = [
  'Sharma', 'Verma', 'Singh', 'Gupta', 'Srivastava', 'Yadav', 'Mishra', 'Pandey',
  'Tiwari', 'Shukla', 'Dubey', 'Tripathi', 'Upadhyay', 'Saxena', 'Agrawal', 'Khan',
  'Siddiqui', 'Ansari', 'Qureshi', 'Begum', 'Malik', 'Ahmed', 'Ali', 'Chauhan',
  'Rathore', 'Tomar', 'Patel', 'Joshi', 'Bhatt', 'Nair', 'Menon', 'Pillai'
];

const CLINICAL_DIAGNOSES = [
  {
    diagnosis: 'Generalised Anxiety Disorder with Insomnia',
    complaints: 'Severe anxiety, persistent worrying, muscle tension, sleep onset insomnia',
    meds: [
      { name: 'Tab. Nexito 10mg', composition: 'Escitalopram 10mg', dosage: '1 Tab', frequency: '1-0-0 (सुबह नाश्ते के बाद)' },
      { name: 'Tab. Zapiz 0.25mg', composition: 'Clonazepam 0.25mg', dosage: '1 Tab', frequency: '0-0-1 (रात को सोते समय)' },
      { name: 'Tab. Pantop 40mg', composition: 'Pantoprazole 40mg', dosage: '1 Tab', frequency: '1-0-0 (BBF)' }
    ],
    advice: 'Deep breathing exercises 15 mins daily, reduce caffeine, avoid screen time 1 hr before bed.',
    tests: 'CBC, Thyroid Profile (TSH), Serum Ferritin',
    notes: 'Responds well to SSRI. Benzodiazepine on short course taper.'
  },
  {
    diagnosis: 'Panic Disorder with Mild Agoraphobia',
    complaints: 'Sudden intense panic episodes, palpitations, chest tightness, fear of crowded places',
    meds: [
      { name: 'Tab. Exitrace', composition: 'Flupenthixole 0.5mg + Melitracen 10mg', dosage: '1 Tab', frequency: '0-0-1 (रात को)' },
      { name: 'Tab. Clonam Pro DS', composition: 'Clonazepam 0.5mg + Propranolol 20mg', dosage: '1 Tab', frequency: 'SOS (घबराहट के दौरे पर)' },
      { name: 'Tab. Nexito Plus', composition: 'Escitalopram 10mg + Clonazepam 0.5mg', dosage: '1 Tab', frequency: '1-0-0 (सुबह)' }
    ],
    advice: 'Grounding 5-4-3-2-1 technique, diaphragmatic breathing. Regular clinic follow-up.',
    tests: 'ECG, Serum Electrolytes, LFT',
    notes: 'Anticipatory anxiety monitored. Cognitive reframing advised.'
  },
  {
    diagnosis: 'Major Depressive Disorder (Moderate)',
    complaints: 'Pervasive low mood, anhedonia, profound fatigue, early morning awakening',
    meds: [
      { name: 'Tab. Duloxetine 30mg', composition: 'Duloxetine 30mg', dosage: '1 Tab', frequency: '1-0-0 (सुबह)' },
      { name: 'Tab. Clonazepam 0.5mg', composition: 'Clonazepam 0.5mg', dosage: '0.5 Tab', frequency: '0-0-1 (रात को)' },
      { name: 'Tab. Pantop 40mg', composition: 'Pantoprazole 40mg', dosage: '1 Tab', frequency: '1-0-0 (सुबह खाली पेट)' }
    ],
    advice: '30 min daily morning brisk walk in natural sunlight. Encourage family engagement.',
    tests: 'Vitamin D3, Vitamin B12, TSH',
    notes: 'Support system active. Appetite recovering.'
  },
  {
    diagnosis: 'Chronic Tension-Type Headache & Somatoform Pain',
    complaints: 'Band-like dull headache, bilateral temple pressure, tight neck & shoulder stiffness',
    meds: [
      { name: 'Tab. Amitriptyline 10mg', composition: 'Amitriptyline 10mg', dosage: '1 Tab', frequency: '0-0-1 (रात को सोने से पहले)' },
      { name: 'Tab. Dolo 650', composition: 'Paracetamol 650mg', dosage: '1 Tab', frequency: 'SOS (तेज़ सिरदर्द होने पर)' },
      { name: 'Tab. Pantop 40mg', composition: 'Pantoprazole 40mg', dosage: '1 Tab', frequency: '1-0-0 (सुबह खाली पेट)' }
    ],
    advice: 'Hot fomentation to neck, ergonomic workstation adjustments, neck posture exercises.',
    tests: 'Cervical Spine X-Ray, CBC, Serum Calcium',
    notes: 'Tricyclic prophylaxis initiated with gradual benefit.'
  },
  {
    diagnosis: 'Episodic Migraine with Aura',
    complaints: 'Unilateral throbbing head pain, photophobia, phonophobia, nausea, visual flashing',
    meds: [
      { name: 'Tab. Propranolol 40mg', composition: 'Propranolol 40mg', dosage: '1 Tab', frequency: '1-0-0 (सुबह)' },
      { name: 'Tab. Naproxen 500mg', composition: 'Naproxen 500mg', dosage: '1 Tab', frequency: 'SOS (दर्द की शुरुआत में)' },
      { name: 'Tab. Domstal 10mg', composition: 'Domperidone 10mg', dosage: '1 Tab', frequency: 'SOS (उल्टी का मन होने पर)' }
    ],
    advice: 'Maintain a headache diary. Avoid identified dietary triggers (caffeine, aged foods).',
    tests: 'MRI Brain with MR Angiography (screening normal)',
    notes: 'Prophylaxis ongoing. Frequency down to once a month.'
  },
  {
    diagnosis: 'Obsessive Compulsive Disorder (Contamination / Checking)',
    complaints: 'Intrusive repetitive contamination thoughts, compulsive washing, checking locks',
    meds: [
      { name: 'Tab. Flunil 20mg', composition: 'Fluoxetine 20mg', dosage: '1 Tab', frequency: '1-0-0 (सुबह नाश्ते के बाद)' },
      { name: 'Tab. Zapiz 0.25mg', composition: 'Clonazepam 0.25mg', dosage: '1 Tab', frequency: '0-0-1 (रात को)' }
    ],
    advice: 'Exposure and Response Prevention (ERP) exercises. Delay ritual by 10 minutes.',
    tests: 'LFT, RFT, CBC',
    notes: 'Insight preserved. ERP progress monitored weekly.'
  },
  {
    diagnosis: 'Bipolar Affective Disorder (Currently Euthymic / Remission)',
    complaints: 'Stable mood for 4 months, no depressive or hypomanic symptoms, normal sleep',
    meds: [
      { name: 'Tab. Divalproex Sodium 500mg', composition: 'Divalproex Sodium ER 500mg', dosage: '1 Tab', frequency: '0-0-1 (रात को भोजन के बाद)' },
      { name: 'Tab. Quetiapine 50mg', composition: 'Quetiapine 50mg', dosage: '1 Tab', frequency: '0-0-1 (रात को सोने से पहले)' }
    ],
    advice: 'Strict adherence to mood stabilizer. Do not skip doses. Regular sleep hygiene.',
    tests: 'Serum Valproic Acid Level, LFT, Lipid Profile, Platelet Count',
    notes: 'Serum Valproate level 72 mcg/mL (therapeutic range). Excellent compliance.'
  },
  {
    diagnosis: 'Adult ADHD with Secondary Executive Dysfunction',
    complaints: 'Difficulty focusing at work, procrastination, internal restlessness, frequent disorganization',
    meds: [
      { name: 'Tab. Atomoxetine 25mg', composition: 'Atomoxetine 25mg', dosage: '1 Tab', frequency: '1-0-0 (सुबह नाश्ते के बाद)' },
      { name: 'Tab. Nexito 5mg', composition: 'Escitalopram 5mg', dosage: '1 Tab', frequency: '1-0-0 (सुबह)' }
    ],
    advice: 'Pomodoro study/work timer (25 min focus, 5 min break). Written planner daily.',
    tests: 'ECG, Blood Pressure Profile',
    notes: 'Gradual titration of atomoxetine. Good tolerability.'
  }
];

async function seed371Prescriptions() {
  console.log('Seeding full 371 clinical prescriptions into PostgreSQL...');

  const doctorProfile = await prisma.doctorProfile.findFirst();
  if (!doctorProfile) {
    console.error('No doctor profile found in database.');
    process.exit(1);
  }
  const docId = doctorProfile.id;

  // Clear existing to establish the clean, deduplicated, beautifully sorted 371 records
  await prisma.offlinePrescription.deleteMany({ where: { doctorId: docId } });

  const totalTarget = 371;
  const records = [];

  // Anchor fixed core patients for today (11/11/2026)
  const todayAnchors = [
    {
      serial: 223,
      name: 'Shaheen',
      age: 50,
      gender: 'Female',
      phone: '9559887094',
      date: new Date('2026-11-11T12:15:00Z'),
      diagIndex: 2,
      bp: '136/88',
      pulse: '84',
      weight: '64'
    },
    {
      serial: 222,
      name: 'Amir',
      age: 30,
      gender: 'Male',
      phone: '9119631330',
      date: new Date('2026-11-11T12:10:00Z'),
      diagIndex: 0,
      bp: '124/80',
      pulse: '78',
      weight: '66'
    },
    {
      serial: 221,
      name: 'Peeyush',
      age: 37,
      gender: 'Male',
      phone: '9984020882',
      date: new Date('2026-11-11T12:05:00Z'),
      diagIndex: 1,
      bp: '122/80',
      pulse: '74',
      weight: '70'
    },
    {
      serial: 217,
      name: 'Sakina',
      age: 26,
      gender: 'Female',
      phone: '7525090696',
      date: new Date('2026-11-11T11:55:00Z'),
      diagIndex: 1,
      bp: '118/76',
      pulse: '82',
      weight: '52'
    },
    {
      serial: 213,
      name: 'Naseem',
      age: 53,
      gender: 'Male',
      phone: '9876543210',
      date: new Date('2026-11-11T11:45:00Z'),
      diagIndex: 1,
      bp: '131/89',
      pulse: '85',
      weight: '48'
    },
    {
      serial: 206,
      name: 'Munni',
      age: 42,
      gender: 'Female',
      phone: '9554554519',
      date: new Date('2026-11-11T11:30:00Z'),
      diagIndex: 3,
      bp: '130/84',
      pulse: '76',
      weight: '58'
    },
    // Past Naseem visits
    {
      serial: 189,
      name: 'Naseem',
      age: 53,
      gender: 'Male',
      phone: '9876543210',
      date: new Date('2026-10-18T10:30:00Z'),
      diagIndex: 1,
      bp: '128/82',
      pulse: '76',
      weight: '50'
    },
    {
      serial: 165,
      name: 'Shabana Begum',
      age: 48,
      gender: 'Female',
      phone: '9876543210',
      date: new Date('2026-10-02T10:00:00Z'),
      diagIndex: 3,
      bp: '136/88',
      pulse: '84',
      weight: '62'
    },
    {
      serial: 148,
      name: 'Naseem',
      age: 53,
      gender: 'Male',
      phone: '9876543210',
      date: new Date('2026-09-15T11:00:00Z'),
      diagIndex: 0,
      bp: '132/86',
      pulse: '82',
      weight: '49'
    },
    {
      serial: 104,
      name: 'Naseem',
      age: 53,
      gender: 'Male',
      phone: '9876543210',
      date: new Date('2026-08-15T10:30:00Z'),
      diagIndex: 0,
      bp: '140/92',
      pulse: '90',
      weight: '51'
    }
  ];

  const anchorMap = new Map();
  for (const a of todayAnchors) {
    anchorMap.set(a.serial, a);
  }

  const startDate = new Date('2026-01-05T09:00:00Z');
  const endDate = new Date('2026-11-11T12:00:00Z');
  const timeSpan = endDate.getTime() - startDate.getTime();

  for (let s = 1; s <= totalTarget; s++) {
    const isAnchor = anchorMap.has(s);
    const anchor = isAnchor ? anchorMap.get(s) : null;

    let pName, pAge, pGender, pPhone, consultDate, diagObj, bp, pulse, weight;

    if (anchor) {
      pName = anchor.name;
      pAge = anchor.age;
      pGender = anchor.gender;
      pPhone = anchor.phone;
      consultDate = anchor.date;
      diagObj = CLINICAL_DIAGNOSES[anchor.diagIndex];
      bp = anchor.bp;
      pulse = anchor.pulse;
      weight = anchor.weight;
    } else {
      const isFemale = (s % 3 === 0);
      const firstNames = isFemale ? FIRST_NAMES_FEMALE : FIRST_NAMES_MALE;
      const firstName = firstNames[s % firstNames.length];
      const lastName = LAST_NAMES[(s * 7) % LAST_NAMES.length];
      pName = `${firstName} ${lastName}`;
      pGender = isFemale ? 'Female' : 'Male';
      pAge = 18 + ((s * 13) % 55);
      pPhone = `98${String(10000000 + (s * 93821) % 90000000)}`;

      // Distribute consultDate progressively across the year
      const progress = (s - 1) / (totalTarget - 1);
      const computedMs = startDate.getTime() + progress * timeSpan;
      consultDate = new Date(computedMs);

      diagObj = CLINICAL_DIAGNOSES[s % CLINICAL_DIAGNOSES.length];
      bp = `${115 + (s % 25)}/${75 + (s % 16)}`;
      pulse = `${70 + (s % 22)}`;
      weight = `${48 + (s % 38)}`;
    }

    const followUpDate = new Date(consultDate.getTime() + (14 + (s % 14)) * 86400000);

    records.push({
      id: crypto.randomUUID(),
      doctorId: docId,
      referenceId: `${s}/2026`,
      patientName: pName,
      patientAge: pAge,
      patientGender: pGender,
      patientPhone: pPhone,
      consultDate: consultDate,
      diagnosis: diagObj.diagnosis,
      chiefComplaints: diagObj.complaints,
      bp: bp,
      pulse: pulse,
      weight: weight,
      medications: diagObj.meds,
      advice: diagObj.advice,
      requiredTests: diagObj.tests,
      followUpDate: followUpDate,
      privateNotes: diagObj.notes,
      pageWidth: 800,
      pageHeight: 1120,
      fontSize: 13,
      marginSize: 40,
      rowSpacing: 12,
      useLetterhead: false,
      createdAt: consultDate,
      updatedAt: consultDate
    });
  }

  // Insert in batches of 50
  for (let i = 0; i < records.length; i += 50) {
    const chunk = records.slice(i, i + 50);
    await prisma.offlinePrescription.createMany({
      data: chunk
    });
  }

  const count = await prisma.offlinePrescription.count({ where: { doctorId: docId } });
  console.log(`Success! Total prescriptions in PostgreSQL database: ${count}`);
  process.exit(0);
}

seed371Prescriptions().catch(err => {
  console.error('Fatal error seeding 371:', err);
  process.exit(1);
});

