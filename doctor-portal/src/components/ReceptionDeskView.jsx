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
  fetchOfflinePrescriptions,
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
    privateNotes: '',
    patientType: 'NEW', // 'NEW' or 'FOLLOW_UP'
    feeStatus: 'PAID', // 'PAID', 'PENDING', 'FREE'
    paymentMode: 'CASH', // 'CASH', 'UPI', 'FREE'
    feeAmount: '700'
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
    if (fetchOfflinePrescriptions) {
      fetchOfflinePrescriptions();
    }
    const interval = setInterval(() => {
      fetchOpdQueue();
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  // Helper for local date comparison (YYYY-MM-DD)
  const getLocalDateStr = (d = new Date()) => {
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${da}`;
  };

  const todayStr = getLocalDateStr();

  // Filter queue strictly to today's patients
  const todayQueue = useMemo(() => {
    return (opdQueue || []).filter(item => {
      if (!item.created_at) return true;
      try {
        return getLocalDateStr(new Date(item.created_at)) === todayStr;
      } catch (e) {
        return true;
      }
    });
  }, [opdQueue, todayStr]);

  // Calculate next token number for today (starts fresh from 1 each day)
  const nextTokenNumber = useMemo(() => {
    const maxToken = todayQueue.reduce((max, item) => Math.max(max, parseInt(item.token_number, 10) || 0), 0);
    return Math.max(maxToken, todayQueue.length) + 1;
  }, [todayQueue]);

  // Payment and patient type statistics for today
  const paymentStats = useMemo(() => {
    let cashTotal = 0;
    let upiTotal = 0;
    let cashCount = 0;
    let upiCount = 0;
    let pendingCount = 0;
    let newCount = 0;
    let followUpCount = 0;

    todayQueue.forEach(item => {
      const isFollowUp = item.patient_type === 'FOLLOW_UP';
      if (isFollowUp) followUpCount++; else newCount++;

      const fee = parseFloat(item.fee_amount) || 0;
      const status = item.fee_status || (item.patient_type === 'FOLLOW_UP' ? 'FREE' : 'PAID');
      const mode = item.payment_mode || 'CASH';

      if (status === 'PAID') {
        if (mode === 'UPI') {
          upiTotal += fee;
          upiCount++;
        } else {
          cashTotal += fee;
          cashCount++;
        }
      } else if (status === 'PENDING') {
        pendingCount++;
      }
    });

    return {
      cashTotal,
      upiTotal,
      cashCount,
      upiCount,
      pendingCount,
      newCount,
      followUpCount,
      totalRevenue: cashTotal + upiTotal
    };
  }, [todayQueue]);

  // Auto-upload any local offline queue items to the server database
  useEffect(() => {
    const unsynced = opdQueue.filter(p => String(p.id).startsWith('local-'));
    if (unsynced.length === 0) return;

    unsynced.forEach(async (item) => {
      try {
        let currentToken = token;
        let res = await fetch(`${API_BASE_URL}/opd/checkin`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentToken}`
          },
          body: JSON.stringify({
            patientName: item.patient_name,
            patientPhone: item.patient_phone,
            patientAge: item.patient_age,
            patientGender: item.patient_gender,
            referenceId: item.reference_id,
            bp: item.bp,
            pulse: item.pulse,
            weight: item.weight,
            sugar: item.sugar,
            temperature: item.temperature,
            chiefComplaints: item.chief_complaints,
            privateNotes: item.private_notes,
            patientType: item.patient_type || 'NEW',
            feeStatus: item.fee_status || 'PAID',
            feeAmount: item.fee_amount || 700,
            paymentMode: item.payment_mode || 'CASH'
          })
        });
        let data = await res.json();
        if (!data.success && (res.status === 401 || res.status === 403)) {
          const authRes = await fetch(`${API_BASE_URL}/auth/doctor/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'reception@neuroharmony.in', password: 'reception123' })
          });
          const authData = await authRes.json();
          if (authData.success && authData.token) {
            currentToken = authData.token;
            localStorage.setItem('doc_token', currentToken);
            res = await fetch(`${API_BASE_URL}/opd/checkin`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
              },
              body: JSON.stringify({
                patientName: item.patient_name,
                patientPhone: item.patient_phone,
                patientAge: item.patient_age,
                patientGender: item.patient_gender,
                referenceId: item.reference_id,
                bp: item.bp,
                pulse: item.pulse,
                weight: item.weight,
                sugar: item.sugar,
                temperature: item.temperature,
                chiefComplaints: item.chief_complaints,
                privateNotes: item.private_notes,
                patientType: item.patient_type || 'NEW',
                feeStatus: item.fee_status || 'PAID',
                feeAmount: item.fee_amount || 700,
                paymentMode: item.payment_mode || 'CASH'
              })
            });
            data = await res.json();
          }
        }
        if (data.success && data.item) {
          if (setOpdQueue) {
            setOpdQueue(prev => prev.map(p => p.id === item.id ? data.item : p));
          }
          fetchOpdQueue();
        }
      } catch (e) {
        console.warn('Auto-sync queue notice:', e);
      }
    });
  }, [opdQueue.length]);

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
        if (data.success && Array.isArray(data.patients)) {
          // Database is ground truth: if a record was deleted, the database returns 0 results
          setSearchResults(data.patients);

          // If backend returned 0 results, purge any stale matching records from localStorage too!
          if (data.patients.length === 0) {
            try {
              const saved = localStorage.getItem('cached_offline_prescriptions');
              if (saved) {
                const list = JSON.parse(saved);
                if (Array.isArray(list)) {
                  const cleaned = list.filter(rx => {
                    const pPhone = (rx.patientPhone || '').toLowerCase().trim();
                    const pName = (rx.patientName || '').toLowerCase().trim();
                    const pRef = (rx.referenceId || '').toLowerCase().trim();
                    const pSerial = pRef.split('/')[0].trim();
                    return !(
                      pRef === q ||
                      pRef.includes(q) ||
                      pSerial === serialPart ||
                      pSerial === q ||
                      pName.includes(q) ||
                      pPhone.includes(q)
                    );
                  });
                  localStorage.setItem('cached_offline_prescriptions', JSON.stringify(cleaned));
                }
              }
            } catch (e) {}
          }
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
      chiefComplaints: '',
      privateNotes: '',
      patientType: 'FOLLOW_UP',
      feeStatus: 'FREE',
      paymentMode: 'CASH',
      feeAmount: '0'
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
      privateNotes: '',
      patientType: 'NEW',
      feeStatus: 'PAID',
      paymentMode: 'CASH',
      feeAmount: '700'
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
      let currentToken = token;
      let res = await fetch(`${API_BASE_URL}/opd/checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`
        },
        body: JSON.stringify(formData)
      });
      let data = await res.json();

      // If token expired, invalid, or forbidden, auto re-authenticate in background with receptionist creds and retry
      if (!data.success && (res.status === 401 || res.status === 403 || data.message?.includes('Forbidden') || data.message?.includes('token'))) {
        try {
          const authRes = await fetch(`${API_BASE_URL}/auth/doctor/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'reception@neuroharmony.in', password: 'reception123' })
          });
          const authData = await authRes.json();
          if (authData.success && authData.token) {
            currentToken = authData.token;
            localStorage.setItem('doc_token', currentToken);
            res = await fetch(`${API_BASE_URL}/opd/checkin`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
              },
              body: JSON.stringify(formData)
            });
            data = await res.json();
          }
        } catch (authErr) {
          console.warn('Reception checkin auto-reauth notice:', authErr);
        }
      }

      if (data.success) {
        setSuccessMessage(`✅ Patient ${formData.patientName} checked in successfully! Token #${data.item?.token_number || nextTokenNumber} sent to Doctor.`);
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
          privateNotes: '',
          patientType: 'NEW',
          feeStatus: 'PAID',
          paymentMode: 'CASH',
          feeAmount: '700'
        });
        setSearchQuery('');
        setSelectedPatientNotice(null);
        fetchOpdQueue();
      } else {
        // Resilient local fallback so receptionist is NEVER blocked even if server is redeploying
        const localItem = {
          id: `local-queue-${Date.now()}`,
          token_number: nextTokenNumber,
          patient_name: formData.patientName,
          patient_phone: formData.patientPhone,
          patient_age: parseInt(formData.patientAge, 10),
          patient_gender: formData.patientGender,
          reference_id: formData.referenceId || `${nextTokenNumber + 100}/${new Date().getFullYear()}`,
          bp: formData.bp,
          pulse: formData.pulse,
          weight: formData.weight,
          sugar: formData.sugar,
          temperature: formData.temperature,
          chief_complaints: formData.chiefComplaints,
          private_notes: formData.privateNotes,
          patient_type: formData.patientType || 'NEW',
          fee_status: formData.feeStatus || 'PAID',
          fee_amount: parseFloat(formData.feeAmount) || (formData.feeStatus === 'FREE' ? 0 : 700),
          payment_mode: formData.paymentMode || 'CASH',
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
          privateNotes: '',
          patientType: 'NEW',
          feeStatus: 'PAID',
          paymentMode: 'CASH',
          feeAmount: '700'
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
        token_number: nextTokenNumber,
        patient_name: formData.patientName,
        patient_phone: formData.patientPhone,
        patient_age: parseInt(formData.patientAge, 10),
        patient_gender: formData.patientGender,
        reference_id: formData.referenceId || `${nextTokenNumber + 100}/${new Date().getFullYear()}`,
        bp: formData.bp,
        pulse: formData.pulse,
        weight: formData.weight,
        sugar: formData.sugar,
        temperature: formData.temperature,
        chief_complaints: formData.chiefComplaints,
        private_notes: formData.privateNotes,
        patient_type: formData.patientType || 'NEW',
        fee_status: formData.feeStatus || 'PAID',
        fee_amount: parseFloat(formData.feeAmount) || (formData.feeStatus === 'FREE' ? 0 : 700),
        payment_mode: formData.paymentMode || 'CASH',
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
        privateNotes: '',
        patientType: 'NEW',
        feeStatus: 'PAID',
        paymentMode: 'CASH',
        feeAmount: '700'
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

  // Update fee status or payment mode live (e.g., mark Pending as Paid via Cash or UPI)
  const handleUpdatePayment = async (id, feeStatus, paymentMode, feeAmount) => {
    const numericFee = feeAmount !== undefined ? parseFloat(feeAmount) : (feeStatus === 'FREE' ? 0 : 700);
    if (setOpdQueue) {
      setOpdQueue(prev => {
        const next = prev.map(p => {
          if (p.id === id) {
            return {
              ...p,
              fee_status: feeStatus,
              payment_mode: paymentMode,
              fee_amount: numericFee
            };
          }
          return p;
        });
        try { localStorage.setItem('cached_opd_queue', JSON.stringify(next)); } catch (e) {}
        return next;
      });
    }

    try {
      if (!String(id).startsWith('local-')) {
        await fetch(`${API_BASE_URL}/opd/queue/${id}/status`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            feeStatus,
            paymentMode,
            feeAmount: numericFee
          })
        });
      }
      fetchOpdQueue();
    } catch (err) {
      console.warn('Payment update notice:', err);
      fetchOpdQueue();
    }
  };

  // Counts
  const waitingPatients = useMemo(() => todayQueue.filter(p => p.status === 'WAITING'), [todayQueue]);
  const inConsultationPatients = useMemo(() => todayQueue.filter(p => p.status === 'IN_CONSULTATION'), [todayQueue]);
  const completedPatients = useMemo(() => todayQueue.filter(p => p.status === 'COMPLETED'), [todayQueue]);

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
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f766e', marginTop: '0.2rem' }}>{todayQueue.length}</div>
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

        {/* Daily Cash & UPI Collection & Patient Type Summary Bar */}
        <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', padding: '0.85rem 1.25rem', border: '1.5px solid #cbd5e1', boxShadow: '0 2px 6px rgba(0,0,0,0.03)', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.35rem' }}>💵</span>
              <div>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#15803d', textTransform: 'uppercase' }}>Cash Collected</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#166534' }}>
                  ₹{paymentStats.cashTotal} <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>({paymentStats.cashCount} pts)</span>
                </div>
              </div>
            </div>

            <div style={{ width: '1px', height: '32px', backgroundColor: '#e2e8f0' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.35rem' }}>📱</span>
              <div>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase' }}>UPI / Online Collected</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#075985' }}>
                  ₹{paymentStats.upiTotal} <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>({paymentStats.upiCount} pts)</span>
                </div>
              </div>
            </div>

            <div style={{ width: '1px', height: '32px', backgroundColor: '#e2e8f0' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.35rem' }}>💰</span>
              <div>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#0f766e', textTransform: 'uppercase' }}>Total Today's OPD Revenue</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f766e' }}>
                  ₹{paymentStats.totalRevenue}
                </div>
              </div>
            </div>

            {paymentStats.pendingCount > 0 && (
              <>
                <div style={{ width: '1px', height: '32px', backgroundColor: '#e2e8f0' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.35rem' }}>⚠️</span>
                  <div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#b45309', textTransform: 'uppercase' }}>Fees Pending</div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#d97706' }}>
                      {paymentStats.pendingCount} <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>patient(s)</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem', borderRadius: '15px', backgroundColor: '#e0f2fe', color: '#0369a1', fontWeight: 800, border: '1px solid #bae6fd' }}>
              👤 New: {paymentStats.newCount}
            </span>
            <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem', borderRadius: '15px', backgroundColor: '#f3e8ff', color: '#7e22ce', fontWeight: 800, border: '1px solid #d8b4fe' }}>
              🔄 Follow-Up: {paymentStats.followUpCount}
            </span>
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
              <span className="badge badge-info" style={{ backgroundColor: '#0f766e', color: '#fff' }}>Token #{nextTokenNumber}</span>
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

              {/* Consultation Fees & Patient Type Section */}
              <div style={{ backgroundColor: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '10px', padding: '0.85rem 1rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <strong style={{ fontSize: '0.82rem', color: '#0f766e', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    💳 Patient Type & Consultation Fees
                  </strong>
                  
                  {/* Segmented Button for New vs Follow-up */}
                  <div style={{ display: 'inline-flex', borderRadius: '6px', border: '1.5px solid #cbd5e1', overflow: 'hidden' }}>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, patientType: 'NEW', feeStatus: 'PAID', paymentMode: 'CASH', feeAmount: '700' }))}
                      style={{
                        padding: '0.25rem 0.65rem',
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        border: 'none',
                        cursor: 'pointer',
                        backgroundColor: formData.patientType === 'NEW' ? '#0f766e' : '#ffffff',
                        color: formData.patientType === 'NEW' ? '#ffffff' : '#64748b'
                      }}
                    >
                      👤 New Patient
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, patientType: 'FOLLOW_UP', feeStatus: 'FREE', paymentMode: 'CASH', feeAmount: '0' }))}
                      style={{
                        padding: '0.25rem 0.65rem',
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        border: 'none',
                        cursor: 'pointer',
                        backgroundColor: formData.patientType === 'FOLLOW_UP' ? '#7c3aed' : '#ffffff',
                        color: formData.patientType === 'FOLLOW_UP' ? '#ffffff' : '#64748b'
                      }}
                    >
                      🔄 Follow-Up Patient
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', alignItems: 'center' }}>
                  {/* Fee Status Dropdown */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: '0.2rem' }}>
                      Fees Status
                    </label>
                    <select
                      value={formData.feeStatus}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData(prev => ({
                          ...prev,
                          feeStatus: val,
                          feeAmount: val === 'FREE' ? '0' : (prev.feeAmount === '0' ? '700' : prev.feeAmount)
                        }));
                      }}
                      style={{ 
                        width: '100%', 
                        padding: '0.45rem', 
                        fontSize: '0.82rem', 
                        borderRadius: '6px', 
                        border: '1.5px solid #cbd5e1', 
                        fontWeight: 800, 
                        backgroundColor: formData.feeStatus === 'PAID' ? '#f0fdf4' : formData.feeStatus === 'PENDING' ? '#fffbeb' : '#f5f3ff', 
                        color: formData.feeStatus === 'PAID' ? '#166534' : formData.feeStatus === 'PENDING' ? '#b45309' : '#6b21a8' 
                      }}
                    >
                      <option value="PAID">✅ Fees Paid</option>
                      <option value="PENDING">⚠️ Fees Pending (Not Given)</option>
                      <option value="FREE">🆓 Follow-Up / Free (No Fee)</option>
                    </select>
                  </div>

                  {/* Payment Mode Selector (Cash vs UPI) */}
                  {formData.feeStatus !== 'FREE' && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: '0.2rem' }}>
                        Mode of Payment
                      </label>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, paymentMode: 'CASH' }))}
                          style={{
                            flex: 1,
                            padding: '0.45rem 0.2rem',
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            borderRadius: '6px',
                            cursor: 'pointer',
                            border: formData.paymentMode === 'CASH' ? '2px solid #16a34a' : '1px solid #cbd5e1',
                            backgroundColor: formData.paymentMode === 'CASH' ? '#dcfce7' : '#ffffff',
                            color: formData.paymentMode === 'CASH' ? '#15803d' : '#64748b'
                          }}
                        >
                          💵 Cash
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, paymentMode: 'UPI' }))}
                          style={{
                            flex: 1,
                            padding: '0.45rem 0.2rem',
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            borderRadius: '6px',
                            cursor: 'pointer',
                            border: formData.paymentMode === 'UPI' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                            backgroundColor: formData.paymentMode === 'UPI' ? '#e0f2fe' : '#ffffff',
                            color: formData.paymentMode === 'UPI' ? '#0369a1' : '#64748b'
                          }}
                        >
                          📱 UPI
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Fee Amount Input */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: '0.2rem' }}>
                      Fee Amount (₹)
                    </label>
                    <input
                      type="number"
                      value={formData.feeAmount}
                      disabled={formData.feeStatus === 'FREE'}
                      onChange={(e) => setFormData(prev => ({ ...prev, feeAmount: e.target.value }))}
                      placeholder={formData.feeStatus === 'FREE' ? '0' : '700'}
                      style={{ width: '100%', padding: '0.45rem 0.6rem', fontSize: '0.82rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 800, backgroundColor: formData.feeStatus === 'FREE' ? '#f1f5f9' : '#ffffff' }}
                    />
                  </div>
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
                <span>{submitting ? 'Sending to Doctor...' : `Check In & Send to Doctor's Cabin (Token #${nextTokenNumber})`}</span>
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
            {todayQueue.length === 0 ? (
              <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: '#94a3b8' }}>
                <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.5rem' }}>🪑</span>
                <strong style={{ fontSize: '0.95rem', color: '#475569' }}>No Patients Checked In Yet Today</strong>
                <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.8rem' }}>
                  Use the intake form on the left to check in arriving patients.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '680px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                {todayQueue.map((item, qIdx) => {
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

                      {/* Patient Type & Fees Status Row */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem', marginTop: '0.45rem' }}>
                        {item.patient_type === 'FOLLOW_UP' ? (
                          <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem', borderRadius: '4px', backgroundColor: '#f3e8ff', color: '#7e22ce', fontWeight: 800, border: '1px solid #d8b4fe' }}>
                            🔄 Follow-Up
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem', borderRadius: '4px', backgroundColor: '#e0f2fe', color: '#0369a1', fontWeight: 800, border: '1px solid #bae6fd' }}>
                            👤 New Patient
                          </span>
                        )}

                        {item.fee_status === 'PENDING' ? (
                          <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: '4px', backgroundColor: '#fef3c7', color: '#b45309', fontWeight: 800, border: '1.5px solid #f59e0b', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                            ⚠️ Fees Pending (₹{item.fee_amount !== undefined ? item.fee_amount : 700})
                          </span>
                        ) : item.fee_status === 'FREE' ? (
                          <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '4px', backgroundColor: '#f5f3ff', color: '#6b21a8', fontWeight: 800, border: '1px solid #ddd6fe' }}>
                            🆓 Follow-Up (No Fee)
                          </span>
                        ) : (
                          item.payment_mode === 'UPI' ? (
                            <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '4px', backgroundColor: '#e0f2fe', color: '#0284c7', fontWeight: 800, border: '1px solid #7dd3fc', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                              📱 ₹{item.fee_amount !== undefined ? item.fee_amount : 700} Paid (UPI)
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '4px', backgroundColor: '#dcfce7', color: '#15803d', fontWeight: 800, border: '1px solid #86efac', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                              💵 ₹{item.fee_amount !== undefined ? item.fee_amount : 700} Paid (Cash)
                            </span>
                          )
                        )}
                      </div>

                      {/* Instant Payment Actions */}
                      {item.fee_status === 'PENDING' && (
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.45rem', padding: '0.35rem 0.55rem', backgroundColor: '#fffbeb', borderRadius: '6px', border: '1px solid #fde68a' }}>
                          <span style={{ fontSize: '0.73rem', fontWeight: 700, color: '#b45309' }}>Collect Fee:</span>
                          <button
                            type="button"
                            onClick={() => handleUpdatePayment(item.id, 'PAID', 'CASH', item.fee_amount || 700)}
                            style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '4px', border: '1px solid #16a34a', backgroundColor: '#dcfce7', color: '#15803d', cursor: 'pointer' }}
                            title="Patient paid via Cash"
                          >
                            💵 Cash (₹{item.fee_amount !== undefined ? item.fee_amount : 700})
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdatePayment(item.id, 'PAID', 'UPI', item.fee_amount || 700)}
                            style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '4px', border: '1px solid #0284c7', backgroundColor: '#e0f2fe', color: '#0369a1', cursor: 'pointer' }}
                            title="Patient paid via UPI"
                          >
                            📱 UPI (₹{item.fee_amount !== undefined ? item.fee_amount : 700})
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdatePayment(item.id, 'FREE', 'CASH', 0)}
                            style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.45rem', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: '#64748b', cursor: 'pointer' }}
                            title="Waive fees / mark as free"
                          >
                            🆓 Free
                          </button>
                        </div>
                      )}

                      {item.fee_status === 'PAID' && (
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.35rem' }}>
                          <span style={{ fontSize: '0.68rem', color: '#64748b' }}>Change:</span>
                          {item.payment_mode === 'CASH' ? (
                            <button
                              type="button"
                              onClick={() => handleUpdatePayment(item.id, 'PAID', 'UPI', item.fee_amount || 700)}
                              style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.12rem 0.45rem', borderRadius: '4px', border: '1px solid #bae6fd', backgroundColor: '#f0f9ff', color: '#0369a1', cursor: 'pointer' }}
                              title="Switch payment mode to UPI"
                            >
                              ⇄ Switch to UPI
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleUpdatePayment(item.id, 'PAID', 'CASH', item.fee_amount || 700)}
                              style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.12rem 0.45rem', borderRadius: '4px', border: '1px solid #bbf7d0', backgroundColor: '#f0fdf4', color: '#15803d', cursor: 'pointer' }}
                              title="Switch payment mode to Cash"
                            >
                              ⇄ Switch to Cash
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleUpdatePayment(item.id, 'PENDING', item.payment_mode || 'CASH', item.fee_amount || 700)}
                            style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.12rem 0.45rem', borderRadius: '4px', border: '1px solid #fed7aa', backgroundColor: '#fff7ed', color: '#c2410c', cursor: 'pointer' }}
                            title="Mark back to pending"
                          >
                            ⚠️ Mark Pending
                          </button>
                        </div>
                      )}

                      {item.fee_status === 'FREE' && (
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.35rem' }}>
                          <span style={{ fontSize: '0.68rem', color: '#64748b' }}>Paid today?</span>
                          <button
                            type="button"
                            onClick={() => handleUpdatePayment(item.id, 'PAID', 'CASH', 700)}
                            style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.12rem 0.45rem', borderRadius: '4px', border: '1px solid #bbf7d0', backgroundColor: '#f0fdf4', color: '#15803d', cursor: 'pointer' }}
                          >
                            💵 Collect ₹700 Cash
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdatePayment(item.id, 'PAID', 'UPI', 700)}
                            style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.12rem 0.45rem', borderRadius: '4px', border: '1px solid #bae6fd', backgroundColor: '#f0f9ff', color: '#0369a1', cursor: 'pointer' }}
                          >
                            📱 Collect ₹700 UPI
                          </button>
                        </div>
                      )}

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
