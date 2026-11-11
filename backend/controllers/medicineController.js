import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resolveDoctorProfile(req) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(req?.user?.id || ''));
  if (isUuid) {
    try {
      const profile = await prisma.doctorProfile.findUnique({
        where: { userId: req.user.id }
      });
      if (profile) return profile;
    } catch (e) {}
  }
  try {
    return await prisma.doctorProfile.findFirst();
  } catch (e) {
    return null;
  }
}

const DEFAULT_MEDICINES = [
  { id: 'med-1', name: 'Tab. Nexito 10mg', composition: 'Escitalopram 10mg', dosage: '1 Tab', frequency: '1-0-0 (सुबह नाश्ते के बाद)' },
  { id: 'med-2', name: 'Tab. Zapiz 0.5mg', composition: 'Clonazepam 0.5mg', dosage: '1 Tab', frequency: '0-0-1 (रात को सोते समय)' },
  { id: 'med-3', name: 'Tab. Pantop 40mg', composition: 'Pantoprazole 40mg', dosage: '1 Tab', frequency: '1-0-0 (सुबह खाली पेट)' },
  { id: 'med-4', name: 'Tab. Clonam Pro DS', composition: 'Clonazepam 0.5mg + Propranolol 20mg', dosage: '1 Tab', frequency: 'SOS (जरूरत पड़ने पर)' },
  { id: 'med-5', name: 'Tab. Exitrace', composition: 'Flupenthixole 0.5mg + Melitracen 10mg', dosage: '1 Tab', frequency: '0-0-1 (रात को)' },
  { id: 'med-6', name: 'Tab. Dolo 650', composition: 'Paracetamol 650mg', dosage: '1 Tab', frequency: 'SOS (दर्द होने पर)' },
  { id: 'med-7', name: 'Tab. Etilaam 0.5mg', composition: 'Etizolam 0.5mg', dosage: '1 Tab', frequency: '0-0-1 (रात को)' },
  { id: 'med-8', name: 'Tab. Depsonil 25mg', composition: 'Imipramine 25mg', dosage: '1 Tab', frequency: '0-0-1 (रात को)' },
  { id: 'med-9', name: 'Tab. Sizopin 50mg', composition: 'Clozapine 50mg', dosage: '1 Tab', frequency: '0-0-1 (रात को)' },
  { id: 'med-10', name: 'Tab. Serenace 5mg', composition: 'Haloperidol 5mg', dosage: '1 Tab', frequency: '1-0-1' },
  { id: 'med-11', name: 'Tab. Qutan 50mg', composition: 'Quetiapine 50mg', dosage: '1 Tab', frequency: '0-0-1 (रात को)' },
  { id: 'med-12', name: 'Tab. Valparin 200mg', composition: 'Sodium Valproate 200mg', dosage: '1 Tab', frequency: '1-0-1' }
];

let inMemoryMedicines = [...DEFAULT_MEDICINES];

/**
 * Add or update a medicine in the doctor's database.
 */
export async function addMedicine(req, res) {
  const { name, dosage, composition } = req.body;

  if (!name) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a medicine name.'
    });
  }

  try {
    const doctorProfile = await resolveDoctorProfile(req);

    if (!doctorProfile) {
      const newMed = {
        id: `med-${Date.now()}`,
        name: name.trim(),
        dosage: dosage ? dosage.trim() : '1 Tab',
        composition: composition ? composition.trim() : ''
      };
      inMemoryMedicines.push(newMed);
      return res.status(200).json({
        success: true,
        medicine: newMed
      });
    }

    const trimmedName = name.trim();
    const existing = await prisma.medicine.findFirst({
      where: {
        doctorId: doctorProfile.id,
        name: {
          equals: trimmedName,
          mode: 'insensitive'
        }
      }
    });

    let medicine;
    if (existing) {
      const updateData = {};
      if (dosage !== undefined && dosage !== null && typeof dosage === 'string' && dosage.trim() !== '') {
        updateData.dosage = dosage.trim();
      }
      if (composition !== undefined && composition !== null && typeof composition === 'string' && composition.trim() !== '') {
        updateData.composition = composition.trim();
      }

      if (Object.keys(updateData).length > 0) {
        medicine = await prisma.medicine.update({
          where: { id: existing.id },
          data: updateData
        });
      } else {
        medicine = existing;
      }
    } else {
      medicine = await prisma.medicine.create({
        data: {
          doctorId: doctorProfile.id,
          name: trimmedName,
          dosage: dosage && typeof dosage === 'string' && dosage.trim() !== '' ? dosage.trim() : null,
          composition: composition && typeof composition === 'string' && composition.trim() !== '' ? composition.trim() : null
        }
      });
    }

    return res.status(200).json({
      success: true,
      medicine
    });
  } catch (error) {
    console.warn('Database offline, storing medicine in memory fallback:', error.message);
    const newMed = {
      id: `med-${Date.now()}`,
      name: name.trim(),
      dosage: dosage ? dosage.trim() : '1 Tab',
      composition: composition ? composition.trim() : ''
    };
    inMemoryMedicines.push(newMed);
    return res.status(200).json({
      success: true,
      medicine: newMed
    });
  }
}

/**
 * Get all medicines in the doctor's database.
 */
export async function getMedicines(req, res) {
  try {
    const doctorProfile = await resolveDoctorProfile(req);

    if (doctorProfile) {
      const medicines = await prisma.medicine.findMany({
        where: { doctorId: doctorProfile.id },
        orderBy: { name: 'asc' }
      });
      if (medicines && medicines.length > 0) {
        return res.status(200).json({
          success: true,
          medicines
        });
      }
    }

    return res.status(200).json({
      success: true,
      medicines: inMemoryMedicines
    });
  } catch (error) {
    console.warn('Database offline, serving memory medicines catalog:', error.message);
    return res.status(200).json({
      success: true,
      medicines: inMemoryMedicines
    });
  }
}

/**
 * Update a medicine (change name/spelling or dosage) by ID.
 */
export async function updateMedicine(req, res) {
  const { id } = req.params;
  const { name, dosage, composition } = req.body;

  if (!name) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a medicine name.'
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

    const medicine = await prisma.medicine.findUnique({
      where: { id }
    });

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found.'
      });
    }

    if (medicine.doctorId !== doctorProfile.id) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not own this medicine record.'
      });
    }

    // Check duplicate name for other records
    if (name.trim().toLowerCase() !== medicine.name.toLowerCase()) {
      const duplicate = await prisma.medicine.findFirst({
        where: {
          doctorId: doctorProfile.id,
          name: {
            equals: name.trim(),
            mode: 'insensitive'
          },
          id: { not: id }
        }
      });

      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: 'A medicine with this name already exists in your database.'
        });
      }
    }

    const updated = await prisma.medicine.update({
      where: { id },
      data: {
        name: name.trim(),
        dosage: dosage ? dosage.trim() : null,
        composition: composition ? composition.trim() : null
      }
    });

    return res.status(200).json({
      success: true,
      medicine: updated
    });
  } catch (error) {
    console.error('Error in updateMedicine:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update medicine.'
    });
  }
}

/**
 * Delete a medicine from the doctor's database.
 */
export async function deleteMedicine(req, res) {
  const { id } = req.params;

  try {
    const doctorProfile = await resolveDoctorProfile(req);

    if (!doctorProfile) {
      return res.status(404).json({
        success: false,
        message: 'Doctor profile not found.'
      });
    }

    const medicine = await prisma.medicine.findUnique({
      where: { id }
    });

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found.'
      });
    }

    if (medicine.doctorId !== doctorProfile.id) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not own this medicine record.'
      });
    }

    await prisma.medicine.delete({
      where: { id }
    });

    return res.status(200).json({
      success: true,
      message: 'Medicine deleted successfully.'
    });
  } catch (error) {
    console.error('Error in deleteMedicine:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete medicine.'
    });
  }
}
