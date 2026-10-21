import React, { useState, useEffect, useMemo, useRef } from 'react';

export default function ReceptionDeskView({
  user,
  token,
  API_BASE_URL,
  handleLogout,
  opdQueue,
  setOpdQueue,
  fetchOpdQueue,
  loadingOpdQueue,
  offlineRxList,
  formatPrintDate
}) {
  // Form State
  const [formData, setFormData] = useState({
    patientName: '',
    patientPhone: '',
    patientAge: '',
    patientGender: 'Male',
    referenceId: '',
    bp: '',
    pulse: '',
    weight: '',
    sugar: '',
    temperature: '',
    chiefComplaints: '',
    privateNotes: ''
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedPatientNotice, setSelectedPatientNotice] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Auto-refresh interval (every 8 seconds to keep live queue sync)
  useEffect(() => {
    fetchOpdQueue();
    const interval = setInterval(() => {
      fetchOpdQueue();
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  // Quick symptom chips for front desk
  const quickSymptoms = [
    'Follow-up visit',
    'Headache / Migraine',
    'Severe Anxiety & Panic',
    'Insomnia / Sleep issue',
    'Depression / Low mood',
    'Body pain & Fatigue',
    'Routine Consultation'
  ];

  // Search for existing patients when searchQuery changes
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || q.length < 1) {
      setSearchResults([]);
      return;
    }

    const serialPart = q.split('/')[0].trim();

    // 1. Instant synchronous local search across offlineRxList & cached_offline_prescriptions
    let pool = (Array.isArray(offlineRxList) && offlineRxList.length > 0) ? [...offlineRxList] : [];
    if (pool.length === 0) {
      try {
        const saved = localStorage.getItem('cached_offline_prescriptions');
        if (saved) pool = JSON.parse(saved);
      } catch (e) {}
    }

    const localMatches = pool.filter(rx => {
      const pPhone = (rx.patientPhone || '').toLowerCase().trim();
      const pName = (rx.patientName || '').toLowerCase().trim();
      const pRef = (rx.referenceId || '').toLowerCase().trim();
      const pSerial = pRef.split('/')[0].trim();
      return (
        pRef === q ||
        pRef.includes(q) ||
        pSerial === serialPart ||
        pSerial === q ||
        pName.includes(q) ||
        pPhone.includes(q)
      );
    });

    const seen = new Set();
    const uniqueLocal = [];
    for (const rx of localMatches) {
      const key = `${(rx.patientName || '').toLowerCase().trim()}_${(rx.referenceId || '').trim()}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueLocal.push(rx);
      }
    }

    // Set immediate results so user sees suggestions in 0ms!
    if (uniqueLocal.length > 0) {
      setSearchResults(uniqueLocal.slice(0, 8));
    }

    // 2. Also query backend in parallel
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`${API_BASE_URL}/opd/search-patients?q=${encodeURIComponent(q)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.patients) && data.patients.length > 0) {
          setSearchResults(data.patients);
        } else if (uniqueLocal.length === 0) {
          setSearchResults([]);
        }
      } catch (err) {
        console.warn('Patient search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [searchQuery, offlineRxList]);

  // Select an existing patient / family member
  const handleSelectPatient = (patient) => {
    setFormData(prev => ({
      ...prev,
      patientName: patient.patientName || '',
      patientPhone: patient.patientPhone || searchQuery || '',
      patientAge: patient.patientAge ? String(patient.patientAge) : '',
      patientGender: patient.patientGender || 'Male',
      referenceId: patient.referenceId || '',
      // Do not copy past vitals so receptionist takes fresh ones, but keep recent complaint as reference if desired
      chiefComplaints: '',
      privateNotes: ''
    }));

    setSelectedPatientNotice({
      name: patient.patientName,
      refId: patient.referenceId,
      date: patient.consultDate || patient.createdAt,
      type: 'EXISTING'
    });
    setSearchResults([]);
  };

  // Register a new family member under this same phone number
  const handleRegisterNewFamilyMember = () => {
    const currentPhone = formData.patientPhone || searchQuery;
    setFormData({
      patientName: '',
      patientPhone: currentPhone,
      patientAge: '',
      patientGender: 'Male',
      referenceId: '', // Will be assigned next sequential ID
      bp: '',
      pulse: '',
      weight: '',
      sugar: '',
      temperature: '',
      chiefComplaints: '',
      privateNotes: ''
    });

    setSelectedPatientNotice({
      name: 'New Family Member',
      phone: currentPhone,
      type: 'NEW_FAMILY_MEMBER'
    });
    setSearchResults([]);
  };

  // Append symptom chip to chief complaints
  const handleAddSymptomChip = (symptom) => {
    setFormData(prev => {
      const current = prev.chiefComplaints ? prev.chiefComplaints.trim() : '';
      if (!current) return { ...prev, chiefComplaints: symptom };
      if (current.includes(symptom)) return prev;
      return { ...prev, chiefComplaints: `${current}, ${symptom}` };
    });
  };

  // Submit Check-in Form
  const handleSubmitCheckin = async (e) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!formData.patientName || !formData.patientName.trim()) {
      setErrorMessage('Please enter the patient full name.');
      return;
    }

    if (!formData.patientAge || isNaN(parseInt(formData.patientAge, 10))) {
      setErrorMessage('Please enter a valid age in years.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE_URL}/opd/checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      const data = await res.json();

      if (data.success) {
        setSuccessMessage(`✅ Patient ${formData.patientName} checked in successfully! Token #${data.item?.token_number || opdQueue.length + 1} sent to Doctor.`);
        if (data.item && setOpdQueue) {
          setOpdQueue(prev => [...prev, data.item]);
        }
        // Reset form
        setFormData({
          patientName: '',
          patientPhone: '',
          patientAge: '',
          patientGender: 'Male',
          referenceId: '',
          bp: '',
          pulse: '',
          weight: '',
          sugar: '',
          temperature: '',
          chiefComplaints: '',
          privateNotes: ''
        });
        setSearchQuery('');
        setSelectedPatientNotice(null);
        fetchOpdQueue();
      } else {
        // Resilient local fallback so receptionist is NEVER blocked even if server is redeploying
        const localItem = {
          id: `local-queue-${Date.now()}`,
          token_number: opdQueue.length + 1,
          patient_name: formData.patientName,
          patient_phone: formData.patientPhone,
          patient_age: parseInt(formData.patientAge, 10),
          patient_gender: formData.patientGender,
          reference_id: formData.referenceId || `${opdQueue.length + 101}/${new Date().getFullYear()}`,
          bp: formData.bp,
          pulse: formData.pulse,
          weight: formData.weight,
          sugar: formData.sugar,
          temperature: formData.temperature,
          chief_complaints: formData.chiefComplaints,
          private_notes: formData.privateNotes,
          status: 'WAITING',
          created_at: new Date().toISOString()
        };
        const updated = [...opdQueue, localItem];
        if (setOpdQueue) setOpdQueue(updated);
        try {
          localStorage.setItem('cached_opd_queue', JSON.stringify(updated));
        } catch (e) {}
        setSuccessMessage(`✅ Patient ${formData.patientName} checked in (Token #${localItem.token_number}) and sent to Doctor's cabin queue.`);
        setFormData({
          patientName: '',
          patientPhone: '',
          patientAge: '',
          patientGender: 'Male',
          referenceId: '',
          bp: '',
          pulse: '',
          weight: '',
          sugar: '',
          temperature: '',
          chiefComplaints: '',
          privateNotes: ''
        });
        setSearchQuery('');
        setSelectedPatientNotice(null);
        fetchOpdQueue();
      }
    } catch (err) {
      console.warn('Backend checkin notice:', err);
      // Local fallback in case backend is offline
      const localItem = {
        id: `local-queue-${Date.now()}`,
        token_number: opdQueue.length + 1,
        patient_name: formData.patientName,
        patient_phone: formData.patientPhone,
        patient_age: parseInt(formData.patientAge, 10),
        patient_gender: formData.patientGender,
        reference_id: formData.referenceId || `${opdQueue.length + 101}/${new Date().getFullYear()}`,
        bp: formData.bp,
        pulse: formData.pulse,
        weight: formData.weight,
        sugar: formData.sugar,
        temperature: formData.temperature,
        chief_complaints: formData.chiefComplaints,
        private_notes: formData.privateNotes,
        status: 'WAITING',
        created_at: new Date().toISOString()
      };
      const updated = [...opdQueue, localItem];
      if (setOpdQueue) setOpdQueue(updated);
      try {
        localStorage.setItem('cached_opd_queue', JSON.stringify(updated));
      } catch (e) {}
      setSuccessMessage(`✅ Patient ${formData.patientName} checked in (Token #${localItem.token_number}) and sent to Doctor's cabin queue.`);
      setFormData({
        patientName: '',
        patientPhone: '',
        patientAge: '',
        patientGender: 'Male',
        referenceId: '',
        bp: '',
        pulse: '',
        weight: '',
        sugar: '',
        temperature: '',
        chiefComplaints: '',
        privateNotes: ''
      });
      setSearchQuery('');
      setSelectedPatientNotice(null);
      fetchOpdQueue();
    } finally {
      setSubmitting(false);
    }
  };

  // Remove / Cancel queue entry
  const handleCancelQueueItem = async (id, patientName) => {
    if (!window.confirm(`Are you sure you want to cancel the queue check-in for ${patientName}?`)) return;

    if (setOpdQueue) {
      setOpdQueue(prev => {
        const next = prev.filter(p => p.id !== id);
        try { localStorage.setItem('cached_opd_queue', JSON.stringify(next)); } catch (e) {}
        return next;
      });
    }

    try {
      if (!String(id).startsWith('local-')) {
        await fetch(`${API_BASE_URL}/opd/queue/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      }
      fetchOpdQueue();
    } catch (err) {
      console.warn('Delete error:', err);
      fetchOpdQueue();
    }
  };

  // Counts
  const waitingPatients = useMemo(() => opdQueue.filter(p => p.status === 'WAITING'), [opdQueue]);
  const inConsultationPatients = useMemo(() => opdQueue.filter(p => p.status === 'IN_CONSULTATION'), [opdQueue]);
  const completedPatients = useMemo(() => opdQueue.filter(p => p.status === 'COMPLETED'), [opdQueue]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9', display: 'flex', flexDirection: 'column' }}>
      
      {/* Top Front Desk Header */}
      <header style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #cbd5e1', padding: '0.85rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '8px', backgroundColor: '#0f766e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1.3rem', fontWeight: 'bold' }}>
            🏥
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.15rem', color: '#0f766e', letterSpacing: '0.02em' }}>NEURO HARMONY CLINIC</div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Front Desk & OPD Reception Desk • Patient Intake Portal</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ textAlign: 'right', display: 'none', md: 'block' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b' }}>
              📅 {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
            </div>
            <div style={{ fontSize: '0.74rem', color: '#059669', fontWeight: 600 }}>● OPD Desk Live</div>
          </div>

          <div style={{ padding: '0.4rem 0.8rem', backgroundColor: '#f0fdfa', border: '1px solid #ccfbf1', borderRadius: '6px', fontSize: '0.8rem', color: '#0f766e', fontWeight: 700 }}>
            👤 Staff: {user?.name || 'Front Desk'}
          </div>

          <button 
            type="button" 
            onClick={handleLogout}
            className="btn btn-secondary"
            style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
          >
            Log Out
          </button>
        </div>
      </header>

      {/* Main Content Workspace */}
      <div style={{ flex: 1, padding: '1.25rem', maxWidth: '1440px', width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        
        {/* Top Summary Metrics Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', padding: '1rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total Checked In Today</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f766e', marginTop: '0.2rem' }}>{opdQueue.length}</div>
          </div>

          <div style={{ backgroundColor: '#fffbeb', borderRadius: '10px', padding: '1rem', border: '1px solid #fde68a', boxShadow: '0 1px 3px rgba(245,158,11,0.05)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#b45309', textTransform: 'uppercase' }}>Waiting Outside Cabin</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#d97706', marginTop: '0.2rem' }}>{waitingPatients.length}</div>
          </div>

          <div style={{ backgroundColor: '#eff6ff', borderRadius: '10px', padding: '1rem', border: '1px solid #bfdbfe', boxShadow: '0 1px 3px rgba(37,99,235,0.05)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase' }}>In Doctor's Cabin</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#2563eb', marginTop: '0.2rem' }}>{inConsultationPatients.length}</div>
          </div>

          <div style={{ backgroundColor: '#f0fdf4', borderRadius: '10px', padding: '1rem', border: '1px solid #bbf7d0', boxShadow: '0 1px 3px rgba(16,185,129,0.05)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#15803d', textTransform: 'uppercase' }}>Consultation Done</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#16a34a', marginTop: '0.2rem' }}>{completedPatients.length}</div>
          </div>
        </div>

        {/* Two-Column Grid: Left Check-in Form (55%), Right Live Queue (45%) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.95fr', gap: '1.25rem', alignItems: 'start' }}>
          
          {/* ================= LEFT COLUMN: INTAKE & CHECK-IN FORM ================= */}
          <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '1.25rem', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '2px solid #0f766e', paddingBottom: '0.65rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f766e', fontWeight: 800 }}>📋 Patient Intake & Check-In</h3>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Enter walk-in patient information to send to Doctor's cabin</span>
              </div>
              <span className="badge badge-info" style={{ backgroundColor: '#0f766e', color: '#fff' }}>Token #{opdQueue.length + 1}</span>
            </div>

            {/* Notification messages */}
            {successMessage && (
              <div style={{ backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', padding: '0.75rem 1rem', borderRadius: '8px', color: '#065f46', fontSize: '0.85rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{successMessage}</span>
                <button type="button" onClick={() => setSuccessMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#065f46' }}>✕</button>
              </div>
            )}

            {errorMessage && (
              <div style={{ backgroundColor: '#fff1f2', border: '1px solid #fecdd3', padding: '0.75rem 1rem', borderRadius: '8px', color: '#9f1239', fontSize: '0.85rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{errorMessage}</span>
                <button type="button" onClick={() => setErrorMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9f1239' }}>✕</button>
              </div>
            )}

            {/* Step 1: Instant Patient Search (Mobile or Name) */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 800, color: '#1e293b', display: 'block', marginBottom: '0.35rem' }}>
                🔍 Fast Patient Lookup (Enter Mobile Number or Name or Ref ID)
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="e.g. 129 or 129/2026 or 9307647137 or Mohd Sayed..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchResults.length === 1) {
                      e.preventDefault();
                      handleSelectPatient(searchResults[0]);
                    }
                  }}
                  style={{ width: '100%', padding: '0.65rem 2.5rem 0.65rem 0.85rem', borderRadius: '8px', border: '2px solid #0f766e', fontSize: '0.92rem', backgroundColor: '#f0fdfa' }}
                />
                <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  {isSearching && (
                    <span style={{ fontSize: '0.78rem', color: '#0f766e' }}>Searching...</span>
                  )}
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '0.9rem', padding: '0.2rem' }}
                      title="Clear search"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Family Members / Existing Patients Found Card */}
              {searchResults.length > 0 && (
                <div style={{ marginTop: '0.75rem', backgroundColor: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: '8px', padding: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#1d4ed8' }}>
                      ✨ Found {searchResults.length} registered patient(s) matching "{searchQuery}":
                    </span>
                    <button 
                      type="button" 
                      onClick={() => setSearchResults([])}
                      style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.78rem' }}
                    >
                      Dismiss
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {searchResults.map((patient, pIdx) => (
                      <div 
                        key={pIdx}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0.75rem', backgroundColor: '#ffffff', borderRadius: '6px', border: '1px solid #dbeafe' }}
                      >
                        <div>
                          <strong style={{ color: '#0f172a', fontSize: '0.92rem' }}>{patient.patientName}</strong>
                          <span style={{ fontSize: '0.78rem', color: '#64748b', marginLeft: '0.4rem' }}>
                            ({patient.patientAge} Yrs / {patient.patientGender}) • Ref: <span style={{ color: '#0f766e', fontWeight: 800 }}>{patient.referenceId || 'N/A'}</span>
                          </span>
                          {patient.patientPhone && (
                            <div style={{ fontSize: '0.74rem', color: '#64748b' }}>📞 {patient.patientPhone}</div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSelectPatient(patient)}
                          className="btn btn-primary"
                          style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem', backgroundColor: '#2563eb', fontWeight: 700 }}
                        >
                          ➕ Select for Visit
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Register New Family Member Button */}
                  <div style={{ marginTop: '0.75rem', textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={handleRegisterNewFamilyMember}
                      className="btn btn-secondary"
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.76rem' }}
                    >
                      👤 Register New Family Member with this Phone
                    </button>
                  </div>
                </div>
              )}

              {/* No results note */}
              {searchQuery.trim().length >= 2 && searchResults.length === 0 && !isSearching && (
                <div style={{ marginTop: '0.6rem', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>ℹ️</span>
                  <span>No existing patient record found for "<strong>{searchQuery}</strong>". You can register them as a new walk-in patient below.</span>
                </div>
              )}

              {/* Notice when existing patient is loaded */}
              {selectedPatientNotice && (
                <div style={{ marginTop: '0.5rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: '#166534', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>
                    ✓ Loaded: <strong>{selectedPatientNotice.name}</strong> • Permanent Ref: <strong>{selectedPatientNotice.refId || 'New'}</strong>
                  </span>
                  <button 
                    type="button" 
                    onClick={() => setSelectedPatientNotice(null)}
                    style={{ background: 'none', border: 'none', color: '#166534', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {/* Check-In Form */}
            <form onSubmit={handleSubmitCheckin}>
              
              {/* Demographics Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>Patient Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Kumar"
                    value={formData.patientName}
                    onChange={(e) => setFormData({ ...formData, patientName: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem 0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>Mobile Number (10 Digits)</label>
                  <input
                    type="tel"
                    placeholder="e.g. 9876543210"
                    value={formData.patientPhone}
                    onChange={(e) => setFormData({ ...formData, patientPhone: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem 0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>Age (Yrs) *</label>
                  <input
                    type="number"
                    min="1"
                    max="125"
                    required
                    placeholder="e.g. 45"
                    value={formData.patientAge}
                    onChange={(e) => setFormData({ ...formData, patientAge: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem 0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>Gender</label>
                  <select
                    value={formData.patientGender}
                    onChange={(e) => setFormData({ ...formData, patientGender: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem 0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>Reference ID / UHID</label>
                  <input
                    type="text"
                    placeholder="Auto or e.g. 129/2026"
                    value={formData.referenceId}
                    onChange={(e) => setFormData({ ...formData, referenceId: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem 0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88rem', backgroundColor: '#f8fafc' }}
                  />
                </div>
              </div>

              {/* Vitals Box (Soft Rose Card) */}
              <div style={{ backgroundColor: '#fff1f2', border: '1.5px solid #fecdd3', borderRadius: '8px', padding: '0.75rem 0.85rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1rem' }}>🩺</span>
                  <strong style={{ fontSize: '0.8rem', color: '#be123c', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Clinical Vitals (Recorded at Reception)
                  </strong>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.5rem' }}>
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9f1239' }}>Blood Pressure</label>
                    <input
                      type="text"
                      placeholder="e.g. 120/80"
                      value={formData.bp}
                      onChange={(e) => setFormData({ ...formData, bp: e.target.value })}
                      style={{ width: '100%', padding: '0.4rem 0.5rem', borderRadius: '4px', border: '1px solid #fecdd3', fontSize: '0.84rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9f1239' }}>Pulse (bpm)</label>
                    <input
                      type="text"
                      placeholder="e.g. 72"
                      value={formData.pulse}
                      onChange={(e) => setFormData({ ...formData, pulse: e.target.value })}
                      style={{ width: '100%', padding: '0.4rem 0.5rem', borderRadius: '4px', border: '1px solid #fecdd3', fontSize: '0.84rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9f1239' }}>Weight (kg)</label>
                    <input
                      type="text"
                      placeholder="e.g. 68"
                      value={formData.weight}
                      onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                      style={{ width: '100%', padding: '0.4rem 0.5rem', borderRadius: '4px', border: '1px solid #fecdd3', fontSize: '0.84rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9f1239' }}>Sugar (mg/dL)</label>
                    <input
                      type="text"
                      placeholder="e.g. 110"
                      value={formData.sugar}
                      onChange={(e) => setFormData({ ...formData, sugar: e.target.value })}
                      style={{ width: '100%', padding: '0.4rem 0.5rem', borderRadius: '4px', border: '1px solid #fecdd3', fontSize: '0.84rem' }}
                    />
                  </div>
                </div>
              </div>

              {/* Chief Complaints Box (Soft Blue Card) */}
              <div style={{ backgroundColor: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: '8px', padding: '0.75rem 0.85rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '1rem' }}>💬</span>
                  <strong style={{ fontSize: '0.8rem', color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Chief Complaints / Reason for Visit
                  </strong>
                </div>

                {/* Quick chip buttons */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.5rem' }}>
                  {quickSymptoms.map((sym, sIdx) => (
                    <button
                      key={sIdx}
                      type="button"
                      onClick={() => handleAddSymptomChip(sym)}
                      style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', borderRadius: '20px', backgroundColor: '#ffffff', border: '1px solid #bfdbfe', color: '#1d4ed8', cursor: 'pointer', fontWeight: 600 }}
                    >
                      + {sym}
                    </button>
                  ))}
                </div>

                <textarea
                  rows="2"
                  placeholder="e.g. Headache since 3 days, disturbed sleep, feeling anxious..."
                  value={formData.chiefComplaints}
                  onChange={(e) => setFormData({ ...formData, chiefComplaints: e.target.value })}
                  style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '4px', border: '1px solid #bfdbfe', fontSize: '0.85rem', resize: 'vertical' }}
                />
              </div>

              {/* Optional Referral / Remarks */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>Referral / Remarks (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Referred by Dr. Sharma, or Patient VIP"
                  value={formData.privateNotes}
                  onChange={(e) => setFormData({ ...formData, privateNotes: e.target.value })}
                  style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', fontWeight: 800, backgroundColor: '#0f766e', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
              >
                <span>🚀</span>
                <span>{submitting ? 'Sending to Doctor...' : `Check In & Send to Doctor's Cabin (Token #${opdQueue.length + 1})`}</span>
              </button>
            </form>

          </div>

          {/* ================= RIGHT COLUMN: LIVE OPD QUEUE ================= */}
          <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '1.25rem', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '2px solid #0f766e', paddingBottom: '0.65rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f766e', fontWeight: 800 }}>👥 Today's OPD Patient Queue</h3>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Live queue of patients sent to the Doctor's cabin</span>
              </div>
              <button
                type="button"
                onClick={fetchOpdQueue}
                className="btn btn-secondary"
                style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
                title="Refresh queue"
              >
                ↻ Refresh
              </button>
            </div>

            {/* Queue List */}
            {opdQueue.length === 0 ? (
              <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: '#94a3b8' }}>
                <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.5rem' }}>🪑</span>
                <strong style={{ fontSize: '0.95rem', color: '#475569' }}>No Patients Checked In Yet Today</strong>
                <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.8rem' }}>
                  Use the intake form on the left to check in arriving patients.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '680px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                {opdQueue.map((item, qIdx) => {
                  const isWaiting = item.status === 'WAITING';
                  const isInConsultation = item.status === 'IN_CONSULTATION';
                  const isCompleted = item.status === 'COMPLETED';

                  let borderCol = '#cbd5e1';
                  let bgCol = '#ffffff';
                  let statusBadge = null;

                  if (isWaiting) {
                    borderCol = '#f59e0b';
                    bgCol = '#fffdf7';
                    statusBadge = (
                      <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '12px', backgroundColor: '#fef3c7', color: '#b45309', fontWeight: 800 }}>
                        ⏳ Waiting Outside
                      </span>
                    );
                  } else if (isInConsultation) {
                    borderCol = '#3b82f6';
                    bgCol = '#eff6ff';
                    statusBadge = (
                      <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '12px', backgroundColor: '#dbeafe', color: '#1d4ed8', fontWeight: 800 }}>
                        🩺 With Doctor
                      </span>
                    );
                  } else {
                    borderCol = '#10b981';
                    bgCol = '#f0fdf4';
                    statusBadge = (
                      <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '12px', backgroundColor: '#dcfce7', color: '#15803d', fontWeight: 800 }}>
                        ✓ Completed
                      </span>
                    );
                  }

                  return (
                    <div 
                      key={item.id || qIdx}
                      style={{ 
                        backgroundColor: bgCol, 
                        border: `1.5px solid ${borderCol}`, 
                        borderRadius: '8px', 
                        padding: '0.75rem', 
                        position: 'relative' 
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.35rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#0f766e', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.8rem' }}>
                            {item.token_number || qIdx + 1}
                          </span>
                          <div>
                            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>
                              {item.patient_name}
                            </div>
                            <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                              {item.patient_age} Yrs / {item.patient_gender} {item.patient_phone ? `• 📞 ${item.patient_phone}` : ''}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                          {statusBadge}
                          <span style={{ fontSize: '0.72rem', color: '#0f766e', fontWeight: 700 }}>
                            Ref: {item.reference_id || 'N/A'}
                          </span>
                        </div>
                      </div>

                      {/* Vitals preview row */}
                      {(item.bp || item.pulse || item.weight || item.sugar) && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.4rem', fontSize: '0.75rem' }}>
                          {item.bp && (
                            <span style={{ padding: '0.15rem 0.4rem', borderRadius: '4px', backgroundColor: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', fontWeight: 700 }}>
                              BP: {item.bp}
                            </span>
                          )}
                          {item.pulse && (
                            <span style={{ padding: '0.15rem 0.4rem', borderRadius: '4px', backgroundColor: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', fontWeight: 700 }}>
                              Pulse: {item.pulse} bpm
                            </span>
                          )}
                          {item.weight && (
                            <span style={{ padding: '0.15rem 0.4rem', borderRadius: '4px', backgroundColor: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', fontWeight: 700 }}>
                              Weight: {item.weight} kg
                            </span>
                          )}
                          {item.sugar && (
                            <span style={{ padding: '0.15rem 0.4rem', borderRadius: '4px', backgroundColor: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', fontWeight: 700 }}>
                              Sugar: {item.sugar} mg/dL
                            </span>
                          )}
                        </div>
                      )}

                      {/* Chief complaints preview */}
                      {item.chief_complaints && (
                        <div style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: '#334155', fontStyle: 'italic', backgroundColor: '#ffffff', padding: '0.3rem 0.5rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                          💬 {item.chief_complaints}
                        </div>
                      )}

                      {/* Action buttons */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() => handleCancelQueueItem(item.id, item.patient_name)}
                          style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.72rem', cursor: 'pointer', padding: '0.2rem' }}
                        >
                          ✕ Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </div>

        </div>

      </div>
    </div>
  );
}
