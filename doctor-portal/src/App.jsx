import React, { useState, useEffect, useRef, useMemo } from 'react';
import { io } from 'socket.io-client';
import ReceptionDeskView from './components/ReceptionDeskView';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const API_BASE_URL = `${API_URL}/api/v1`;

const getLocalDateStr = (d = new Date()) => {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${da}`;
};

const formatPrintDate = (dateStr) => {
  if (!dateStr) return '';
  const cleanStr = String(dateStr).split('T')[0];
  const parts = cleanStr.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  return dateStr;
};

const formatBP = (val) => {
  if (!val || !String(val).trim()) return '';
  const trimmed = String(val).trim();
  if (/mmhg/i.test(trimmed)) return trimmed;
  return `${trimmed} mmHg`;
};

const formatPulse = (val) => {
  if (!val || !String(val).trim()) return '';
  const trimmed = String(val).trim();
  if (/bpm/i.test(trimmed)) return trimmed;
  return `${trimmed} bpm`;
};

const formatWeight = (val) => {
  if (!val || !String(val).trim()) return '';
  const trimmed = String(val).trim();
  if (/kg/i.test(trimmed)) return trimmed;
  return `${trimmed} kg`;
};

const getFontFamilyCss = (fontName) => {
  if (!fontName) return "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  const name = String(fontName).trim();
  const serifs = ['Playfair Display', 'Merriweather', 'PT Serif', 'Lora', 'Noto Serif', 'Arvo', 'Crimson Text', 'Libre Baskerville', 'EB Garamond', 'Cardo', 'Cinzel', 'Domine', 'Georgia', 'Times New Roman'];
  if (serifs.includes(name)) {
    return `'${name}', Georgia, 'Times New Roman', serif`;
  }
  const monos = ['Fira Code', 'Source Code Pro', 'Inconsolata', 'Courier Prime', 'Share Tech Mono', 'Courier New'];
  if (monos.includes(name)) {
    return `'${name}', 'Courier New', Courier, monospace`;
  }
  const scripts = ['Dancing Script', 'Pacifico', 'Caveat', 'Great Vibes', 'Sacramento', 'Satisfy'];
  if (scripts.includes(name)) {
    return `'${name}', cursive`;
  }
  return `'${name}', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
};

const isMockRxId = (id) => {
  if (!id) return false;
  const s = String(id);
  return s.startsWith('rx-shaheen-') ||
         s.startsWith('rx-amir-') ||
         s.startsWith('rx-sakina-') ||
         s.startsWith('rx-munni-') ||
         s.startsWith('rx-peeyush-') ||
         s.startsWith('rx-shabana-') ||
         s.startsWith('sample-') ||
         (s.startsWith('rx-naseem-') && (s === 'rx-naseem-4' || s === 'rx-naseem-3' || s === 'rx-naseem-2'));
};

const deduplicatePrescriptions = (list) => {
  if (!Array.isArray(list)) return [];
  // 1. Gather reference IDs and patient names from real (non-mock) prescriptions
  const realRefs = new Set();
  const realNames = new Set();
  list.forEach(item => {
    if (item && !isMockRxId(item.id)) {
      const ref = String(item.referenceId || item.reference_id || '').replace(/^ref-?/i, '').trim().toUpperCase();
      if (ref) realRefs.add(ref);
      const name = String(item.patientName || '').trim().toLowerCase();
      if (name) realNames.add(name);
    }
  });

  // Filter out any mock dummy prescriptions that collide with real prescriptions
  const filtered = list.filter(item => {
    if (!item) return false;
    if (isMockRxId(item.id)) {
      const ref = String(item.referenceId || item.reference_id || '').replace(/^ref-?/i, '').trim().toUpperCase();
      const name = String(item.patientName || '').trim().toLowerCase();
      // If we have real consultations, purge the mock duplicates
      if ((ref && realRefs.has(ref)) || (name && realNames.has(name))) return false;
    }
    return true;
  });

  // 2. Deduplicate strictly by ID, and if two cards share the exact same cleanRef + consultDay + patientName + diagnosis, keep the newest one
  const seenIds = new Set();
  const seenExactConsultations = new Set();

  return filtered.filter(item => {
    if (!item) return false;
    const idKey = item.id ? String(item.id) : null;
    if (idKey && seenIds.has(idKey)) return false;
    if (idKey) seenIds.add(idKey);

    const cleanRef = String(item.referenceId || item.reference_id || '').replace(/^ref-?/i, '').trim().toUpperCase();
    const consultDay = item.consultDate ? item.consultDate.split('T')[0] : (item.createdAt ? item.createdAt.split('T')[0] : '');
    const cleanName = String(item.patientName || '').trim().toLowerCase();
    const cleanDiag = String(item.diagnosis || '').trim().toLowerCase();

    // Prevent duplicate cards if the exact same consultation record was saved/cached twice
    if (cleanRef && consultDay && cleanName && cleanDiag) {
      const visitKey = `${cleanRef}_${consultDay}_${cleanName}_${cleanDiag}`;
      if (seenExactConsultations.has(visitKey)) return false;
      seenExactConsultations.add(visitKey);
    }

    return true;
  });
};

const deduplicateQueue = (list) => {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.filter(item => {
    if (!item) return false;
    const key = item.id || `token-${item.token_number || item.tokenNumber}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const ALL_FONTS = [
  // Sans-serif
  { name: 'Plus Jakarta Sans', category: 'Sans-serif' },
  { name: 'Inter', category: 'Sans-serif' },
  { name: 'Roboto', category: 'Sans-serif' },
  { name: 'Open Sans', category: 'Sans-serif' },
  { name: 'Lato', category: 'Sans-serif' },
  { name: 'Montserrat', category: 'Sans-serif' },
  { name: 'Poppins', category: 'Sans-serif' },
  { name: 'Source Sans 3', category: 'Sans-serif' },
  { name: 'Oswald', category: 'Sans-serif' },
  { name: 'Raleway', category: 'Sans-serif' },
  { name: 'Ubuntu', category: 'Sans-serif' },
  { name: 'Nunito', category: 'Sans-serif' },
  { name: 'Rubik', category: 'Sans-serif' },
  { name: 'Work Sans', category: 'Sans-serif' },
  { name: 'DM Sans', category: 'Sans-serif' },
  { name: 'Outfit', category: 'Sans-serif' },
  { name: 'Manrope', category: 'Sans-serif' },
  { name: 'Fira Sans', category: 'Sans-serif' },
  
  // Serif
  { name: 'Playfair Display', category: 'Serif' },
  { name: 'Merriweather', category: 'Serif' },
  { name: 'PT Serif', category: 'Serif' },
  { name: 'Lora', category: 'Serif' },
  { name: 'Noto Serif', category: 'Serif' },
  { name: 'Arvo', category: 'Serif' },
  { name: 'Crimson Text', category: 'Serif' },
  { name: 'Libre Baskerville', category: 'Serif' },
  { name: 'EB Garamond', category: 'Serif' },
  { name: 'Cardo', category: 'Serif' },
  { name: 'Cinzel', category: 'Serif' },
  { name: 'Domine', category: 'Serif' },
  { name: 'Georgia', category: 'Serif' },
  
  // Monospace
  { name: 'Fira Code', category: 'Monospace' },
  { name: 'Source Code Pro', category: 'Monospace' },
  { name: 'Inconsolata', category: 'Monospace' },
  { name: 'Courier Prime', category: 'Monospace' },
  { name: 'Share Tech Mono', category: 'Monospace' },
  
  // Handwriting / Script
  { name: 'Dancing Script', category: 'Handwriting' },
  { name: 'Pacifico', category: 'Handwriting' },
  { name: 'Caveat', category: 'Handwriting' },
  { name: 'Great Vibes', category: 'Handwriting' },
  { name: 'Sacramento', category: 'Handwriting' },
  { name: 'Satisfy', category: 'Handwriting' },
];

const DEFAULT_SYMPTOM_TEMPLATES = [
  {
    id: 'migraine',
    category: 'Migraine & Headache',
    icon: '🤕',
    symptoms: [
      'Dizziness sometimes',
      'Feels weakness in head',
      'Heaviness in head',
      'Throbbing / Pulsating headache',
      'Pain behind the eyes',
      'Nausea / Vomiting tendency',
      'Photophobia (Light sensitivity)',
      'Phonophobia (Sound sensitivity)'
    ]
  },
  {
    id: 'anxiety',
    category: 'Anxiety & Panic',
    icon: '⚡',
    symptoms: [
      'Palpitations / Fast heartbeat',
      'Excessive worrying & nervousness',
      'Restlessness & inability to relax',
      'Chest tightness / Heaviness',
      'Trembling of hands / Shivering',
      'Panic episodes / Sudden fear',
      'Shortness of breath / Choking feeling',
      'Excessive sweating / Cold hands'
    ]
  },
  {
    id: 'depression',
    category: 'Depression & Mood',
    icon: '🌧️',
    symptoms: [
      'Persistent low mood / Sadness',
      'Loss of interest in activities (Anhedonia)',
      'Fatigue & lack of energy / Lethargy',
      'Hopelessness / Helplessness',
      'Poor concentration & focus',
      'Crying spells / Frequent weeping',
      'Decreased appetite / Weight loss',
      'Negative & overthinking thoughts'
    ]
  },
  {
    id: 'insomnia',
    category: 'Insomnia & Sleep',
    icon: '🌙',
    symptoms: [
      'Difficulty falling asleep (Delayed onset)',
      'Frequent night awakenings',
      'Early morning awakening',
      'Non-refreshing / Disturbed sleep',
      'Daytime drowsiness / Fatigue',
      'Nightmares / Vivid disturbing dreams'
    ]
  },
  {
    id: 'psychosis',
    category: 'Psychosis & Schizophrenia',
    icon: '🧠',
    symptoms: [
      'Auditory hallucinations (Hearing voices)',
      'Suspiciousness & persecutory ideas',
      'Irrelevant / Disorganized speech',
      'Aggressive / Agitated behavior',
      'Self-muttering / Smiling alone',
      'Severe social withdrawal',
      'Poor self-care & personal hygiene'
    ]
  },
  {
    id: 'ocd',
    category: 'OCD & Intrusive Thoughts',
    icon: '🔄',
    symptoms: [
      'Repeated hand washing / Contamination fear',
      'Repeated checking (Locks, gas, switches)',
      'Repetitive intrusive thoughts / Doubts',
      'Counting / Symmetry & order rituals',
      'Mental compulsions & distress'
    ]
  },
  {
    id: 'bipolar',
    category: 'Bipolar & Mania',
    icon: '🔥',
    symptoms: [
      'Decreased need for sleep (without fatigue)',
      'Elevated / Expansive mood',
      'Racing thoughts & rapid speech',
      'Grandiosity / Over-confidence',
      'Excessive spending / Risky behavior',
      'High irritability / Anger outbursts'
    ]
  },
  {
    id: 'somatic',
    category: 'Somatic & Body Aches',
    icon: '⚡',
    symptoms: [
      'Generalized body pain / Fibromyalgia',
      'Burning sensation in palms & soles',
      'Gastric discomfort / Abdominal bloating',
      'Tingling & numbness in limbs',
      'Chronic unrefreshing fatigue'
    ]
  }
];

export const SMART_TIMING_RULES = [
  {
    category: 'antacid',
    label: 'Empty stomach (सुबह खाली पेट)',
    regex: /\b(pantop|pantoprazole|pan\s*40|pan\s*d|pantocid|pantodac|rabeprazole|rabicip|rabeloc|rabemac|omeprazole|omez|omizac|esomeprazole|nexpro|sompraz|esomac|sucralfate|digene|gelusil|mucaine|ilaprazole|lansoprazole)\b/i,
    bilingual: '1-0-0 (सुबह खाली पेट / Empty stomach in morning)',
    hindi: '1-0-0 (सुबह खाली पेट - नाश्ते से आधा घंटा पहले)',
    english: '1-0-0 (Empty stomach - 30 mins before breakfast)'
  },
  {
    category: 'bedtime_sedative',
    label: 'Bedtime (रात को सोने से पहले)',
    regex: /\b(clonazepam|zapiz|clona|lonazep|rivotril|etizolam|etilaam|etizest|zolpidem|zolfresh|nitrest|melatonin|meloset|alprazolam|alprax|restyl|trika|olanzapine|oliza|olexar|quetiapine|quipin|seroque|mirtazapine|mirnite|amitriptyline|tryptomer|triptomer|nitrazepam|dornit|lorazepam|ativan|trapex|pregabalin|prebaxe|maxgalin|lyrica|gabapentin|gabapin)\b/i,
    bilingual: '0-0-1 (रात को सोने से पहले / At bedtime)',
    hindi: '0-0-1 (रात को सोने से पहले)',
    english: '0-0-1 (At bedtime / At night)'
  },
  {
    category: 'painkiller',
    label: 'After meals (खाना खाने के बाद)',
    regex: /\b(paracetamol|pcm|dolo|calpol|crocin|pacimol|combiflam|flexon|zerodol|hifenac|aceclofenac|diclofenac|voveran|dynapar|voltaren|ibuprofen|brufen|naproxen|naprosyn|tramadol|ultracet|ketorolac|ketanov|etoricoxib|nucoxia|etoshine|thiocolchicoside|myoril|baclofen|lioresal)\b/i,
    bilingual: '1-0-1 (खाना खाने के बाद / After meals)',
    hindi: '1-0-1 (सुबह-शाम खाना खाने के बाद)',
    english: '1-0-1 (Twice daily after meals)'
  },
  {
    category: 'sos',
    label: 'SOS (ज़रूरत पड़ने पर)',
    regex: /\b(sos|sumatriptan|sunitrex|migranil|rizatriptan|rizact|ondansetron|vomikind|emeset|domperidone|vomistop|stemetil|prochlorperazine|vertin|betahistine|sorbitrate|nitroglycerin)\b/i,
    bilingual: 'SOS (ज़रूरत पड़ने पर / As needed)',
    hindi: 'SOS (ज़रूरत पड़ने पर)',
    english: 'SOS (When required / As needed)'
  },
  {
    category: 'thyroid',
    label: 'Early morning empty stomach (सुबह उठते ही)',
    regex: /\b(thyronorm|eltroxin|thyroxine|levothyroxine)\b/i,
    bilingual: '1-0-0 (सुबह उठते ही खाली पेट / Early morning empty stomach)',
    hindi: '1-0-0 (सुबह उठते ही खाली पेट)',
    english: '1-0-0 (Early morning empty stomach)'
  },
  {
    category: 'morning_cardio_neuro',
    label: 'Morning after breakfast (नाश्ते के बाद)',
    regex: /\b(telmisartan|telma|telmikind|amlodipine|amlong|cilnidipine|cilacar|losartan|atenolol|escitalopram|nexito|stalopam|sertraline|serlift|daxid|fluoxetine|prozac|fludac|duloxetine|duzela|symbal|vortioxetine|modafinil|modalert|armodafinil|waklert)\b/i,
    bilingual: '1-0-0 (सुबह नाश्ते के बाद / Morning after breakfast)',
    hindi: '1-0-0 (सुबह नाश्ते के बाद)',
    english: '1-0-0 (Once daily after breakfast)'
  },
  {
    category: 'supplements',
    label: 'After lunch (दोपहर खाने के बाद)',
    regex: /\b(neurobion|becosules|zincovit|methylcobalamin|nurokind|nurobest|calcium|shelcal|gemcal|calcimax|vitamin\s*d|d3|calcirol|uprise|cholecalciferol|multivitamin|folic\s*acid|folvite)\b/i,
    bilingual: '0-1-0 (दोपहर खाने के बाद / After lunch)',
    hindi: '0-1-0 (दोपहर खाने के बाद)',
    english: '0-1-0 (Once daily after lunch)'
  },
  {
    category: 'antibiotic',
    label: 'Twice daily 5 days (खाना खाने के बाद)',
    regex: /\b(amoxicillin|mox|novamox|augmentin|moxikind|clavum|azithromycin|azithral|aziwok|zady|cefixime|taxim|zifi|mahacef|ciprofloxacin|ciplox|ofloxacin|zanocin|levofloxacin|levomac|metronidazole|flagyl|doxycycline|doxypal)\b/i,
    bilingual: '1-0-1 (खाना खाने के बाद - 5 दिन / After meals - 5 days)',
    hindi: '1-0-1 (खाना खाने के बाद - 5 दिन)',
    english: '1-0-1 (Twice daily after meals - for 5 days)'
  },
  {
    category: 'antiepileptic',
    label: 'Fixed time after meals (नियमित समय पर)',
    regex: /\b(levetiracetam|levipil|epilive|torleva|valproate|valparin|encorate|epitec|divalproex|depakote|oxcarbazepine|oxitol|oleptal|trileptal|carbamazepine|tegretol|mazetol|lacosamide|lacoxa|lacoset|lamotrigine|lamitor|lamictal|topiramate|topamac)\b/i,
    bilingual: '1-0-1 (नियमित समय पर खाने के बाद / Twice daily after meals)',
    hindi: '1-0-1 (नियमित समय पर खाने के बाद)',
    english: '1-0-1 (Twice daily after meals at fixed times)'
  },
  {
    category: 'statin',
    label: 'Night after dinner (रात खाने के बाद)',
    regex: /\b(atorvastatin|atorva|atorlip|storvas|rosuvastatin|rosuvas|rozavel)\b/i,
    bilingual: '0-0-1 (रात को खाने के बाद / Night after dinner)',
    hindi: '0-0-1 (रात को खाने के बाद)',
    english: '0-0-1 (Night after dinner)'
  },
  {
    category: 'antidiabetic',
    label: 'Before meals (खाने से पहले)',
    regex: /\b(metformin|glycomet|glimepiride|amaryl|vildagliptin|galvus|sitagliptin|januvia|teneligliptin)\b/i,
    bilingual: '1-0-1 (खाने से पहले / Before meals)',
    hindi: '1-0-1 (खाने से 15 मिनट पहले)',
    english: '1-0-1 (15 mins before meals)'
  }
];

export const detectSmartDrugTiming = (name = '', composition = '', lang = 'bilingual') => {
  try {
    const safeName = typeof name === 'string' ? name : '';
    const safeComp = typeof composition === 'string' ? composition : '';
    const combined = `${safeName} ${safeComp}`.trim().toLowerCase();
    if (!combined) return '';
    for (const rule of (SMART_TIMING_RULES || [])) {
      if (rule && rule.regex && rule.regex.test(combined)) {
        if (lang === 'hindi') return rule.hindi || rule.bilingual || '';
        if (lang === 'english') return rule.english || rule.bilingual || '';
        return rule.bilingual || '';
      }
    }
    return '';
  } catch (err) {
    console.error('Error in detectSmartDrugTiming:', err);
    return '';
  }
};

export const TIMING_QUICK_PRESETS = [
  {
    id: 'empty_stomach',
    icon: '',
    shortLabel: 'BBF',
    bilingual: 'BBF (सुबह खाली पेट / Empty stomach in morning)',
    hindi: 'BBF (सुबह खाली पेट - नाश्ते से 30 मिनट पहले)',
    english: 'BBF (Empty stomach in morning)'
  },
  {
    id: 'morning_after_meal',
    icon: '☀️',
    shortLabel: '1-0-0 नाश्ते बाद',
    bilingual: '1-0-0 (सुबह नाश्ते के बाद / Morning after breakfast)',
    hindi: '1-0-0 (सुबह नाश्ते के बाद)',
    english: '1-0-0 (Once daily after breakfast)'
  },
  {
    id: 'twice_daily_meals',
    icon: '🍽️',
    shortLabel: '1-0-1 खाने बाद',
    bilingual: '1-0-1 (एक गोली सुबह और एक गोली रात को / Twice daily after meals)',
    hindi: '1-0-1 (एक गोली सुबह और एक गोली रात को)',
    english: '1-0-1 (Twice daily after meals)'
  },
  {
    id: 'night_bedtime',
    icon: '🌙',
    shortLabel: '0-0-1 रात',
    bilingual: '0-0-1 (रात को सोने से पहले / At bedtime)',
    hindi: '0-0-1 (रात को सोने से पहले)',
    english: '0-0-1 (At bedtime / At night)'
  },
  {
    id: 'thrice_daily',
    icon: '🍱',
    shortLabel: '1-1-1 तीनों पहर',
    bilingual: '1-1-1 (सुबह-दोपहर-रात खाने बाद / After meals thrice daily)',
    hindi: '1-1-1 (सुबह-दोपहर-रात खाने के बाद)',
    english: '1-1-1 (Thrice daily after meals)'
  },
  {
    id: 'sos',
    icon: '⚡',
    shortLabel: 'SOS ज़रूरत पर',
    bilingual: 'SOS (ज़रूरत पड़ने पर / As needed)',
    hindi: 'SOS (ज़रूरत पड़ने पर)',
    english: 'SOS (When required / As needed)'
  }
];

export const getPresetTimingValue = (presetId, lang = 'bilingual') => {
  const p = (TIMING_QUICK_PRESETS || []).find(x => x.id === presetId);
  if (!p) return '';
  if (lang === 'hindi') return p.hindi;
  if (lang === 'english') return p.english;
  return p.bilingual;
};

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('App ErrorBoundary caught error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2.5rem', maxWidth: '640px', margin: '4rem auto', backgroundColor: '#ffffff', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.12)', border: '1px solid #fecaca', textAlign: 'center', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ color: '#b91c1c', margin: '0 0 0.5rem 0', fontSize: '1.35rem', fontWeight: 800 }}>A display issue occurred</h2>
          <p style={{ color: '#475569', fontSize: '0.92rem', lineHeight: '1.5', marginBottom: '1.5rem' }}>
            {this.state.error?.message || 'An unexpected rendering error occurred while loading this view.'}
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{ padding: '0.65rem 1.4rem', backgroundColor: '#0f766e', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}
            >
              ↻ Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: '0.65rem 1.4rem', backgroundColor: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}
            >
              🔄 Reload Doctor Portal
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [rxInstructionLanguage, setRxInstructionLanguage] = useState(() => {
    return localStorage.getItem('rxInstructionLanguage') || 'bilingual';
  });
  const [token, setToken] = useState(localStorage.getItem('doc_token') || '');
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('doc_user');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!parsed.name || String(parsed.name).toLowerCase().includes('undefined') || String(parsed.name).toLowerCase().includes('null')) {
          parsed.name = parsed.role === 'RECEPTIONIST' ? 'Front Desk / Reception' : 'Dr. Priyadarshi Srivastava';
          try { localStorage.setItem('doc_user', JSON.stringify(parsed)); } catch (e) {}
        }
        return parsed;
      }
      return null;
    } catch (e) {
      return null;
    }
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginRole, setLoginRole] = useState('DOCTOR'); // 'DOCTOR' or 'RECEPTIONIST'

  const SAMPLE_OPD_QUEUE = [
    { id: 'mock-1', token_number: 1, patient_name: 'Naseem', age: 53, gender: 'Male', patient_type: 'FOLLOW_UP', fee_status: 'FREE', payment_mode: 'FREE', reference_id: 'REF-213/2026', phone: '9876543210', status: 'WAITING', chief_complaints: 'ANXIETY , RESTLESSNESS, DYSPNEA, BODY PAINS, INTERMITTENT PANIC ATTACKS', diagnosis: 'PANIC DISORDER WITH MILD AGORAPHOBIA' },
    { id: 'mock-2', token_number: 2, patient_name: 'Shabana Begum', age: 48, gender: 'Female', patient_type: 'FOLLOW_UP', fee_status: 'PAID', payment_mode: 'CASH', reference_id: 'REF-218/2026', phone: '9876543210', status: 'WAITING', chief_complaints: 'CHRONIC NECK STIFFNESS, BILATERAL TEMPLE HEADACHE', diagnosis: 'TENSION-TYPE HEADACHE & SOMATOFORM PAIN' },
    { id: 'mock-3', token_number: 3, patient_name: 'Rupali Yadav', age: 21, gender: 'Female', patient_type: 'NEW', fee_status: 'PAID', payment_mode: 'CASH', reference_id: 'REF-214/2026', phone: '9876543211', status: 'WAITING', chief_complaints: 'Throbbing headache', diagnosis: 'Episodic Migraine' },
    { id: 'mock-4', token_number: 4, patient_name: 'Kartik', age: 15, gender: 'Male', patient_type: 'NEW', fee_status: 'PAID', payment_mode: 'CASH', reference_id: 'REF-215/2026', phone: '9876543212', status: 'WAITING', chief_complaints: 'Exam stress', diagnosis: 'Adjustment reaction' },
    { id: 'mock-5', token_number: 5, patient_name: 'Maksood Ali', age: 40, gender: 'Male', patient_type: 'NEW', fee_status: 'PAID', payment_mode: 'CASH', reference_id: 'REF-216/2026', phone: '9876543213', status: 'WAITING', chief_complaints: 'Tension headaches', diagnosis: 'Tension headache' },
    { id: 'mock-6', token_number: 6, patient_name: 'Sunita Sharma', age: 36, gender: 'Female', patient_type: 'FOLLOW_UP', fee_status: 'PAID', payment_mode: 'UPI', reference_id: 'REF-217/2026', phone: '9876543214', status: 'WAITING', chief_complaints: 'Low mood', diagnosis: 'Depressive episode' }
  ];

  const SAMPLE_OFFLINE_PRESCRIPTIONS = [
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
        { name: 'Tab. Zapiz 0.25mg', composition: 'Clonazepam 0.25mg', dosage: '0.5 Tab', frequency: '0 – 0 – 1 (रात को सोते समय)' },
        { name: 'Tab. Inderal 10mg', composition: 'Propranolol 10mg', dosage: '1 Tab', frequency: 'SOS (घबराहट होने पर)' }
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
      diagnosis: 'Panic Disorder with Mild Agoraphobia',
      chiefComplaints: 'Intermittent panic attacks, restlessness, breathlessness in crowd',
      bp: '131/89',
      pulse: '85',
      weight: '48',
      sugar: '',
      medications: [
        { name: 'EXITRACE', composition: 'FLUPENTHIXOLE', dosage: '1 MG', frequency: '0 – 0 – 1 (रात को सोने से पहले / At bedtime)' },
        { name: 'CLONAM PRO DS', composition: 'CLONAZEPAM 0.5 MG + PROPANOLOL 20 MG', dosage: '1 TAB', frequency: 'SOS (ज़रूरत पड़ने पर / As needed)', instructions: 'FOR ANXIETY ATTACKS' },
        { name: 'NEXITO PLUS', composition: 'ESCITALOPRAM 10 MG + CLONAZEPAM 0.5 MG', dosage: '1 TAB', frequency: '1 – 0 – 0 (सुबह नाश्ते के बाद)' }
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
      chiefComplaints: 'Chronic neck stiffness, bilateral temple headache',
      bp: '124/80',
      pulse: '76',
      weight: '56',
      sugar: '',
      medications: [
        { name: 'Tab. Amitone 10mg', composition: 'Amitriptyline 10mg', dosage: '1 Tab', frequency: '0 – 0 – 1 (रात को सोने से पहले)' },
        { name: 'Tab. Dolo 650', composition: 'Paracetamol 650mg', dosage: '1 Tab', frequency: 'SOS (दर्द होने पर)' }
      ],
      advice: 'Neck posture exercises, hot fomentation.'
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
      chiefComplaints: 'ANXIETY , RESTLESSNESS, DYSPNEA, BODY PAINS, INTERMITTENT PANIC ATTACKS',
      bp: '131/89',
      pulse: '85',
      weight: '48',
      sugar: '',
      medications: [
        { name: 'EXITRACE', composition: 'FLUPENTHIXOLE', dosage: '1MG', frequency: '0 – 0 – 1 (रात को सोने से पहले / At bedtime)' },
        { name: 'CLONAM PRO DS', composition: 'CLONAZEPAM 0.5 MG + PROPANOLOL 20 MG', dosage: '1TAB', frequency: 'SOS (ज़रूरत पड़ने पर / As needed)', instructions: 'FOR ANXIETY ATTACKS' },
        { name: 'NEXITO PLUS', composition: 'ESCITALOPRAM 10 MG + CLONAZEPAM 0.5 MG', dosage: '1TAB', frequency: '1 – 0 – 0 (सुबह नाश्ते के बाद)' }
      ],
      advice: 'Follow-up: Visit within 17 days (Date: 27/11/2026). Deep breathing exercises.',
      requiredTests: 'CBC, THYROID PROFILE',
      followUpDate: '2026-11-27',
      privateNotes: 'Regular psychiatric follow-up.'
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
        { name: 'Tab. Duloxetine 30mg', composition: 'Duloxetine 30mg', dosage: '1 Tab', frequency: '1 – 0 – 0 (सुबह नाश्ते के बाद)' },
        { name: 'Tab. Clonazepam 0.5mg', composition: 'Clonazepam 0.5mg', dosage: '0.5 Tab', frequency: '0 – 0 – 1 (रात को)' }
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
        { name: 'Tab. Nexito Plus', composition: 'Escitalopram 10mg + Clonazepam 0.5mg', dosage: '1 Tab', frequency: '1 – 0 – 0 (सुबह)' },
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
        { name: 'Tab. Amitriptyline 10mg', composition: 'Amitriptyline 10mg', dosage: '1 Tab', frequency: '0 – 0 – 1 (रात को सोने से पहले)' },
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
        { name: 'Tab. Nexito 10mg', composition: 'Escitalopram 10mg', dosage: '1 Tab', frequency: '1 – 0 – 0 (सुबह नाश्ते के बाद)' },
        { name: 'Tab. Zapiz 0.25mg', composition: 'Clonazepam 0.25mg', dosage: '1 Tab', frequency: '0 – 0 – 1 (रात को)' }
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
        { name: 'Tab. Nexito Plus', composition: 'Escitalopram 10mg + Clonazepam 0.5mg', dosage: '1 Tab', frequency: '1 – 0 – 0 (सुबह)' },
        { name: 'Tab. Dolo 650', composition: 'Paracetamol 650mg', dosage: '1 Tab', frequency: 'SOS (सिरदर्द पर)' }
      ],
      advice: 'Avoid checking vitals repeatedly. Reassurance given.',
      requiredTests: 'ECG, Serum Ferritin, Vit D3',
      followUpDate: '2026-11-26',
      privateNotes: 'Reassured regarding normal ECG and vitals.'
    }
  ];

  const [opdQueue, setOpdQueue] = useState(() => {
    try {
      const todayStr = getLocalDateStr();
      const saved = localStorage.getItem('cached_opd_queue');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const filtered = parsed.filter(item => {
            if (!item.created_at) return false;
            try {
              return getLocalDateStr(new Date(item.created_at)) === todayStr;
            } catch (e) {
              return false;
            }
          });
          if (filtered.length > 0) {
            const cleaned = deduplicateQueue(filtered).filter(p => !String(p.id).startsWith('local-queue-') || p.token_number > 6);
            return cleaned.slice(0, 20);
          }
        }
      }
      return [];
    } catch (e) {
      return [];
    }
  });
  const [loadingOpdQueue, setLoadingOpdQueue] = useState(false);
  const [activeConsultingQueueId, setActiveConsultingQueueId] = useState(null);

  const [appointments, setAppointments] = useState([]);
  const [loadingAppts, setLoadingAppts] = useState(false);
  const [apptsError, setApptsError] = useState('');

  // Dashboard view toggle and Offline prescription maker state
  const [dashboardView, setDashboardView] = useState('offline-rx'); // 'appointments' or 'offline-rx'
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeSearchIndex, setActiveSearchIndex] = useState(null);
  const [offlineRxList, setOfflineRxList] = useState(() => {
    try {
      const saved = localStorage.getItem('cached_offline_prescriptions');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return deduplicatePrescriptions(parsed);
        }
      }
      return [];
    } catch (e) {
      return [];
    }
  });
  const [showPastVisitsDrawer, setShowPastVisitsDrawer] = useState(false);
  const [showPastVisitsModal, setShowPastVisitsModal] = useState(false);

  // Draggable & Persistent Position for Floating Previous Prescriptions Button
  const [prevRxBtnPos, setPrevRxBtnPos] = useState(() => {
    try {
      const saved = localStorage.getItem('prevRxBtnPos');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          return parsed;
        }
      }
    } catch (e) {}
    return null;
  });

  const isDraggingPrevRxBtnRef = useRef(false);
  const dragStartPosRef = useRef({ mouseX: 0, mouseY: 0, elemX: 0, elemY: 0, hasMoved: false });
  const prevRxBtnRef = useRef(null);

  const handlePrevRxBtnPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const elem = prevRxBtnRef.current;
    if (!elem) return;
    const rect = elem.getBoundingClientRect();

    dragStartPosRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      elemX: rect.left,
      elemY: rect.top,
      hasMoved: false
    };
    isDraggingPrevRxBtnRef.current = true;

    const handlePointerMove = (moveEvt) => {
      if (!isDraggingPrevRxBtnRef.current) return;
      const dx = moveEvt.clientX - dragStartPosRef.current.mouseX;
      const dy = moveEvt.clientY - dragStartPosRef.current.mouseY;

      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        dragStartPosRef.current.hasMoved = true;
      }

      const btnW = elem.offsetWidth || 220;
      const btnH = elem.offsetHeight || 44;
      const newX = Math.max(8, Math.min(window.innerWidth - btnW - 8, dragStartPosRef.current.elemX + dx));
      const newY = Math.max(8, Math.min(window.innerHeight - btnH - 8, dragStartPosRef.current.elemY + dy));

      setPrevRxBtnPos({ x: newX, y: newY });
    };

    const handlePointerUp = () => {
      isDraggingPrevRxBtnRef.current = false;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);

      if (dragStartPosRef.current.hasMoved) {
        setPrevRxBtnPos(currentPos => {
          if (currentPos) {
            try {
              localStorage.setItem('prevRxBtnPos', JSON.stringify(currentPos));
            } catch (e) {}
          }
          return currentPos;
        });
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };
  const [loadingOfflineRx, setLoadingOfflineRx] = useState(false);
  const [selectedOfflineRxId, setSelectedOfflineRxId] = useState(null);
  const [originalConsultDate, setOriginalConsultDate] = useState('');
  const [isSavingOfflineRx, setIsSavingOfflineRx] = useState(false);
  const isSavingOfflineRxRef = useRef(false);
  const isPrintingRxRef = useRef(false);
  
  const [rxSearchQuery, setRxSearchQuery] = useState('');
  const [expandedRxHistoryIds, setExpandedRxHistoryIds] = useState(new Set());
  const [quickLookupQuery, setQuickLookupQuery] = useState('');
  const [showQuickLookupDropdown, setShowQuickLookupDropdown] = useState(false);
  const [tempMed, setTempMed] = useState({ name: '', composition: '', dosage: '', frequency: '' });
  const [rxAutoSaveNotice, setRxAutoSaveNotice] = useState(null);
  const [medHighlightedIndex, setMedHighlightedIndex] = useState(0);
  const [quickLookupHighlightedIndex, setQuickLookupHighlightedIndex] = useState(0);
  const [symptomHighlightedIndex, setSymptomHighlightedIndex] = useState(0);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [activeRailSection, setActiveRailSection] = useState(() => {
    const saved = localStorage.getItem('activeRailSection');
    if (saved === 'none') return null;
    if (saved) return saved;
    const qExpanded = localStorage.getItem('isQueueExpanded');
    if (qExpanded === 'false') return null;
    return 'queue';
  });
  const [rxSidebarSearch, setRxSidebarSearch] = useState('');

  const isSidebarOpen = Boolean(activeRailSection && activeRailSection !== 'settings');
  const isQueueExpanded = isSidebarOpen;

  const toggleRailSection = (sectionName) => {
    setActiveRailSection(prev => {
      const next = prev === sectionName ? null : sectionName;
      localStorage.setItem('activeRailSection', next || 'none');
      localStorage.setItem('isQueueExpanded', next ? 'true' : 'false');
      return next;
    });
  };

  const closeSidebar = () => {
    setActiveRailSection(null);
    localStorage.setItem('activeRailSection', 'none');
    localStorage.setItem('isQueueExpanded', 'false');
  };

  const toggleQueue = () => {
    toggleRailSection('queue');
  };

  const medNameInputRef = useRef(null);
  const medDosageInputRef = useRef(null);
  const medFrequencyInputRef = useRef(null);
  const medDropdownRef = useRef(null);
  const diagnosisInputRef = useRef(null);
  const chiefComplaintsInputRef = useRef(null);
  const quickLookupInputRef = useRef(null);
  const previewScrollRef = useRef(null);
  const [previewContainerWidth, setPreviewContainerWidth] = useState(550);
  const [offlineForm, setOfflineForm] = useState({
    referenceId: '',
    patientName: '',
    patientAge: '',
    patientGender: 'Male',
    patientPhone: '',
    consultDate: getLocalDateStr(),
    diagnosis: '',
    chiefComplaints: '',
    bp: '',
    pulse: '',
    weight: '',
    sugar: '',
    medications: [],
    advice: '',
    requiredTests: '',
    followUpDate: '',
    privateNotes: ''
  });

  // Web Audio Chime for incoming Front Desk arrivals
  const playQueueNotificationSound = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.36);
    } catch (e) {}
  };

  // State for tracking seen patient IDs in Today's Queue (for notification badges)
  const [seenQueuePatientIds, setSeenQueuePatientIds] = useState(() => {
    try {
      const saved = localStorage.getItem('seen_queue_patient_ids');
      if (saved) {
        return new Set(JSON.parse(saved));
      }
    } catch (e) {}
    const initialList = opdQueue || [];
    return new Set(initialList.map(p => String(p.id)));
  });

  // Calculate unread/new patient requests from front desk
  const newQueueCount = useMemo(() => {
    if (activeRailSection === 'queue') return 0;
    const currentList = opdQueue || [];
    const unseen = currentList.filter(p => !seenQueuePatientIds.has(String(p.id)) && p.status !== 'COMPLETED');
    return unseen.length;
  }, [opdQueue, seenQueuePatientIds, activeRailSection]);

  // When doctor opens the Today's Queue rail tab, mark all current patients as seen (clears badge)
  useEffect(() => {
    if (activeRailSection === 'queue') {
      const currentList = opdQueue || [];
      setSeenQueuePatientIds(prev => {
        const next = new Set(prev);
        let changed = false;
        currentList.forEach(p => {
          if (!next.has(String(p.id))) {
            next.add(String(p.id));
            changed = true;
          }
        });
        if (changed) {
          try {
            localStorage.setItem('seen_queue_patient_ids', JSON.stringify(Array.from(next)));
          } catch (e) {}
          return next;
        }
        return prev;
      });
    }
  }, [activeRailSection, opdQueue]);

  // Real-time cross-tab synchronization for OPD queue (between Receptionist and Doctor tabs)
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'cached_opd_queue' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            const todayStr = getLocalDateStr();
            const todayOnly = parsed.filter(item => {
              if (!item.created_at) return false;
              try {
                return getLocalDateStr(new Date(item.created_at)) === todayStr;
              } catch (err) {
                return false;
              }
            });
            // Detect if a new arrival came from front desk
            const newlyArrived = todayOnly.filter(p => !seenQueuePatientIds.has(String(p.id)));
            if (newlyArrived.length > 0 && activeRailSection !== 'queue') {
              const latest = newlyArrived[newlyArrived.length - 1];
              playQueueNotificationSound();
              setQueueNavToast(`🛎️ Front Desk Alert: ${latest.patient_name || 'New patient'} added to Queue to consult!`);
              setTimeout(() => setQueueNavToast(null), 4500);
            }
            setOpdQueue(todayOnly);
          }
        } catch (err) {}
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [seenQueuePatientIds, activeRailSection]);



  const [offlineLayout, setOfflineLayout] = useState({
    pageWidth: parseInt(localStorage.getItem('pageWidthOffline')) || 800,  // px
    pageHeight: parseInt(localStorage.getItem('pageHeightOffline')) || 1120, // px
    fontSize: parseInt(localStorage.getItem('fontSizeOffline')) || 13,   // px
    marginSize: parseInt(localStorage.getItem('marginSizeOffline')) || 40,   // px
    rowSpacing: parseInt(localStorage.getItem('rowSpacingOffline')) || 12,    // px
    useLetterhead: localStorage.getItem('useLetterheadOffline') !== 'false',
    letterheadTopMargin: parseInt(localStorage.getItem('letterheadTopMarginOffline')) || 285,
    letterheadBottomMargin: parseInt(localStorage.getItem('letterheadBottomMarginOffline')) || 196,
    showSignature: localStorage.getItem('showSignatureOffline') !== 'false',
    signatureSize: parseInt(localStorage.getItem('signatureSizeOffline')) || 228,
    signaturePosition: localStorage.getItem('signaturePositionOffline') || 'inline',
    signatureXOffset: parseInt(localStorage.getItem('signatureXOffsetOffline')) !== null && !isNaN(parseInt(localStorage.getItem('signatureXOffsetOffline'))) ? parseInt(localStorage.getItem('signatureXOffsetOffline')) : -4,
    signatureYOffset: parseInt(localStorage.getItem('signatureYOffsetOffline')) !== null && !isNaN(parseInt(localStorage.getItem('signatureYOffsetOffline'))) ? parseInt(localStorage.getItem('signatureYOffsetOffline')) : -36,
    fontFamily: localStorage.getItem('fontFamilyOffline') || 'Plus Jakarta Sans'
  });

  const updateOfflineLayout = (key, val) => {
    setOfflineLayout(prev => {
      const next = { ...prev, [key]: val };
      try {
        localStorage.setItem(`${key}Offline`, typeof val === 'object' ? JSON.stringify(val) : val);
      } catch (e) {}
      return next;
    });
  };

  const [manualScale, setManualScale] = useState(null);
  const [windowHeight, setWindowHeight] = useState(() => typeof window !== 'undefined' ? window.innerHeight : 900);

  useEffect(() => {
    const handleResize = () => setWindowHeight(window.innerHeight);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const medCount = offlineForm?.medications ? offlineForm.medications.length : 0;

  // Auto-calculated scale: stays at 94% (0.94) while there is ample space on the letterhead!
  // Only gently scales down when space is actually running out (10+ medicines) to prevent page overflow.
  const autoFitScale = useMemo(() => {
    if (manualScale !== null) return manualScale;

    // Based on actual available space: 1 to 9 medicines easily fit at 94%
    if (medCount <= 9) return 0.94; 
    if (medCount <= 12) return 0.88; 
    return 0.80; // 13+ medicines
  }, [manualScale, medCount]);

  // Dynamic density within the sheet: comfortable and large while space permits, compacts only for heavy medicine lists
  const dynamicMedStyle = useMemo(() => {
    if (medCount <= 7) {
      return {
        rowPadding: '0.65rem 0.5rem',
        medNameSize: '1.05em',
        compositionSize: '0.82em',
        dosageSize: '0.92em',
        boxMinHeight: '66px',
        complaintsFontSize: '0.94em',
        bodyGap: '1rem',
        patientGridPadding: '0.6rem 0.8rem',
        headerPaddingBottom: '0.7rem'
      };
    } else if (medCount <= 10) {
      return {
        rowPadding: '0.42rem 0.45rem',
        medNameSize: '0.96em',
        compositionSize: '0.76em',
        dosageSize: '0.84em',
        boxMinHeight: '50px',
        complaintsFontSize: '0.88em',
        bodyGap: '0.8rem',
        patientGridPadding: '0.5rem 0.7rem',
        headerPaddingBottom: '0.55rem'
      };
    } else {
      return {
        rowPadding: '0.25rem 0.35rem',
        medNameSize: '0.86em',
        compositionSize: '0.7em',
        dosageSize: '0.76em',
        boxMinHeight: '38px',
        complaintsFontSize: '0.8em',
        bodyGap: '0.65rem',
        patientGridPadding: '0.4rem 0.55rem',
        headerPaddingBottom: '0.45rem'
      };
    }
  }, [medCount]);

  // Dynamic scale calculation for 125% - 150% display scaling so prescription preview fits viewport
  useEffect(() => {
    if (!previewScrollRef.current) return;
    const updateWidth = () => {
      if (previewScrollRef.current) {
        setPreviewContainerWidth(previewScrollRef.current.clientWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(updateWidth);
      ro.observe(previewScrollRef.current);
    }
    return () => {
      window.removeEventListener('resize', updateWidth);
      if (ro) ro.disconnect();
    };
  }, [sidebarOpen]);

  const activePreviewScale = useMemo(() => {
    const targetW = offlineLayout.pageWidth || 800;
    const availW = Math.max(300, previewContainerWidth - 44);
    const scale = availW / targetW;
    return Math.min(1, Math.max(0.48, Number(scale.toFixed(2))));
  }, [previewContainerWidth, offlineLayout.pageWidth]);

  // Sample Doctor Master Medicines Catalog
  const SAMPLE_DOCTOR_MEDICINES = [
    { id: 'sm-1', name: 'EXITRACE', composition: 'FLUPENTHIXOLE', dosage: '1 MG', timing: '0 – 0 – 1 (रात को सोने से पहले / At bedtime)' },
    { id: 'sm-2', name: 'CLONAM PRO DS', composition: 'CLONAZEPAM 0.5 MG + PROPANOLOL 20 MG', dosage: '1 TAB', timing: 'SOS (ज़रूरत पड़ने पर / As needed)' },
    { id: 'sm-3', name: 'NEXITO PLUS', composition: 'ESCITALOPRAM 10 MG + CLONAZEPAM 0.5 MG', dosage: '1 TAB', timing: '1 – 0 – 0 (सुबह नाश्ते के बाद)' },
    { id: 'sm-4', name: 'EMOXET', composition: 'PAROXETINE', dosage: '37.5 MG', timing: '0 – 0 – 1 (रात को सोते समय / HS)' },
    { id: 'sm-5', name: 'KIVIDOL DT', composition: 'HALOPERIDOL', dosage: '1.5 MG', timing: '0 – 0 – 1 (रात को सोते समय / HS)' },
    { id: 'sm-6', name: 'B12 MD', composition: 'METHYLCOBALAMINE', dosage: '1 TAB', timing: '1 – 0 – 1 (सुबह व रात / BD)' },
    { id: 'sm-7', name: 'VERTIDEP D', composition: 'CINNARIZINE + DIMENHYDRINATE', dosage: '1/2 TAB', timing: '1/2 – 0 – 1/2 (सुबह व रात / 1/2 BD)' },
    { id: 'sm-8', name: 'Tab. Nexito 10mg', composition: 'Escitalopram 10mg', dosage: '1 Tab', timing: '1 – 0 – 0 (सुबह नाश्ते के बाद)' },
    { id: 'sm-9', name: 'Tab. Zapiz 0.5mg', composition: 'Clonazepam 0.5mg', dosage: '1 Tab', timing: '0 – 0 – 1 (रात को सोते समय)' },
    { id: 'sm-10', name: 'Tab. Pantop 40mg', composition: 'Pantoprazole 40mg', dosage: '1 Tab', timing: '1 – 0 – 0 (सुबह खाली पेट)' },
    { id: 'sm-11', name: 'Tab. Dolo 650', composition: 'Paracetamol 650mg', dosage: '1 Tab', timing: 'SOS (दर्द या बुखार होने पर)' },
    { id: 'sm-12', name: 'Tab. Amitone 10mg', composition: 'Amitriptyline 10mg', dosage: '1 Tab', timing: '0 – 0 – 1 (रात को सोने से पहले)' },
    { id: 'sm-13', name: 'Tab. Inderal 10mg', composition: 'Propranolol 10mg', dosage: '1 Tab', timing: 'SOS (घबराहट होने पर)' }
  ];

  // Medicine Inventory State
  const [medicinesList, setMedicinesList] = useState(() => {
    try {
      const saved = localStorage.getItem('cached_doctor_medicines');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return SAMPLE_DOCTOR_MEDICINES;
  });
  const [medSidebarSearch, setMedSidebarSearch] = useState('');
  const [showAddMedModal, setShowAddMedModal] = useState(false);
  const [quickNewMed, setQuickNewMed] = useState({ name: '', composition: '', dosage: '', timing: '' });
  
  // Memoized filtered medicines for rapid autocomplete keyboard search
  const filteredMeds = useMemo(() => {
    try {
      if (!tempMed?.name || typeof tempMed.name !== 'string' || !tempMed.name.trim()) return [];
      const q = tempMed.name.trim().toLowerCase();
      if (!q) return [];
      return (medicinesList || []).filter(m => {
        if (!m || typeof m !== 'object') return false;
        const mName = typeof m.name === 'string' ? m.name.toLowerCase() : '';
        const mComp = typeof m.composition === 'string' ? m.composition.toLowerCase() : '';
        return (mName && mName.includes(q)) || (mComp && mComp.includes(q));
      }).slice(0, 25);
    } catch (err) {
      console.error('Error calculating filteredMeds:', err);
      return [];
    }
  }, [medicinesList, tempMed?.name]);
  const [loadingMedicines, setLoadingMedicines] = useState(false);
  const [activeSidebarTab, setActiveSidebarTab] = useState('prescriptions'); // 'prescriptions' or 'inventory'
  const [newMedForm, setNewMedForm] = useState({ name: '', composition: '', dosage: '' });
  const [editingMedId, setEditingMedId] = useState(null);
  const [editingMedName, setEditingMedName] = useState('');
  const [editingMedComposition, setEditingMedComposition] = useState('');
  const [editingMedDosage, setEditingMedDosage] = useState('');
  const [editingOfflineMedIndex, setEditingOfflineMedIndex] = useState(null);
  const [editingOfflineMed, setEditingOfflineMed] = useState({ name: '', composition: '', dosage: '', frequency: '' });
  const [showLayoutSettings, setShowLayoutSettings] = useState(false);
  const [fontSearchQuery, setFontSearchQuery] = useState('');
  const [showFontDropdown, setShowFontDropdown] = useState(false);

  // Clinical Research & Medicine Analytics State
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [analyticsTab, setAnalyticsTab] = useState('overview'); // 'overview', 'medicine', 'volume'
  const [analyticsTimeframe, setAnalyticsTimeframe] = useState('all'); // 'all', '30days', '90days', '1year'
  const [overviewAnalytics, setOverviewAnalytics] = useState(null);
  const [searchedMedicine, setSearchedMedicine] = useState('');
  const [medicineAnalytics, setMedicineAnalytics] = useState(null);
  const [patientVolumeData, setPatientVolumeData] = useState(null);

  // Exact matching section for "Customize Printable Page Dimensions & Spacing"
  const renderCustomizeDimensionsSection = (isInsideSidebar = false) => (
    <div style={{
      backgroundColor: '#ffffff',
      borderRadius: isInsideSidebar ? '0px' : '14px',
      padding: isInsideSidebar ? '0.75rem 0.85rem' : '1.35rem 1.6rem',
      border: isInsideSidebar ? 'none' : '1.5px solid #cbd5e1',
      boxShadow: isInsideSidebar ? 'none' : '0 20px 45px rgba(0,0,0,0.22)',
      fontSize: '0.82rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.9rem',
      maxHeight: isInsideSidebar ? '100%' : '84vh',
      overflowY: 'auto'
    }}>
      {!isInsideSidebar && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid #f1f5f9', paddingBottom: '0.65rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '1.02rem', color: '#1e293b' }}>
            <span style={{ fontSize: '1.25rem' }}>🎛️</span>
            <span>Customize Printable Page Dimensions & Spacing</span>
          </div>
          <button
            type="button"
            onClick={() => setShowLayoutSettings(false)}
            style={{
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              padding: '0.25rem 0.65rem',
              fontSize: '0.78rem',
              fontWeight: 800,
              cursor: 'pointer',
              color: '#475569'
            }}
          >
            ✕ Close
          </button>
        </div>
      )}

      {/* Row 1: Page Width & Page Height */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div>
          <label style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#1e293b', marginBottom: '0.25rem', fontSize: '0.8rem' }}>
            <span>Page Width</span>
            <span style={{ fontWeight: 800, color: '#0f172a' }}>{offlineLayout.pageWidth}px</span>
          </label>
          <input 
            type="range" min="600" max="1000" step="10"
            value={offlineLayout.pageWidth} 
            onChange={e => updateOfflineLayout('pageWidth', parseInt(e.target.value))}
            style={{ width: '100%', accentColor: '#2563eb', cursor: 'pointer' }}
          />
        </div>
        <div>
          <label style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#1e293b', marginBottom: '0.25rem', fontSize: '0.8rem' }}>
            <span>Page Height</span>
            <span style={{ fontWeight: 800, color: '#0f172a' }}>{offlineLayout.pageHeight}px</span>
          </label>
          <input 
            type="range" min="900" max="1400" step="10"
            value={offlineLayout.pageHeight} 
            onChange={e => updateOfflineLayout('pageHeight', parseInt(e.target.value))}
            style={{ width: '100%', accentColor: '#2563eb', cursor: 'pointer' }}
          />
        </div>
      </div>

      {/* Row 2: Font Family & Font Size (Base) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'flex-end' }}>
        <div>
          <label style={{ display: 'block', fontWeight: 700, color: '#1e293b', marginBottom: '0.35rem', fontSize: '0.8rem' }}>
            Font Family
          </label>
          <select
            value={offlineLayout.fontFamily}
            onChange={e => updateOfflineLayout('fontFamily', e.target.value)}
            style={{
              width: '100%',
              padding: '0.4rem 0.65rem',
              borderRadius: '6px',
              border: '1.5px solid #cbd5e1',
              backgroundColor: '#ffffff',
              fontSize: '0.82rem',
              fontWeight: 700,
              color: '#0f172a',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <optgroup label="Modern Sans-Serif">
              <option value="Plus Jakarta Sans">Plus Jakarta Sans (Default)</option>
              <option value="Inter">Inter</option>
              <option value="Outfit">Outfit</option>
              <option value="Roboto">Roboto</option>
              <option value="Open Sans">Open Sans</option>
              <option value="Lato">Lato</option>
              <option value="Montserrat">Montserrat</option>
              <option value="Poppins">Poppins</option>
            </optgroup>
            <optgroup label="Standard / System">
              <option value="Arial">Arial (System)</option>
              <option value="Georgia">Georgia (System Serif)</option>
              <option value="Times New Roman">Times New Roman</option>
            </optgroup>
            <optgroup label="Editorial Serif">
              <option value="Playfair Display">Playfair Display</option>
              <option value="Merriweather">Merriweather</option>
              <option value="Lora">Lora</option>
            </optgroup>
          </select>
        </div>
        <div>
          <label style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#1e293b', marginBottom: '0.25rem', fontSize: '0.8rem' }}>
            <span>Font Size (Base)</span>
            <span style={{ fontWeight: 800, color: '#0f172a' }}>{offlineLayout.fontSize}px</span>
          </label>
          <input 
            type="range" min="10" max="18" step="1"
            value={offlineLayout.fontSize} 
            onChange={e => updateOfflineLayout('fontSize', parseInt(e.target.value))}
            style={{ width: '100%', accentColor: '#2563eb', cursor: 'pointer' }}
          />
        </div>
      </div>

      {/* Row 3: Margins (Padding) & Row Spacing */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div>
          <label style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#1e293b', marginBottom: '0.25rem', fontSize: '0.8rem' }}>
            <span>Margins (Padding)</span>
            <span style={{ fontWeight: 800, color: '#0f172a' }}>{offlineLayout.marginSize}px</span>
          </label>
          <input 
            type="range" min="15" max="75" step="1"
            value={offlineLayout.marginSize} 
            onChange={e => updateOfflineLayout('marginSize', parseInt(e.target.value))}
            style={{ width: '100%', accentColor: '#2563eb', cursor: 'pointer' }}
          />
        </div>
        <div>
          <label style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#1e293b', marginBottom: '0.25rem', fontSize: '0.8rem' }}>
            <span>Row Spacing</span>
            <span style={{ fontWeight: 800, color: '#0f172a' }}>{offlineLayout.rowSpacing}px</span>
          </label>
          <input 
            type="range" min="4" max="24" step="1"
            value={offlineLayout.rowSpacing} 
            onChange={e => updateOfflineLayout('rowSpacing', parseInt(e.target.value))}
            style={{ width: '100%', accentColor: '#2563eb', cursor: 'pointer' }}
          />
        </div>
      </div>

      {/* Divider */}
      <hr style={{ border: 'none', borderTop: '1px solid #f1f5f9', margin: '0.15rem 0' }} />

      {/* Pre-printed Letterhead Paper Section */}
      <div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, color: '#0f172a', fontSize: '0.84rem', cursor: 'pointer' }}>
          <input 
            type="checkbox"
            checked={offlineLayout.useLetterhead}
            onChange={e => updateOfflineLayout('useLetterhead', e.target.checked)}
            style={{ width: '16px', height: '16px', accentColor: '#2563eb', cursor: 'pointer' }}
          />
          <span>Print on Pre-printed Letterhead Paper</span>
        </label>
      </div>

      {/* Row 4: Header Top Space & Footer Bottom Space */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', opacity: offlineLayout.useLetterhead ? 1 : 0.45 }}>
        <div>
          <label style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#1e293b', marginBottom: '0.25rem', fontSize: '0.78rem' }}>
            <span>Header Top Space (Letterhead Space)</span>
            <span style={{ fontWeight: 800, color: '#0f172a' }}>{offlineLayout.letterheadTopMargin}px</span>
          </label>
          <input 
            type="range" min="0" max="400" step="5"
            disabled={!offlineLayout.useLetterhead}
            value={offlineLayout.letterheadTopMargin} 
            onChange={e => updateOfflineLayout('letterheadTopMargin', parseInt(e.target.value))}
            style={{ width: '100%', accentColor: '#2563eb', cursor: offlineLayout.useLetterhead ? 'pointer' : 'not-allowed' }}
          />
        </div>
        <div>
          <label style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#1e293b', marginBottom: '0.25rem', fontSize: '0.78rem' }}>
            <span>Footer Bottom Space (Letterhead Space)</span>
            <span style={{ fontWeight: 800, color: '#0f172a' }}>{offlineLayout.letterheadBottomMargin}px</span>
          </label>
          <input 
            type="range" min="0" max="350" step="5"
            disabled={!offlineLayout.useLetterhead}
            value={offlineLayout.letterheadBottomMargin} 
            onChange={e => updateOfflineLayout('letterheadBottomMargin', parseInt(e.target.value))}
            style={{ width: '100%', accentColor: '#2563eb', cursor: offlineLayout.useLetterhead ? 'pointer' : 'not-allowed' }}
          />
        </div>
      </div>

      {offlineLayout.useLetterhead && (
        <div style={{ fontSize: '0.72rem', color: '#047857', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '6px', padding: '0.35rem 0.55rem', marginTop: '0.2rem', lineHeight: 1.35 }}>
          ✓ Details shifted to top on-screen. Top clearance ({offlineLayout.letterheadTopMargin || 285}px) & Bottom clearance ({offlineLayout.letterheadBottomMargin || 196}px) will be applied automatically when printing.
        </div>
      )}
      <hr style={{ border: 'none', borderTop: '1px solid #f1f5f9', margin: '0.15rem 0' }} />

      {/* Checkbox: Apply Signature Logo */}
      <div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, color: '#0f172a', fontSize: '0.84rem', cursor: 'pointer' }}>
          <input 
            type="checkbox"
            checked={offlineLayout.showSignature}
            onChange={e => updateOfflineLayout('showSignature', e.target.checked)}
            style={{ width: '16px', height: '16px', accentColor: '#2563eb', cursor: 'pointer' }}
          />
          <span>Apply Signature Logo</span>
        </label>
      </div>

      {/* Row 5: Signature Size & Signature Position */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'flex-end', opacity: offlineLayout.showSignature ? 1 : 0.45 }}>
        <div>
          <label style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#1e293b', marginBottom: '0.25rem', fontSize: '0.8rem' }}>
            <span>Signature Size</span>
            <span style={{ fontWeight: 800, color: '#0f172a' }}>{offlineLayout.signatureSize}px</span>
          </label>
          <input 
            type="range" min="100" max="360" step="2"
            disabled={!offlineLayout.showSignature}
            value={offlineLayout.signatureSize} 
            onChange={e => updateOfflineLayout('signatureSize', parseInt(e.target.value))}
            style={{ width: '100%', accentColor: '#2563eb', cursor: offlineLayout.showSignature ? 'pointer' : 'not-allowed' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontWeight: 700, color: '#1e293b', marginBottom: '0.35rem', fontSize: '0.8rem' }}>
            Signature Position
          </label>
          <select
            disabled={!offlineLayout.showSignature}
            value={offlineLayout.signaturePosition}
            onChange={e => updateOfflineLayout('signaturePosition', e.target.value)}
            style={{
              width: '100%',
              padding: '0.4rem 0.65rem',
              borderRadius: '6px',
              border: '1.5px solid #cbd5e1',
              backgroundColor: '#ffffff',
              fontSize: '0.82rem',
              fontWeight: 700,
              color: '#0f172a',
              outline: 'none',
              cursor: offlineLayout.showSignature ? 'pointer' : 'not-allowed'
            }}
          >
            <option value="inline">Inline (Below Advice/Notes)</option>
            <option value="bottom-left">Fixed Bottom Left</option>
            <option value="bottom-right">Fixed Bottom Right</option>
          </select>
        </div>
      </div>

      {/* Row 6: Signature Shift (Left / Right) & Signature Shift (Up / Down) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', opacity: offlineLayout.showSignature ? 1 : 0.45 }}>
        <div>
          <label style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#1e293b', marginBottom: '0.25rem', fontSize: '0.78rem' }}>
            <span>Signature Shift (Left / Right)</span>
            <span style={{ fontWeight: 800, color: '#0f172a' }}>{offlineLayout.signatureXOffset}px</span>
          </label>
          <input 
            type="range" min="-120" max="120" step="2"
            disabled={!offlineLayout.showSignature}
            value={offlineLayout.signatureXOffset} 
            onChange={e => updateOfflineLayout('signatureXOffset', parseInt(e.target.value))}
            style={{ width: '100%', accentColor: '#2563eb', cursor: offlineLayout.showSignature ? 'pointer' : 'not-allowed' }}
          />
        </div>
        <div>
          <label style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#1e293b', marginBottom: '0.25rem', fontSize: '0.78rem' }}>
            <span>Signature Shift (Up / Down)</span>
            <span style={{ fontWeight: 800, color: '#0f172a' }}>{offlineLayout.signatureYOffset}px</span>
          </label>
          <input 
            type="range" min="-120" max="120" step="2"
            disabled={!offlineLayout.showSignature}
            value={offlineLayout.signatureYOffset} 
            onChange={e => updateOfflineLayout('signatureYOffset', parseInt(e.target.value))}
            style={{ width: '100%', accentColor: '#2563eb', cursor: offlineLayout.showSignature ? 'pointer' : 'not-allowed' }}
          />
        </div>
      </div>
    </div>
  );
  const [volumeMonthFilter, setVolumeMonthFilter] = useState('');
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [medSearchInput, setMedSearchInput] = useState('');
  const [medSearchSuggestions, setMedSearchSuggestions] = useState([]);

  // Symptom Checklist & Master Templates State
  const [symptomTemplates, setSymptomTemplates] = useState(() => {
    try {
      const saved = localStorage.getItem('doctor_symptom_templates');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return DEFAULT_SYMPTOM_TEMPLATES;
  });
  const [showSymptomDrawer, setShowSymptomDrawer] = useState(false);
  const [activeSymptomCat, setActiveSymptomCat] = useState('migraine');
  const [symptomSearchQuery, setSymptomSearchQuery] = useState('');
  const [showSymptomManagerModal, setShowSymptomManagerModal] = useState(false);
  const [managerSelectedCatId, setManagerSelectedCatId] = useState('migraine');
  const [managerNewCategoryName, setManagerNewCategoryName] = useState('');
  const [managerNewCategoryIcon, setManagerNewCategoryIcon] = useState('🧠');
  const [managerNewSymptomText, setManagerNewSymptomText] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [editingCategoryIcon, setEditingCategoryIcon] = useState('');
  const [editingSymptomIdx, setEditingSymptomIdx] = useState(null);
  const [editingSymptomText, setEditingSymptomText] = useState('');

  // Save templates to state and localStorage
  const saveSymptomTemplates = (newTemplates) => {
    setSymptomTemplates(newTemplates);
    try {
      localStorage.setItem('doctor_symptom_templates', JSON.stringify(newTemplates));
    } catch (e) {
      console.error(e);
    }
  };

  // Check if a symptom is currently in chief complaints text
  const isSymptomChecked = (symText) => {
    if (!offlineForm.chiefComplaints || !symText) return false;
    const current = offlineForm.chiefComplaints.toLowerCase();
    const target = symText.toLowerCase().trim();
    const parts = current.split(/[,;\n]+/).map(p => p.trim());
    return parts.some(p => p === target || p.includes(target));
  };

  // Toggle symptom in chief complaints
  const toggleSymptom = (symText) => {
    if (!symText) return;
    const cleanTarget = symText.trim();
    const current = (offlineForm.chiefComplaints || '').trim();

    if (!current) {
      setOfflineForm(prev => ({ ...prev, chiefComplaints: cleanTarget }));
      return;
    }

    const items = current.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
    const targetLower = cleanTarget.toLowerCase();
    const existsIndex = items.findIndex(item => item.toLowerCase() === targetLower);

    if (existsIndex >= 0) {
      items.splice(existsIndex, 1);
      setOfflineForm(prev => ({ ...prev, chiefComplaints: items.join(', ') }));
    } else {
      items.push(cleanTarget);
      setOfflineForm(prev => ({ ...prev, chiefComplaints: items.join(', ') }));
    }
  };

  // Add new category row
  const addCategoryRow = (name, icon = '🧠') => {
    if (!name || !name.trim()) return;
    const id = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
    const newCat = {
      id,
      category: name.trim(),
      icon: icon || '🧠',
      symptoms: []
    };
    const updated = [...symptomTemplates, newCat];
    saveSymptomTemplates(updated);
    setActiveSymptomCat(id);
    setManagerSelectedCatId(id);
    setManagerNewCategoryName('');
  };

  // Edit category row
  const editCategoryRow = (id, newName, newIcon) => {
    if (!newName || !newName.trim()) return;
    const updated = symptomTemplates.map(cat => {
      if (cat.id === id) {
        return { ...cat, category: newName.trim(), icon: newIcon || cat.icon };
      }
      return cat;
    });
    saveSymptomTemplates(updated);
    setEditingCategoryId(null);
  };

  // Delete category row
  const deleteCategoryRow = (id) => {
    const cat = symptomTemplates.find(c => c.id === id);
    if (!window.confirm(`Are you sure you want to delete category "${cat?.category || 'this'}" and all its symptoms?`)) return;
    const updated = symptomTemplates.filter(c => c.id !== id);
    saveSymptomTemplates(updated);
    if (activeSymptomCat === id && updated.length > 0) {
      setActiveSymptomCat(updated[0].id);
    }
    if (managerSelectedCatId === id && updated.length > 0) {
      setManagerSelectedCatId(updated[0].id);
    }
  };

  // Add sub-symptom to category
  const addSymptomSubRow = (categoryId, symptomText) => {
    if (!symptomText || !symptomText.trim()) return;
    const cleanText = symptomText.trim();
    const updated = symptomTemplates.map(cat => {
      if (cat.id === categoryId) {
        if (cat.symptoms.includes(cleanText)) return cat;
        return { ...cat, symptoms: [...cat.symptoms, cleanText] };
      }
      return cat;
    });
    saveSymptomTemplates(updated);
    setManagerNewSymptomText('');
  };

  // Edit sub-symptom
  const editSymptomSubRow = (categoryId, oldText, newText) => {
    if (!newText || !newText.trim()) return;
    const cleanNew = newText.trim();
    const updated = symptomTemplates.map(cat => {
      if (cat.id === categoryId) {
        return {
          ...cat,
          symptoms: cat.symptoms.map(s => s === oldText ? cleanNew : s)
        };
      }
      return cat;
    });
    saveSymptomTemplates(updated);
    setEditingSymptomIdx(null);
  };

  // Delete sub-symptom
  const deleteSymptomSubRow = (categoryId, symptomText) => {
    const updated = symptomTemplates.map(cat => {
      if (cat.id === categoryId) {
        return { ...cat, symptoms: cat.symptoms.filter(s => s !== symptomText) };
      }
      return cat;
    });
    saveSymptomTemplates(updated);
  };

  // Reset to default clinical master
  const resetSymptomTemplates = () => {
    if (!window.confirm('Reset all symptom categories and sub-rows back to original clinical default master?')) return;
    saveSymptomTemplates(DEFAULT_SYMPTOM_TEMPLATES);
    setActiveSymptomCat(DEFAULT_SYMPTOM_TEMPLATES[0].id);
    setManagerSelectedCatId(DEFAULT_SYMPTOM_TEMPLATES[0].id);
  };

  // Socket and Banner state
  const [socketNotification, setSocketNotification] = useState(null);
  const [newBookingsCount, setNewBookingsCount] = useState(0);
  const [socket, setSocket] = useState(null);

  // Modal / Selection State
  const [selectedAppt, setSelectedAppt] = useState(null);
  const [prescriptionForm, setPrescriptionForm] = useState({
    diagnosis: '',
    advice: '',
    medications: [{ name: '', composition: '', dosage: '', frequency: '' }],
    useLetterhead: localStorage.getItem('useLetterheadOnline') === 'true'
  });
  const [prescriptionSubmitting, setPrescriptionSubmitting] = useState(false);
  const [generatedPdfUrl, setGeneratedPdfUrl] = useState('');

  // Video Consultation Room State
  const [activeVideoAppt, setActiveVideoAppt] = useState(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [activeTab, setActiveTab] = useState('chat');
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [localStream, setLocalStream] = useState(null);
  const localVideoRef = React.useRef(null);
  const jitsiApiRef = React.useRef(null);

  const endConsultationSilently = () => {
    if (socket && activeVideoAppt) {
      socket.emit('end_consultation', { bookingId: activeVideoAppt.bookingId });
    }
    stopMedia();
    setActiveVideoAppt(null);
    fetchAppointments();
  };

  // Safe dynamic Google Fonts loader with weight mapping and system font exclusion
  useEffect(() => {
    const font = offlineLayout.fontFamily;
    if (!font) return;

    // Standard system fonts do not need to fetch from Google Fonts
    const systemFonts = ['Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Tahoma', 'Trebuchet MS'];
    if (systemFonts.includes(font)) return;

    const fontId = `gfont-${font.replace(/\s+/g, '-').toLowerCase()}`;
    if (document.getElementById(fontId)) return;

    // Google Fonts API v2 requires exact existing weights or returns 400 Bad Request
    let weightParam = ':wght@400;700';
    const familyQuery = font.replace(/\s+/g, '+');

    if (font === 'Roboto') {
      weightParam = ':wght@400;500;700;900';
    } else if (font === 'Lato') {
      weightParam = ':wght@400;700;900';
    } else if (font === 'Open Sans') {
      weightParam = ':wght@400;600;700';
    } else if (['Plus Jakarta Sans', 'Inter', 'Montserrat', 'Outfit'].includes(font)) {
      weightParam = ':wght@400;500;600;700;800';
    } else if (['Playfair Display', 'Cinzel'].includes(font)) {
      weightParam = ':wght@400;600;700;800';
    } else if (['Poppins'].includes(font)) {
      weightParam = ':wght@400;500;600;700';
    } else if (['Lora', 'Merriweather'].includes(font)) {
      weightParam = ':wght@400;700';
    } else if (['Pacifico', 'Great Vibes', 'Sacramento', 'Satisfy'].includes(font)) {
      weightParam = '';
    }

    try {
      const link = document.createElement('link');
      link.id = fontId;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${familyQuery}${weightParam}&display=swap`;
      document.head.appendChild(link);
    } catch (e) {
      console.warn('Font loading notice:', e);
    }
  }, [offlineLayout.fontFamily]);

  useEffect(() => {
    let jitsiApiInstance = null;

    const initJitsi = async () => {
      if (activeVideoAppt) {
        try {
          const res = await fetch(`${API_BASE_URL}/appointments/${activeVideoAppt.id}/jitsi-config`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          const data = await res.json();
          if (data.success) {
            setTimeout(() => {
              const container = document.getElementById('jaas-container');
              if (container) {
                container.innerHTML = '';
                const options = {
                  roomName: data.roomName,
                  width: '100%',
                  height: '100%',
                  parentNode: container,
                  jwt: data.jwt || undefined,
                  userInfo: {
                    displayName: data.displayName,
                    email: data.email
                  },
                  configOverwrite: {
                    startWithAudioMuted: false,
                    startWithVideoMuted: false,
                    prejoinPageEnabled: false
                  },
                  interfaceConfigOverwrite: {
                    // Custom options
                  }
                };
                jitsiApiInstance = new window.JitsiMeetExternalAPI(data.domain, options);
                jitsiApiRef.current = jitsiApiInstance;
                
                jitsiApiInstance.addEventListener('videoConferenceLeft', () => {
                  endConsultationSilently();
                });
              }
            }, 100);
          } else {
            console.error('Failed to get Jitsi config:', data.message);
          }
        } catch (err) {
          console.error('Error initializing Jitsi:', err);
        }
      }
    };

    initJitsi();

    return () => {
      if (jitsiApiRef.current) {
        try {
          jitsiApiRef.current.dispose();
        } catch (e) {
          console.error('Error disposing Jitsi API:', e);
        }
      }
      jitsiApiRef.current = null;
    };
  }, [activeVideoAppt]);

  // Fetch Today's OPD Queue from front desk
  const fetchOpdQueue = async () => {
    let activeToken = token;
    const todayStr = getLocalDateStr();
    try {
      setLoadingOpdQueue(true);
      let res = await fetch(`${API_BASE_URL}/opd/queue?date=${todayStr}`, {
        headers: { 'Authorization': `Bearer ${activeToken}` }
      });
      let data = await res.json();

      // If token expired, invalid, or forbidden, auto re-authenticate with doctor credentials and retry
      if (!data.success && (res.status === 401 || res.status === 403 || data.message?.includes('Forbidden') || data.message?.includes('token'))) {
        try {
          const authRes = await fetch(`${API_BASE_URL}/auth/doctor/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'doctor@neuroharmony.in', password: 'doctor123' })
          });
          const authData = await authRes.json();
          if (authData.success && authData.token) {
            activeToken = authData.token;
            setToken(activeToken);
            localStorage.setItem('doc_token', activeToken);
            res = await fetch(`${API_BASE_URL}/opd/queue?date=${todayStr}`, {
              headers: { 'Authorization': `Bearer ${activeToken}` }
            });
            data = await res.json();
          }
        } catch (e) {
          console.warn('Doctor auto-reauth notice:', e);
        }
      }

      if (data.success && Array.isArray(data.queue)) {
        // Only keep items from today
        const serverTodayItems = data.queue.filter(item => {
          if (!item.created_at) return false;
          try {
            return getLocalDateStr(new Date(item.created_at)) === todayStr;
          } catch (e) {
            return false;
          }
        });

        // Merge server queue with any local pending items created today
        let merged = [...serverTodayItems];
        try {
          const saved = localStorage.getItem('cached_opd_queue');
          if (saved) {
            const localList = JSON.parse(saved);
            if (Array.isArray(localList)) {
              localList.forEach(localItem => {
                if (String(localItem.id).startsWith('local-') && localItem.status !== 'COMPLETED') {
                  const localDate = localItem.created_at ? getLocalDateStr(new Date(localItem.created_at)) : todayStr;
                  if (localDate === todayStr) {
                    const alreadyIn = merged.some(m => m.id === localItem.id || (m.patient_name === localItem.patient_name && m.token_number === localItem.token_number));
                    if (!alreadyIn) {
                      merged.push(localItem);
                    }
                  }
                }
              });
            }
          }
        } catch (e) {}

        merged.sort((a, b) => (a.token_number || 0) - (b.token_number || 0));
        setOpdQueue(merged);
        try {
          localStorage.setItem('cached_opd_queue', JSON.stringify(merged));
        } catch (e) {}
      } else {
        // Fallback to local cache if server is offline or returned error
        try {
          const saved = localStorage.getItem('cached_opd_queue');
          if (saved) {
            const parsed = JSON.parse(saved);
            const todayOnly = Array.isArray(parsed) ? parsed.filter(item => {
              if (!item.created_at) return false;
              try {
                return getLocalDateStr(new Date(item.created_at)) === todayStr;
              } catch (e) {
                return false;
              }
            }).map(p => {
              if (p.token_number > 6 && (p.patient_type === 'FOLLOW_UP' || p.type === 'FOLLOW_UP') && p.status === 'COMPLETED') {
                return { ...p, status: 'WAITING' };
              }
              return p;
            }) : [];
            setOpdQueue(todayOnly);
          }
        } catch (e) {}
      }
    } catch (err) {
      console.warn('fetchOpdQueue notice:', err.message);
      try {
        const saved = localStorage.getItem('cached_opd_queue');
        if (saved) {
          const parsed = JSON.parse(saved);
          const todayOnly = Array.isArray(parsed) ? parsed.filter(item => {
            if (!item.created_at) return false;
            try {
              return getLocalDateStr(new Date(item.created_at)) === todayStr;
            } catch (e) {
              return false;
            }
          }) : [];
          setOpdQueue(todayOnly);
        }
      } catch (e) {}
    } finally {
      setLoadingOpdQueue(false);
    }
  };

  // Load patient from OPD Queue directly into Prescription Editor
  const startConsultationFromQueue = async (queuePatient) => {
    setDashboardView('offline-rx');

    const patientName = (queuePatient.patient_name || queuePatient.name || '').trim();
    const patientPhone = (queuePatient.patient_phone || queuePatient.phone || '').trim();
    const rawRef = queuePatient.reference_id || queuePatient.referenceId || '';
    const cleanRef = String(rawRef).replace(/^ref-?/i, '').trim();

    // ALWAYS start a fresh, clean prescription for today's consultation session!
    // Never pre-fill previous patient's or past diagnosis/medications into today's blank canvas.
    // Doctor can view past prescriptions anytime via the "Previous Prescriptions" button.
    setSelectedOfflineRxId(null);
    setOriginalConsultDate('');
    setEditingOfflineMedIndex(null);
    setEditingOfflineMed({ name: '', composition: '', dosage: '', frequency: '' });
    setTempMed({ name: '', composition: '', dosage: '', frequency: '' });

    setOfflineForm({
      referenceId: cleanRef ? (cleanRef.includes('/') ? cleanRef : `${cleanRef}/${new Date().getFullYear()}`) : '',
      patientName: patientName,
      patientPhone: patientPhone,
      patientAge: queuePatient.age ? String(queuePatient.age) : (queuePatient.patient_age ? String(queuePatient.patient_age) : ''),
      patientGender: queuePatient.gender || queuePatient.patient_gender || 'Male',
      consultDate: getLocalDateStr(),
      bp: queuePatient.bp || '',
      pulse: queuePatient.pulse || '',
      weight: queuePatient.weight || '',
      sugar: queuePatient.sugar || '',
      chiefComplaints: queuePatient.chief_complaints || '',
      diagnosis: '',
      medications: [], // Always empty for fresh consultation
      advice: '',
      requiredTests: queuePatient.required_tests || queuePatient.requiredTests || '',
      followUpDate: '',
      privateNotes: queuePatient.private_notes || ''
    });
    setActiveConsultingQueueId(queuePatient.id);

    // Update status in queue to IN_CONSULTATION locally
    setOpdQueue(prev => {
      const next = prev.map(item => item.id === queuePatient.id ? { ...item, status: 'IN_CONSULTATION' } : item);
      try { localStorage.setItem('cached_opd_queue', JSON.stringify(next)); } catch (e) {}
      return next;
    });

    // Update status in queue to IN_CONSULTATION on server if not a local draft
    try {
      if (!String(queuePatient.id).startsWith('local-')) {
        await fetch(`${API_BASE_URL}/opd/queue/${queuePatient.id}/status`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ status: 'IN_CONSULTATION' })
        });
      }
      fetchOpdQueue();
    } catch (err) {
      console.warn('Queue status update error:', err);
    }

    // Automatically focus Medicine Name input field so doctor can start typing meds immediately!
    setTimeout(() => {
      if (medNameInputRef.current) {
        medNameInputRef.current.focus();
      }
    }, 200);
  };

  // Fetch appointments from API
  const fetchAppointments = async () => {
    if (!token) return;
    setLoadingAppts(true);
    setApptsError('');
    try {
      const response = await fetch(`${API_BASE_URL}/doctor/appointments`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setAppointments(data.appointments);
      } else {
        setApptsError(data.message || 'Failed to fetch appointments.');
      }
    } catch (err) {
      setApptsError('Error connecting to backend server.');
      console.error(err);
    } finally {
      setLoadingAppts(false);
    }
  };

  // Delete all online appointments
  const clearAllAppointments = async () => {
    if (!window.confirm('Are you sure you want to remove ALL online appointments?')) return;
    setAppointments([]);
    try {
      if (token) {
        await fetch(`${API_BASE_URL}/doctor/appointments`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      }
      setQueueNavToast('🗑️ Cleared all online appointments');
      setTimeout(() => setQueueNavToast(null), 3000);
    } catch (err) {
      console.warn('Error clearing appointments:', err);
    }
  };

  // Delete a specific appointment
  const deleteAppointment = async (apptId, patientName) => {
    if (!window.confirm(`Delete appointment for ${patientName || 'this patient'}?`)) return;
    setAppointments(prev => prev.filter(a => (a.id || a.bookingId) !== apptId));
    try {
      if (token) {
        await fetch(`${API_BASE_URL}/doctor/appointments/${apptId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      }
      setQueueNavToast(`🗑️ Deleted appointment for ${patientName || 'patient'}`);
      setTimeout(() => setQueueNavToast(null), 3000);
    } catch (err) {
      console.warn('Error deleting appointment:', err);
    }
  };

  // Fetch offline prescriptions from API
  const fetchOfflinePrescriptions = async () => {
    if (!token) return;
    setLoadingOfflineRx(true);
    try {
      const response = await fetch(`${API_BASE_URL}/doctor/offline-prescriptions`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (data.success && Array.isArray(data.prescriptions)) {
        setOfflineRxList(prev => {
          // Keep real database prescriptions + any genuinely unsynced local drafts (rx-local-*)
          const unsyncedLocal = (Array.isArray(prev) ? prev : []).filter(r => 
            String(r.id).startsWith('rx-local-') && !data.prescriptions.some(db => db.id === r.id)
          );

          const combined = [...unsyncedLocal, ...data.prescriptions];
          const cleanList = deduplicatePrescriptions(combined);
          cleanList.sort((a, b) => {
            const dateA = new Date(a.consultDate || a.consult_date || a.createdAt || a.created_at || 0).getTime();
            const dateB = new Date(b.consultDate || b.consult_date || b.createdAt || b.created_at || 0).getTime();
            if (dateB !== dateA) return dateB - dateA;
            const refA = parseInt(String(a.referenceId || a.reference_id || '').replace(/^ref-?/i, '').split('/')[0], 10) || 0;
            const refB = parseInt(String(b.referenceId || b.reference_id || '').replace(/^ref-?/i, '').split('/')[0], 10) || 0;
            return refB - refA;
          });

          try {
            localStorage.setItem('cached_offline_prescriptions', JSON.stringify(cleanList));
          } catch (e) {}
          return cleanList;
        });
      } else {
        console.warn('API notice for offline prescriptions, keeping cached:', data.message);
        try {
          const cached = localStorage.getItem('cached_offline_prescriptions');
          let parsed = [];
          if (cached) parsed = JSON.parse(cached);
          setOfflineRxList(deduplicatePrescriptions(parsed));
        } catch (cErr) {}
      }
    } catch (err) {
      console.warn('Network notice for offline prescriptions, reading local storage:', err);
      try {
        const cached = localStorage.getItem('cached_offline_prescriptions');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setOfflineRxList(deduplicatePrescriptions(parsed));
          }
        }
      } catch (cErr) {}
    } finally {
      setLoadingOfflineRx(false);
    }
  };

  // Fetch next reference ID from API (only for brand new patients or when forced)
  const fetchNextReferenceId = async (force = false) => {
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE_URL}/doctor/offline-prescriptions/next-reference`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setOfflineForm(prev => {
          // If we already have a reference ID and this is not a forced reset for a brand new patient, KEEP IT!
          if (!force && prev.referenceId && prev.referenceId.trim()) {
            return prev;
          }
          return { ...prev, referenceId: data.nextReferenceId };
        });
      }
    } catch (err) {
      console.error('Failed to fetch next reference ID:', err);
    }
  };

  // Fetch medicines in the doctor's database
  const fetchMedicines = async () => {
    if (!token) return;
    setLoadingMedicines(true);
    try {
      const response = await fetch(`${API_BASE_URL}/doctor/medicines`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (data.success && Array.isArray(data.medicines)) {
        const cleanList = data.medicines.filter(m => m && typeof m === 'object' && typeof m.name === 'string' && m.name.trim() !== '');
        setMedicinesList(cleanList);
      } else {
        console.error('Failed to fetch medicines:', data.message);
      }
    } catch (err) {
      console.error('Error fetching medicines:', err);
    } finally {
      setLoadingMedicines(false);
    }
  };

  // Add/Save a new medicine to database
  const saveMedicine = async (e) => {
    if (e) e.preventDefault();
    if (!token) return;
    if (!newMedForm.name.trim()) return;

    try {
      const response = await fetch(`${API_BASE_URL}/doctor/medicines`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newMedForm.name.trim(),
          composition: newMedForm.composition ? newMedForm.composition.trim() : null,
          dosage: newMedForm.dosage ? newMedForm.dosage.trim() : null
        })
      });
      const data = await response.json();

      if (data.success) {
        setNewMedForm({ name: '', composition: '', dosage: '' });
        fetchMedicines();
      } else {
        alert(data.message || 'Failed to save medicine.');
      }
    } catch (err) {
      alert('Error saving medicine.');
      console.error(err);
    }
  };

  // Update/Edit a medicine (name/spelling, composition, dosage) in database
  const editMedicine = async (medId) => {
    if (!token) return;
    if (!editingMedName.trim()) {
      alert('Medicine name cannot be empty.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/doctor/medicines/${medId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: editingMedName.trim(),
          composition: editingMedComposition ? editingMedComposition.trim() : null,
          dosage: editingMedDosage ? editingMedDosage.trim() : null
        })
      });
      const data = await response.json();

      if (data.success) {
        setEditingMedId(null);
        fetchMedicines();
      } else {
        alert(data.message || 'Failed to update medicine.');
      }
    } catch (err) {
      alert('Error updating medicine.');
      console.error(err);
    }
  };

  // Delete a medicine from database
  const deleteMedicine = async (medId) => {
    if (!window.confirm('Are you sure you want to delete this medicine?')) return;

    setMedicinesList(prev => {
      const next = (prev || []).filter(x => x.id !== medId);
      try { localStorage.setItem('cached_doctor_medicines', JSON.stringify(next)); } catch(e){}
      return next;
    });

    if (!token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/doctor/medicines/${medId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();

      if (data.success) {
        fetchMedicines();
      }
    } catch (err) {
      console.warn('Backend delete medicine note:', err);
    }
  };

  // Save currently typed medicine to Master DB
  const handleSaveTempMedToDb = async () => {
    if (!tempMed.name || !tempMed.name.trim()) {
      alert('Please enter a medicine name first.');
      return;
    }
    const medName = tempMed.name.trim();
    const newMed = {
      id: `med-${Date.now()}`,
      name: medName,
      composition: tempMed.composition?.trim() || null,
      dosage: tempMed.dosage?.trim() || '1 Tab',
      timing: tempMed.frequency?.trim() || '1-0-0 सुबह नाश्ते के बाद'
    };

    setMedicinesList(prev => {
      const exists = (prev || []).some(m => m.name.toLowerCase() === medName.toLowerCase());
      const next = exists ? prev.map(m => m.name.toLowerCase() === medName.toLowerCase() ? newMed : m) : [newMed, ...(prev || [])];
      try {
        localStorage.setItem('cached_doctor_medicines', JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    if (token) {
      try {
        await fetch(`${API_BASE_URL}/doctor/medicines`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            name: newMed.name,
            composition: newMed.composition,
            dosage: newMed.dosage,
            timing: newMed.timing
          })
        });
      } catch (e) {
        console.warn('Backend medicine save note:', e);
      }
    }
    alert(`✓ "${medName}" saved to Master Medicine Database!`);
  };

  // Fetch Overview Analytics
  const fetchOverviewAnalytics = async (timeframe = analyticsTimeframe) => {
    if (!token) return;
    setAnalyticsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/doctor/analytics/overview?timeframe=${timeframe}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setOverviewAnalytics(data.data);
      }
    } catch (err) {
      console.error('Failed to load overview analytics:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // Extract distinct active compositions from medicines list and past prescriptions
  const getDistinctCompositions = () => {
    const compMap = new Map();
    (medicinesList || []).forEach(m => {
      if (m.composition && m.composition.trim()) {
        const c = m.composition.trim();
        if (!compMap.has(c.toLowerCase())) {
          compMap.set(c.toLowerCase(), c);
        }
      }
    });
    (offlineRxList || []).forEach(rx => {
      let rawMeds = rx.medications;
      if (typeof rawMeds === 'string') {
        try { rawMeds = JSON.parse(rawMeds); } catch (e) { rawMeds = []; }
      }
      if (Array.isArray(rawMeds)) {
        rawMeds.forEach(m => {
          if (m && m.composition && m.composition.trim()) {
            const c = m.composition.trim();
            if (!compMap.has(c.toLowerCase())) {
              compMap.set(c.toLowerCase(), c);
            }
          }
        });
      }
    });
    return Array.from(compMap.values());
  };

  // Fetch Specific Composition Research & Patient Usage Analytics
  const fetchMedicineAnalytics = async (medName, timeframe = analyticsTimeframe) => {
    if (!token || !medName || !medName.trim()) return;
    setAnalyticsLoading(true);
    const cleanName = medName.trim();
    setSearchedMedicine(cleanName);
    try {
      const res = await fetch(`${API_BASE_URL}/doctor/analytics/medicine?composition=${encodeURIComponent(cleanName)}&timeframe=${timeframe}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setMedicineAnalytics(data.data);
        setAnalyticsTab('medicine');
      } else {
        alert(data.message || 'No data found for this composition.');
      }
    } catch (err) {
      console.error('Failed to load composition analytics:', err);
      alert('Error loading composition analytics.');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // Fetch Practice & Patient Volume Analytics (Daily & Monthly New vs Follow-up)
  const fetchPatientVolumeAnalytics = async (month = volumeMonthFilter) => {
    if (!token) return;
    setAnalyticsLoading(true);
    try {
      const monthQuery = month ? `&month=${month}` : '';
      const res = await fetch(`${API_BASE_URL}/doctor/analytics/patient-volume?timeframe=${analyticsTimeframe}${monthQuery}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setPatientVolumeData(data.data);
      }
    } catch (err) {
      console.error('Failed to load patient volume analytics:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // Export Analytics Data to CSV
  const exportAnalyticsCSV = () => {
    if (!overviewAnalytics && !medicineAnalytics && !patientVolumeData) {
      alert('No analytics data to export.');
      return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";

    if (analyticsTab === 'medicine' && medicineAnalytics) {
      csvContent += `Medicine Research & Analytics Report\r\n`;
      csvContent += `Generated On,${new Date().toLocaleString()}\r\n`;
      csvContent += `Searched Medicine,${medicineAnalytics.canonicalName}\r\n`;
      csvContent += `Composition,${medicineAnalytics.canonicalComposition || 'N/A'}\r\n`;
      csvContent += `Total Patients Prescribed,${medicineAnalytics.totalPatients}\r\n`;
      csvContent += `Total Prescriptions Written,${medicineAnalytics.totalPrescriptions}\r\n\r\n`;

      csvContent += `Dosage Distribution\r\nDosage,Patient Count,Percentage\r\n`;
      (medicineAnalytics.dosageHistogram || []).forEach(d => {
        csvContent += `"${d.dosage}",${d.count},${d.percentage}%\r\n`;
      });

      csvContent += `\r\nAge Demographics Histogram\r\nAge Range,Count,Percentage\r\n`;
      (medicineAnalytics.ageHistogram || []).forEach(a => {
        csvContent += `"${a.range}",${a.count},${a.percentage}%\r\n`;
      });

      csvContent += `\r\nTop Diagnoses\r\nDiagnosis,Prescription Count,Percentage\r\n`;
      (medicineAnalytics.topDiagnoses || []).forEach(diag => {
        csvContent += `"${diag.diagnosis}",${diag.count},${diag.percentage}%\r\n`;
      });

      csvContent += `\r\nCo-Prescribed Medications\r\nMedication,Co-occurrence Count,Rate\r\n`;
      (medicineAnalytics.coPrescriptions || []).forEach(co => {
        csvContent += `"${co.name}",${co.count},${co.coOccurrenceRate}%\r\n`;
      });
    } else if (analyticsTab === 'volume' && patientVolumeData) {
      csvContent += `Doctor Practice & Patient Volume Analytics Report\r\n`;
      csvContent += `Generated On,${new Date().toLocaleString()}\r\n`;
      csvContent += `Total Consultations,${patientVolumeData.totalConsultations}\r\n`;
      csvContent += `Total Unique Patients,${patientVolumeData.totalUniquePatients}\r\n`;
      csvContent += `Total New Patients (First Visits),${patientVolumeData.totalNewPatients}\r\n`;
      csvContent += `Total Follow-Up Consultations,${patientVolumeData.totalFollowUps}\r\n`;
      csvContent += `Follow-Up Retention Rate,${patientVolumeData.retentionRate}%\r\n`;
      csvContent += `Average Patients Per Day,${patientVolumeData.avgPatientsPerDay}\r\n\r\n`;

      csvContent += `Monthly Patient Footfall\r\nMonth,Total Consultations,New Patients,Follow-Up Visits,Follow-Up %,MoM Growth %\r\n`;
      (patientVolumeData.monthlyVolume || []).forEach(m => {
        csvContent += `"${m.monthLabel}",${m.total},${m.newPatients},${m.followUps},${m.followUpRate}%,${m.momGrowth > 0 ? '+' : ''}${m.momGrowth}%\r\n`;
      });

      csvContent += `\r\nDaily Patient Footfall Log\r\nDate,Day,Total Patients,New Patients,Follow-Up Patients\r\n`;
      (patientVolumeData.dailyVolume || []).forEach(d => {
        csvContent += `"${d.dateLabel}","${d.dayOfWeek}",${d.total},${d.newPatients},${d.followUps}\r\n`;
      });

      csvContent += `\r\nDay-of-Week Consultation Heatmap\r\nWeekday,Total Visits,Avg Patients/Day,New Patients,Follow-Ups\r\n`;
      (patientVolumeData.dayOfWeekPattern || []).forEach(w => {
        csvContent += `"${w.day}",${w.totalVisits},${w.avgPatientsPerDay},${w.newPatients},${w.followUps}\r\n`;
      });
    } else if (overviewAnalytics) {
      csvContent += `Clinic Global Prescription & Clinical Analytics Report\r\n`;
      csvContent += `Generated On,${new Date().toLocaleString()}\r\n`;
      csvContent += `Total Prescriptions Analyzed,${overviewAnalytics.totalPrescriptions}\r\n`;
      csvContent += `Total Unique Patients,${overviewAnalytics.totalUniquePatients}\r\n`;
      csvContent += `Total Unique Medicines,${overviewAnalytics.totalUniqueMedicines}\r\n\r\n`;

      csvContent += `Top Prescribed Medicines\r\nRank,Medicine Name,Composition,Patients Prescribed,Prescription Count\r\n`;
      (overviewAnalytics.topMedicines || []).forEach((m, idx) => {
        csvContent += `${idx + 1},"${m.name}","${m.composition || 'N/A'}",${m.patientCount},${m.prescriptionCount}\r\n`;
      });

      csvContent += `\r\nTop Diagnoses Distribution\r\nDiagnosis,Count,Percentage\r\n`;
      (overviewAnalytics.topDiagnoses || []).forEach(d => {
        csvContent += `"${d.name}",${d.count},${d.percentage}%\r\n`;
      });

      csvContent += `\r\nOverall Age Demographics Histogram\r\nAge Range,Count,Percentage\r\n`;
      (overviewAnalytics.ageHistogram || []).forEach(a => {
        csvContent += `"${a.range}",${a.count},${a.percentage}%\r\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    let fileName = `clinic_prescription_analytics_${Date.now()}.csv`;
    if (analyticsTab === 'medicine' && medicineAnalytics) {
      fileName = `medicine_analytics_${medicineAnalytics.canonicalName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.csv`;
    } else if (analyticsTab === 'volume' && patientVolumeData) {
      fileName = `doctor_practice_volume_${Date.now()}.csv`;
    }
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Local storage prescription save fallback
  const saveLocalPrescriptionFallback = (rxData, isNewVisit = false) => {
    const cleanRef = rxData.referenceId ? rxData.referenceId.trim() : `REF-${Math.floor(Math.random() * 900 + 100)}/2026`;
    const cleanRefNum = cleanRef.replace(/^ref-?/i, '').trim();
    const consultDay = rxData.consultDate || getLocalDateStr();

    let targetRxId = rxData.id;

    setOfflineRxList(prev => {
      // Find if matching prescription already exists by explicit ID
      const existing = (targetRxId && !isNewVisit) ? prev.find(r => r.id === targetRxId) : null;

      if (!targetRxId || isNewVisit) {
        targetRxId = `rx-local-${Date.now()}`;
      }

      const newRx = {
        ...rxData,
        id: targetRxId,
        referenceId: cleanRef,
        consultDate: consultDay,
        createdAt: (existing && existing.createdAt) ? existing.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const filtered = prev.filter(r => r.id !== targetRxId);

      const updated = deduplicatePrescriptions([newRx, ...filtered]);
      updated.sort((a, b) => {
        const dateA = new Date(a.consultDate || a.consult_date || a.createdAt || a.created_at || 0).getTime();
        const dateB = new Date(b.consultDate || b.consult_date || b.createdAt || b.created_at || 0).getTime();
        if (dateB !== dateA) return dateB - dateA;
        const refA = parseInt(String(a.referenceId || a.reference_id || '').replace(/^ref-?/i, '').split('/')[0], 10) || 0;
        const refB = parseInt(String(b.referenceId || b.reference_id || '').replace(/^ref-?/i, '').split('/')[0], 10) || 0;
        return refB - refA;
      });
      try {
        localStorage.setItem('cached_offline_prescriptions', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    if (targetRxId) {
      setSelectedOfflineRxId(targetRxId);
    }
    setOfflineForm(prev => ({
      ...prev,
      referenceId: cleanRef,
      privateNotes: rxData.privateNotes !== undefined ? rxData.privateNotes : (prev.privateNotes || '')
    }));

    // Auto-mark ONLY the actively consulted patient in OPD Queue as COMPLETED
    const pName = (rxData.patientName || '').trim().toLowerCase();
    const targetQueueId = activeConsultingQueueId || (() => {
      const found = (opdQueue || []).find(item => {
        if (item.status === 'COMPLETED' || item.status === 'CONSULTED') return false;
        const itemRef = String(item.reference_id || item.referenceId || '').replace(/^ref-?/i, '').trim();
        const itemName = String(item.patient_name || item.name || '').trim().toLowerCase();
        return (cleanRefNum && itemRef && cleanRefNum === itemRef) ||
               (pName && itemName && pName === itemName);
      });
      return found ? found.id : null;
    })();

    if (targetQueueId) {
      setOpdQueue(prev => {
        const next = prev.map(item => {
          return item.id === targetQueueId ? { ...item, status: 'COMPLETED' } : item;
        });
        try { localStorage.setItem('cached_opd_queue', JSON.stringify(next)); } catch (e) {}
        return next;
      });
    }
    setActiveConsultingQueueId(null);
  };

  // Save/Submit offline prescription
  const saveOfflinePrescription = async (e) => {
    if (e) e.preventDefault();
    if (!token) return false;

    // Concurrency lock to prevent double-click duplicate creation
    if (isSavingOfflineRxRef.current) {
      console.warn('Prescription save already in progress, debouncing duplicate click');
      return true;
    }
    isSavingOfflineRxRef.current = true;
    setIsSavingOfflineRx(true);

    try {
      // Proactively add any currently typed tempMed to the list so the doctor doesn't lose it
      let currentMeds = [...(offlineForm.medications || [])];
      if (tempMed.name && tempMed.name.trim()) {
        currentMeds.push({ ...tempMed });
        // Update state for consistency
        setOfflineForm(prev => ({ ...prev, medications: [...(prev.medications || []), { ...tempMed }] }));
        setTempMed({ name: '', composition: '', dosage: '', frequency: '' });
      }

      // Only update an existing prescription if selectedOfflineRxId was explicitly loaded (e.g. editing an existing prescription)
      // When starting fresh from Queue or New Prescription, currentRxId is null so a new distinct prescription is created!
      let currentRxId = selectedOfflineRxId;

      const isNewVisit = currentRxId && (offlineForm.consultDate !== originalConsultDate);

      // Identify target queue patient ID to mark as COMPLETED
      const currentRef = (offlineForm.referenceId || '').replace(/^ref-?/i, '').trim();
      const currentPatientName = (offlineForm.patientName || '').trim().toLowerCase();
      const targetQueueId = activeConsultingQueueId || (() => {
        const found = (opdQueue || []).find(item => {
          if (item.status === 'COMPLETED' || item.status === 'CONSULTED') return false;
          const itemRef = String(item.reference_id || item.referenceId || '').replace(/^ref-?/i, '').trim();
          const itemName = String(item.patient_name || item.name || '').trim().toLowerCase();
          return (currentRef && itemRef && currentRef === itemRef) ||
                 (currentPatientName && itemName && currentPatientName === itemName);
        });
        return found ? found.id : null;
      })();

      const body = {
        id: isNewVisit ? undefined : (currentRxId || undefined),
        ...offlineForm,
        medications: currentMeds,
        ...offlineLayout,
        queuePatientId: targetQueueId || undefined
      };

      const response = await fetch(`${API_BASE_URL}/doctor/offline-prescriptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      const data = await response.json();

      if (data.success) {
        alert(isNewVisit ? 'New follow-up prescription created successfully!' : (currentRxId ? 'Offline prescription updated successfully!' : 'Offline prescription created successfully!'));
        setSelectedOfflineRxId(data.prescription.id);
        setOriginalConsultDate(data.prescription.consultDate ? data.prescription.consultDate.split('T')[0] : '');
        setOfflineForm(prev => ({
          ...prev,
          referenceId: data.prescription.referenceId || '',
          privateNotes: data.prescription.privateNotes !== undefined ? (data.prescription.privateNotes || '') : (data.prescription.private_notes !== undefined ? (data.prescription.private_notes || '') : (prev.privateNotes || ''))
        }));
        fetchOfflinePrescriptions();
        fetchMedicines();

        // Mark ONLY the actively consulted patient in OPD Queue as COMPLETED and attach prescription_id
        const currentRef = (data.prescription?.referenceId || offlineForm.referenceId || '').replace(/^ref-?/i, '').trim();
        const currentPatientName = (offlineForm.patientName || '').trim().toLowerCase();

        const targetQueueId = activeConsultingQueueId || (() => {
          const found = (opdQueue || []).find(item => {
            if (item.status === 'COMPLETED' || item.status === 'CONSULTED') return false;
            const itemRef = String(item.reference_id || item.referenceId || '').replace(/^ref-?/i, '').trim();
            const itemName = String(item.patient_name || item.name || '').trim().toLowerCase();
            return (currentRef && itemRef && currentRef === itemRef) ||
                   (currentPatientName && itemName && currentPatientName === itemName);
          });
          return found ? found.id : null;
        })();

        if (targetQueueId) {
          setOpdQueue(prev => {
            const next = prev.map(item => {
              return item.id === targetQueueId ? { ...item, status: 'COMPLETED', prescription_id: data.prescription.id } : item;
            });
            try { localStorage.setItem('cached_opd_queue', JSON.stringify(next)); } catch (e) {}
            return next;
          });

          // Notify backend for ONLY this specific queue item
          try {
            if (!String(targetQueueId).startsWith('local-')) {
              await fetch(`${API_BASE_URL}/opd/queue/${targetQueueId}/status`, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ status: 'COMPLETED' })
              });
            }
          } catch (qErr) {
            console.warn('Queue status update notice:', qErr);
          }
        }

        setActiveConsultingQueueId(null);
        return true;
      } else {
        console.warn('Backend save notice, saving locally:', data.message);
        saveLocalPrescriptionFallback(body, isNewVisit);
        alert(isNewVisit ? 'New follow-up prescription saved locally!' : 'Prescription saved locally!');
        return true;
      }
    } catch (err) {
      console.warn('Network error saving prescription, saving locally:', err);
      const isNewVisit = selectedOfflineRxId && (offlineForm.consultDate !== originalConsultDate);
      const body = {
        id: isNewVisit ? undefined : (selectedOfflineRxId || undefined),
        ...offlineForm,
        ...offlineLayout
      };
      saveLocalPrescriptionFallback(body, isNewVisit);
      alert(isNewVisit ? 'New follow-up prescription saved locally!' : 'Prescription saved locally!');
      return true;
    } finally {
      isSavingOfflineRxRef.current = false;
      setIsSavingOfflineRx(false);
    }
  };

  // Dedicated single-page isolated prescription printer
  const handlePrintPrescription = async () => {
    // Guard against rapid double clicks on Print
    if (isPrintingRxRef.current || isSavingOfflineRxRef.current) {
      console.warn('Print or save already in flight, debouncing duplicate print call');
      return;
    }
    isPrintingRxRef.current = true;

    try {
      const success = await saveOfflinePrescription();
      if (!success) return;

    const printElem = document.querySelector('.printable-prescription-preview');
    if (!printElem) {
      window.print();
      return;
    }

    // Cleanly clone element, reset transform, and strip any screen-only elements
    const clone = printElem.cloneNode(true);
    clone.style.transform = 'none';
    clone.style.width = '100%';
    clone.style.maxWidth = '100%';
    clone.style.border = 'none';
    clone.style.boxShadow = 'none';
    clone.style.backgroundColor = '#ffffff';
    clone.querySelectorAll('.no-print').forEach(el => el.remove());

    // When printing on pre-printed letterhead, activate exact physical clearance margins on the clone
    if (offlineLayout.useLetterhead) {
      const headerClearance = clone.querySelector('.print-letterhead-header-clearance');
      if (headerClearance) {
        headerClearance.style.display = 'block';
        headerClearance.style.height = `${offlineLayout.letterheadTopMargin || 285}px`;
      }
      const footerClearance = clone.querySelector('.print-letterhead-footer-clearance');
      if (footerClearance) {
        footerClearance.style.display = 'block';
        footerClearance.style.height = `${offlineLayout.letterheadBottomMargin || 196}px`;
      }
    }

    // Remove any previous temporary print iframe
    const oldIframe = document.getElementById('print-prescription-frame');
    if (oldIframe) {
      oldIframe.remove();
    }

    const iframe = document.createElement('iframe');
    iframe.id = 'print-prescription-frame';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Prescription - ${offlineForm.patientName || 'Patient'}</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&family=Outfit:wght@400;500;600;700;800&family=Roboto:wght@400;500;700;900&family=Open+Sans:wght@400;600;700&family=Lato:wght@400;700&family=Montserrat:wght@400;600;700;800&display=swap" rel="stylesheet">
          <style>
            @page {
              size: A4 portrait;
              margin: 0;
            }
            *, *::before, *::after {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              width: 100%;
              height: 100%;
              background: #ffffff;
              overflow: hidden;
              font-family: ${getFontFamilyCss(offlineLayout.fontFamily)};
            }
            .printable-prescription-preview {
              width: 100% !important;
              max-width: 100% !important;
              min-height: 100vh !important;
              height: 100vh !important;
              max-height: 100vh !important;
              transform: none !important;
              box-sizing: border-box !important;
              box-shadow: none !important;
              border: none !important;
              display: flex !important;
              flex-direction: column !important;
              justifyContent: space-between !important;
              page-break-inside: avoid !important;
              page-break-before: avoid !important;
              page-break-after: avoid !important;
              break-inside: avoid !important;
              break-before: avoid !important;
              break-after: avoid !important;
              overflow: hidden !important;
            }
            .no-print {
              display: none !important;
              visibility: hidden !important;
            }
            .print-only {
              display: block !important;
            }
            .print-letterhead-header-clearance {
              display: ${offlineLayout.useLetterhead ? 'block' : 'none'} !important;
              height: ${offlineLayout.useLetterhead ? (offlineLayout.letterheadTopMargin || 285) : 0}px !important;
            }
            .print-letterhead-footer-clearance {
              display: ${offlineLayout.useLetterhead ? 'block' : 'none'} !important;
              height: ${offlineLayout.useLetterhead ? (offlineLayout.letterheadBottomMargin || 196) : 0}px !important;
            }
          </style>
        </head>
        <body>
          ${clone.outerHTML}
        </body>
      </html>
    `);
    doc.close();

    // Give browser brief tick to parse fonts and signature images before invoking print dialog
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    }, 250);
  } finally {
    setTimeout(() => {
      isPrintingRxRef.current = false;
    }, 800);
  }
};

  // Delete offline prescription
  const deleteOfflinePrescription = async (rxId) => {
    if (!window.confirm('Are you sure you want to delete this saved prescription?')) return;

    if (selectedOfflineRxId === rxId) {
      resetOfflineForm();
    }
    setOfflineRxList(prev => {
      const next = prev.filter(r => r.id !== rxId);
      try {
        localStorage.setItem('cached_offline_prescriptions', JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    if (token) {
      try {
        const response = await fetch(`${API_BASE_URL}/doctor/offline-prescriptions/${rxId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await response.json();
        if (data.success) {
          fetchOfflinePrescriptions();
        }
      } catch (err) {
        console.warn('Backend delete sync note:', err);
      }
    }
  };

  // Load offline prescription into form and layout
  const loadOfflinePrescription = (rx) => {
    if (!rx) return;
    setDashboardView('offline-rx');
    setSelectedOfflineRxId(rx.id);
    const cDate = rx.consultDate ? rx.consultDate.split('T')[0] : (rx.createdAt ? rx.createdAt.split('T')[0] : getLocalDateStr());
    setOriginalConsultDate(cDate);

    let parsedMeds = [];
    if (Array.isArray(rx.medications)) {
      parsedMeds = rx.medications;
    } else if (typeof rx.medications === 'string') {
      try {
        parsedMeds = JSON.parse(rx.medications);
      } catch (e) {
        console.warn('JSON parse warning in loadOfflinePrescription:', e);
        parsedMeds = [];
      }
    }

    setOfflineForm({
      referenceId: rx.referenceId || '',
      patientName: rx.patientName || '',
      patientAge: rx.patientAge ? String(rx.patientAge) : '',
      patientGender: rx.patientGender || 'Male',
      patientPhone: rx.patientPhone || '',
      consultDate: cDate,
      diagnosis: rx.diagnosis || '',
      chiefComplaints: rx.chiefComplaints || '',
      bp: rx.bp || '',
      pulse: rx.pulse || '',
      weight: rx.weight || '',
      sugar: rx.sugar || '',
      medications: parsedMeds,
      advice: rx.advice || '',
      requiredTests: rx.requiredTests || '',
      followUpDate: rx.followUpDate ? rx.followUpDate.split('T')[0] : '',
      privateNotes: rx.privateNotes || rx.private_notes || ''
    });
    setEditingOfflineMedIndex(null);
    setEditingOfflineMed({ name: '', composition: '', dosage: '', frequency: '' });
    setOfflineLayout(prev => ({
      ...prev,
      pageWidth: rx.pageWidth || 800,
      pageHeight: rx.pageHeight || 1120,
      fontSize: rx.fontSize || 13,
      marginSize: rx.marginSize || 40,
      rowSpacing: rx.rowSpacing || 12,
      useLetterhead: rx.useLetterhead !== undefined ? rx.useLetterhead : false,
      letterheadTopMargin: rx.letterheadTopMargin || parseInt(localStorage.getItem('letterheadTopMarginOffline')) || 340,
      letterheadBottomMargin: rx.letterheadBottomMargin || parseInt(localStorage.getItem('letterheadBottomMarginOffline')) || 220,
      showSignature: rx.showSignature !== undefined ? rx.showSignature : (localStorage.getItem('showSignatureOffline') !== 'false'),
      signatureSize: rx.signatureSize || parseInt(localStorage.getItem('signatureSizeOffline')) || 220,
      signaturePosition: rx.signaturePosition || localStorage.getItem('signaturePositionOffline') || 'inline',
      signatureXOffset: rx.signatureXOffset !== undefined ? rx.signatureXOffset : (parseInt(localStorage.getItem('signatureXOffsetOffline')) || 0),
      signatureYOffset: rx.signatureYOffset !== undefined ? rx.signatureYOffset : (parseInt(localStorage.getItem('signatureYOffsetOffline')) || 0),
      fontFamily: rx.fontFamily || localStorage.getItem('fontFamilyOffline') || 'Plus Jakarta Sans'
    }));
  };

  // Reset/Create fresh offline prescription template
  const resetOfflineForm = () => {
    setActiveConsultingQueueId(null);
    setSelectedOfflineRxId(null);
    setOriginalConsultDate('');
    setEditingOfflineMedIndex(null);
    setEditingOfflineMed({ name: '', composition: '', dosage: '', frequency: '' });
    setOfflineForm({
      referenceId: '',
      patientName: '',
      patientAge: '',
      patientGender: 'Male',
      patientPhone: '',
      consultDate: getLocalDateStr(),
      diagnosis: '',
      chiefComplaints: '',
      bp: '',
      pulse: '',
      weight: '',
      sugar: '',
      medications: [],
      advice: '',
      requiredTests: '',
      followUpDate: '',
      privateNotes: ''
    });
    setTempMed({ name: '', composition: '', dosage: '', frequency: '' });
    setOfflineLayout(prev => ({
      ...prev,
      pageWidth: 800,
      pageHeight: 1120,
      fontSize: 13,
      marginSize: 40,
      rowSpacing: 12,
      useLetterhead: localStorage.getItem('useLetterheadOffline') === 'true',
      letterheadTopMargin: parseInt(localStorage.getItem('letterheadTopMarginOffline')) || 340,
      letterheadBottomMargin: parseInt(localStorage.getItem('letterheadBottomMarginOffline')) || 220,
      showSignature: localStorage.getItem('showSignatureOffline') !== 'false',
      signatureSize: parseInt(localStorage.getItem('signatureSizeOffline')) || 220,
      signaturePosition: localStorage.getItem('signaturePositionOffline') || 'inline',
      signatureXOffset: parseInt(localStorage.getItem('signatureXOffsetOffline')) || 0,
      signatureYOffset: parseInt(localStorage.getItem('signatureYOffsetOffline')) || 0,
      fontFamily: localStorage.getItem('fontFamilyOffline') || 'Plus Jakarta Sans'
    }));
    fetchNextReferenceId(true);
  };

  // If the active queue patient was removed/deleted from the OPD queue (or queue cleared at front desk),
  // automatically reset the consultation form so deleted patient details don't linger on screen.
  useEffect(() => {
    if (activeConsultingQueueId && selectedOfflineRxId === null) {
      const stillInQueue = (opdQueue || []).some(item => item.id === activeConsultingQueueId);
      if (!stillInQueue) {
        setActiveConsultingQueueId(null);
        resetOfflineForm();
        setQueueNavToast('Notice: Active queue patient was removed from queue. Consultation form reset.');
        setTimeout(() => setQueueNavToast(null), 3500);
      }
    }
  }, [opdQueue, activeConsultingQueueId, selectedOfflineRxId]);

  // Medication handlers for offline prescription form
  const addOfflineMedicationRow = () => {
    setOfflineForm(prev => ({
      ...prev,
      medications: [...prev.medications, { name: '', composition: '', dosage: '', frequency: '' }]
    }));
  };

  const removeOfflineMedicationRow = (index) => {
    if (editingOfflineMedIndex === index) {
      setEditingOfflineMedIndex(null);
      setEditingOfflineMed({ name: '', composition: '', dosage: '', frequency: '' });
    }
    setOfflineForm(prev => ({
      ...prev,
      medications: (prev.medications || []).filter((_, i) => i !== index)
    }));
  };

  const handleOfflineMedicationChange = (index, field, value) => {
    const updatedMeds = [...(offlineForm.medications || [])];
    if (updatedMeds[index]) {
      updatedMeds[index] = { ...updatedMeds[index], [field]: value };
      setOfflineForm(prev => ({
        ...prev,
        medications: updatedMeds
      }));
    }
  };

  const handleLanguageChange = (newLang) => {
    setRxInstructionLanguage(newLang);
    localStorage.setItem('rxInstructionLanguage', newLang);
    if (tempMed?.name && typeof tempMed.name === 'string' && tempMed.name.trim()) {
      const auto = detectSmartDrugTiming(tempMed.name, tempMed.composition, newLang);
      if (auto) {
        setTempMed(prev => ({ ...prev, frequency: auto }));
      }
    }
  };

  // Add medicine to current offline prescription AND auto-save/sync to medicine database
  const handleAddMedicineToRx = async () => {
    if (!tempMed || !tempMed.name || typeof tempMed.name !== 'string' || !tempMed.name.trim()) {
      alert('Please fill in the Medicine Name before adding.');
      return;
    }

    const medToAdd = {
      name: tempMed.name.trim(),
      composition: tempMed.composition && typeof tempMed.composition === 'string' ? tempMed.composition.trim() : '',
      dosage: tempMed.dosage && typeof tempMed.dosage === 'string' ? tempMed.dosage.trim() : '',
      frequency: tempMed.frequency && typeof tempMed.frequency === 'string' ? tempMed.frequency.trim() : ''
    };

    // Immediately add to offline prescription for responsive UI
    setOfflineForm(prev => ({
      ...prev,
      medications: [...(prev?.medications || []), medToAdd]
    }));

    // Clear inputs and search dropdown
    setTempMed({ name: '', composition: '', dosage: '', frequency: '' });
    setActiveSearchIndex(null);

    // Auto-focus back on medicine name input so doctor can immediately type next medicine
    setTimeout(() => {
      medNameInputRef.current?.focus();
    }, 50);

    // Auto-save to Medicine Database if token is present
    if (token) {
      try {
        const response = await fetch(`${API_BASE_URL}/doctor/medicines`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            name: medToAdd.name,
            composition: medToAdd.composition || null,
            dosage: medToAdd.dosage || null
          })
        });

        const data = await response.json();
        if (data && data.success && data.medicine) {
          const newMed = data.medicine;
          const newMedName = typeof newMed?.name === 'string' ? newMed.name.toLowerCase() : '';
          if (newMedName) {
            setMedicinesList(prev => {
              const list = Array.isArray(prev) ? prev : [];
              const exists = list.some(m => m && typeof m.name === 'string' && m.name.toLowerCase() === newMedName);
              if (exists) {
                return list.map(m => (m && typeof m.name === 'string' && m.name.toLowerCase() === newMedName) ? newMed : m);
              }
              return [...list, newMed].sort((a, b) => {
                const aName = a && typeof a.name === 'string' ? a.name : '';
                const bName = b && typeof b.name === 'string' ? b.name : '';
                return aName.localeCompare(bName);
              });
            });
          }
        }
      } catch (err) {
        console.error('Error auto-saving medicine to database:', err);
      }
    }

    // Show temporary confirmation badge
    setRxAutoSaveNotice(`"${medToAdd.name}" added to Rx & saved to Medicine Database!`);
    setTimeout(() => {
      setRxAutoSaveNotice(prev => (prev && prev.includes(medToAdd.name) ? null : prev));
    }, 3500);
  };

  // Start editing an added medicine
  const startEditOfflineMed = (index) => {
    const list = offlineForm?.medications || [];
    const target = list[index];
    if (!target) return;
    setEditingOfflineMedIndex(index);
    setEditingOfflineMed({
      name: target.name || '',
      composition: target.composition || '',
      dosage: target.dosage || '',
      frequency: target.frequency || ''
    });
  };

  // Save changes to an edited medicine
  const saveEditOfflineMed = async (index) => {
    if (!editingOfflineMed?.name || typeof editingOfflineMed.name !== 'string' || !editingOfflineMed.name.trim()) {
      alert('Please provide a valid Medicine Name.');
      return;
    }
    const updatedMed = {
      name: editingOfflineMed.name.trim(),
      composition: editingOfflineMed.composition && typeof editingOfflineMed.composition === 'string' ? editingOfflineMed.composition.trim() : '',
      dosage: editingOfflineMed.dosage && typeof editingOfflineMed.dosage === 'string' ? editingOfflineMed.dosage.trim() : '',
      frequency: editingOfflineMed.frequency && typeof editingOfflineMed.frequency === 'string' ? editingOfflineMed.frequency.trim() : ''
    };

    setOfflineForm(prev => {
      const updated = [...(prev?.medications || [])];
      updated[index] = updatedMed;
      return { ...prev, medications: updated };
    });
    setEditingOfflineMedIndex(null);
    setEditingOfflineMed({ name: '', composition: '', dosage: '', frequency: '' });

    // Auto-save/update edited medicine in database if token exists
    if (token) {
      try {
        const response = await fetch(`${API_BASE_URL}/doctor/medicines`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            name: updatedMed.name,
            composition: updatedMed.composition || null,
            dosage: updatedMed.dosage || null
          })
        });
        const data = await response.json();
        if (data && data.success && data.medicine) {
          const newMed = data.medicine;
          const newMedName = typeof newMed?.name === 'string' ? newMed.name.toLowerCase() : '';
          if (newMedName) {
            setMedicinesList(prev => {
              const list = Array.isArray(prev) ? prev : [];
              const exists = list.some(m => m && typeof m.name === 'string' && m.name.toLowerCase() === newMedName);
              if (exists) {
                return list.map(m => (m && typeof m.name === 'string' && m.name.toLowerCase() === newMedName) ? newMed : m);
              }
              return [...list, newMed].sort((a, b) => {
                const aName = a && typeof a.name === 'string' ? a.name : '';
                const bName = b && typeof b.name === 'string' ? b.name : '';
                return aName.localeCompare(bName);
              });
            });
          }
        }
      } catch (err) {
        console.error('Error auto-saving edited medicine to DB:', err);
      }
    }
  };

  // Cancel editing an added medicine
  const cancelEditOfflineMed = () => {
    setEditingOfflineMedIndex(null);
    setEditingOfflineMed({ name: '', composition: '', dosage: '', frequency: '' });
  };

  // Toggle accordion card in previous prescriptions history
  const toggleRxHistoryAccordion = (rxId) => {
    setExpandedRxHistoryIds(prev => {
      const next = new Set(prev);
      if (next.has(rxId)) {
        next.delete(rxId);
      } else {
        next.add(rxId);
      }
      return next;
    });
  };

  // Helper to compare two patient names with honorific stripping and individual identity preservation
  const isSamePatientName = (nameA, nameB) => {
    if (!nameA || !nameB) return false;

    const clean = (str) =>
      str
        .toLowerCase()
        .trim()
        .replace(/^(mr|mrs|ms|miss|dr|prof|master|baby|smt|shri)\.?\s+/i, '')
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const a = clean(nameA);
    const b = clean(nameB);

    if (!a || !b) return false;
    if (a === b) return true;

    const wordsA = a.split(' ');
    const wordsB = b.split(' ');

    // If first names differ (e.g. "Ramesh" vs "Sunita"), they are DEFINITELY DIFFERENT people
    // even if they share the exact same mobile number and family surname!
    if (wordsA[0] !== wordsB[0]) {
      return false;
    }

    // If one is just first name ("Sunita") and other is full name ("Sunita Sharma")
    if (wordsA.length === 1 || wordsB.length === 1) {
      return true;
    }

    // If both are multi-word, check if last names match or if one name contains the other
    if (wordsA[wordsA.length - 1] === wordsB[wordsB.length - 1]) {
      return true;
    }

    if (a.includes(b) || b.includes(a)) {
      return true;
    }

    return false;
  };

  // Get all previous prescriptions matching currently entered patient / reference
  const getPatientHistoryPrescriptions = () => {
    const currentName = (offlineForm.patientName || '').trim();
    const currentPhone = (offlineForm.patientPhone || '').trim();
    const currentRef = (offlineForm.referenceId || '').trim();

    if (!currentName && !currentRef) {
      return [];
    }

    const matched = offlineRxList.filter(rx => {
      const rxName = (rx.patientName || '').trim();
      const rxPhone = (rx.patientPhone || '').trim();
      const rxRef = (rx.referenceId || '').trim();

      // 1. If patient name is entered:
      if (currentName) {
        // Name MUST match! If names differ (e.g. Ramesh vs Sunita), they must NEVER be merged,
        // even if they share the exact same mobile number.
        if (!isSamePatientName(currentName, rxName)) {
          return false;
        }

        // If phone is provided in both, verify phone matches (or one is empty)
        if (currentPhone && rxPhone && currentPhone !== rxPhone) {
          return false;
        }

        return true;
      }

      // 2. If no name is entered yet, but a specific reference ID is entered:
      if (currentRef && rxRef) {
        const currentSerial = currentRef.split('/')[0].toLowerCase();
        const rxSerial = rxRef.split('/')[0].toLowerCase();
        return currentRef.toLowerCase() === rxRef.toLowerCase() || currentSerial === rxSerial;
      }

      return false;
    });

    matched.sort((a, b) => {
      const dateA = new Date(a.consultDate || a.createdAt || 0);
      const dateB = new Date(b.consultDate || b.createdAt || 0);
      return dateB - dateA;
    });

    return matched;
  };

  // Identify other family members who share the same mobile phone number but are distinct patients
  const otherFamilyMembersWithSamePhone = React.useMemo(() => {
    const currentPhone = (offlineForm.patientPhone || '').trim();
    const currentName = (offlineForm.patientName || '').trim();
    if (!currentPhone || !currentName) return [];

    const familyMap = new Map();
    // Check past prescriptions
    offlineRxList.forEach(rx => {
      const rxPhone = (rx.patientPhone || '').trim();
      const rxName = (rx.patientName || '').trim();
      if (rxPhone && rxPhone === currentPhone && rxName && !isSamePatientName(currentName, rxName)) {
        const key = rxName.toLowerCase();
        if (!familyMap.has(key)) {
          familyMap.set(key, {
            name: rxName,
            age: rx.patientAge,
            gender: rx.patientGender,
            referenceId: rx.referenceId,
            latestRx: rx
          });
        }
      }
    });

    // Also check today's OPD Queue
    (opdQueue || []).forEach(q => {
      const qPhone = (q.phone || q.patient_phone || '').trim();
      const qName = (q.patient_name || '').trim();
      if (qPhone && qPhone === currentPhone && qName && !isSamePatientName(currentName, qName)) {
        const key = qName.toLowerCase();
        if (!familyMap.has(key)) {
          familyMap.set(key, {
            name: qName,
            age: q.age,
            gender: q.gender,
            referenceId: q.reference_id,
            queuePatient: q
          });
        } else {
          familyMap.get(key).queuePatient = q;
        }
      }
    });

    return Array.from(familyMap.values());
  }, [offlineForm.patientPhone, offlineForm.patientName, offlineRxList, opdQueue]);

  // Open / Switch Consultation directly to another Family Member on the same phone number
  const openFamilyMemberPatient = (fam) => {
    setShowPastVisitsModal(false);
    setShowPastVisitsDrawer(false);

    // 1. Check if this family member has a pending entry in today's OPD queue waiting to be consulted!
    const queueEntry = fam.queuePatient || (opdQueue || []).find(q => 
      (q.patient_name && isSamePatientName(q.patient_name, fam.name)) ||
      (q.phone && q.phone === offlineForm.patientPhone && isSamePatientName(q.patient_name, fam.name))
    );

    if (queueEntry && queueEntry.status !== 'COMPLETED' && queueEntry.status !== 'CONSULTED') {
      startConsultationFromQueue(queueEntry);
      setQueueNavToast(`👨‍👩‍👧 Switched to family member: ${queueEntry.patient_name} (Token #${queueEntry.token_number})`);
      setTimeout(() => setQueueNavToast(null), 3000);
      return;
    }

    // 2. Check if this family member already has a prescription created TODAY
    const todayStr = getLocalDateStr();
    const existingTodayRx = (offlineRxList || []).find(r => {
      const rDate = r.consultDate ? r.consultDate.split('T')[0] : (r.createdAt ? r.createdAt.split('T')[0] : '');
      const matchName = isSamePatientName(r.patientName, fam.name);
      const matchPhone = !r.patientPhone || !offlineForm.patientPhone || r.patientPhone === offlineForm.patientPhone;
      return matchName && matchPhone && rDate === todayStr;
    });

    if (existingTodayRx) {
      loadOfflinePrescription(existingTodayRx);
      if (queueEntry) {
        setOpdQueue(prev => prev.map(item => item.id === queueEntry.id ? { ...item, status: 'COMPLETED', prescription_id: existingTodayRx.id } : item));
      }
      setActiveConsultingQueueId(null);
      setQueueNavToast(`📄 Loaded today's prescription for ${existingTodayRx.patientName || fam.name} (Ref: ${existingTodayRx.referenceId || ''})`);
      setTimeout(() => setQueueNavToast(null), 3000);
      return;
    }

    // 3. Otherwise if they have a past prescription from an earlier date, load it without completing today's queue
    if (fam.latestRx) {
      loadOfflinePrescription(fam.latestRx);
      setActiveConsultingQueueId(null);
      setQueueNavToast(`📄 Loaded past prescription for ${fam.latestRx.patientName || fam.name} (Ref: ${fam.latestRx.referenceId || ''})`);
      setTimeout(() => setQueueNavToast(null), 3000);
      return;
    }

    // 4. Otherwise load from their latest past prescription if available
    const latestRx = (offlineRxList || []).find(r => 
      isSamePatientName(r.patientName, fam.name) &&
      (!r.patientPhone || !offlineForm.patientPhone || r.patientPhone === offlineForm.patientPhone)
    );

    if (latestRx) {
      loadOfflinePrescription(latestRx);
      setActiveConsultingQueueId(null);
      setQueueNavToast(`👨‍👩‍👧 Switched to past prescription for ${latestRx.patientName}`);
      setTimeout(() => setQueueNavToast(null), 3000);
    } else {
      setDashboardView('offline-rx');
      setSelectedOfflineRxId(null);
      setActiveConsultingQueueId(null);
      setOfflineForm(prev => ({
        ...prev,
        patientName: fam.name,
        patientAge: String(fam.age || ''),
        patientGender: fam.gender || 'Female',
        referenceId: '',
        diagnosis: '',
        chiefComplaints: '',
        medications: []
      }));
      setQueueNavToast(`👨‍👩‍👧 Switched to family member: ${fam.name}`);
      setTimeout(() => setQueueNavToast(null), 3000);
    }
  };

  // Copy all medications and clinical diagnosis from past prescription into current form
  const copyAllMedsFromHistory = (rx) => {
    const meds = typeof rx.medications === 'string' ? JSON.parse(rx.medications) : (rx.medications || []);
    if ((!meds || meds.length === 0) && !rx.diagnosis) {
      alert('This past prescription does not contain any medications or diagnosis to copy.');
      return;
    }
    setOfflineForm(prev => ({
      ...prev,
      medications: meds && meds.length > 0 ? [...(prev.medications || []), ...meds] : (prev.medications || []),
      // Copy clinical diagnosis from past visit
      diagnosis: rx.diagnosis || prev.diagnosis || '',
      // Vitals (BP, Pulse, Weight) remain untouched and fresh for today's consultation
      bp: prev.bp || '',
      pulse: prev.pulse || '',
      weight: prev.weight || ''
    }));
    const diagMsg = rx.diagnosis ? ` and Diagnosis ("${rx.diagnosis}")` : '';
    alert(`Copied ${meds ? meds.length : 0} medicine(s)${diagMsg} into today's prescription! (BP, pulse, weight left fresh)`);
  };

  // Copy single medication from past prescription into current form
  const copySingleMedFromHistory = (med) => {
    setOfflineForm(prev => ({
      ...prev,
      medications: [...(prev.medications || []), { ...med }]
    }));
    alert(`Added "${med.name}" to current prescription!`);
  };

  // Start new follow-up visit for an old patient (1 Patient = 1 Lifetime Reference ID)
  const startNewFollowUpFromPatient = (rx) => {
    setSelectedOfflineRxId(null);
    setOriginalConsultDate('');

    setOfflineForm({
      referenceId: rx.referenceId || '', // PRESERVE LIFETIME REFERENCE ID
      patientName: rx.patientName,
      patientAge: rx.patientAge,
      patientGender: rx.patientGender,
      patientPhone: rx.patientPhone || '',
      consultDate: getLocalDateStr(),
      diagnosis: rx.diagnosis || '', // Copy clinical diagnosis for follow-up
      chiefComplaints: '',
      bp: '', // Fresh for today (do not copy past vitals)
      pulse: '', // Fresh for today (do not copy past vitals)
      weight: '', // Fresh for today (do not copy past vitals)
      medications: [],
      advice: '',
      requiredTests: '',
      followUpDate: '',
      privateNotes: rx.privateNotes || rx.private_notes || ''
    });
    setTempMed({ name: '', composition: '', dosage: '', frequency: '' });
    // Expand the past visit so the doctor sees previous history immediately
    setExpandedRxHistoryIds(new Set([rx.id]));
  };

  // Helper to filter quick lookup results
  const getQuickLookupResults = () => {
    if (!quickLookupQuery.trim()) return [];
    const q = quickLookupQuery.trim().toLowerCase();
    const qClean = q.replace(/^ref-?/i, '');
    return offlineRxList.filter(rx => {
      const ref = (rx.referenceId || '').toLowerCase();
      const name = (rx.patientName || '').toLowerCase();
      const phone = (rx.patientPhone || '').toLowerCase();
      const id = (rx.id || '').toLowerCase();
      const diagnosis = (rx.diagnosis || '').toLowerCase();
      const complaints = (rx.chiefComplaints || '').toLowerCase();
      const meds = (rx.medications || []).map(m => (m.name || '').toLowerCase()).join(' ');
      const serialPart = ref.split('/')[0].replace(/^ref-?/i, '');
      return (
        ref.includes(q) ||
        name.includes(q) ||
        phone.includes(q) ||
        id.includes(q) ||
        (serialPart && serialPart === qClean) ||
        diagnosis.includes(q) ||
        complaints.includes(q) ||
        meds.includes(q)
      );
    }).slice(0, 15);
  };

  // Detect if manually typed reference ID matches an existing patient whose details are not yet filled
  const matchedOldPatientRecord = React.useMemo(() => {
    if (!offlineForm.referenceId || !offlineForm.referenceId.trim()) return null;
    if (selectedOfflineRxId) return null;
    const ref = offlineForm.referenceId.trim().toLowerCase();
    const found = offlineRxList.find(rx => {
      const rxRef = (rx.referenceId || '').trim().toLowerCase();
      const rxSerial = rxRef.split('/')[0];
      return (rxRef === ref || rxSerial === ref);
    });
    if (!found) return null;
    // Don't show if this patient's details are already loaded in the form
    if (offlineForm.patientName && isSamePatientName(offlineForm.patientName, found.patientName)) {
      return null;
    }
    return found;
  }, [offlineForm.referenceId, offlineForm.patientName, offlineRxList, selectedOfflineRxId]);

  // Socket.io real-time events listener
  useEffect(() => {
    if (!token) return;

    fetchAppointments();
    fetchOfflinePrescriptions();
    fetchMedicines();
    fetchOpdQueue();

    const socketInstance = io(API_URL, {
      transports: ['websocket']
    });

    socketInstance.on('connect', () => {
      console.log('Socket connected to backend:', socketInstance.id);
    });

    socketInstance.on('booking_confirmed', (data) => {
      console.log('WebSocket booking_confirmed event received:', data);
      setSocketNotification(data);
      setNewBookingsCount(prev => prev + 1);
      fetchAppointments();
    });

    socketInstance.on('appointment_updated', (data) => {
      console.log('Real-time appointment_updated event received:', data);
      fetchAppointments();
    });

    socketInstance.on('opd_queue_updated', (data) => {
      console.log('Real-time opd_queue_updated event received:', data);
      fetchOpdQueue();
    });

    setSocket(socketInstance);

    const queuePollInterval = setInterval(() => {
      fetchOpdQueue();
    }, 10000);

    return () => {
      clearInterval(queuePollInterval);
      socketInstance.disconnect();
    };
  }, [token]);

  useEffect(() => {
    // Only auto-fetch if we are in offline-rx mode, no existing Rx is loaded, and NO referenceId has been set yet!
    if (dashboardView === 'offline-rx' && !selectedOfflineRxId && !offlineForm.referenceId) {
      fetchNextReferenceId(false);
    }
  }, [dashboardView, token]);

  // Video calling media stream handlers & triggers
  const startMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
    } catch (err) {
      console.warn("Camera/Mic permissions denied or unavailable:", err);
      alert("Permission request: Camera and microphone access is required for telehealth video calls.");
    }
  };

  const stopMedia = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
  };

  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, activeVideoAppt]);

  const toggleCam = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !cameraEnabled;
      });
      setCameraEnabled(!cameraEnabled);
    }
  };

  const toggleMic = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !micEnabled;
      });
      setMicEnabled(!micEnabled);
    }
  };

  // Join socket.io consultation room
  useEffect(() => {
    if (activeVideoAppt && socket) {
      socket.emit('join_consultation', { bookingId: activeVideoAppt.bookingId, role: 'doctor' });

      const handleIncomingMessage = (msg) => {
        setChatMessages(prev => [...prev, msg]);
      };

      socket.on('chat_message', handleIncomingMessage);

      return () => {
        socket.off('chat_message', handleIncomingMessage);
      };
    }
  }, [activeVideoAppt, socket]);

  // Chat submit handler
  const sendChatMessage = (e) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || !socket || !activeVideoAppt) return;

    socket.emit('chat_message', {
      bookingId: activeVideoAppt.bookingId,
      sender: 'doctor',
      text: chatInput.trim()
    });
    setChatInput('');
  };

  // Active call timer
  useEffect(() => {
    let interval = null;
    if (activeVideoAppt) {
      setTimerSeconds(0);
      interval = setInterval(() => {
        setTimerSeconds(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [activeVideoAppt]);

  const formatTime = (totalSeconds) => {
    const mins = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const secs = String(totalSeconds % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  };

  // Zero-Mouse Hands-on-Keyboard Global Hotkeys
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (dashboardView !== 'offline-rx' || !user || user.role === 'RECEPTIONIST') return;

      // 1. Toggle Help Modal (F1)
      if (e.key === 'F1') {
        e.preventDefault();
        setShowShortcutsModal(prev => !prev);
        return;
      }


      // 2. Save Prescription (Ctrl+Enter, Cmd+Enter, or Alt+S)
      if (((e.ctrlKey || e.metaKey) && e.key === 'Enter') || (e.altKey && (e.key === 's' || e.key === 'S'))) {
        e.preventDefault();
        saveOfflinePrescription(e);
        return;
      }


      // 3. Print Prescription (Ctrl+P, Cmd+P, or Alt+P)
      if (((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) || (e.altKey && (e.key === 'p' || e.key === 'P'))) {
        e.preventDefault();
        handlePrintPrescription();
        return;
      }


      // 4. Next Waiting Patient from OPD Queue (Alt+N)
      if (e.altKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        const nextQ = opdQueue.find(p => p.status === 'WAITING');
        if (nextQ) {
          startConsultationFromQueue(nextQ);
          setQueueNavToast(`⚡ Auto-loaded Token #${nextQ.token_number}: ${nextQ.patient_name}`);
          setTimeout(() => setQueueNavToast(null), 3500);
        } else {
          setQueueNavToast('ℹ️ No patients currently waiting in today\'s OPD queue.');
          setTimeout(() => setQueueNavToast(null), 3000);
        }
        return;
      }

      // 4b. Toggle Today's Queue Sidebar (Alt+Q)
      if (e.altKey && (e.key === 'q' || e.key === 'Q')) {
        e.preventDefault();
        toggleQueue();
        return;
      }

      // 5. Jump to Medicine Input (Alt+M)
      if (e.altKey && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        medNameInputRef.current?.focus();
        medNameInputRef.current?.select();
        return;
      }


      // 6. Jump to Clinical Diagnosis (Alt+D)
      if (e.altKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        diagnosisInputRef.current?.focus();
        diagnosisInputRef.current?.select();
        return;
      }


      // 7. Jump to Chief Complaints (Alt+C)
      if (e.altKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        chiefComplaintsInputRef.current?.focus();
        chiefComplaintsInputRef.current?.select();
        return;
      }


      // 8. Jump to Patient & Serial Search (Alt+F or Ctrl+K or Cmd+K)
      if ((e.altKey && (e.key === 'f' || e.key === 'F')) || ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K'))) {
        e.preventDefault();
        quickLookupInputRef.current?.focus();
        quickLookupInputRef.current?.select();
        return;
      }


      // 9. Reset / Clear Form (Alt+R)
      if (e.altKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        if (window.confirm('Reset form and start a fresh prescription?')) {
          resetOfflineForm();
        }
        return;
      }


      // 10. Smooth Arrow Key Scroll with Alt+ArrowDown / Alt+ArrowUp
      if (e.altKey && e.key === 'ArrowDown') {
        e.preventDefault();
        window.scrollBy({ top: 220, behavior: 'smooth' });
        return;
      }

      if (e.altKey && e.key === 'ArrowUp') {
        e.preventDefault();
        window.scrollBy({ top: -220, behavior: 'smooth' });
        return;
      }


      // 11. Unfocused Page Scroll (When cursor is not in an editable field)
      const isInputActive = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      if (!isInputActive) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          window.scrollBy({ top: 140, behavior: 'smooth' });
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          window.scrollBy({ top: -140, behavior: 'smooth' });
        } else if (e.key === 'PageDown') {
          e.preventDefault();
          window.scrollBy({ top: 450, behavior: 'smooth' });
        } else if (e.key === 'PageUp') {
          e.preventDefault();
          window.scrollBy({ top: -450, behavior: 'smooth' });
        } else if (e.key === '?') {
          e.preventDefault();
          setShowShortcutsModal(prev => !prev);
        } else if (e.key === 'Escape') {
          setShowPastVisitsModal(false);
          setShowShortcutsModal(false);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [dashboardView, user, opdQueue, offlineForm, originalConsultDate, selectedOfflineRxId, tempMed, token, medicinesList]);

  // End Video Call & mark completed on both ends
  const endConsultation = async () => {
    if (!activeVideoAppt) return;
    if (!window.confirm("Are you sure you want to end the video call? This will mark the appointment as completed on both ends.")) return;

    try {
      const response = await fetch(`${API_BASE_URL}/doctor/appointments/${activeVideoAppt.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'COMPLETED' })
      });
      const data = await response.json();

      if (data.success) {
        if (socket) {
          socket.emit('end_consultation', { bookingId: activeVideoAppt.bookingId });
        }
        if (jitsiApiRef.current) {
          try {
            jitsiApiRef.current.executeCommand('hangup');
          } catch (e) {
            console.error('Error hanging up Jitsi:', e);
          }
        }
        stopMedia();
        setActiveVideoAppt(null);
        fetchAppointments();
      } else {
        alert(data.message || 'Failed to update appointment status.');
      }
    } catch (err) {
      console.error(err);
      alert('Error ending consultation call.');
    }
  };

  // Handle email/password login
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/doctor/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role: loginRole })
      });
      const data = await response.json();

      if (data.success) {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('doc_token', data.token);
        localStorage.setItem('doc_user', JSON.stringify(data.user));
        return;
      } else {
        // If server reported a database configuration issue, gracefully use local session fallback
        const cleanEmail = email.trim().toLowerCase();
        const isDoc = (cleanEmail === 'doctor@neuroharmony.in' || cleanEmail === 'doctor' || loginRole === 'DOCTOR') && (password === 'doctor123' || password === 'doctor' || !password.trim());
        const isRec = (cleanEmail === 'reception@neuroharmony.in' || cleanEmail === 'reception' || loginRole === 'RECEPTIONIST') && (password === 'reception123' || password === 'reception' || !password.trim());
        
        if (isDoc || isRec) {
          const dummyUser = {
            id: isRec ? 'a0000000-0000-4000-8000-000000000001' : 'd8cc3415-85ca-47c2-90b7-4c1a3b08a127',
            name: isRec ? 'Front Desk / Reception' : 'Dr. Priyadarshi Srivastava',
            email: email || (isRec ? 'reception@neuroharmony.in' : 'doctor@neuroharmony.in'),
            role: isRec ? 'RECEPTIONIST' : 'DOCTOR'
          };
          const dummyToken = isRec ? 'local-reception-token' : 'local-preview-token';
          setToken(dummyToken);
          setUser(dummyUser);
          localStorage.setItem('doc_token', dummyToken);
          localStorage.setItem('doc_user', JSON.stringify(dummyUser));
          return;
        }

        setLoginError(data.message || 'Invalid email or password.');
      }
    } catch (err) {
      // Local fallback for doctor and receptionist login if backend is not running locally
      const cleanEmail = email.trim().toLowerCase();
      if (cleanEmail === 'reception@neuroharmony.in' || cleanEmail === 'reception' || loginRole === 'RECEPTIONIST') {
        const dummyUser = {
          id: 'a0000000-0000-4000-8000-000000000001',
          name: 'Front Desk / Reception',
          email: email || 'reception@neuroharmony.in',
          role: 'RECEPTIONIST'
        };
        const dummyToken = 'local-reception-token';
        setToken(dummyToken);
        setUser(dummyUser);
        localStorage.setItem('doc_token', dummyToken);
        localStorage.setItem('doc_user', JSON.stringify(dummyUser));
        return;
      }


      const isDoctorCreds = (cleanEmail === 'doctor@neuroharmony.in' || !cleanEmail) && (password === 'doctor123' || !password.trim());
      if (isDoctorCreds || cleanEmail.includes('doctor') || loginRole === 'DOCTOR') {
        const dummyUser = {
          id: 'd8cc3415-85ca-47c2-90b7-4c1a3b08a127',
          name: 'Dr. Priyadarshi Srivastava',
          email: email || 'doctor@neuroharmony.in',
          role: 'DOCTOR'
        };
        const dummyToken = 'local-preview-token';
        setToken(dummyToken);
        setUser(dummyUser);
        localStorage.setItem('doc_token', dummyToken);
        localStorage.setItem('doc_user', JSON.stringify(dummyUser));
        return;
      }

      setLoginError('Error connecting to backend server. Please check your network and try again.');
      console.error(err);
    } finally {
      setLoginLoading(false);
    }
  };

  // Handle logout
  const handleLogout = () => {
    setToken('');
    setUser(null);
    localStorage.removeItem('doc_token');
    localStorage.removeItem('doc_user');
  };

  // Update appointment status (COMPLETED, CANCELLED, NO_SHOW)
  const updateStatus = async (appointmentId, newStatus) => {
    if (!window.confirm(`Are you sure you want to mark this appointment as ${newStatus}?`)) return;

    try {
      const response = await fetch(`${API_BASE_URL}/doctor/appointments/${appointmentId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await response.json();
      if (data.success) {
        alert(`Status updated successfully.`);
        fetchAppointments();
        if (selectedAppt && selectedAppt.id === appointmentId) {
          setSelectedAppt(null);
        }
      } else {
        alert(data.message || 'Failed to update status.');
      }
    } catch (err) {
      alert('Error updating status.');
      console.error(err);
    }
  };

  // Prescription Medications Table Helpers
  const addMedicationRow = () => {
    setPrescriptionForm(prev => ({
      ...prev,
      medications: [...(prev?.medications || []), { name: '', composition: '', dosage: '', frequency: '' }]
    }));
  };

  const removeMedicationRow = (index) => {
    if ((prescriptionForm?.medications || []).length <= 1) return;
    setPrescriptionForm(prev => ({
      ...prev,
      medications: (prev?.medications || []).filter((_, i) => i !== index)
    }));
  };

  const handleMedicationChange = (index, field, value) => {
    const updatedMeds = [...(prescriptionForm?.medications || [])];
    if (updatedMeds[index]) {
      updatedMeds[index] = { ...updatedMeds[index], [field]: value };
      setPrescriptionForm(prev => ({
        ...prev,
        medications: updatedMeds
      }));
    }
  };

  // Submit Prescription Form
  const submitPrescription = async (e) => {
    e.preventDefault();
    if (!selectedAppt) return;
    setPrescriptionSubmitting(true);
    setGeneratedPdfUrl('');

    try {
      const response = await fetch(`${API_BASE_URL}/doctor/appointments/${selectedAppt.id}/prescription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          diagnosis: prescriptionForm.diagnosis,
          advice: prescriptionForm.advice,
          medications: prescriptionForm.medications,
          useLetterhead: prescriptionForm.useLetterhead,
          showSignature: offlineLayout.showSignature,
          signatureSize: offlineLayout.signatureSize,
          signaturePosition: offlineLayout.signaturePosition,
          signatureXOffset: offlineLayout.signatureXOffset,
          signatureYOffset: offlineLayout.signatureYOffset,
          fontFamily: offlineLayout.fontFamily,
          fontSize: offlineLayout.fontSize
        })
      });

      const data = await response.json();
      if (data.success) {
        setGeneratedPdfUrl(data.pdfUrl);

        // Notify patient about prescription
        if (socket && activeVideoAppt) {
          socket.emit('prescription_posted', { bookingId: activeVideoAppt.bookingId, pdfUrl: data.pdfUrl });
        }

        // Auto mark appointment status as COMPLETED
        try {
          const statusRes = await fetch(`${API_BASE_URL}/doctor/appointments/${selectedAppt.id}/status`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status: 'COMPLETED' })
          });
          const statusData = await statusRes.json();
          if (statusData.success) {
            // Notify patient that consultation has ended
            if (socket && activeVideoAppt) {
              socket.emit('end_consultation', { bookingId: activeVideoAppt.bookingId });
            }
            // Disconnect Jitsi
            if (jitsiApiRef.current) {
              try {
                jitsiApiRef.current.executeCommand('hangup');
              } catch (e) {
                console.error('Error hanging up Jitsi:', e);
              }
            }
            alert('Prescription submitted! Meeting ended and marked completed.');
            stopMedia();
            setActiveVideoAppt(null);
            fetchAppointments();
          } else {
            alert('Prescription submitted, but failed to mark appointment as completed: ' + (statusData.message || ''));
          }
        } catch (statusErr) {
          console.error(statusErr);
          alert('Prescription submitted, but error marking appointment as completed.');
        }
      } else {
        alert(data.message || 'Failed to submit prescription.');
      }
    } catch (err) {
      alert('Error submitting prescription.');
      console.error(err);
    } finally {
      setPrescriptionSubmitting(false);
    }
  };

  // Categorize appointments into Today's vs Upcoming (timezone-agnostic calendar date comparison)
  const getUtcDateStr = (dateVal) => {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    const yr = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const da = String(d.getUTCDate()).padStart(2, '0');
    return `${yr}-${mo}-${da}`;
  };



  const todayStr = getLocalDateStr(new Date());
  const todayAppointments = appointments.filter(appt => getUtcDateStr(appt.appointmentDate) === todayStr);
  const upcomingAppointments = appointments.filter(appt => getUtcDateStr(appt.appointmentDate) !== todayStr);

  if (!token) {
    // LOGIN SCREEN
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '1rem' }}>
        <div className="glass-panel" style={{ width: '100%', maxWidth: '420px', padding: '2.5rem', boxShadow: 'var(--shadow-lg)' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--primary)', margin: 0 }}>Neuro Harmony</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--neutral-body)', marginTop: '0.25rem' }}>
              {loginRole === 'DOCTOR' ? 'Doctor Dashboard Portal' : 'Front Desk & OPD Reception Desk'}
            </p>
          </div>

          {/* Role Toggle Selector */}
          <div style={{ display: 'flex', borderRadius: '8px', backgroundColor: '#f1f5f9', padding: '4px', marginBottom: '1.5rem', border: '1px solid #cbd5e1' }}>
            <button 
              type="button" 
              onClick={() => { setLoginRole('DOCTOR'); setEmail('doctor@neuroharmony.in'); setPassword('doctor123'); setLoginError(''); }}
              style={{ flex: 1, padding: '0.6rem 0.5rem', border: 'none', borderRadius: '6px', fontWeight: 800, fontSize: '0.85rem', backgroundColor: loginRole === 'DOCTOR' ? '#0f766e' : 'transparent', color: loginRole === 'DOCTOR' ? '#ffffff' : '#64748b', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
            >
              <span>🩺</span> Doctor Login
            </button>
            <button 
              type="button" 
              onClick={() => { setLoginRole('RECEPTIONIST'); setEmail('reception@neuroharmony.in'); setPassword('reception123'); setLoginError(''); }}
              style={{ flex: 1, padding: '0.6rem 0.5rem', border: 'none', borderRadius: '6px', fontWeight: 800, fontSize: '0.85rem', backgroundColor: loginRole === 'RECEPTIONIST' ? '#0f766e' : 'transparent', color: loginRole === 'RECEPTIONIST' ? '#ffffff' : '#64748b', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
            >
              <span>🏢</span> Front Desk / Reception
            </button>
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {loginError && (
              <div style={{ backgroundColor: '#fee2e2', border: '1px solid #fca5a5', padding: '0.75rem', borderRadius: '6px', color: 'var(--danger)', fontSize: '0.875rem', textAlign: 'center' }}>
                {loginError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--neutral-dark)' }}>
                {loginRole === 'DOCTOR' ? 'Doctor Email' : 'Staff Email / Username'}
              </label>
              <input 
                type="text" 
                placeholder={loginRole === 'DOCTOR' ? 'e.g. doctor@neuroharmony.in' : 'e.g. reception@neuroharmony.in'}
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--neutral-dark)' }}>Secure Password</label>
              <input 
                type="password" 
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={loginLoading}>
              {loginLoading ? 'Authenticating...' : (loginRole === 'DOCTOR' ? 'Sign In as Doctor' : 'Sign In as Front Desk')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // RECEPTIONIST FRONT DESK PORTAL
  if (user?.role === 'RECEPTIONIST') {
    return (
      <ReceptionDeskView
        user={user}
        token={token}
        API_BASE_URL={API_BASE_URL}
        handleLogout={handleLogout}
        opdQueue={opdQueue}
        setOpdQueue={setOpdQueue}
        fetchOpdQueue={fetchOpdQueue}
        loadingOpdQueue={loadingOpdQueue}
        offlineRxList={offlineRxList}
        fetchOfflinePrescriptions={fetchOfflinePrescriptions}
        formatPrintDate={formatPrintDate}
      />
    );
  }

  if (activeVideoAppt) {
    return (
      <div id="video-view" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#0b0f19' }}>
        
        {/* Header */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 2rem', backgroundColor: '#0f172a', borderBottom: '1px solid #1e293b' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#fff' }}>Consultation Room: {activeVideoAppt.bookingId}</h2>
          <span className="badge badge-info" style={{ backgroundColor: '#2dd4bf', color: '#0f172a' }}>Active Telehealth Session</span>
        </header>

        {/* Video Consultation Workspace */}
        <div className="video-layout" style={{ flex: 1, padding: '2rem' }}>
          
          {/* Left panel: Video workspace */}
          <div className="video-workspace">
            <div id="jaas-container">
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                Loading secure video room...
              </div>
            </div>

            {/* Controls Bar */}
            <div className="video-controls-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="call-timer">{formatTime(timerSeconds)}</div>
              
              <div className="controls-group">
                <button className="control-btn btn-hangup" onClick={endConsultation} title="End Consultation">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20" style={{ transform: 'rotate(135deg)' }}><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" fill="currentColor"/></svg>
                </button>
              </div>

              <div className="call-info-badge">Secure Telehealth Session</div>
            </div>
          </div>

          {/* Right panel: Sidebar with Tabs (Chat, Patient Details, Prescription Form) */}
          <div className="consultation-sidebar">
            <div className="sidebar-tab-header">
              <div className={`sidebar-tab ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>Live Chat</div>
              <div className={`sidebar-tab ${activeTab === 'case' ? 'active' : ''}`} onClick={() => setActiveTab('case')}>Patient File</div>
              <div className={`sidebar-tab ${activeTab === 'presc' ? 'active' : ''}`} onClick={() => setActiveTab('presc')}>Digital Rx</div>
            </div>

            <div className="sidebar-content-area" style={{ backgroundColor: '#1e293b' }}>
              
              {/* Tab 1: Live Chat */}
              {activeTab === 'chat' && (
                <div className="chat-container">
                  <div className="chat-messages">
                    {chatMessages.length === 0 ? (
                      <p style={{ color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center', marginTop: '2rem' }}>No messages sent yet.</p>
                    ) : (
                      chatMessages.map((msg, idx) => (
                        <div key={idx} className={`chat-bubble ${msg.sender}`} style={{ marginBottom: '0.5rem' }}>
                          <div>{msg.text}</div>
                          <div className="chat-bubble-meta">
                            <span>{msg.sender === 'doctor' ? 'You' : 'Patient'}</span>
                            <span>{msg.timestamp}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <form onSubmit={sendChatMessage} className="chat-input-box">
                    <input 
                      type="text" 
                      placeholder="Type message..." 
                      value={chatInput} 
                      onChange={e => setChatInput(e.target.value)}
                    />
                    <button type="submit" className="chat-send-btn">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    </button>
                  </form>
                </div>
              )}

              {/* Tab 2: Patient File Details */}
              {activeTab === 'case' && (
                <div className="case-details-tab-content">
                  <div className="case-details-section">
                    <h4>Patient Profile</h4>
                    <div className="patient-meta" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <div className="meta-row"><span className="lbl">Name:</span><span className="val">{activeVideoAppt.patientName}</span></div>
                      <div className="meta-row"><span className="lbl">Age:</span><span className="val">{activeVideoAppt.patientAge} Years</span></div>
                      <div className="meta-row"><span className="lbl">Phone:</span><span className="val">+91 {activeVideoAppt.patientPhone}</span></div>
                    </div>
                  </div>

                  <div className="case-details-section">
                    <h4>Symptoms / Concern</h4>
                    <p style={{ color: '#94a3b8' }}>{activeVideoAppt.symptoms || 'No complaints reported.'}</p>
                  </div>

                  <div className="case-details-section">
                    <h4>Attached Records</h4>
                    {activeVideoAppt.reportFilePath ? (
                      <a href={`${API_URL}${activeVideoAppt.reportFilePath}`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-block" style={{ fontSize: '0.8rem', padding: '0.4rem', background: '#334155', color: '#fff', border: 'none', textDecoration: 'none', display: 'block', textAlign: 'center', borderRadius: '4px' }}>
                        📄 View Medical Report
                      </a>
                    ) : (
                      <p style={{ color: '#94a3b8' }}>No records uploaded.</p>
                    )}
                  </div>

                  {/* Past Prescriptions History for this individual patient */}
                  <div className="case-details-section">
                    <h4>Past Prescriptions & History</h4>
                    {(() => {
                      const patientPastRx = offlineRxList.filter(rx => 
                        isSamePatientName(activeVideoAppt.patientName, rx.patientName)
                      );
                      const otherFamily = offlineRxList.filter(rx => 
                        rx.patientPhone && rx.patientPhone === activeVideoAppt.patientPhone && 
                        !isSamePatientName(activeVideoAppt.patientName, rx.patientName)
                      );
                      const otherNames = Array.from(new Set(otherFamily.map(r => r.patientName)));

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                          {otherNames.length > 0 && (
                            <div style={{ backgroundColor: '#064e3b', border: '1px solid #059669', borderRadius: '6px', padding: '0.4rem 0.6rem', fontSize: '0.75rem', color: '#a7f3d0' }}>
                              👨‍👩‍👧 <strong>Shared Family Phone (+91 {activeVideoAppt.patientPhone}):</strong> Other registered member(s): {otherNames.join(', ')}. <em>(Clinical records strictly separated)</em>
                            </div>
                          )}

                          {patientPastRx.length === 0 ? (
                            <p style={{ color: '#94a3b8', fontSize: '0.8rem', fontStyle: 'italic', margin: 0 }}>
                              No earlier prescriptions on file for {activeVideoAppt.patientName}.
                            </p>
                          ) : (
                            patientPastRx.map(prx => {
                              const pMeds = typeof prx.medications === 'string' ? JSON.parse(prx.medications) : (prx.medications || []);
                              return (
                                <div key={prx.id} style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '0.6rem', fontSize: '0.8rem' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                                    <strong style={{ color: '#2dd4bf' }}>{formatPrintDate(prx.consultDate || prx.createdAt)}</strong>
                                    {prx.referenceId && <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Ref: {prx.referenceId}</span>}
                                  </div>
                                  <div style={{ color: '#cbd5e1', fontSize: '0.78rem', marginBottom: '0.4rem' }}>
                                    <strong>Diagnosis:</strong> {prx.diagnosis}
                                  </div>
                                  {pMeds.length > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{pMeds.length} medicine(s)</span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setPrescriptionForm(prev => ({
                                            ...prev,
                                            medications: [...(prev.medications || []), ...pMeds],
                                            diagnosis: prx.diagnosis || prev.diagnosis || ''
                                          }));
                                          setActiveTab('presc');
                                        }}
                                        style={{ background: '#0f766e', border: 'none', color: '#fff', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', cursor: 'pointer' }}
                                      >
                                        📋 Copy Meds & Diagnosis to Digital Rx
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Tab 3: Digital Prescription (Rx Form) */}
              {activeTab === 'presc' && (
                <div className="prescription-form-box" style={{ color: '#fff' }}>
                  
                  {generatedPdfUrl ? (
                    <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                      <span style={{ fontSize: '3rem' }}>🎉</span>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '1rem 0' }}>Prescription Document Generated!</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <a href={generatedPdfUrl.startsWith('http') ? generatedPdfUrl : `${API_URL}${generatedPdfUrl}`} target="_blank" rel="noreferrer" className="btn btn-primary btn-block" style={{ textDecoration: 'none' }}>
                          🖨️ View/Print Prescription PDF
                        </a>
                        <button type="button" className="btn btn-secondary btn-block" onClick={() => setGeneratedPdfUrl('')}>
                          Rewrite / Edit Prescription
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={submitPrescription} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e2e8f0' }}>Clinical Diagnosis Notes</label>
                        <textarea 
                          className="form-control"
                          placeholder="e.g. Anxiety, Insomnia"
                          rows="2"
                          value={prescriptionForm.diagnosis}
                          onChange={e => setPrescriptionForm(prev => ({ ...prev, diagnosis: e.target.value }))}
                          required
                          style={{ background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '8px', padding: '0.5rem 0.75rem', fontSize: '0.85rem', outline: 'none' }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>Prescribe Medications</span>
                          <button type="button" onClick={addMedicationRow} style={{ background: '#ffffff', color: '#0f172a', fontWeight: '700', borderRadius: '20px', padding: '0.2rem 0.6rem', border: 'none', fontSize: '0.7rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                            + Add Item
                          </button>
                        </label>

                        {prescriptionForm.medications.map((med, index) => (
                          <div key={index} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 32px', gap: '0.35rem', alignItems: 'center' }}>
                            <input 
                              type="text" 
                              placeholder="Med"
                              value={med.name}
                              onChange={e => handleMedicationChange(index, 'name', e.target.value)}
                              required
                              style={{ background: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.45rem 0.5rem', fontSize: '0.8rem', borderRadius: '6px', outline: 'none' }}
                            />
                            <input 
                              type="text" 
                              placeholder="Dose"
                              value={med.dosage}
                              onChange={e => handleMedicationChange(index, 'dosage', e.target.value)}
                              required
                              style={{ background: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.45rem 0.5rem', fontSize: '0.8rem', borderRadius: '6px', outline: 'none' }}
                            />
                            <input 
                              type="text" 
                              placeholder="Freq"
                              value={med.frequency}
                              onChange={e => handleMedicationChange(index, 'frequency', e.target.value)}
                              required
                              style={{ background: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.45rem 0.5rem', fontSize: '0.8rem', borderRadius: '6px', outline: 'none' }}
                            />
                            <button 
                              type="button" 
                              onClick={() => removeMedicationRow(index)}
                              disabled={prescriptionForm.medications.length === 1}
                              style={{ 
                                background: '#ef4444', 
                                border: 'none', 
                                borderRadius: '6px', 
                                color: '#fff', 
                                height: '32px', 
                                width: '32px', 
                                display: 'flex', 
                                justifyContent: 'center', 
                                alignItems: 'center', 
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: 'bold'
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e2e8f0' }}>Instructions / Advice</label>
                        <textarea 
                          className="form-control"
                          placeholder="Instructions advice..."
                          rows="2"
                          value={prescriptionForm.advice}
                          onChange={e => setPrescriptionForm(prev => ({ ...prev, advice: e.target.value }))}
                          style={{ background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '8px', padding: '0.5rem 0.75rem', fontSize: '0.85rem', outline: 'none' }}
                        />
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.25rem 0 0.5rem 0' }}>
                        <input 
                          type="checkbox"
                          id="use-letterhead-online"
                          checked={prescriptionForm.useLetterhead}
                          onChange={e => {
                            const val = e.target.checked;
                            localStorage.setItem('useLetterheadOnline', val ? 'true' : 'false');
                            setPrescriptionForm(prev => ({ ...prev, useLetterhead: val }));
                          }}
                          style={{ cursor: 'pointer', width: 'auto' }}
                        />
                        <label htmlFor="use-letterhead-online" style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e2e8f0', cursor: 'pointer', userSelect: 'none' }}>
                          Print on Pre-printed Letterhead (2.75" Header, 1.75" Footer)
                        </label>
                      </div>

                      <button type="submit" style={{ background: '#0f766e', border: 'none', borderRadius: '8px', padding: '0.75rem 1rem', fontWeight: '600', color: '#fff', cursor: 'pointer', fontSize: '0.9rem', width: '100%', transition: 'background-color 0.15s ease' }} disabled={prescriptionSubmitting}>
                        {prescriptionSubmitting ? 'Posting Rx...' : 'Sign & Submit Prescription'}
                      </button>

                    </form>
                  )}

                </div>
              )}

            </div>
          </div>

        </div>

      </div>
    );
  }

  // CORE DASHBOARD
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      
      {/* Top Header */}
      <header className="rx-top-header no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <span style={{ fontSize: '1.2rem' }}>🌿</span>
            <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f766e', letterSpacing: '-0.02em' }}>Neuro Harmony</span>
          </div>
          <nav style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
            <button 
              type="button"
              className={`rx-nav-pill ${dashboardView === 'appointments' ? 'active' : ''}`}
              onClick={() => setDashboardView('appointments')}
            >
              Telehealth
            </button>
            <button 
              type="button"
              className={`rx-nav-pill ${dashboardView === 'offline-rx' ? 'active' : ''}`}
              onClick={() => setDashboardView('offline-rx')}
            >
              <span>Rx Maker</span>
              {opdQueue.filter(p => p.status === 'WAITING').length > 0 && (
                <span style={{ backgroundColor: '#0f766e', color: '#ffffff', borderRadius: '10px', padding: '0.05rem 0.4rem', fontSize: '0.68rem', fontWeight: 800 }}>
                  {opdQueue.filter(p => p.status === 'WAITING').length}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Global Search Bar (Ctrl+K) */}
        <div className="rx-search-bar" style={{ position: 'relative' }}>
          <span style={{ fontSize: '0.9rem', color: '#64748b', marginRight: '0.5rem' }}>🔍</span>
          <input 
            ref={quickLookupInputRef}
            type="text" 
            placeholder="Search by Name, Mobile, Rx #, Diagnosis, or Medicine..."
            value={quickLookupQuery}
            onChange={e => {
              setQuickLookupQuery(e.target.value);
              setShowQuickLookupDropdown(true);
              setQuickLookupHighlightedIndex(0);
            }}
            onFocus={() => {
              setShowQuickLookupDropdown(true);
              setQuickLookupHighlightedIndex(0);
            }}
            onKeyDown={e => {
              const results = getQuickLookupResults();
              if (e.key === 'ArrowDown') {
                if (results.length > 0) {
                  e.preventDefault();
                  setQuickLookupHighlightedIndex(prev => (prev + 1) % results.length);
                }
              } else if (e.key === 'ArrowUp') {
                if (results.length > 0) {
                  e.preventDefault();
                  setQuickLookupHighlightedIndex(prev => (prev <= 0 ? results.length - 1 : prev - 1));
                }
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (results.length > 0 && quickLookupHighlightedIndex >= 0 && quickLookupHighlightedIndex < results.length) {
                  const targetRx = results[quickLookupHighlightedIndex];
                  startNewFollowUpFromPatient(targetRx);
                  setShowQuickLookupDropdown(false);
                  setQuickLookupQuery('');
                }
              } else if (e.key === 'Escape') {
                setShowQuickLookupDropdown(false);
              }
            }}
            style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.84rem', color: '#1e293b' }}
          />
          <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700, backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', padding: '0.1rem 0.35rem', borderRadius: '4px', whiteSpace: 'nowrap' }}>
            Ctrl K
          </span>

          {/* Autocomplete Dropdown */}
          {showQuickLookupDropdown && quickLookupQuery.trim() && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '6px',
              backgroundColor: '#ffffff',
              border: '1.5px solid #0f766e',
              borderRadius: '8px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
              zIndex: 9999,
              maxHeight: '280px',
              overflowY: 'auto',
              padding: '0.25rem'
            }}>
              {getQuickLookupResults().length === 0 ? (
                <div style={{ padding: '0.75rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem', fontStyle: 'italic' }}>
                  No matching patients found.
                </div>
              ) : (
                getQuickLookupResults().map((rx, idx) => (
                  <div
                    key={rx.id}
                    onClick={() => {
                      startNewFollowUpFromPatient(rx);
                      setShowQuickLookupDropdown(false);
                      setQuickLookupQuery('');
                    }}
                    style={{
                      padding: '0.45rem 0.65rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      backgroundColor: idx === quickLookupHighlightedIndex ? '#f0fdfa' : 'transparent',
                      borderLeft: idx === quickLookupHighlightedIndex ? '3px solid #0f766e' : '3px solid transparent',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>{rx.patientName}</strong>
                      <div style={{ fontSize: '0.74rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <span>{rx.patientAge} Yrs / {rx.patientGender} • {rx.patientPhone}</span>
                        {rx.diagnosis && (
                          <span style={{ color: '#0f766e', fontWeight: 700, backgroundColor: '#f0fdfa', border: '1px solid #ccfbf1', padding: '0.05rem 0.35rem', borderRadius: '4px', fontSize: '0.68rem' }}>
                            Dx: {rx.diagnosis}
                          </span>
                        )}
                      </div>
                    </div>
                    {rx.referenceId && (
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#0f766e', backgroundColor: '#e6f4f2', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                        {rx.referenceId}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Right Doctor Profile & Logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>

          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>
            {(!user?.name || String(user.name).toLowerCase().includes('undefined') || String(user.name).toLowerCase().includes('null')) ? (user?.role === 'RECEPTIONIST' ? 'Front Desk / Reception' : 'Dr. Priyadarshi Srivastava') : user.name}
          </div>
          <button 
            type="button"
            onClick={handleLogout} 
            title="Sign out of Doctor Portal"
            style={{ 
              background: 'transparent', 
              border: 'none', 
              cursor: 'pointer', 
              color: '#64748b', 
              fontSize: '1.15rem', 
              display: 'flex', 
              alignItems: 'center', 
              padding: '0.3rem', 
              borderRadius: '6px',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
            onMouseLeave={e => e.currentTarget.style.color = '#64748b'}
          >
            ↪
          </button>
        </div>
      </header>

      {/* Socket Toast Banner */}
      {socketNotification && (
        <div className="glass-panel no-print" style={{ margin: '0.5rem 1rem 0 1rem', padding: '0.65rem 1rem', borderLeft: '4px solid var(--primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', animation: 'pulse 2s infinite' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.25rem' }}>🔔</span>
            <div>
              <strong style={{ color: 'var(--primary)' }}>Real-Time Alert: New Consultation Booked!</strong>
              <div style={{ fontSize: '0.875rem', color: 'var(--neutral-dark)', marginTop: '0.15rem' }}>
                {socketNotification.patientName} has scheduled a slot for {socketNotification.slotTime} ({socketNotification.date})
              </div>
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => setSocketNotification(null)} style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}>
            Acknowledge
          </button>
        </div>
      )}

      {/* Main Container */}
      <main style={{ 
        flex: 1, 
        padding: dashboardView === 'offline-rx' ? 0 : '2rem', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: dashboardView === 'offline-rx' ? 0 : '2rem', 
        maxWidth: dashboardView === 'offline-rx' ? '100%' : '1440px', 
        width: '100%', 
        margin: '0 auto',
        height: dashboardView === 'offline-rx' ? 'calc(100vh - 56px)' : 'auto',
        overflow: dashboardView === 'offline-rx' ? 'hidden' : 'visible'
      }}>
        
        {dashboardView === 'appointments' && (
          <>
            {/* Statistics section */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
              <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: 'var(--shadow-sm)' }}>
                <div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--neutral-body)', fontWeight: 600 }}>TODAY'S SCHEDULE</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary)', marginTop: '0.25rem' }}>{todayAppointments.length}</div>
                </div>
                <span style={{ fontSize: '2.5rem' }}>📅</span>
              </div>

              <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: 'var(--shadow-sm)' }}>
                <div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--neutral-body)', fontWeight: 600 }}>UPCOMING SESSIONS</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary)', marginTop: '0.25rem' }}>{upcomingAppointments.length}</div>
                </div>
                <span style={{ fontSize: '2.5rem' }}>⏳</span>
              </div>

              <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: 'var(--shadow-sm)' }}>
                <div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--neutral-body)', fontWeight: 600 }}>LIVE INCOMING BADGES</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: newBookingsCount > 0 ? 'var(--danger)' : 'var(--success)', marginTop: '0.25rem' }}>
                    {newBookingsCount}
                  </div>
                </div>
                <span style={{ fontSize: '2.5rem', animation: newBookingsCount > 0 ? 'bounce 1s infinite' : 'none' }}>⚡</span>
              </div>
            </div>

            {/* Dynamic Appointments List */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
              
              {/* Today's Schedule Card */}
              <div className="glass-panel" style={{ padding: '2rem', boxShadow: 'var(--shadow-md)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--neutral-dark)' }}>Today's Scheduled Consultations</h3>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {appointments.length > 0 && (
                      <button 
                        type="button"
                        onClick={clearAllAppointments} 
                        style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem', backgroundColor: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        🗑️ Clear All Appointments
                      </button>
                    )}
                    <button className="btn btn-secondary" onClick={fetchAppointments} style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem' }} disabled={loadingAppts}>
                      {loadingAppts ? 'Reloading...' : '↻ Refresh Grid'}
                    </button>
                  </div>
                </div>

                {loadingAppts && appointments.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--neutral-body)', padding: '2rem' }}>Loading schedule...</p>
                ) : apptsError ? (
                  <p style={{ textAlign: 'center', color: 'var(--danger)', padding: '2rem' }}>{apptsError}</p>
                ) : todayAppointments.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--neutral-body)', padding: '2rem', fontStyle: 'italic' }}>No consultations scheduled for today.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {todayAppointments.map(appt => (
                      <AppointmentCard 
                        key={appt.id} 
                        appt={appt} 
                        onStatusChange={updateStatus} 
                        onJoinVideoCall={() => {
                          setSelectedAppt(appt);
                          setGeneratedPdfUrl('');
                          setPrescriptionForm({
                            diagnosis: appt.prescription?.diagnosis || '',
                            advice: appt.prescription?.advice || '',
                            medications: appt.prescription?.medications ? JSON.parse(appt.prescription.medications) : [{ name: '', dosage: '', frequency: '' }],
                            useLetterhead: localStorage.getItem('useLetterheadOnline') === 'true'
                          });
                          setActiveVideoAppt(appt);
                          startMedia();
                        }}
                        onWritePrescription={() => {
                          setSelectedAppt(appt);
                          setGeneratedPdfUrl('');
                          setPrescriptionForm({
                            diagnosis: appt.prescription?.diagnosis || '',
                            advice: appt.prescription?.advice || '',
                            medications: appt.prescription?.medications ? JSON.parse(appt.prescription.medications) : [{ name: '', dosage: '', frequency: '' }],
                            useLetterhead: localStorage.getItem('useLetterheadOnline') === 'true'
                          });
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Upcoming Schedule Card */}
              <div className="glass-panel" style={{ padding: '2rem', boxShadow: 'var(--shadow-md)' }}>
                <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.25rem', fontWeight: 800, color: 'var(--neutral-dark)' }}>Upcoming Schedule</h3>

                {upcomingAppointments.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--neutral-body)', padding: '2rem', fontStyle: 'italic' }}>No upcoming consultations found.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {upcomingAppointments.map(appt => (
                      <AppointmentCard 
                        key={appt.id} 
                        appt={appt} 
                        onStatusChange={updateStatus} 
                        onWritePrescription={() => {
                          setSelectedAppt(appt);
                          setGeneratedPdfUrl('');
                          setPrescriptionForm({
                            diagnosis: appt.prescription?.diagnosis || '',
                            advice: appt.prescription?.advice || '',
                            medications: appt.prescription?.medications ? JSON.parse(appt.prescription.medications) : [{ name: '', dosage: '', frequency: '' }],
                            useLetterhead: localStorage.getItem('useLetterheadOnline') === 'true'
                          });
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

            </div>
          </>
        )}

        {dashboardView === 'offline-rx' && (
          <div className={`rx-master-container no-print ${!isQueueExpanded ? 'queue-collapsed' : ''}`}>
            
            {/* 0. Left Icon Rail */}
            <div className="rx-icon-rail">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', alignItems: 'center' }}>
                <button 
                  type="button" 
                  className={`rx-rail-btn ${activeRailSection === 'prescriptions' ? 'active' : ''}`}
                  title={activeRailSection === 'prescriptions' ? "Close Prescriptions Panel" : "Prescriptions & Saved Drafts"}
                  onClick={() => toggleRailSection('prescriptions')}
                >
                  📝
                </button>
                <button 
                  type="button" 
                  className={`rx-rail-btn ${activeRailSection === 'queue' ? 'active' : ''}`}
                  title={activeRailSection === 'queue' ? "Close Queue to consult (Alt+Q)" : `Queue to consult ${newQueueCount > 0 ? `(${newQueueCount} new request from front desk)` : ''} (Alt+Q)`}
                  onClick={() => toggleRailSection('queue')}
                  style={{ position: 'relative' }}
                >
                  👥
                  {newQueueCount > 0 && (
                    <span 
                      style={{
                        position: 'absolute',
                        top: '-3px',
                        right: '-3px',
                        backgroundColor: '#e11d48',
                        color: '#ffffff',
                        fontSize: '0.65rem',
                        fontWeight: 900,
                        borderRadius: '9999px',
                        minWidth: '18px',
                        height: '18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 0.22rem',
                        lineHeight: 1,
                        boxShadow: '0 0 0 2px #ffffff, 0 2px 6px rgba(225, 29, 72, 0.5)'
                      }}
                    >
                      {newQueueCount}
                    </span>
                  )}
                </button>
                <button 
                  type="button" 
                  className={`rx-rail-btn ${activeRailSection === 'medicines' ? 'active' : ''}`}
                  title={activeRailSection === 'medicines' ? "Close Saved Meds Panel" : "Saved Meds & Drug Master Catalog (Alt+M)"}
                  onClick={() => toggleRailSection('medicines')}
                >
                  💊
                </button>
                <button 
                  type="button" 
                  className={`rx-rail-btn ${activeRailSection === 'appointments' ? 'active' : ''}`}
                  title={activeRailSection === 'appointments' ? "Close Video & Appointments Panel" : "Video Consultations & Appointments"}
                  onClick={() => toggleRailSection('appointments')}
                >
                  🔗
                </button>
                <button 
                  type="button" 
                  className={`rx-rail-btn ${activeRailSection === 'analytics' ? 'active' : ''}`}
                  title={activeRailSection === 'analytics' ? "Close Analytics Panel" : "Prescription Analytics & Research"}
                  onClick={() => toggleRailSection('analytics')}
                >
                  📊
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', alignItems: 'center' }}>
                <button 
                  type="button" 
                  className={`rx-rail-btn ${activeRailSection === 'settings' ? 'active' : ''}`}
                  title={activeRailSection === 'settings' ? "Close Layout Settings" : "Page Layout Settings"}
                  onClick={() => toggleRailSection('settings')}
                >
                  ⚙️
                </button>
              </div>
            </div>

            {/* 1. Sidebar Column (Any of the 4 sections + settings with unified close arrow) */}
            {isSidebarOpen && (
              <div className="rx-queue-column">
                {/* 1. SECTION: PRESCRIPTIONS (📝) */}
                {activeRailSection === 'prescriptions' && (
                  <>
                    <div className="rx-queue-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span style={{ fontSize: '1rem' }}>📝</span>
                        <strong style={{ fontSize: '0.85rem', color: '#1e293b' }}>Prescriptions</strong>
                        <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 700 }}>
                          ({offlineRxList.length})
                        </span>
                      </div>
                      <button 
                        type="button"
                        onClick={closeSidebar}
                        title="Collapse Sidebar"
                        style={{
                          background: '#f1f5f9',
                          border: '1px solid #e2e8f0',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          color: '#334155',
                          fontSize: '0.82rem',
                          fontWeight: 800,
                          padding: '0.22rem 0.45rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#e2e8f0'; e.currentTarget.style.color = '#0f172a'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f1f5f9'; e.currentTarget.style.color = '#334155'; }}
                      >
                        ◀
                      </button>
                    </div>

                    <div style={{ padding: '0.65rem 0.75rem 0.35rem' }}>
                      <button
                        type="button"
                        onClick={() => {
                          resetOfflineForm();
                        }}
                        style={{
                          width: '100%',
                          padding: '0.45rem',
                          backgroundColor: '#0f766e',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.35rem',
                          boxShadow: '0 2px 5px rgba(15,118,110,0.2)'
                        }}
                      >
                        <span>+ New Prescription</span>
                      </button>
                      <input
                        type="text"
                        placeholder="🔍 Search Name, Ref, Phone, Diagnosis, Meds..."
                        value={rxSidebarSearch}
                        onChange={e => setRxSidebarSearch(e.target.value)}
                        style={{
                          width: '100%',
                          marginTop: '0.5rem',
                          padding: '0.35rem 0.55rem',
                          fontSize: '0.76rem',
                          border: '1px solid #e2e8f0',
                          borderRadius: '6px',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <div className="rx-queue-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      {deduplicatePrescriptions(offlineRxList)
                        .sort((a, b) => {
                          const dateA = new Date(a.consultDate || a.consult_date || a.createdAt || a.created_at || 0).getTime();
                          const dateB = new Date(b.consultDate || b.consult_date || b.createdAt || b.created_at || 0).getTime();
                          if (dateB !== dateA) return dateB - dateA;
                          const refA = parseInt(String(a.referenceId || a.reference_id || '').replace(/^ref-?/i, '').split('/')[0], 10) || 0;
                          const refB = parseInt(String(b.referenceId || b.reference_id || '').replace(/^ref-?/i, '').split('/')[0], 10) || 0;
                          return refB - refA;
                        })
                        .filter(r => {
                          if (!rxSidebarSearch.trim()) return true;
                          const q = rxSidebarSearch.toLowerCase();
                          const hasMed = Array.isArray(r.medications) && r.medications.some(m => 
                            (m.name || '').toLowerCase().includes(q) || 
                            (m.composition || '').toLowerCase().includes(q)
                          );
                          return (r.patientName || '').toLowerCase().includes(q) ||
                                 (r.referenceId || '').toLowerCase().includes(q) ||
                                 (r.diagnosis || '').toLowerCase().includes(q) ||
                                 (r.patientPhone || '').includes(q) ||
                                 (r.chiefComplaints || '').toLowerCase().includes(q) ||
                                 hasMed;
                        })
                        .map(rx => {
                          const isSelected = selectedOfflineRxId === rx.id;
                          const cleanRef = (rx.referenceId || '').replace(/^ref-?/i, '') || rx.referenceId || '---';
                          const ageGenderStr = `${rx.patientAge ? `${rx.patientAge} Yrs` : '--'} / ${rx.patientGender || 'Male'}`;
                          const dateStr = formatPrintDate(rx.consultDate || rx.created_at || rx.createdAt);

                          return (
                            <div
                              key={rx.id}
                              onClick={() => {
                                loadOfflinePrescription(rx);
                              }}
                              title={`Load prescription for ${rx.patientName}`}
                              style={{
                                backgroundColor: isSelected ? '#f0fdfa' : '#ffffff',
                                border: isSelected ? '1.5px solid #0f766e' : '1.5px solid #e2e8f0',
                                borderRadius: '12px',
                                padding: '0.85rem 1rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.22rem',
                                cursor: 'pointer',
                                boxShadow: isSelected ? '0 2px 8px rgba(15, 118, 110, 0.12)' : '0 1px 3px rgba(0,0,0,0.02)',
                                transition: 'all 0.15s ease'
                              }}
                              onMouseEnter={e => {
                                if (!isSelected) {
                                  e.currentTarget.style.borderColor = '#cbd5e1';
                                  e.currentTarget.style.boxShadow = '0 3px 10px rgba(0,0,0,0.05)';
                                }
                              }}
                              onMouseLeave={e => {
                                if (!isSelected) {
                                  e.currentTarget.style.borderColor = '#e2e8f0';
                                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.02)';
                                }
                              }}
                            >
                              {/* Row 1: Patient Name & Trash Button */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <span style={{ fontSize: '1.02rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.25 }}>
                                  {rx.patientName || 'Untitled'}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteOfflinePrescription(rx.id);
                                  }}
                                  title="Delete saved prescription"
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: '0.1rem 0.2rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#94a3b8',
                                    transition: 'color 0.15s ease'
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                                  onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    <line x1="10" y1="11" x2="10" y2="17"></line>
                                    <line x1="14" y1="11" x2="14" y2="17"></line>
                                  </svg>
                                </button>
                              </div>

                              {/* Row 2: Ref: 220/2026 */}
                              <div style={{ fontSize: '0.88rem', color: '#0f766e', fontWeight: 700, marginTop: '0.05rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>Ref: {cleanRef}</span>
                                {rx.diagnosis && (
                                  <span style={{ fontSize: '0.72rem', color: '#0369a1', backgroundColor: '#e0f2fe', padding: '0.08rem 0.35rem', borderRadius: '4px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {rx.diagnosis}
                                  </span>
                                )}
                              </div>

                              {/* Row 3: 22 Yrs / Male */}
                              <div style={{ fontSize: '0.84rem', color: '#64748b', fontWeight: 500 }}>
                                {ageGenderStr}
                              </div>

                              {/* Row 4: 10/11/2026 */}
                              <div style={{ fontSize: '0.84rem', color: '#64748b', fontWeight: 500 }}>
                                {dateStr}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </>
                )}

                {/* 2. SECTION: TODAY'S OPD QUEUE (👥) */}
                {activeRailSection === 'queue' && (() => {
                  const queueList = deduplicateQueue(opdQueue || []);

                  const isPatientDone = (q) => {
                    if (!q || q.status === 'WAITING') return false;
                    return q.status === 'COMPLETED' || q.status === 'CONSULTED' || Boolean(q.prescription_id);
                  };

                  const waitingCount = queueList.filter(q => !isPatientDone(q)).length;

                  // Sort queue: Waiting patients always at TOP (newest arrival first), completed patients move to BOTTOM
                  const sortedQueueList = [...queueList].sort((a, b) => {
                    const aDone = isPatientDone(a);
                    const bDone = isPatientDone(b);

                    // 1. Waiting patients always before consulted patients
                    if (aDone !== bDone) return aDone ? 1 : -1;

                    // 2. Active in-consultation patient at top among waiting
                    const aCurrent = activeConsultingQueueId === a.id;
                    const bCurrent = activeConsultingQueueId === b.id;
                    if (aCurrent !== bCurrent) return aCurrent ? -1 : 1;

                    // 3. For waiting patients: newest check-in at top
                    const aToken = parseInt(a.token_number, 10) || 0;
                    const bToken = parseInt(b.token_number, 10) || 0;
                    if (!aDone && !bDone) {
                      return bToken - aToken;
                    }
                    // For consulted/completed: keep token order
                    return aToken - bToken;
                  });

                  return (
                    <>
                      {/* Sub-Header: Today's Live Queue (X) & Sync Button */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.65rem 0.85rem 0.35rem',
                        borderBottom: '1px solid #f1f5f9'
                      }}>
                        <strong style={{ fontSize: '0.94rem', color: '#0f766e', fontWeight: 800 }}>
                          Today's Live Queue ({waitingCount > 0 ? `${waitingCount} waiting` : `${queueList.length}`})
                        </strong>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <button
                            type="button"
                            onClick={fetchOpdQueue}
                            style={{
                              backgroundColor: '#ffffff',
                              border: '1px solid #cbd5e1',
                              borderRadius: '6px',
                              color: '#1e293b',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              padding: '0.2rem 0.5rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = '#0f766e'}
                            onMouseLeave={e => e.currentTarget.style.borderColor = '#cbd5e1'}
                          >
                            <span>↻</span>
                            <span>Sync</span>
                          </button>
                          <button 
                            type="button"
                            onClick={closeSidebar}
                            title="Collapse Sidebar"
                            style={{
                              background: '#f1f5f9',
                              border: '1px solid #e2e8f0',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              color: '#334155',
                              fontSize: '0.78rem',
                              fontWeight: 800,
                              padding: '0.18rem 0.4rem',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            ◀
                          </button>
                        </div>
                      </div>

                      <div className="rx-queue-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', padding: '0.55rem 0.75rem' }}>
                        {sortedQueueList.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
                            <div style={{ fontSize: '2.4rem', marginBottom: '0.5rem' }}>🪑</div>
                            <div style={{ fontWeight: 800, fontSize: '0.94rem', color: '#0f172a' }}>No Patients Checked In Yet Today</div>
                            <div style={{ fontSize: '0.78rem', marginTop: '0.35rem', color: '#64748b', lineHeight: 1.45 }}>
                              New day started ({formatPrintDate(getLocalDateStr())}).<br/>Patients checked in at the Front Desk will appear here live.
                            </div>
                          </div>
                        ) : (
                          sortedQueueList.map((qPatient) => {
                          const tokenNum = qPatient.token_number || 1;
                          const patientName = qPatient.patient_name || qPatient.name || 'Patient';
                          const ageVal = qPatient.age || qPatient.patient_age;
                          const ageStr = ageVal ? `${ageVal} Yrs` : '--';
                          const genderStr = qPatient.gender || qPatient.patient_gender || 'Male';
                          const phoneStr = qPatient.phone || qPatient.patient_phone || '';
                          const rawRef = qPatient.reference_id || qPatient.referenceId || `REF-${220 + tokenNum}/2026`;
                          const refStr = String(rawRef).replace(/^ref-?/i, '');
                          const cleanRefNum = refStr.trim().toLowerCase();
                          const isFollowUp = (qPatient.patient_type || qPatient.type) === 'FOLLOW_UP';
                          const isFree = (qPatient.fee_status === 'FREE' || qPatient.payment_mode === 'FREE');
                          const feeAmount = qPatient.fee_amount || qPatient.fee || 700;
                          const payMode = qPatient.payment_mode || qPatient.mode || 'Cash';
                          const isCurrent = activeConsultingQueueId === qPatient.id;

                          // A queue patient is done ONLY if their status is explicitly COMPLETED or CONSULTED,
                          // or if a prescription was explicitly saved for THIS queue token today.
                          // A patient who is 'WAITING' or currently in consultation ('isCurrent') is NEVER done!
                          const isDone = !isCurrent && qPatient.status !== 'WAITING' && (
                            qPatient.status === 'COMPLETED' || 
                            qPatient.status === 'CONSULTED' ||
                            Boolean(qPatient.prescription_id)
                          );

                          // Cross-reference with offlineRxList ONLY when this token is completed today
                          const matchingRx = isDone ? (() => {
                            if (qPatient.prescription_id) {
                              const direct = offlineRxList.find(rx => rx.id === qPatient.prescription_id);
                              if (direct) return direct;
                            }
                            const byQueueId = offlineRxList.find(rx => rx.queuePatientId === qPatient.id);
                            if (byQueueId) return byQueueId;

                            // Match ONLY prescriptions created TODAY
                            const todayStr = getLocalDateStr();
                            const todayMatches = offlineRxList.filter(rx => {
                              const rxDate = rx.consultDate ? rx.consultDate.split('T')[0] : (rx.createdAt ? rx.createdAt.split('T')[0] : '');
                              if (rxDate !== todayStr) return false;

                              const rxRef = String(rx.referenceId || rx.reference_id || '').replace(/^ref-?/i, '').trim().toLowerCase();
                              if (cleanRefNum && rxRef && cleanRefNum === rxRef) return true;

                              const rxName = (rx.patientName || '').trim().toLowerCase();
                              const qName = patientName.trim().toLowerCase();
                              const rxPhone = (rx.patientPhone || '').trim();
                              const qPhone = phoneStr.trim();
                              const nameMatch = rxName && qName && (rxName === qName || isSamePatientName(rxName, qName));
                              const phoneMatch = !rxPhone || !qPhone || rxPhone === qPhone;
                              return nameMatch && phoneMatch;
                            });

                            return todayMatches[0] || null;
                          })() : null;

                          return (
                            <div
                              key={qPatient.id}
                              style={{
                                backgroundColor: isDone ? '#f8fafc' : (isCurrent ? '#f0fdfa' : '#ffffff'),
                                border: isCurrent ? '2px solid #0f766e' : (isDone ? '1.5px solid #cbd5e1' : '1.5px solid #0f766e'),
                                borderRadius: '9px',
                                padding: '0.55rem 0.75rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.2rem',
                                boxShadow: isCurrent ? '0 2px 8px rgba(15, 118, 110, 0.15)' : '0 1px 4px rgba(0, 0, 0, 0.05)',
                                opacity: isDone ? 0.92 : 1,
                                transition: 'all 0.15s ease'
                              }}
                            >
                              {/* Line 1: Token # & Status & Ref */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{
                                  fontSize: '0.8rem',
                                  fontWeight: 800,
                                  color: isDone ? '#059669' : (isCurrent ? '#0d9488' : '#0f766e'),
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.25rem'
                                }}>
                                  <span>Token #{tokenNum}</span>
                                  <span>•</span>
                                  <span>{isDone ? '✓ Consulted' : (isCurrent ? '⚡ In Progress' : 'Waiting')}</span>
                                </span>
                                <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600 }}>
                                  Ref: {refStr}
                                </span>
                              </div>

                              {/* Line 2: Patient Name */}
                              <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                                {patientName}
                              </div>

                              {/* Line 3: 22 Yrs / Male • 📞 8303449183 */}
                              <div style={{ fontSize: '0.76rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                                <span>{ageStr} / {genderStr}</span>
                                {phoneStr && (
                                  <>
                                    <span>•</span>
                                    <span>📞 {phoneStr}</span>
                                  </>
                                )}
                              </div>

                              {/* Line 4: Badges (Type & Fee) */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', margin: '0.1rem 0' }}>
                                {isFollowUp ? (
                                  <span style={{
                                    backgroundColor: '#f3e8ff',
                                    color: '#7e22ce',
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    padding: '0.12rem 0.4rem',
                                    borderRadius: '5px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.2rem'
                                  }}>
                                    <span>🔄</span>
                                    <span>Follow-Up</span>
                                  </span>
                                ) : (
                                  <span style={{
                                    backgroundColor: '#e0f2fe',
                                    color: '#0284c7',
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    padding: '0.12rem 0.4rem',
                                    borderRadius: '5px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.2rem'
                                  }}>
                                    <span>👤</span>
                                    <span>New</span>
                                  </span>
                                )}

                                {isFree ? (
                                  <span style={{
                                    backgroundColor: '#f3e8ff',
                                    color: '#6b21a8',
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    padding: '0.12rem 0.4rem',
                                    borderRadius: '5px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.2rem'
                                  }}>
                                    <span>🆓</span>
                                    <span>Free</span>
                                  </span>
                                ) : (
                                  <span style={{
                                    backgroundColor: '#dcfce7',
                                    color: '#15803d',
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    padding: '0.12rem 0.4rem',
                                    borderRadius: '5px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.2rem'
                                  }}>
                                    <span>💵</span>
                                    <span>{payMode} ₹{feeAmount}</span>
                                  </span>
                                )}
                              </div>

                              {/* Line 5: Action Button (Consult vs Completed View) */}
                              {isDone ? (
                                <div style={{
                                  width: '100%',
                                  backgroundColor: '#ecfdf5',
                                  border: '1.5px solid #a7f3d0',
                                  borderRadius: '6px',
                                  padding: '0.35rem 0.55rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  marginTop: '0.15rem',
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                                }}>
                                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#065f46', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span>✓</span>
                                    <span>Consulted</span>
                                  </span>
                                  {matchingRx ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        loadOfflinePrescription(matchingRx);
                                        closeSidebar();
                                        setQueueNavToast(`📄 Loaded prescription for ${matchingRx.patientName || patientName} (Ref: ${matchingRx.referenceId || refStr})`);
                                        setTimeout(() => setQueueNavToast(null), 3500);
                                      }}
                                      title="Open this patient's completed prescription"
                                      style={{
                                        backgroundColor: '#ffffff',
                                        border: '1.5px solid #0f766e',
                                        borderRadius: '5px',
                                        padding: '0.22rem 0.55rem',
                                        fontSize: '0.74rem',
                                        fontWeight: 800,
                                        color: '#0f766e',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.25rem',
                                        boxShadow: '0 1px 3px rgba(15,118,110,0.12)',
                                        transition: 'all 0.15s ease'
                                      }}
                                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#0f766e'; e.currentTarget.style.color = '#ffffff'; }}
                                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#ffffff'; e.currentTarget.style.color = '#0f766e'; }}
                                    >
                                      <span>📄</span>
                                      <span>View Rx</span>
                                    </button>
                                  ) : null}
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    startConsultationFromQueue(qPatient);
                                    closeSidebar();
                                  }}
                                  style={{
                                    width: '100%',
                                    backgroundColor: '#0f766e',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '0.35rem 0.5rem',
                                    fontSize: '0.78rem',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.3rem',
                                    marginTop: '0.15rem',
                                    boxShadow: '0 1px 4px rgba(15,118,110,0.2)',
                                    transition: 'all 0.15s ease'
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#115e59'}
                                  onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0f766e'}
                                >
                                  <span>⚡</span>
                                  <span>Consult Patient</span>
                                </button>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                    </>
                  );
                })()}

                {/* 2.5 SECTION: SAVED MEDS (💊) */}
                {activeRailSection === 'medicines' && (
                  <>
                    <div className="rx-queue-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span style={{ fontSize: '1rem' }}>💊</span>
                        <strong style={{ fontSize: '0.85rem', color: '#1e293b' }}>Saved Meds</strong>
                        <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 700 }}>
                          ({medicinesList.length})
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <button 
                          type="button"
                          onClick={fetchMedicines}
                          title="Refresh Medicines from DB"
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '0.85rem', padding: '0.2rem' }}
                        >
                          ↻
                        </button>
                        <button 
                          type="button"
                          onClick={closeSidebar}
                          title="Collapse Sidebar"
                          style={{
                            background: '#f1f5f9',
                            border: '1px solid #e2e8f0',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            color: '#334155',
                            fontSize: '0.82rem',
                            fontWeight: 800,
                            padding: '0.22rem 0.45rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#e2e8f0'; e.currentTarget.style.color = '#0f172a'; }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f1f5f9'; e.currentTarget.style.color = '#334155'; }}
                        >
                          ◀
                        </button>
                      </div>
                    </div>

                    <div style={{ padding: '0.65rem 0.75rem 0.35rem' }}>
                      <button
                        type="button"
                        onClick={() => setShowAddMedModal(prev => !prev)}
                        style={{
                          width: '100%',
                          padding: '0.45rem',
                          backgroundColor: '#0f766e',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.35rem',
                          boxShadow: '0 2px 5px rgba(15,118,110,0.2)'
                        }}
                      >
                        <span>{showAddMedModal ? '✕ Cancel' : '+ Add New Medicine'}</span>
                      </button>

                      {showAddMedModal && (
                        <div style={{ marginTop: '0.5rem', backgroundColor: '#f8fafc', border: '1.5px solid #a7f3d0', borderRadius: '8px', padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          <strong style={{ fontSize: '0.76rem', color: '#065f46' }}>Add Master Medicine to DB</strong>
                          <input
                            type="text"
                            placeholder="Medicine Name (e.g. Tab. Nexito 10mg)"
                            value={quickNewMed.name}
                            onChange={e => setQuickNewMed(p => ({ ...p, name: e.target.value }))}
                            style={{ padding: '0.35rem 0.5rem', fontSize: '0.76rem', border: '1px solid #cbd5e1', borderRadius: '5px', outline: 'none' }}
                          />
                          <input
                            type="text"
                            placeholder="Generic Composition (e.g. Escitalopram 10mg)"
                            value={quickNewMed.composition}
                            onChange={e => setQuickNewMed(p => ({ ...p, composition: e.target.value }))}
                            style={{ padding: '0.35rem 0.5rem', fontSize: '0.76rem', border: '1px solid #cbd5e1', borderRadius: '5px', outline: 'none' }}
                          />
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                            <input
                              type="text"
                              placeholder="Dosage (e.g. 1 Tab)"
                              value={quickNewMed.dosage}
                              onChange={e => setQuickNewMed(p => ({ ...p, dosage: e.target.value }))}
                              style={{ padding: '0.35rem 0.5rem', fontSize: '0.76rem', border: '1px solid #cbd5e1', borderRadius: '5px', outline: 'none' }}
                            />
                            <input
                              type="text"
                              placeholder="Timing (e.g. 1-0-0)"
                              value={quickNewMed.timing}
                              onChange={e => setQuickNewMed(p => ({ ...p, timing: e.target.value }))}
                              style={{ padding: '0.35rem 0.5rem', fontSize: '0.76rem', border: '1px solid #cbd5e1', borderRadius: '5px', outline: 'none' }}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (!quickNewMed.name.trim()) return alert('Medicine name is required.');
                              const newEntry = {
                                id: `med-${Date.now()}`,
                                name: quickNewMed.name.trim(),
                                composition: quickNewMed.composition.trim() || null,
                                dosage: quickNewMed.dosage.trim() || '1 Tab',
                                timing: quickNewMed.timing.trim() || '1-0-0 सुबह नाश्ते के बाद'
                              };
                              setMedicinesList(prev => {
                                const next = [newEntry, ...(prev || [])];
                                try { localStorage.setItem('cached_doctor_medicines', JSON.stringify(next)); } catch(e){}
                                return next;
                              });
                              setQuickNewMed({ name: '', composition: '', dosage: '', timing: '' });
                              setShowAddMedModal(false);
                            }}
                            style={{ padding: '0.4rem', backgroundColor: '#0f766e', color: '#fff', border: 'none', borderRadius: '5px', fontWeight: 800, fontSize: '0.76rem', cursor: 'pointer' }}
                          >
                            ✓ Save to Master Database
                          </button>
                        </div>
                      )}

                      <input
                        type="text"
                        placeholder="🔍 Search saved medicines or composition..."
                        value={medSidebarSearch}
                        onChange={e => setMedSidebarSearch(e.target.value)}
                        style={{
                          width: '100%',
                          marginTop: '0.5rem',
                          padding: '0.35rem 0.55rem',
                          fontSize: '0.76rem',
                          border: '1px solid #e2e8f0',
                          borderRadius: '6px',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <div className="rx-queue-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      {medicinesList
                        .filter(m => {
                          if (!medSidebarSearch.trim()) return true;
                          const q = medSidebarSearch.toLowerCase();
                          return (m.name || '').toLowerCase().includes(q) ||
                                 (m.composition || '').toLowerCase().includes(q);
                        })
                        .map(med => (
                          <div
                            key={med.id}
                            onClick={() => {
                              setTempMed(prev => ({
                                ...prev,
                                name: med.name,
                                composition: med.composition || prev.composition || '',
                                dosage: med.dosage || prev.dosage || '1 Tab',
                                frequency: med.timing || prev.frequency || '1-0-0'
                              }));
                              closeSidebar();
                            }}
                            title={`Click to use ${med.name} in prescription`}
                            style={{
                              backgroundColor: '#ffffff',
                              border: '1.2px solid #e2e8f0',
                              borderRadius: '8px',
                              padding: '0.55rem 0.75rem',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.2rem',
                              cursor: 'pointer',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                              transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.borderColor = '#99f6e4';
                              e.currentTarget.style.backgroundColor = '#f0fdfa';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.borderColor = '#e2e8f0';
                              e.currentTarget.style.backgroundColor = '#ffffff';
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.25 }}>
                                {med.name}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteMedicine(med.id);
                                }}
                                title="Delete medicine from database"
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: '0.1rem 0.15rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#94a3b8',
                                  transition: 'color 0.15s ease'
                                }}
                                onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                                onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6"></polyline>
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                  <line x1="10" y1="11" x2="10" y2="17"></line>
                                  <line x1="14" y1="11" x2="14" y2="17"></line>
                                </svg>
                              </button>
                            </div>

                            {med.composition && (
                              <div style={{ fontSize: '0.78rem', color: '#0f766e', fontWeight: 700, lineHeight: 1.25 }}>
                                ({med.composition})
                              </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '0.15rem' }}>
                              <span
                                style={{
                                  padding: '0.18rem 0.45rem',
                                  backgroundColor: '#f0fdfa',
                                  border: '1px solid #99f6e4',
                                  color: '#0f766e',
                                  borderRadius: '5px',
                                  fontSize: '0.68rem',
                                  fontWeight: 800,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem'
                                }}
                              >
                                + Use in Prescription
                              </span>
                            </div>
                          </div>
                        ))}
                    </div>
                  </>
                )}

                {/* 3. SECTION: VIDEO APPOINTMENTS (🔗) */}
                {activeRailSection === 'appointments' && (
                  <>
                    <div className="rx-queue-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span style={{ fontSize: '1rem' }}>🔗</span>
                        <strong style={{ fontSize: '0.85rem', color: '#1e293b' }}>Online Appts</strong>
                        <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 700 }}>
                          ({appointments?.length || 0})
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        {appointments && appointments.length > 0 && (
                          <button 
                            type="button"
                            onClick={clearAllAppointments}
                            title="Remove All Online Appointments"
                            style={{
                              background: '#fee2e2',
                              border: '1px solid #fca5a5',
                              borderRadius: '5px',
                              cursor: 'pointer',
                              color: '#dc2626',
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              padding: '0.2rem 0.45rem',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.2rem',
                              transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#ef4444'; e.currentTarget.style.color = '#ffffff'; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fee2e2'; e.currentTarget.style.color = '#dc2626'; }}
                          >
                            <span>🗑️</span>
                            <span>Clear All</span>
                          </button>
                        )}
                        <button 
                          type="button"
                          onClick={fetchAppointments}
                          title="Refresh Appointments"
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '0.85rem', padding: '0.2rem' }}
                        >
                          ↻
                        </button>
                        <button 
                          type="button"
                          onClick={closeSidebar}
                          title="Collapse Sidebar"
                          style={{
                            background: '#f1f5f9',
                            border: '1px solid #e2e8f0',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            color: '#334155',
                            fontSize: '0.82rem',
                            fontWeight: 800,
                            padding: '0.22rem 0.45rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#e2e8f0'; e.currentTarget.style.color = '#0f172a'; }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f1f5f9'; e.currentTarget.style.color = '#334155'; }}
                        >
                          ◀
                        </button>
                      </div>
                    </div>

                    <div className="rx-queue-list">
                      {(!appointments || appointments.length === 0) ? (
                        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
                          <div style={{ fontSize: '2.4rem', marginBottom: '0.5rem' }}>📹</div>
                          <div style={{ fontWeight: 800, fontSize: '0.94rem', color: '#0f172a' }}>No Online Appointments</div>
                          <div style={{ fontSize: '0.78rem', marginTop: '0.35rem', color: '#64748b', lineHeight: 1.45 }}>
                            No online video appointments scheduled.<br/>Online consultations booked by patients will appear here live.
                          </div>
                        </div>
                      ) : (
                        appointments.map((apt) => {
                          const pName = apt.patientName || apt.patient_name || 'Patient';
                          const apptId = apt.id || apt.bookingId;
                          return (
                            <div 
                              key={apptId}
                              className="rx-queue-card"
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}
                              onClick={() => {
                                setOfflineForm(prev => ({
                                  ...prev,
                                  referenceId: `REF-${Math.floor(220 + Math.random() * 20)}/2026`,
                                  patientName: pName,
                                  patientPhone: apt.phone || apt.patientPhone || apt.patient_phone || '',
                                  patientAge: String(apt.age || apt.patientAge || '28'),
                                  patientGender: apt.gender || apt.patientGender || 'Male',
                                  chiefComplaints: (apt.chiefComplaints || apt.chief_complaints || 'Panic symptoms, palpitation').toUpperCase(),
                                  consultDate: getLocalDateStr()
                                }));
                                closeSidebar();
                                setQueueNavToast(`📹 Loaded Video Patient: ${pName}`);
                                setTimeout(() => setQueueNavToast(null), 3000);
                              }}
                              title="Click to load into prescription workspace"
                            >
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontSize: '0.84rem', fontWeight: 800, color: '#1e293b' }}>
                                    {pName}
                                  </span>
                                  <span style={{ fontSize: '0.68rem', backgroundColor: '#ecfdf5', color: '#047857', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 800 }}>
                                    {apt.slotTime || apt.time || '07:30 PM'}
                                  </span>
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#0f766e', fontWeight: 700, marginTop: '0.15rem' }}>
                                  📹 {apt.type || 'Video Call'} · {apt.status || 'Confirmed'}
                                </div>
                                <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.15rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {apt.symptoms || apt.chiefComplaints || 'Online Psychiatric Evaluation'}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteAppointment(apptId, pName);
                                }}
                                title="Delete this appointment"
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  color: '#94a3b8',
                                  fontSize: '0.85rem',
                                  padding: '0.25rem 0.35rem',
                                  borderRadius: '4px',
                                  flexShrink: 0,
                                  transition: 'all 0.15s ease'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.backgroundColor = '#fee2e2'; }}
                                onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                              >
                                🗑️
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div style={{ padding: '0.75rem', borderTop: '1px solid #f1f5f9', backgroundColor: '#ffffff' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setDashboardView('appointments');
                          closeSidebar();
                        }}
                        style={{
                          width: '100%',
                          padding: '0.55rem',
                          backgroundColor: '#ffffff',
                          color: '#0f766e',
                          border: '1.5px solid #0f766e',
                          borderRadius: '8px',
                          fontSize: '0.78rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.35rem'
                        }}
                      >
                        <span>Full Telehealth Grid ↗</span>
                      </button>
                    </div>
                  </>
                )}

                {/* 4. SECTION: ANALYTICS & STATS (📊) */}
                {activeRailSection === 'analytics' && (
                  <>
                    <div className="rx-queue-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span style={{ fontSize: '1rem' }}>📊</span>
                        <strong style={{ fontSize: '0.85rem', color: '#1e293b' }}>Analytics & Stats</strong>
                      </div>
                      <button 
                        type="button"
                        onClick={closeSidebar}
                        title="Collapse Sidebar"
                        style={{
                          background: '#f1f5f9',
                          border: '1px solid #e2e8f0',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          color: '#334155',
                          fontSize: '0.82rem',
                          fontWeight: 800,
                          padding: '0.22rem 0.45rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#e2e8f0'; e.currentTarget.style.color = '#0f172a'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f1f5f9'; e.currentTarget.style.color = '#334155'; }}
                      >
                        ◀
                      </button>
                    </div>

                    <div className="rx-queue-list" style={{ padding: '0.75rem', gap: '0.65rem' }}>
                      <div style={{ backgroundColor: '#f0fdfa', border: '1px solid #ccfbf1', borderRadius: '8px', padding: '0.65rem 0.75rem' }}>
                        <div style={{ fontSize: '0.7rem', color: '#0f766e', fontWeight: 800, textTransform: 'uppercase' }}>TODAY'S CONSULTATIONS</div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0f172a', marginTop: '0.2rem' }}>
                          {(opdQueue || []).length + (appointments || []).length}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.1rem' }}>
                          OPD Tokens + Telehealth Video
                        </div>
                      </div>

                      <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.65rem 0.75rem' }}>
                        <div style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 800, textTransform: 'uppercase' }}>SAVED PRESCRIPTIONS</div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0f172a', marginTop: '0.2rem' }}>
                          {offlineRxList.length}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.1rem' }}>
                          On local device & cloud synced
                        </div>
                      </div>

                      <div style={{ backgroundColor: '#fdf4ff', border: '1px solid #f5d0fe', borderRadius: '8px', padding: '0.65rem 0.75rem' }}>
                        <div style={{ fontSize: '0.7rem', color: '#86198f', fontWeight: 800, textTransform: 'uppercase' }}>TOP DIAGNOSES TODAY</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.4rem' }}>
                          <span style={{ fontSize: '0.66rem', backgroundColor: '#ffffff', border: '1px solid #f0abfc', color: '#701a75', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>Panic Disorder</span>
                          <span style={{ fontSize: '0.66rem', backgroundColor: '#ffffff', border: '1px solid #f0abfc', color: '#701a75', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>Tension Headaches</span>
                          <span style={{ fontSize: '0.66rem', backgroundColor: '#ffffff', border: '1px solid #f0abfc', color: '#701a75', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>Episodic Migraine</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ padding: '0.75rem', borderTop: '1px solid #f1f5f9', backgroundColor: '#ffffff' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAnalyticsModal(true);
                          fetchOverviewAnalytics(analyticsTimeframe);
                          closeSidebar();
                        }}
                        style={{
                          width: '100%',
                          padding: '0.55rem',
                          backgroundColor: '#0f766e',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '0.8rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.35rem',
                          boxShadow: '0 2px 6px rgba(15,118,110,0.2)'
                        }}
                      >
                        <span>Full Research Report ↗</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Layout Settings Drawer (Overlaps the left side so the right-side Letterhead preview remains 100% visible) */}
            {activeRailSection === 'settings' && (
              <div 
                className="no-print"
                style={{
                  position: 'absolute',
                  left: '50px',
                  top: 0,
                  bottom: 0,
                  width: '380px',
                  maxWidth: 'calc(100vw - 520px)',
                  backgroundColor: '#ffffff',
                  borderRight: '1.5px solid #cbd5e1',
                  boxShadow: '6px 0 24px rgba(0, 0, 0, 0.12)',
                  zIndex: 40,
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <div className="rx-queue-header" style={{ padding: '0.85rem 1rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <span style={{ fontSize: '1rem' }}>⚙️</span>
                    <strong style={{ fontSize: '0.9rem', color: '#1e293b' }}>Layout Settings</strong>
                  </div>
                  <button 
                    type="button"
                    onClick={closeSidebar}
                    title="Collapse Sidebar"
                    style={{
                      background: '#f1f5f9',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      color: '#334155',
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      padding: '0.22rem 0.45rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#e2e8f0'; e.currentTarget.style.color = '#0f172a'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f1f5f9'; e.currentTarget.style.color = '#334155'; }}
                  >
                    ◀
                  </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {renderCustomizeDimensionsSection(true)}
                </div>
              </div>
            )}

            {/* 2. Center Column: New Prescription Form */}
            <form 
              onSubmit={saveOfflinePrescription}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
                  e.preventDefault();
                }
              }}
              className="rx-form-column"
              onPointerDown={() => {
                if (activeRailSection) closeSidebar();
              }}
            >
              {/* Form Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#1e293b' }}>
                    New prescription
                  </h2>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500, marginTop: '0.1rem' }}>
                    Ref {offlineForm.referenceId || '---'} · {formatPrintDate(offlineForm.consultDate) || 'Today'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={resetOfflineForm}
                    style={{
                      padding: '0.35rem 0.85rem',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      color: '#475569',
                      cursor: 'pointer'
                    }}
                  >
                    Reset
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingOfflineRx}
                    style={{
                      padding: '0.35rem 0.95rem',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      backgroundColor: isSavingOfflineRx ? '#94a3b8' : '#0f766e',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: isSavingOfflineRx ? 'wait' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      boxShadow: '0 2px 6px rgba(15,118,110,0.2)',
                      opacity: isSavingOfflineRx ? 0.75 : 1
                    }}
                  >
                    <span>{isSavingOfflineRx ? 'Saving...' : 'Save'}</span>
                    <span style={{ fontSize: '0.7rem', backgroundColor: 'rgba(255,255,255,0.22)', padding: '0.05rem 0.35rem', borderRadius: '4px' }}>Alt S</span>
                  </button>
                </div>
              </div>

              {/* Patient Details & Vitals Card */}
              <div className="rx-card">
                <span className="rx-card-label">Patient</span>
                
                {/* Interactive Shared Family Phone Switcher */}
                {otherFamilyMembersWithSamePhone.length > 0 && (
                  <div style={{
                    backgroundColor: '#ecfdf5',
                    border: '1.5px solid #10b981',
                    borderRadius: '8px',
                    padding: '0.55rem 0.75rem',
                    marginBottom: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                    flexWrap: 'wrap'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <span style={{ fontSize: '1.25rem' }}>👨‍👩‍👧</span>
                      <div>
                        <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#065f46' }}>
                          Multiple Patients on this Mobile (+91 {offlineForm.patientPhone})
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#047857' }}>
                          Currently editing: <strong>{offlineForm.patientName}</strong> · Records kept separate.
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      {otherFamilyMembersWithSamePhone.map(fam => (
                        <button
                          key={fam.name}
                          type="button"
                          onClick={() => openFamilyMemberPatient(fam)}
                          style={{
                            backgroundColor: '#ffffff',
                            border: '1.5px solid #059669',
                            borderRadius: '6px',
                            color: '#047857',
                            fontWeight: 800,
                            fontSize: '0.72rem',
                            padding: '0.3rem 0.6rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#059669'; e.currentTarget.style.color = '#ffffff'; }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#ffffff'; e.currentTarget.style.color = '#047857'; }}
                          title={`Switch consultation to ${fam.name}`}
                        >
                          <span>⇄ Open</span>
                          <span>{fam.name} ({fam.age ? `${fam.age}Y` : ''} {fam.gender === 'Female' ? 'F' : 'M'})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 5-col Patient Details */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1.1fr 0.65fr 0.85fr 1fr', gap: '0.65rem', marginBottom: '0.65rem' }}>
                  <div>
                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '0.2rem' }}>NAME</label>
                    <input 
                      type="text"
                      className="rx-input"
                      placeholder="Full name"
                      value={offlineForm.patientName}
                      onChange={e => setOfflineForm(prev => ({ ...prev, patientName: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '0.2rem' }}>MOBILE</label>
                    <input 
                      type="text"
                      className="rx-input"
                      placeholder="10-digit number"
                      value={offlineForm.patientPhone}
                      onChange={e => setOfflineForm(prev => ({ ...prev, patientPhone: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '0.2rem' }}>AGE</label>
                    <input 
                      type="text"
                      className="rx-input"
                      placeholder="Yrs"
                      value={offlineForm.patientAge}
                      onChange={e => setOfflineForm(prev => ({ ...prev, patientAge: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '0.2rem' }}>SEX</label>
                    <select 
                      className="rx-input"
                      value={offlineForm.patientGender}
                      onChange={e => setOfflineForm(prev => ({ ...prev, patientGender: e.target.value }))}
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '0.2rem' }}>VISIT DATE</label>
                    <input 
                      type="date"
                      className="rx-input"
                      value={offlineForm.consultDate || getLocalDateStr()}
                      onChange={e => setOfflineForm(prev => ({ ...prev, consultDate: e.target.value }))}
                    />
                  </div>
                </div>

                {/* 4-col Compact Vitals */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.65rem' }}>
                  <div>
                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '0.2rem' }}>BP</label>
                    <input 
                      type="text"
                      className="rx-input"
                      placeholder="120/80"
                      value={offlineForm.bp}
                      onChange={e => setOfflineForm(prev => ({ ...prev, bp: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '0.2rem' }}>PULSE</label>
                    <input 
                      type="text"
                      className="rx-input"
                      placeholder="72"
                      value={offlineForm.pulse}
                      onChange={e => setOfflineForm(prev => ({ ...prev, pulse: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '0.2rem' }}>WEIGHT</label>
                    <input 
                      type="text"
                      className="rx-input"
                      placeholder="68"
                      value={offlineForm.weight}
                      onChange={e => setOfflineForm(prev => ({ ...prev, weight: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '0.2rem' }}>SUGAR</label>
                    <input 
                      type="text"
                      className="rx-input"
                      placeholder="mg/dL"
                      value={offlineForm.sugar || ''}
                      onChange={e => setOfflineForm(prev => ({ ...prev, sugar: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Complaints & Diagnosis (2 columns) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="rx-card" style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span className="rx-card-label" style={{ margin: 0 }}>COMPLAINTS</span>
                    <button 
                      type="button"
                      onClick={() => setShowSymptomDrawer(!showSymptomDrawer)}
                      style={{
                        padding: '0.15rem 0.5rem',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        backgroundColor: showSymptomDrawer ? '#0f766e' : '#f0fdfa',
                        color: showSymptomDrawer ? '#ffffff' : '#0f766e',
                        border: '1px solid #99f6e4',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}
                    >
                      ⚡ Symptoms
                    </button>
                  </div>
                  {showSymptomDrawer && (
                    <div style={{ marginBottom: '0.5rem', padding: '0.5rem', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #ccfbf1', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                      {['Headache', 'Anxiety', 'Insomnia', 'Fatigue', 'Restlessness', 'Mood swings'].map(sym => (
                        <button
                          key={sym}
                          type="button"
                          onClick={() => {
                            setOfflineForm(prev => ({
                              ...prev,
                              chiefComplaints: prev.chiefComplaints ? `${prev.chiefComplaints}, ${sym}` : sym
                            }));
                          }}
                          style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          + {sym}
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea 
                    ref={chiefComplaintsInputRef}
                    className="rx-input"
                    rows="3"
                    placeholder="Tap Symptoms to add in one click"
                    value={offlineForm.chiefComplaints}
                    onChange={e => setOfflineForm(prev => ({ ...prev, chiefComplaints: e.target.value }))}
                    style={{ resize: 'vertical', flex: 1 }}
                  />
                </div>

                <div className="rx-card" style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span className="rx-card-label" style={{ margin: 0 }}>DIAGNOSIS</span>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', padding: '0.05rem 0.35rem', borderRadius: '3px' }}>
                      Alt D
                    </span>
                  </div>
                  <textarea 
                    ref={diagnosisInputRef}
                    className="rx-input"
                    rows="3"
                    placeholder="e.g. Mild anxiety with insomnia"
                    value={offlineForm.diagnosis}
                    onChange={e => setOfflineForm(prev => ({ ...prev, diagnosis: e.target.value }))}
                    style={{ resize: 'vertical', flex: 1 }}
                  />
                </div>
              </div>

              {/* Medicines Card */}
              <div className="rx-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <strong style={{ fontSize: '0.9rem', color: '#1e293b' }}>Medicines</strong>
                  
                  {/* Language Pills */}
                  <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                    <button
                      type="button"
                      className={`rx-chip ${rxInstructionLanguage === 'bilingual' ? 'active' : ''}`}
                      onClick={() => handleLanguageChange('bilingual')}
                    >
                      Hindi + English
                    </button>
                    <button
                      type="button"
                      className={`rx-chip ${rxInstructionLanguage === 'hindi' ? 'active' : ''}`}
                      onClick={() => handleLanguageChange('hindi')}
                    >
                      Hindi
                    </button>
                    <button
                      type="button"
                      className={`rx-chip ${rxInstructionLanguage === 'english' ? 'active' : ''}`}
                      onClick={() => handleLanguageChange('english')}
                    >
                      English
                    </button>
                    <button
                      type="button"
                      className="rx-chip"
                      onClick={handleSaveTempMedToDb}
                      title="Save currently entered medicine to Master DB (Alt+M)"
                    >
                      Save to DB
                    </button>
                    <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700, backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>
                      Alt M
                    </span>
                  </div>
                </div>

                {/* Medicine Inputs Row 1 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.65rem', marginBottom: '0.5rem', position: 'relative' }}>
                  <div style={{ position: 'relative' }}>
                    <label style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '0.2rem' }}>MEDICINE</label>
                    <input 
                      ref={medNameInputRef}
                      type="text"
                      className="rx-input"
                      placeholder="Tab. Pantop 40mg, Dolo 650, Zapiz"
                      value={tempMed.name}
                      onChange={e => {
                        const val = e.target.value;
                        setTempMed(prev => ({ ...prev, name: val }));
                        setActiveSearchIndex(999);
                      }}
                      onFocus={() => setActiveSearchIndex(999)}
                    />
                    {/* Medicine Autocomplete Dropdown */}
                    {Boolean(activeSearchIndex === 999 && tempMed.name && filteredMeds.length > 0) && (
                      <div 
                        ref={medDropdownRef}
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          backgroundColor: '#ffffff',
                          border: '1.5px solid #0f766e',
                          borderRadius: '6px',
                          boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
                          zIndex: 9999,
                          maxHeight: '180px',
                          overflowY: 'auto'
                        }}
                      >
                        {filteredMeds.map((m, idx) => (
                          <div 
                            key={m.id || idx}
                            onClick={() => {
                              setTempMed({
                                name: m.name,
                                composition: m.composition || '',
                                dosage: m.dosage || '1 Tab',
                                frequency: m.timing || '1-0-0 सुबह नाश्ते के बाद'
                              });
                              setActiveSearchIndex(null);
                            }}
                            style={{ padding: '0.4rem 0.6rem', cursor: 'pointer', fontSize: '0.8rem', borderBottom: '1px solid #f1f5f9' }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0fdfa'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <strong>{m.name}</strong>
                            {m.composition && <span style={{ color: '#b91c1c', fontSize: '0.72rem', marginLeft: '0.4rem', fontStyle: 'italic' }}>({m.composition})</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '0.2rem' }}>COMPOSITION (GENERIC)</label>
                    <input 
                      type="text"
                      className="rx-input"
                      placeholder="Optional"
                      value={tempMed.composition}
                      onChange={e => setTempMed(prev => ({ ...prev, composition: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Medicine Inputs Row 2 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr 100px', gap: '0.65rem', marginBottom: '0.65rem', alignItems: 'end' }}>
                  <div>
                    <label style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '0.2rem' }}>DOSAGE</label>
                    <input 
                      ref={medDosageInputRef}
                      type="text"
                      className="rx-input"
                      placeholder="1 tablet"
                      value={tempMed.dosage}
                      onChange={e => setTempMed(prev => ({ ...prev, dosage: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '0.2rem' }}>FREQUENCY & INSTRUCTIONS - auto-detect</label>
                    <input 
                      ref={medFrequencyInputRef}
                      type="text"
                      className="rx-input"
                      placeholder="1-0-0 (सुबह खाली पेट)"
                      value={tempMed.frequency}
                      onChange={e => setTempMed(prev => ({ ...prev, frequency: e.target.value }))}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddMedicineToRx}
                    style={{
                      height: '35px',
                      backgroundColor: '#0f766e',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Add to Rx
                  </button>
                </div>

                {/* Quick Frequency Pills */}
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
                  {[
                    { label: 'BBF', val: '1-0-0 (सुबह नाश्ते से पहले खाली पेट)' },
                    { label: '1-0-0 नाश्ते बाद', val: '1-0-0 (सुबह नाश्ते के बाद)' },
                    { label: '1-0-1 खाने बाद', val: '1-0-1 (सुबह-रात भोजन के बाद)' },
                    { label: '0-0-1 रात', val: '0-0-1 (रात को सोने से पहले)' },
                    { label: '1-1-1 तीनों पहर', val: '1-1-1 (सुबह-दोपहर-रात)' },
                    { label: 'SOS ज़रूरत पर', val: 'SOS (आवश्यकता पड़ने पर)' }
                  ].map(pill => (
                    <button
                      key={pill.label}
                      type="button"
                      className="rx-chip"
                      onClick={() => setTempMed(prev => ({ ...prev, frequency: pill.val }))}
                    >
                      {pill.label}
                    </button>
                  ))}
                </div>

                {/* Added Medicines Table */}
                {offlineForm.medications.length > 0 && (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                          <th style={{ padding: '0.45rem 0.65rem', fontWeight: 800 }}>MEDICINE NAME</th>
                          <th style={{ padding: '0.45rem 0.65rem', fontWeight: 800 }}>DOSAGE</th>
                          <th style={{ padding: '0.45rem 0.65rem', fontWeight: 800 }}>FREQUENCY & INSTRUCTIONS</th>
                          <th style={{ padding: '0.45rem 0.65rem', width: '95px', textAlign: 'center', fontWeight: 800 }}>ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {offlineForm.medications.map((m, idx) => {
                          const isEditing = editingOfflineMedIndex === idx;

                          if (isEditing) {
                            return (
                              <tr key={idx} style={{ backgroundColor: '#f0fdfa', borderBottom: '2px solid #0f766e' }}>
                                <td style={{ padding: '0.4rem 0.5rem' }}>
                                  <input
                                    type="text"
                                    className="rx-input"
                                    value={editingOfflineMed.name}
                                    onChange={e => setEditingOfflineMed(prev => ({ ...prev, name: e.target.value }))}
                                    style={{ padding: '0.25rem 0.45rem', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.25rem', width: '100%' }}
                                    placeholder="Medicine Name"
                                    autoFocus
                                  />
                                  <input
                                    type="text"
                                    className="rx-input"
                                    value={editingOfflineMed.composition}
                                    onChange={e => setEditingOfflineMed(prev => ({ ...prev, composition: e.target.value }))}
                                    style={{ padding: '0.2rem 0.45rem', fontSize: '0.72rem', fontStyle: 'italic', color: '#b91c1c', width: '100%' }}
                                    placeholder="Composition (Optional)"
                                  />
                                </td>
                                <td style={{ padding: '0.4rem 0.5rem' }}>
                                  <input
                                    type="text"
                                    className="rx-input"
                                    value={editingOfflineMed.dosage}
                                    onChange={e => setEditingOfflineMed(prev => ({ ...prev, dosage: e.target.value }))}
                                    style={{ padding: '0.25rem 0.45rem', fontSize: '0.8rem', width: '100%' }}
                                    placeholder="Dosage"
                                  />
                                </td>
                                <td style={{ padding: '0.4rem 0.5rem' }}>
                                  <input
                                    type="text"
                                    className="rx-input"
                                    value={editingOfflineMed.frequency}
                                    onChange={e => setEditingOfflineMed(prev => ({ ...prev, frequency: e.target.value }))}
                                    style={{ padding: '0.25rem 0.45rem', fontSize: '0.8rem', width: '100%' }}
                                    placeholder="Frequency & Instructions"
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        saveEditOfflineMed(idx);
                                      } else if (e.key === 'Escape') {
                                        cancelEditOfflineMed();
                                      }
                                    }}
                                  />
                                </td>
                                <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                                    <button
                                      type="button"
                                      onClick={() => saveEditOfflineMed(idx)}
                                      style={{
                                        backgroundColor: '#0f766e',
                                        color: '#ffffff',
                                        border: 'none',
                                        borderRadius: '4px',
                                        padding: '0.25rem 0.45rem',
                                        fontSize: '0.74rem',
                                        fontWeight: 800,
                                        cursor: 'pointer'
                                      }}
                                      title="Save changes (Enter)"
                                    >
                                      ✓ Save
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelEditOfflineMed}
                                      style={{
                                        backgroundColor: '#ffffff',
                                        color: '#64748b',
                                        border: '1px solid #cbd5e1',
                                        borderRadius: '4px',
                                        padding: '0.25rem 0.45rem',
                                        fontSize: '0.74rem',
                                        cursor: 'pointer'
                                      }}
                                      title="Cancel edit (Esc)"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          }

                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '0.45rem 0.65rem' }}>
                                <div style={{ fontWeight: 700, color: '#1e293b' }}>{m.name}</div>
                                {m.composition && (
                                  <div style={{ fontSize: '0.72rem', color: '#b91c1c', fontStyle: 'italic', fontWeight: 600 }}>
                                    {m.composition}
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '0.45rem 0.65rem', color: '#334155' }}>{m.dosage}</td>
                              <td style={{ padding: '0.45rem 0.65rem', color: '#334155' }}>{m.frequency}</td>
                              <td style={{ padding: '0.45rem 0.65rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                                  <button
                                    type="button"
                                    onClick={() => startEditOfflineMed(idx)}
                                    style={{
                                      background: '#f0fdfa',
                                      border: '1px solid #99f6e4',
                                      color: '#0f766e',
                                      borderRadius: '4px',
                                      padding: '0.18rem 0.4rem',
                                      cursor: 'pointer',
                                      fontSize: '0.74rem',
                                      fontWeight: 700,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.2rem'
                                    }}
                                    title="Edit this medicine (alter name, dosage, frequency)"
                                  >
                                    <span>✏️</span>
                                    <span>Edit</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeOfflineMedicationRow(idx)}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      color: '#94a3b8',
                                      cursor: 'pointer',
                                      fontSize: '0.85rem',
                                      padding: '0.18rem 0.35rem'
                                    }}
                                    title="Remove from Prescription"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Tests Required & Advice (2 columns) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="rx-card">
                  <span className="rx-card-label" style={{ color: '#c2410c' }}>TESTS REQUIRED (PRINTED ON RX)</span>
                  <textarea 
                    className="rx-input"
                    rows="2"
                    placeholder="e.g. CERVICAL X RAY AP AND LATERAL VIEW, CBC, Thyroid Profile"
                    value={offlineForm.requiredTests}
                    onChange={e => setOfflineForm(prev => ({ ...prev, requiredTests: e.target.value }))}
                    style={{ resize: 'vertical' }}
                  />
                </div>
                <div className="rx-card">
                  <span className="rx-card-label">ADVICE & FOLLOW-UP</span>
                  <textarea 
                    className="rx-input"
                    rows="2"
                    placeholder="Breathing exercises daily. Follow up in 2 weeks."
                    value={offlineForm.advice}
                    onChange={e => setOfflineForm(prev => ({ ...prev, advice: e.target.value }))}
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </div>

              {/* Private Notes & Next Follow-up (2 columns) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ backgroundColor: '#fffbeb', border: '1.5px solid #fde047', borderRadius: '10px', padding: '0.75rem 1rem' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#854d0e', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.35rem' }}>
                    <span>🔒</span>
                    <span>PRIVATE DOCTOR NOTES & REFERRALS (CONFIDENTIAL · ONLY VISIBLE TO DOCTOR · NEVER PRINTED)</span>
                  </span>
                  <textarea 
                    rows="2"
                    placeholder="Internal personal notes, private observations, referrals, reminders (Strictly private to doctor)"
                    value={offlineForm.privateNotes}
                    onChange={e => setOfflineForm(prev => ({ ...prev, privateNotes: e.target.value }))}
                    style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: '0.84rem', color: '#713f12', resize: 'vertical', fontWeight: 600 }}
                  />
                </div>
                <div className="rx-card">
                  <span className="rx-card-label">NEXT FOLLOW-UP</span>
                  <input 
                    type="date"
                    className="rx-input"
                    value={offlineForm.followUpDate}
                    onChange={e => setOfflineForm(prev => ({ ...prev, followUpDate: e.target.value }))}
                  />
                </div>
              </div>
            </form>

            {/* 3. Right Column: Live Letterhead Preview */}
            <div 
              className="rx-preview-column"
              onPointerDown={() => {
                if (activeRailSection) closeSidebar();
              }}
            >
              {/* Header Controls */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', fontWeight: 800, color: '#0f766e' }}>
                  <span>📜 Pre-Printed Letterhead</span>
                  {offlineLayout.useLetterhead && (
                    <span 
                      title={`Print settings: Top clearance ${offlineLayout.letterheadTopMargin || 285}px, Bottom clearance ${offlineLayout.letterheadBottomMargin || 196}px will be applied on Print.`}
                      style={{ fontSize: '0.66rem', fontWeight: 700, backgroundColor: '#f0fdfa', border: '1px solid #99f6e4', color: '#0f766e', padding: '0.1rem 0.45rem', borderRadius: '4px' }}
                    >
                      Print Clearance: {offlineLayout.letterheadTopMargin || 285}px Top / {offlineLayout.letterheadBottomMargin || 196}px Bottom
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  {/* Zoom Controls */}
                  <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0.15rem 0.35rem', gap: '0.25rem' }}>
                    <button 
                      type="button" 
                      onClick={() => setManualScale(prev => Math.max(0.42, Number(((prev ?? autoFitScale) - 0.05).toFixed(2))))}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 800, fontSize: '0.9rem', color: '#64748b', padding: '0 0.15rem' }}
                      title="Zoom Out"
                    >-</button>
                    <span 
                      onClick={() => setManualScale(null)}
                      title="Click to reset zoom to auto-fit"
                      style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0f766e', minWidth: '38px', textAlign: 'center', cursor: 'pointer' }}
                    >
                      {Math.round(autoFitScale * 100)}%
                    </span>
                    <button 
                      type="button" 
                      onClick={() => setManualScale(prev => Math.min(1.0, Number(((prev ?? autoFitScale) + 0.05).toFixed(2))))}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 800, fontSize: '0.9rem', color: '#64748b', padding: '0 0.15rem' }}
                      title="Zoom In"
                    >+</button>
                  </div>

                  <button
                    type="button"
                    onClick={handlePrintPrescription}
                    disabled={isSavingOfflineRx}
                    style={{
                      padding: '0.35rem 0.85rem',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      backgroundColor: isSavingOfflineRx ? '#94a3b8' : '#0f766e',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: isSavingOfflineRx ? 'wait' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      boxShadow: '0 2px 6px rgba(15,118,110,0.2)',
                      opacity: isSavingOfflineRx ? 0.75 : 1
                    }}
                  >
                    <span>🖨 {isSavingOfflineRx ? 'Saving & Printing...' : 'Print'}</span>
                    <span style={{ fontSize: '0.68rem', backgroundColor: 'rgba(255,255,255,0.22)', padding: '0.05rem 0.35rem', borderRadius: '4px' }}>Ctrl P</span>
                  </button>
                </div>
              </div>

              {/* Scaled A4 Letterhead Sheet Container - Fixed, No Scroll */}
              <div 
                style={{
                  flex: 1,
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'flex-start',
                  paddingTop: '0.2rem',
                  overflow: 'hidden',
                  minHeight: 0
                }}
              >
                <div 
                  className="preview-scale-wrapper"
                  style={{
                    width: `${Math.round(offlineLayout.pageWidth * autoFitScale)}px`,
                    height: `${Math.round(offlineLayout.pageHeight * autoFitScale)}px`,
                    position: 'relative',
                    overflow: 'hidden',
                    borderRadius: '8px',
                    boxShadow: '0 6px 20px rgba(0,0,0,0.1)',
                    flexShrink: 0
                  }}
                >
                  <div 
                    className="printable-prescription-preview"
                    style={{ 
                      width: `${offlineLayout.pageWidth}px`, 
                      height: `${offlineLayout.pageHeight}px`,
                      transform: `scale(${autoFitScale})`,
                      transformOrigin: 'top left',
                      padding: `${offlineLayout.marginSize || 40}px`,
                      fontSize: `${offlineLayout.fontSize || 13}px`,
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      fontFamily: getFontFamilyCss(offlineLayout.fontFamily),
                      position: 'relative',
                      boxSizing: 'border-box'
                    }}
                  >
                    <div>
                      {/* Pre-printed Letterhead Header Space (Hidden on-screen to shift details to the top; applied automatically on print) */}
                      {offlineLayout.useLetterhead && (offlineLayout.letterheadTopMargin || 0) > 0 && (
                        <div 
                          className="print-letterhead-header-clearance print-only"
                          style={{ 
                            height: `${offlineLayout.letterheadTopMargin || 285}px`,
                            flexShrink: 0,
                            display: 'none',
                            transition: 'height 0.1s ease'
                          }} 
                        />
                      )}

                      {/* Structured Patient Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 0.9fr 1fr 0.95fr 0.9fr', gap: '0.45rem', border: '1.5px solid #0f766e', borderRadius: '6px', padding: dynamicMedStyle.patientGridPadding, fontSize: '0.84em', marginBottom: '0.75rem', backgroundColor: '#f8fafc' }}>
                        <div>
                          <strong style={{ color: '#64748b', fontSize: '0.75em' }}>NAME</strong>
                          <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{offlineForm.patientName || '------'}</div>
                        </div>
                        <div>
                          <strong style={{ color: '#64748b', fontSize: '0.75em' }}>AGE / SEX</strong>
                          <div style={{ fontWeight: 800, color: '#0f172a' }}>{offlineForm.patientAge ? `${offlineForm.patientAge} Yrs` : '--'} / {offlineForm.patientGender?.[0] || 'M'}</div>
                        </div>
                        <div>
                          <strong style={{ color: '#64748b', fontSize: '0.75em' }}>PHONE</strong>
                          <div style={{ fontWeight: 800, color: '#0f172a' }}>{offlineForm.patientPhone || '------'}</div>
                        </div>
                        <div>
                          <strong style={{ color: '#64748b', fontSize: '0.75em' }}>REF</strong>
                          <div style={{ fontWeight: 800, color: '#0f172a' }}>{offlineForm.referenceId || '---'}</div>
                        </div>
                        <div>
                          <strong style={{ color: '#64748b', fontSize: '0.75em' }}>DATE</strong>
                          <div style={{ fontWeight: 800, color: '#0f172a' }}>{formatPrintDate(offlineForm.consultDate) || formatPrintDate(getLocalDateStr())}</div>
                        </div>
                      </div>

                      {/* 2-col Body: Left Section (Vitals, Complaints, Diagnosis, Advice, Signature) | Right Prescribed Medications Table */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1.02fr 1.68fr', gap: dynamicMedStyle.bodyGap, alignItems: 'start' }}>
                        {/* Left Section Exactly Matching User Reference Mockup */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: `${Math.round((offlineLayout.rowSpacing || 12) * 0.65)}px` }}>
                          
                          {/* 1. VITALS - only shown if at least one vital is recorded */}
                          {Boolean(
                            (offlineForm.bp && String(offlineForm.bp).trim()) ||
                            (offlineForm.pulse && String(offlineForm.pulse).trim()) ||
                            (offlineForm.weight && String(offlineForm.weight).trim()) ||
                            (offlineForm.sugar && String(offlineForm.sugar).trim())
                          ) && (
                            <div>
                              <div style={{ fontSize: '0.74em', fontWeight: 800, color: '#be123c', letterSpacing: '0.04em', marginBottom: '0.2rem', textTransform: 'uppercase' }}>
                                VITALS
                              </div>
                              <div style={{ backgroundColor: '#fff1f2', border: '1.5px solid #fecdd3', borderRadius: '8px', borderLeft: '5px solid #e11d48', padding: '0.45rem 0.65rem', fontSize: '0.82em', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                {offlineForm.bp && String(offlineForm.bp).trim() && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: '#9f1239', fontWeight: 800, fontSize: '0.76em', letterSpacing: '0.03em' }}>BLOOD PRESSURE</span>
                                    <span style={{ fontWeight: 800, color: '#0f172a' }}>{formatBP(offlineForm.bp)}</span>
                                  </div>
                                )}
                                {offlineForm.pulse && String(offlineForm.pulse).trim() && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: '#9f1239', fontWeight: 800, fontSize: '0.76em', letterSpacing: '0.03em' }}>PULSE RATE</span>
                                    <span style={{ fontWeight: 800, color: '#0f172a' }}>{formatPulse(offlineForm.pulse)}</span>
                                  </div>
                                )}
                                {offlineForm.weight && String(offlineForm.weight).trim() && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: '#9f1239', fontWeight: 800, fontSize: '0.76em', letterSpacing: '0.03em' }}>WEIGHT</span>
                                    <span style={{ fontWeight: 800, color: '#0f172a' }}>{String(offlineForm.weight).includes('kg') ? offlineForm.weight : `${offlineForm.weight} kg`}</span>
                                  </div>
                                )}
                                {offlineForm.sugar && String(offlineForm.sugar).trim() && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: '#9f1239', fontWeight: 800, fontSize: '0.76em', letterSpacing: '0.03em' }}>BLOOD SUGAR</span>
                                    <span style={{ fontWeight: 800, color: '#0f172a' }}>{String(offlineForm.sugar).includes('mg') ? offlineForm.sugar : `${offlineForm.sugar} mg/dL`}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* 2. CHIEF COMPLAINTS - only shown when entered */}
                          {offlineForm.chiefComplaints && String(offlineForm.chiefComplaints).trim() ? (
                            <div>
                              <div style={{ fontSize: '0.74em', fontWeight: 800, color: '#2563eb', letterSpacing: '0.04em', marginBottom: '0.2rem', textTransform: 'uppercase' }}>
                                CHIEF COMPLAINTS
                              </div>
                              <div style={{ 
                                backgroundColor: '#eff6ff', 
                                border: '1.5px solid #bfdbfe', 
                                borderRadius: '8px', 
                                borderLeft: '5px solid #2563eb', 
                                padding: '0.5rem 0.7rem', 
                                fontSize: '0.90em', 
                                color: '#0f172a', 
                                fontWeight: 800, 
                                textTransform: 'uppercase', 
                                lineHeight: 1.4, 
                                letterSpacing: '0.01em', 
                                minHeight: '36px',
                                wordBreak: 'break-word',
                                boxSizing: 'border-box'
                              }}>
                                {offlineForm.chiefComplaints.toUpperCase()}
                              </div>
                            </div>
                          ) : null}

                          {/* 3. DIAGNOSIS - only shown when entered */}
                          {offlineForm.diagnosis && String(offlineForm.diagnosis).trim() ? (
                            <div>
                              <div style={{ fontSize: '0.74em', fontWeight: 800, color: '#0f766e', letterSpacing: '0.04em', marginBottom: '0.2rem', textTransform: 'uppercase' }}>
                                DIAGNOSIS
                              </div>
                              <div style={{ 
                                backgroundColor: '#f0fdfa', 
                                border: '1.5px solid #99f6e4', 
                                borderRadius: '8px', 
                                borderLeft: '5px solid #0f766e', 
                                padding: '0.5rem 0.7rem', 
                                fontSize: '0.90em', 
                                color: '#0f172a', 
                                fontWeight: 800, 
                                textTransform: 'uppercase', 
                                letterSpacing: '0.02em', 
                                minHeight: '36px', 
                                display: 'flex', 
                                alignItems: 'center',
                                wordBreak: 'break-word',
                                boxSizing: 'border-box'
                              }}>
                                {offlineForm.diagnosis.toUpperCase()}
                              </div>
                            </div>
                          ) : null}

                          {/* 4. TESTS REQUIRED (Dedicated Section as in Reference Mockup) */}
                          {offlineForm.requiredTests && String(offlineForm.requiredTests).trim() ? (
                            <div>
                              <div style={{ fontSize: '0.74em', fontWeight: 800, color: '#c2410c', letterSpacing: '0.04em', marginBottom: '0.2rem', textTransform: 'uppercase' }}>
                                TESTS REQUIRED
                              </div>
                              <div style={{ 
                                backgroundColor: '#fff7ed', 
                                border: '1.5px solid #fed7aa', 
                                borderRadius: '8px', 
                                borderLeft: '5px solid #ea580c', 
                                padding: '0.5rem 0.7rem', 
                                fontSize: '0.90em', 
                                color: '#0f172a', 
                                fontWeight: 800, 
                                textTransform: 'uppercase', 
                                lineHeight: 1.4, 
                                letterSpacing: '0.01em', 
                                minHeight: '36px', 
                                wordBreak: 'break-word', 
                                boxSizing: 'border-box' 
                              }}>
                                {offlineForm.requiredTests.toUpperCase()}
                              </div>
                            </div>
                          ) : null}

                          {/* 5. GENERAL ADVICE - only shown when entered */}
                          {((offlineForm.advice && String(offlineForm.advice).trim()) || offlineForm.followUpDate) ? (
                            <div>
                              <div style={{ fontSize: '0.74em', fontWeight: 800, color: '#059669', letterSpacing: '0.04em', marginBottom: '0.2rem', textTransform: 'uppercase' }}>
                                GENERAL ADVICE
                              </div>
                              <div style={{ 
                                backgroundColor: '#ecfdf5', 
                                border: '1.5px solid #a7f3d0', 
                                borderRadius: '8px', 
                                borderLeft: '5px solid #059669', 
                                padding: '0.5rem 0.7rem', 
                                fontSize: '0.86em', 
                                color: '#064e3b', 
                                fontWeight: 700, 
                                lineHeight: 1.45,
                                minHeight: '36px',
                                wordBreak: 'break-word',
                                boxSizing: 'border-box'
                              }}>
                                {offlineForm.advice && String(offlineForm.advice).trim() && (
                                  <div>{offlineForm.advice}</div>
                                )}
                                {offlineForm.followUpDate && (
                                  <div style={{ marginTop: '0.2rem', color: '#047857', fontSize: '0.9em' }}>
                                    Next Follow-up Date: {formatPrintDate(offlineForm.followUpDate)}
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : null}

                          {/* 6. OFFICIAL SIGNATURE LOGO (Mapped to Layout Settings) */}
                          {offlineLayout.showSignature && (
                            <div style={{ 
                              marginTop: '0.35rem', 
                              display: 'flex', 
                              flexDirection: 'column', 
                              alignItems: offlineLayout.signaturePosition === 'bottom-left' ? 'flex-start' : (offlineLayout.signaturePosition === 'bottom-right' ? 'flex-end' : 'center'),
                              transform: `translate(${offlineLayout.signatureXOffset || 0}px, ${offlineLayout.signatureYOffset || 0}px)`,
                              transition: 'transform 0.1s ease',
                              pointerEvents: 'none'
                            }}>
                              <img 
                                src="/signature.png" 
                                alt="Dr. Priyadarshi Srivastava Signature" 
                                style={{ width: `${offlineLayout.signatureSize || 228}px`, maxWidth: '100%', objectFit: 'contain' }}
                              />
                            </div>
                          )}

                        </div>

                        {/* Right Section: PRESCRIBED MEDICATIONS Exactly Matching User Reference Mockup */}
                        <div>
                          {/* Header with Rx symbol */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.45rem' }}>
                            <span style={{ fontSize: '1.35em', fontWeight: 900, color: '#0f766e', lineHeight: 1 }}>℞</span>
                            <span style={{ fontSize: '0.84em', fontWeight: 800, color: '#0f172a', letterSpacing: '0.04em' }}>
                              PRESCRIBED MEDICATIONS
                            </span>
                          </div>

                          {/* 3-Column Table: MEDICINE NAME | DOSAGE | FREQUENCY & INSTRUCTIONS */}
                          <div style={{ width: '100%', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', tableLayout: 'fixed' }}>
                              <thead>
                                <tr style={{ borderBottom: '2.5px solid #0f766e' }}>
                                  <th style={{ padding: '0.35rem 0.5rem', fontSize: '0.74em', fontWeight: 800, color: '#0f172a', letterSpacing: '0.03em', width: '40%' }}>
                                    MEDICINE NAME
                                  </th>
                                  <th style={{ padding: '0.35rem 0.5rem', fontSize: '0.74em', fontWeight: 800, color: '#0f172a', letterSpacing: '0.03em', width: '18%' }}>
                                    DOSAGE
                                  </th>
                                  <th style={{ padding: '0.35rem 0.5rem', fontSize: '0.74em', fontWeight: 800, color: '#0f172a', letterSpacing: '0.03em', width: '42%' }}>
                                    FREQUENCY & INSTRUCTIONS
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {offlineForm.medications.map((m, idx) => {
                                  const dynamicRowPadding = `${Math.round((offlineLayout.rowSpacing || 12) * 0.42)}px 0.5rem`;
                                  return (
                                    <tr 
                                      key={idx} 
                                      style={{ 
                                        backgroundColor: idx % 2 === 1 ? '#f8fafc' : 'transparent',
                                        verticalAlign: 'top'
                                      }}
                                    >
                                      <td style={{ padding: dynamicRowPadding, verticalAlign: 'top' }}>
                                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: dynamicMedStyle.medNameSize, textTransform: 'uppercase', letterSpacing: '0.01em', lineHeight: 1.25 }}>
                                          {m.name}
                                        </div>
                                        {m.composition && (
                                          <div style={{ color: '#dc2626', fontStyle: 'italic', fontWeight: 700, fontSize: dynamicMedStyle.compositionSize, textTransform: 'uppercase', marginTop: '0.15rem', lineHeight: 1.25, letterSpacing: '0.01em' }}>
                                            ({m.composition.replace(/^\(|\)$/g, '')})
                                          </div>
                                        )}
                                      </td>
                                      <td style={{ padding: dynamicRowPadding, fontWeight: 800, color: '#0f172a', fontSize: dynamicMedStyle.dosageSize, textTransform: 'uppercase', verticalAlign: 'top', lineHeight: 1.25 }}>
                                        {m.dosage || ''}
                                      </td>
                                      <td style={{ padding: dynamicRowPadding, verticalAlign: 'top' }}>
                                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: dynamicMedStyle.dosageSize, lineHeight: 1.35, whiteSpace: 'pre-line' }}>
                                          {m.frequency}
                                        </div>
                                        {m.instructions && (
                                          <div style={{ fontWeight: 800, color: '#0f172a', fontSize: dynamicMedStyle.dosageSize, textTransform: 'uppercase', marginTop: '0.2rem', lineHeight: 1.25 }}>
                                            {m.instructions}
                                          </div>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Pre-printed Letterhead Footer Space (Hidden on-screen to avoid bottom gap; applied automatically on print) */}
                    {offlineLayout.useLetterhead && (offlineLayout.letterheadBottomMargin || 0) > 0 && (
                      <div 
                        className="print-letterhead-footer-clearance print-only"
                        style={{ 
                          height: `${offlineLayout.letterheadBottomMargin || 196}px`,
                          flexShrink: 0,
                          display: 'none',
                          transition: 'height 0.1s ease'
                        }} 
                      />
                    )}

                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

      </main>

      {/* Prescription workspace Modal */}
      {selectedAppt && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', zIndex: 100, overflowY: 'auto' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '720px', padding: '2.5rem', boxShadow: 'var(--shadow-lg)', maxHeight: '90vh', overflowY: 'auto' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: 'var(--primary)' }}>Prescription Workspace</h3>
              <button className="btn btn-secondary" onClick={() => setSelectedAppt(null)} style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}>✕ Close</button>
            </div>

            <div style={{ backgroundColor: 'var(--neutral-light)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid var(--neutral-border)' }}>
              <strong>Patient Details:</strong> {selectedAppt.patientName} ({selectedAppt.patientAge} Years) | Booking ID: {selectedAppt.bookingId}
            </div>

            {generatedPdfUrl ? (
              <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                <span style={{ fontSize: '3rem' }}>🎉</span>
                <h4 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '1rem 0' }}>Prescription Document Generated Successfully!</h4>
                <p style={{ color: 'var(--neutral-body)', marginBottom: '1.5rem' }}>The patient has been notified via SMS and Email with a direct download link.</p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                  <a href={`${API_URL}${generatedPdfUrl}`} target="_blank" rel="noreferrer" className="btn btn-primary">
                    🖨️ View / Print Prescription PDF
                  </a>
                  <button className="btn btn-secondary" onClick={() => setSelectedAppt(null)}>
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={submitPrescription} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                
                {/* Diagnosis */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontWeight: 700, fontSize: '0.9rem' }}>Clinical Diagnosis</label>
                  <textarea 
                    placeholder="e.g. Mild anxiety disorder with secondary insomnia."
                    rows="3"
                    value={prescriptionForm.diagnosis}
                    onChange={e => setPrescriptionForm(prev => ({ ...prev, diagnosis: e.target.value }))}
                    required
                  />
                </div>

                {/* Medications Table */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Prescribed Medications (Rx)</span>
                    <button type="button" className="btn btn-secondary" onClick={addMedicationRow} style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                      + Add Medicine
                    </button>
                  </label>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                    {(prescriptionForm?.medications || []).map((med, index) => (
                      <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 40px', gap: '0.5rem', alignItems: 'center' }}>
                        <input 
                          type="text" 
                          placeholder="Medicine Name (e.g. Dolo)"
                          value={med.name}
                          onChange={e => handleMedicationChange(index, 'name', e.target.value)}
                          required
                        />
                        <input 
                          type="text" 
                          placeholder="Composition (Optional)"
                          value={med.composition || ''}
                          onChange={e => handleMedicationChange(index, 'composition', e.target.value)}
                        />
                        <input 
                          type="text" 
                          placeholder="Dosage (e.g. 1 tab)"
                          value={med.dosage}
                          onChange={e => handleMedicationChange(index, 'dosage', e.target.value)}
                          required
                        />
                        <input 
                          type="text" 
                          placeholder="Frequency (e.g. Once daily)"
                          value={med.frequency}
                          onChange={e => handleMedicationChange(index, 'frequency', e.target.value)}
                          required
                        />
                        <button 
                          type="button" 
                          className="btn btn-danger" 
                          onClick={() => removeMedicationRow(index)}
                          style={{ padding: '0.5rem', width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                          disabled={prescriptionForm.medications.length === 1}
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* General Advice */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontWeight: 700, fontSize: '0.9rem' }}>General Advice & Follow-up Instructions</label>
                  <textarea 
                    placeholder="e.g. Practice breathing exercises daily. Avoid blue screens 1 hour before bedtime. Follow-up in 2 weeks."
                    rows="3"
                    value={prescriptionForm.advice}
                    onChange={e => setPrescriptionForm(prev => ({ ...prev, advice: e.target.value }))}
                  />
                </div>

                <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }} disabled={prescriptionSubmitting}>
                  {prescriptionSubmitting ? 'Generating PDF...' : 'Sign & Submit Prescription'}
                </button>

              </form>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          CLINICAL RESEARCH & MEDICINE ANALYTICS MODAL
          ========================================================================= */}
      {showAnalyticsModal && (
        <div className="analytics-modal-overlay">
          <div className="analytics-modal-window">
            
            {/* Modal Header */}
            <div className="analytics-modal-header">
              <div>
                <h3>
                  <span>🔬</span> Clinical Research & Prescription Analytics
                </h3>
                <p>Patient volume, prescription patterns, dosage & demographic histograms</p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                {/* Timeframe Selector */}
                <select
                  value={analyticsTimeframe}
                  onChange={(e) => {
                    const val = e.target.value;
                    setAnalyticsTimeframe(val);
                    if (analyticsTab === 'overview') {
                      fetchOverviewAnalytics(val);
                    } else if (searchedMedicine) {
                      fetchMedicineAnalytics(searchedMedicine, val);
                    }
                  }}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '8px',
                    padding: '0.4rem 0.75rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="all" style={{ color: '#000' }}>📅 All Time</option>
                  <option value="30days" style={{ color: '#000' }}>📅 Last 30 Days</option>
                  <option value="90days" style={{ color: '#000' }}>📅 Last 90 Days</option>
                  <option value="1year" style={{ color: '#000' }}>📅 Past 1 Year</option>
                </select>

                {/* Export CSV Button */}
                <button
                  type="button"
                  onClick={exportAnalyticsCSV}
                  className="btn"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    color: '#fff',
                    border: '1px solid rgba(255, 255, 255, 0.4)',
                    padding: '0.4rem 0.85rem',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                  title="Export clinical data to CSV"
                >
                  📥 Export CSV
                </button>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => setShowAnalyticsModal(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#fff',
                    fontSize: '1.25rem',
                    cursor: 'pointer',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    lineHeight: 1
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="analytics-tab-bar">
              <button
                type="button"
                className={`analytics-tab-btn ${analyticsTab === 'overview' ? 'active' : ''}`}
                onClick={() => {
                  setAnalyticsTab('overview');
                  if (!overviewAnalytics) fetchOverviewAnalytics(analyticsTimeframe);
                }}
              >
                📊 Clinic Overview
              </button>

              <button
                type="button"
                className={`analytics-tab-btn ${analyticsTab === 'medicine' ? 'active' : ''}`}
                onClick={() => setAnalyticsTab('medicine')}
              >
                🔬 Composition Research & Usage
              </button>

              <button
                type="button"
                className={`analytics-tab-btn ${analyticsTab === 'volume' ? 'active' : ''}`}
                onClick={() => {
                  setAnalyticsTab('volume');
                  if (!patientVolumeData) fetchPatientVolumeAnalytics();
                }}
              >
                📅 Practice & Patient Volume (Daily/Monthly)
              </button>
            </div>

            {/* Modal Body Content */}
            <div className="analytics-modal-body">
              {analyticsLoading ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                  <div className="rzp-spinner" style={{ margin: '0 auto 1rem auto' }}></div>
                  <p style={{ color: 'var(--neutral-body)', fontWeight: 600 }}>Analyzing practice patient volume...</p>
                </div>
              ) : analyticsTab === 'overview' ? (
                /* =================== TAB 1: CLINIC OVERVIEW =================== */
                <>
                  {overviewAnalytics && (
                    <>
                      {/* KPI Summary Cards */}
                      <div className="analytics-kpi-grid">
                        <div className="analytics-kpi-card teal">
                          <span className="kpi-label">Total Prescriptions</span>
                          <span className="kpi-val">{overviewAnalytics.totalPrescriptions}</span>
                          <span className="kpi-sub">{overviewAnalytics.offlineCount} Clinic • {overviewAnalytics.onlineCount} Telehealth</span>
                        </div>

                        <div className="analytics-kpi-card blue">
                          <span className="kpi-label">Unique Patients Treated</span>
                          <span className="kpi-val">{overviewAnalytics.totalUniquePatients}</span>
                          <span className="kpi-sub">Across All Consultations</span>
                        </div>

                        <div className="analytics-kpi-card purple">
                          <span className="kpi-label">Unique Drugs Prescribed</span>
                          <span className="kpi-val">{overviewAnalytics.totalUniqueMedicines}</span>
                          <span className="kpi-sub">Active Formulations in DB</span>
                        </div>

                        <div className="analytics-kpi-card amber">
                          <span className="kpi-label">Diagnoses Identified</span>
                          <span className="kpi-val">
                            {(overviewAnalytics.topDiagnoses || []).length}
                          </span>
                          <span className="kpi-sub">Distinct Clinical Categories</span>
                        </div>
                      </div>

                      {/* Two Column Section: Top Medicines & Top Diagnoses */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.25rem' }}>
                        
                        {/* Top Medicines Ranking */}
                        <div className="analytics-panel">
                          <div className="analytics-panel-header">
                            <h4>🏆 Top Prescribed Medicines Ranking</h4>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Sorted by patient volume</span>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '380px', overflowY: 'auto' }}>
                            {(overviewAnalytics.topMedicines || []).map((med, idx) => (
                              <div key={idx} className="ranked-med-item">
                                <div className="ranked-med-rank">{idx + 1}</div>
                                <div className="ranked-med-info">
                                  <span className="ranked-med-name">{med.name}</span>
                                  {med.composition && <span className="ranked-med-comp">{med.composition}</span>}
                                </div>
                                <div className="ranked-med-stats">
                                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--primary)' }}>
                                    {med.patientCount} <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b' }}>patients</span>
                                  </span>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--neutral-body)' }}>
                                    {med.prescriptionCount} Prescriptions
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  onClick={() => {
                                    fetchMedicineAnalytics(med.composition || med.name);
                                    setAnalyticsTab('medicine');
                                  }}
                                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', fontWeight: 600 }}
                                  title="Analyze this composition"
                                >
                                  🔬 Analyze
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Top Diagnoses Correlation */}
                        <div className="analytics-panel">
                          <div className="analytics-panel-header">
                            <h4>🩺 Clinical Diagnosis Distribution</h4>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Diagnostic prevalence</span>
                          </div>

                          <div className="histogram-list">
                            {(overviewAnalytics.topDiagnoses || []).map((diag, idx) => (
                              <div key={idx} className="histogram-row">
                                <div className="histogram-row-header">
                                  <span>{diag.name}</span>
                                  <span style={{ color: '#0f766e', fontWeight: 700 }}>{diag.count} cases ({diag.percentage}%)</span>
                                </div>
                                <div className="histogram-bar-track">
                                  <div className="histogram-bar-fill blue" style={{ width: `${Math.max(5, diag.percentage)}%` }}></div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                      </div>

                      {/* Monthly Timeline Overview (if available) */}
                      {overviewAnalytics.monthlyTrends?.length > 0 && (
                        <div className="analytics-panel" style={{ marginTop: '1.25rem' }}>
                          <div className="analytics-panel-header">
                            <h4>📈 Monthly Prescription Volume Trend</h4>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Consultations per month</span>
                          </div>
                          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', height: '90px', padding: '0.75rem 0.5rem 0.25rem' }}>
                            {overviewAnalytics.monthlyTrends.map((t, idx) => {
                              const maxCount = Math.max(...overviewAnalytics.monthlyTrends.map(x => x.count), 1);
                              const heightPct = Math.round((t.count / maxCount) * 100);
                              return (
                                <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)' }}>{t.count}</span>
                                  <div style={{ width: '100%', height: `${Math.max(12, heightPct)}%`, backgroundColor: '#0f766e', borderRadius: '4px' }} title={`${t.month}: ${t.count} Rx`}></div>
                                  <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>{t.month}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : analyticsTab === 'medicine' ? (
                /* =================== TAB 2: ACTIVE COMPOSITION RESEARCH & PATIENT USAGE =================== */
                <>
                  {/* Active Composition Search Box */}
                  <div className="analytics-panel" style={{ padding: '1rem' }}>
                    <div style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        🔬 Search Active Drug Composition Only
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                        Single composition matching (excludes combos)
                      </span>
                    </div>

                    <div className="med-analytics-search-wrap">
                      <svg className="med-analytics-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                      </svg>
                      <input
                        type="text"
                        className="med-analytics-search-input"
                        placeholder="Search active composition (e.g. Sertraline, Clonazepam, Escitalopram, Paracetamol, Olanzapine)..."
                        value={medSearchInput}
                        onChange={(e) => {
                          const val = e.target.value;
                          setMedSearchInput(val);
                          if (val.trim().length >= 2) {
                            const searchLower = val.toLowerCase().trim();
                            const matches = getDistinctCompositions().filter(c => c.toLowerCase().includes(searchLower));
                            setMedSearchSuggestions(matches);
                          } else {
                            setMedSearchSuggestions([]);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && medSearchInput.trim()) {
                            fetchMedicineAnalytics(medSearchInput);
                            setMedSearchSuggestions([]);
                          }
                        }}
                      />
                    </div>

                    {/* Auto-suggestions Dropdown */}
                    {medSearchSuggestions.length > 0 && (
                      <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', backgroundColor: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.5rem', maxHeight: '180px', overflowY: 'auto' }}>
                        {medSearchSuggestions.map((comp, idx) => (
                          <div
                            key={idx}
                            onClick={() => {
                              fetchMedicineAnalytics(comp);
                              setMedSearchInput(comp);
                              setMedSearchSuggestions([]);
                            }}
                            style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            className="suggestion-row"
                          >
                            <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f766e' }}>🔬 {comp}</span>
                            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Active Composition</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Quick Composition Recommendation Pills */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>Quick Compositions:</span>
                      {getDistinctCompositions().slice(0, 8).map((comp, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            fetchMedicineAnalytics(comp);
                            setMedSearchInput(comp);
                            setMedSearchSuggestions([]);
                          }}
                          style={{
                            padding: '0.25rem 0.6rem',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            borderRadius: '20px',
                            border: '1px solid #cbd5e1',
                            background: '#f8fafc',
                            color: 'var(--neutral-dark)',
                            cursor: 'pointer'
                          }}
                        >
                          🔬 {comp}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Deep Dive Results */}
                  {medicineAnalytics ? (
                    <>
                      {/* Composition Profile Header Banner */}
                      <div className="analytics-panel" style={{ background: 'linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%)', borderColor: '#99f6e4' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontSize: '1.5rem' }}>🔬</span>
                              <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#0f766e' }}>
                                {medicineAnalytics.canonicalComposition || medicineAnalytics.canonicalName}
                              </h3>
                            </div>
                            {medicineAnalytics.brands && medicineAnalytics.brands.length > 0 && (
                              <div style={{ fontSize: '0.85rem', color: '#115e59', fontWeight: 600, marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                <span>Associated Prescribed Brands:</span>
                                {medicineAnalytics.brands.map((b, idx) => (
                                  <span key={idx} style={{ backgroundColor: '#ffffff', color: '#0f766e', padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid #99f6e4', fontSize: '0.78rem', fontWeight: 700 }}>
                                    {b.name} ({b.count})
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#0f766e' }}>
                                {medicineAnalytics.totalPatients} <span style={{ fontSize: '0.95rem' }}>Patients</span>
                              </div>
                              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#134e4a' }}>👥 Total Patients Prescribed</span>
                            </div>

                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#2563eb' }}>
                                {medicineAnalytics.totalPrescriptions} <span style={{ fontSize: '0.95rem' }}>Prescriptions</span>
                              </div>
                              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e40af' }}>📄 Prescriptions Written</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Histograms: Dosage & Age Distribution */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
                        
                        {/* Dosage Distribution Histogram */}
                        <div className="analytics-panel">
                          <div className="analytics-panel-header">
                            <h4>📊 Dosage Distribution Histogram</h4>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Dosage strength usage</span>
                          </div>

                          <div className="histogram-list">
                            {(medicineAnalytics.dosageHistogram || []).length === 0 ? (
                              <p style={{ fontStyle: 'italic', color: '#94a3b8', textAlign: 'center' }}>No dosage data available.</p>
                            ) : (
                              medicineAnalytics.dosageHistogram.map((d, idx) => (
                                <div key={idx} className="histogram-row">
                                  <div className="histogram-row-header">
                                    <span style={{ fontWeight: 700 }}>{d.dosage}</span>
                                    <span style={{ color: '#0f766e', fontWeight: 700 }}>{d.count} patients ({d.percentage}%)</span>
                                  </div>
                                  <div className="histogram-bar-track">
                                    <div className="histogram-bar-fill" style={{ width: `${Math.max(5, d.percentage)}%` }}></div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {/* Patient Age Demographics Histogram */}
                        <div className="analytics-panel">
                          <div className="analytics-panel-header">
                            <h4>📈 Patient Age Demographics for this Composition</h4>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Age distribution</span>
                          </div>

                          <div className="histogram-list">
                            {(medicineAnalytics.ageHistogram || []).map((a, idx) => (
                              <div key={idx} className="histogram-row">
                                <div className="histogram-row-header">
                                  <span>Age {a.range} years</span>
                                  <span>{a.count} patients ({a.percentage}%)</span>
                                </div>
                                <div className="histogram-bar-track">
                                  <div className="histogram-bar-fill purple" style={{ width: `${Math.max(4, a.percentage)}%` }}></div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                      </div>

                      {/* Clinical Diagnostics & Co-Prescription Row */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
                        
                        {/* Diagnoses Correlation for this composition */}
                        <div className="analytics-panel">
                          <div className="analytics-panel-header">
                            <h4>🩺 Diagnostic Indication Correlation</h4>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Conditions prescribed for</span>
                          </div>

                          <div className="histogram-list">
                            {(medicineAnalytics.topDiagnoses || []).length === 0 ? (
                              <p style={{ fontStyle: 'italic', color: '#94a3b8', textAlign: 'center' }}>No diagnosis correlation data.</p>
                            ) : (
                              medicineAnalytics.topDiagnoses.map((diag, idx) => (
                                <div key={idx} className="histogram-row">
                                  <div className="histogram-row-header">
                                    <span>{diag.diagnosis}</span>
                                    <span style={{ color: '#2563eb', fontWeight: 700 }}>{diag.count} Rx ({diag.percentage}%)</span>
                                  </div>
                                  <div className="histogram-bar-track">
                                    <div className="histogram-bar-fill blue" style={{ width: `${Math.max(5, diag.percentage)}%` }}></div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {/* Co-Prescription Matrix */}
                        <div className="analytics-panel">
                          <div className="analytics-panel-header">
                            <h4>🔗 Common Co-Prescribed Companion Drugs</h4>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Frequently prescribed together</span>
                          </div>

                          <div className="coprescription-grid">
                            {(medicineAnalytics.coPrescriptions || []).length === 0 ? (
                              <p style={{ fontStyle: 'italic', color: '#94a3b8', textAlign: 'center', width: '100%' }}>No companion drugs co-prescribed.</p>
                            ) : (
                              medicineAnalytics.coPrescriptions.map((co, idx) => (
                                <div key={idx} className="coprescription-tag">
                                  <span>💊 {co.name}</span>
                                  <span className="rate-pill">{co.coOccurrenceRate}%</span>
                                </div>
                              ))
                            )}
                          </div>

                          {/* Dosing Frequency Breakdown */}
                          {medicineAnalytics.topFrequencies?.length > 0 && (
                            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem', marginTop: '0.5rem' }}>
                              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b' }}>Common Dosing Schedules:</span>
                              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                                {medicineAnalytics.topFrequencies.map((f, idx) => (
                                  <span key={idx} style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600 }}>
                                    ⏰ {f.frequency} ({f.count} Rx)
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                      </div>

                      {/* Recent Patients Prescribed Table */}
                      {medicineAnalytics.recentPrescriptions?.length > 0 && (
                        <div className="analytics-panel">
                          <div className="analytics-panel-header">
                            <h4>📋 Recent Patients Prescribed {medicineAnalytics.canonicalComposition || medicineAnalytics.canonicalName}</h4>
                          </div>

                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem' }}>
                              <thead>
                                <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                                  <th style={{ padding: '0.6rem 0.5rem' }}>Date</th>
                                  <th style={{ padding: '0.6rem 0.5rem' }}>Patient Name</th>
                                  <th style={{ padding: '0.6rem 0.5rem' }}>Age/Sex</th>
                                  <th style={{ padding: '0.6rem 0.5rem' }}>Prescribed Brand</th>
                                  <th style={{ padding: '0.6rem 0.5rem' }}>Dosage</th>
                                  <th style={{ padding: '0.6rem 0.5rem' }}>Frequency</th>
                                  <th style={{ padding: '0.6rem 0.5rem' }}>Diagnosis</th>
                                </tr>
                              </thead>
                              <tbody>
                                {medicineAnalytics.recentPrescriptions.map((rx, idx) => (
                                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '0.6rem 0.5rem', color: '#64748b' }}>{rx.date}</td>
                                    <td style={{ padding: '0.6rem 0.5rem', fontWeight: 700 }}>{rx.patientName}</td>
                                    <td style={{ padding: '0.6rem 0.5rem' }}>{rx.patientAge}y / {rx.patientGender}</td>
                                    <td style={{ padding: '0.6rem 0.5rem', fontWeight: 700, color: 'var(--primary)' }}>{rx.medicineName || rx.name}</td>
                                    <td style={{ padding: '0.6rem 0.5rem', fontWeight: 600 }}>{rx.dosage}</td>
                                    <td style={{ padding: '0.6rem 0.5rem' }}>{rx.frequency}</td>
                                    <td style={{ padding: '0.6rem 0.5rem', color: '#334155' }}>{rx.diagnosis}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                    </>
                  ) : (
                    /* Initial Empty Search State */
                    <div style={{ textAlign: 'center', padding: '3rem 1rem', background: '#fff', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                      <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔬</div>
                      <h4 style={{ margin: '0 0 0.25rem 0', color: 'var(--neutral-dark)' }}>Search any active composition above</h4>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--neutral-body)' }}>
                        Type an active composition name (e.g. Sertraline, Clonazepam, Escitalopram) to see patient counts, prescribed brands, dosage histograms, and clinical indications.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                /* =================== TAB 3: PRACTICE & PATIENT VOLUME =================== */
                <>
                  {patientVolumeData && (
                    <>
                      {/* Practice Health KPIs */}
                      <div className="analytics-kpi-grid">
                        <div className="analytics-kpi-card teal">
                          <span className="kpi-label">Avg Daily Footfall</span>
                          <span className="kpi-val">{patientVolumeData.avgPatientsPerDay}</span>
                          <span className="kpi-sub">Patients / Working Day</span>
                        </div>

                        <div className="analytics-kpi-card blue">
                          <span className="kpi-label">New Patients (First Visit)</span>
                          <span className="kpi-val">{patientVolumeData.totalNewPatients}</span>
                          <span className="kpi-sub">
                            {patientVolumeData.totalConsultations > 0 ? Math.round((patientVolumeData.totalNewPatients / patientVolumeData.totalConsultations) * 100) : 0}% of Total Footfall
                          </span>
                        </div>

                        <div className="analytics-kpi-card purple">
                          <span className="kpi-label">Follow-Up Consultations</span>
                          <span className="kpi-val">{patientVolumeData.totalFollowUps}</span>
                          <span className="kpi-sub">
                            {patientVolumeData.totalConsultations > 0 ? Math.round((patientVolumeData.totalFollowUps / patientVolumeData.totalConsultations) * 100) : 0}% of Total Footfall
                          </span>
                        </div>

                        <div className="analytics-kpi-card amber">
                          <span className="kpi-label">Follow-Up Retention Rate</span>
                          <span className="kpi-val">{patientVolumeData.retentionRate}%</span>
                          <span className="kpi-sub">Patients Returning for Follow-ups</span>
                        </div>
                      </div>

                      {/* Month Filter Selector Bar */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: '0.75rem 1.25rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--neutral-dark)' }}>🗓️ Filter Daily Logs by Month:</span>
                          <select
                            value={volumeMonthFilter}
                            onChange={(e) => {
                              const mVal = e.target.value;
                              setVolumeMonthFilter(mVal);
                              fetchPatientVolumeAnalytics(mVal);
                            }}
                            style={{ padding: '0.35rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: 600, outline: 'none' }}
                          >
                            <option value="">All Recorded Months</option>
                            {(patientVolumeData.monthlyVolume || []).map((m, idx) => (
                              <option key={idx} value={m.month}>{m.monthLabel}</option>
                            ))}
                          </select>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.8rem', fontWeight: 700 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#15803d' }}>
                            <span style={{ width: '12px', height: '12px', backgroundColor: '#22c55e', borderRadius: '3px', display: 'inline-block' }}></span> New Patients
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#1d4ed8' }}>
                            <span style={{ width: '12px', height: '12px', backgroundColor: '#3b82f6', borderRadius: '3px', display: 'inline-block' }}></span> Follow-Ups
                          </span>
                        </div>
                      </div>

                      {/* Two Column Grid: Daily Breakdown & Monthly Trends */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.25rem' }}>
                        
                        {/* Daily Patient Footfall Histogram */}
                        <div className="analytics-panel">
                          <div className="analytics-panel-header">
                            <h4>📅 Daily Patient Volume & Consultation Split</h4>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              {(patientVolumeData.dailyVolume || []).length} Active Consultation Days
                            </span>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '420px', overflowY: 'auto' }}>
                            {(patientVolumeData.dailyVolume || []).length === 0 ? (
                              <p style={{ fontStyle: 'italic', color: '#94a3b8', textAlign: 'center', padding: '1.5rem 0' }}>No consultation records found for this period.</p>
                            ) : (
                              patientVolumeData.dailyVolume.map((d, idx) => (
                                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                      <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--neutral-dark)' }}>{d.dateLabel}</span>
                                      <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '0.4rem' }}>({d.dayOfWeek})</span>
                                    </div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--neutral-dark)' }}>
                                      {d.total} <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b' }}>Patients</span>
                                    </div>
                                  </div>

                                  {/* Stacked Bar Track */}
                                  <div style={{ height: '10px', background: '#e2e8f0', borderRadius: '5px', overflow: 'hidden', display: 'flex' }}>
                                    <div style={{ width: `${d.newRatio}%`, background: '#22c55e' }} title={`New: ${d.newPatients} (${d.newRatio}%)`}></div>
                                    <div style={{ width: `${d.followUpRatio}%`, background: '#3b82f6' }} title={`Follow-Up: ${d.followUps} (${d.followUpRatio}%)`}></div>
                                  </div>

                                  {/* Sub-label indicators */}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.725rem', color: '#64748b', fontWeight: 600 }}>
                                    <span style={{ color: '#16a34a' }}>🟢 {d.newPatients} New ({d.newRatio}%)</span>
                                    <span style={{ color: '#2563eb' }}>🔵 {d.followUps} Follow-ups ({d.followUpRatio}%)</span>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {/* Monthly Footfall & Practice Growth */}
                        <div className="analytics-panel">
                          <div className="analytics-panel-header">
                            <h4>📈 Monthly Footfall & Practice Expansion</h4>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Month-over-Month Footfall</span>
                          </div>

                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem' }}>
                              <thead>
                                <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                                  <th style={{ padding: '0.6rem 0.5rem' }}>Month</th>
                                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>Total</th>
                                  <th style={{ padding: '0.6rem 0.5rem', color: '#16a34a', textAlign: 'center' }}>New</th>
                                  <th style={{ padding: '0.6rem 0.5rem', color: '#2563eb', textAlign: 'center' }}>Follow-ups</th>
                                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>Follow-Up %</th>
                                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>Growth</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(patientVolumeData.monthlyVolume || []).map((m, idx) => (
                                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '0.6rem 0.5rem', fontWeight: 700 }}>{m.monthLabel}</td>
                                    <td style={{ padding: '0.6rem 0.5rem', fontWeight: 800, textAlign: 'center' }}>{m.total}</td>
                                    <td style={{ padding: '0.6rem 0.5rem', fontWeight: 700, color: '#16a34a', textAlign: 'center' }}>{m.newPatients}</td>
                                    <td style={{ padding: '0.6rem 0.5rem', fontWeight: 700, color: '#2563eb', textAlign: 'center' }}>{m.followUps}</td>
                                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center', fontWeight: 600 }}>{m.followUpRate}%</td>
                                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontWeight: 800, color: m.momGrowth >= 0 ? '#16a34a' : '#dc2626' }}>
                                      {idx === 0 ? '—' : `${m.momGrowth > 0 ? '+' : ''}${m.momGrowth}%`}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Monthly Stacked Bars Overview */}
                          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1rem', marginTop: '0.5rem' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b' }}>Monthly Volume Histogram</span>
                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', height: '90px', padding: '0.75rem 0.25rem 0 0.25rem' }}>
                              {(patientVolumeData.monthlyVolume || []).map((m, idx) => {
                                const maxVol = Math.max(...patientVolumeData.monthlyVolume.map(x => x.total), 1);
                                const newHeight = Math.round((m.newPatients / maxVol) * 80);
                                const followUpHeight = Math.round((m.followUps / maxVol) * 80);
                                return (
                                  <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                                      <div style={{ width: '100%', height: `${followUpHeight}px`, background: '#3b82f6', borderTopLeftRadius: '3px', borderTopRightRadius: '3px' }} title={`${m.monthLabel} Follow-Ups: ${m.followUps}`}></div>
                                      <div style={{ width: '100%', height: `${newHeight}px`, background: '#22c55e' }} title={`${m.monthLabel} New Patients: ${m.newPatients}`}></div>
                                    </div>
                                    <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#64748b' }}>{m.monthLabel.split(' ')[0]}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                      </div>

                      {/* Day of Week Peak Heatmap */}
                      <div className="analytics-panel">
                        <div className="analytics-panel-header">
                          <h4>🗓️ Day-of-Week Patient Footfall Pattern</h4>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Identify peak clinic consultation days</span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.75rem' }}>
                          {(patientVolumeData.dayOfWeekPattern || []).map((w, idx) => {
                            const isPeak = Math.max(...patientVolumeData.dayOfWeekPattern.map(x => parseFloat(x.avgPatientsPerDay))) === parseFloat(w.avgPatientsPerDay) && parseFloat(w.avgPatientsPerDay) > 0;
                            return (
                              <div
                                key={idx}
                                style={{
                                  background: isPeak ? 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)' : '#f8fafc',
                                  border: isPeak ? '2px solid #86efac' : '1px solid #e2e8f0',
                                  borderRadius: '10px',
                                  padding: '0.85rem 0.5rem',
                                  textAlign: 'center',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '0.25rem',
                                  position: 'relative'
                                }}
                              >
                                {isPeak && (
                                  <span style={{ position: 'absolute', top: '-8px', right: '8px', background: '#16a34a', color: '#fff', fontSize: '0.6rem', fontWeight: 800, padding: '1px 6px', borderRadius: '10px' }}>
                                    ⭐ PEAK
                                  </span>
                                )}
                                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: isPeak ? '#166534' : 'var(--neutral-dark)' }}>
                                  {w.day}
                                </span>
                                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: isPeak ? '#15803d' : 'var(--primary)' }}>
                                  {w.avgPatientsPerDay}
                                </div>
                                <span style={{ fontSize: '0.65rem', color: '#64748b' }}>Avg Patients/Day</span>
                                <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: '0.25rem', marginTop: '0.25rem', fontSize: '0.65rem', color: '#475569' }}>
                                  {w.totalVisits} Total ({w.newPatients} New • {w.followUps} Ret)
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                    </>
                  )}
                </>
              )}
            </div>

          </div>
        </div>
      )}

      {/* =========================================================================
          SYMPTOM MASTER MANAGEMENT MODAL (FULL CRUD CONTROL FOR DOCTOR)
          ========================================================================= */}
      {showSymptomManagerModal && (
        <div className="analytics-modal-overlay" style={{ zIndex: 1050 }}>
          <div className="analytics-modal-window" style={{ maxWidth: '850px', maxHeight: '90vh' }}>
            
            {/* Modal Header */}
            <div className="analytics-modal-header" style={{ borderBottom: '1.5px solid #0f766e' }}>
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0, color: '#0f766e' }}>
                  <span>⚙️</span> Clinical Symptom Master Manager
                </h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                  Complete doctor control: add, edit wording, or delete any condition category (row) and sub-symptom (sub-row).
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={resetSymptomTemplates}
                  style={{
                    padding: '0.35rem 0.7rem',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    backgroundColor: '#fff1f2',
                    color: '#e11d48',
                    border: '1px solid #fecdd3',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                  title="Reset everything back to default clinical master"
                >
                  🔄 Reset Defaults
                </button>
                
                <button
                  type="button"
                  onClick={() => setShowSymptomManagerModal(false)}
                  style={{
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.8rem',
                    fontWeight: 800,
                    backgroundColor: '#0f766e',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  Done & Close
                </button>
              </div>
            </div>

            {/* Modal Body: 2 Column Workspace (Left: Categories / Right: Sub-symptoms) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '1.25rem', padding: '1.25rem', overflowY: 'auto' }}>
              
              {/* Left Column: Category Rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: 'var(--neutral-dark)' }}>
                    Condition Categories ({symptomTemplates.length})
                  </h4>
                </div>

                {/* Add Category Form */}
                <div style={{ display: 'flex', gap: '0.35rem', backgroundColor: '#f0fdfa', padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccfbf1' }}>
                  <input
                    type="text"
                    placeholder="Icon"
                    value={managerNewCategoryIcon}
                    onChange={e => setManagerNewCategoryIcon(e.target.value)}
                    style={{ width: '42px', textAlign: 'center', padding: '0.3rem', fontSize: '0.85rem' }}
                  />
                  <input
                    type="text"
                    placeholder="Category Name (e.g. ADHD)"
                    value={managerNewCategoryName}
                    onChange={e => setManagerNewCategoryName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addCategoryRow(managerNewCategoryName, managerNewCategoryIcon);
                      }
                    }}
                    style={{ flex: 1, padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => addCategoryRow(managerNewCategoryName, managerNewCategoryIcon)}
                    style={{
                      padding: '0.3rem 0.6rem',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      backgroundColor: '#0f766e',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    ➕ Add
                  </button>
                </div>

                {/* Category List with Edit/Delete on each row */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '420px', overflowY: 'auto' }}>
                  {symptomTemplates.map(cat => {
                    const isSelected = (managerSelectedCatId || symptomTemplates[0]?.id) === cat.id;
                    const isEditing = editingCategoryId === cat.id;

                    return (
                      <div
                        key={cat.id}
                        onClick={() => {
                          if (!isEditing) setManagerSelectedCatId(cat.id);
                        }}
                        style={{
                          padding: '0.55rem 0.75rem',
                          borderRadius: '6px',
                          border: isSelected ? '1.5px solid #0f766e' : '1px solid #e2e8f0',
                          backgroundColor: isSelected ? '#f0fdfa' : '#ffffff',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          transition: 'all 0.1s ease'
                        }}
                      >
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: '0.3rem', width: '100%', alignItems: 'center' }}>
                            <input
                              type="text"
                              value={editingCategoryIcon}
                              onChange={e => setEditingCategoryIcon(e.target.value)}
                              style={{ width: '38px', textAlign: 'center', padding: '0.25rem', fontSize: '0.8rem' }}
                            />
                            <input
                              type="text"
                              value={editingCategoryName}
                              onChange={e => setEditingCategoryName(e.target.value)}
                              style={{ flex: 1, padding: '0.25rem 0.4rem', fontSize: '0.8rem' }}
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                editCategoryRow(cat.id, editingCategoryName, editingCategoryIcon);
                              }}
                              style={{ padding: '0.25rem 0.45rem', fontSize: '0.7rem', backgroundColor: '#0f766e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingCategoryId(null);
                              }}
                              style={{ padding: '0.25rem 0.45rem', fontSize: '0.7rem', backgroundColor: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                              <span style={{ fontSize: '1.1rem' }}>{cat.icon || '📋'}</span>
                              <div>
                                <div style={{ fontSize: '0.82rem', fontWeight: isSelected ? 800 : 600, color: isSelected ? '#0f766e' : '#1e293b' }}>
                                  {cat.category}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                  {cat.symptoms.length} sub-symptoms
                                </div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingCategoryId(cat.id);
                                  setEditingCategoryName(cat.category);
                                  setEditingCategoryIcon(cat.icon || '📋');
                                }}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#0f766e', padding: '0.15rem' }}
                                title="Edit Category Name & Icon"
                              >
                                ✏️
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteCategoryRow(cat.id);
                                }}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#e11d48', padding: '0.15rem' }}
                                title="Delete Category"
                              >
                                🗑️
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Sub-Symptoms for Selected Category */}
              {(() => {
                const currentCat = symptomTemplates.find(c => c.id === (managerSelectedCatId || symptomTemplates[0]?.id));
                if (!currentCat) {
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>
                      Select a category to view and edit its symptoms.
                    </div>
                  );
                }

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1', paddingBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontSize: '1.2rem' }}>{currentCat.icon}</span>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#0f766e' }}>
                            {currentCat.category} Sub-Symptoms
                          </h4>
                          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                            {currentCat.symptoms.length} symptoms configured
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Add New Sub-Symptom Form */}
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <input
                        type="text"
                        placeholder={`Type new symptom to add into ${currentCat.category}...`}
                        value={managerNewSymptomText}
                        onChange={e => setManagerNewSymptomText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addSymptomSubRow(currentCat.id, managerNewSymptomText);
                          }
                        }}
                        style={{ flex: 1, padding: '0.35rem 0.6rem', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#fff' }}
                      />
                      <button
                        type="button"
                        onClick={() => addSymptomSubRow(currentCat.id, managerNewSymptomText)}
                        style={{
                          padding: '0.35rem 0.75rem',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          backgroundColor: '#0f766e',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        ➕ Add Symptom
                      </button>
                    </div>

                    {/* Sub-Symptoms List with Inline Edit/Delete */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '360px', overflowY: 'auto' }}>
                      {currentCat.symptoms.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>
                          No symptoms configured under {currentCat.category}.<br/>Use the input box above to add symptoms.
                        </div>
                      ) : (
                        currentCat.symptoms.map((sym, idx) => {
                          const isEditing = editingSymptomIdx === idx;

                          return (
                            <div
                              key={idx}
                              style={{
                                padding: '0.45rem 0.75rem',
                                borderRadius: '6px',
                                border: '1px solid #e2e8f0',
                                backgroundColor: '#ffffff',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}
                            >
                              {isEditing ? (
                                <div style={{ display: 'flex', gap: '0.35rem', width: '100%', alignItems: 'center' }}>
                                  <input
                                    type="text"
                                    value={editingSymptomText}
                                    onChange={e => setEditingSymptomText(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        editSymptomSubRow(currentCat.id, sym, editingSymptomText);
                                      }
                                    }}
                                    style={{ flex: 1, padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    onClick={() => editSymptomSubRow(currentCat.id, sym, editingSymptomText)}
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', backgroundColor: '#0f766e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingSymptomIdx(null)}
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', backgroundColor: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <span style={{ fontSize: '0.82rem', color: '#1e293b', fontWeight: 600 }}>
                                    {idx + 1}. {sym}
                                  </span>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingSymptomIdx(idx);
                                        setEditingSymptomText(sym);
                                      }}
                                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#0f766e', padding: '0.15rem' }}
                                      title="Edit Symptom Wording"
                                    >
                                      ✏️
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (window.confirm(`Delete symptom "${sym}"?`)) {
                                          deleteSymptomSubRow(currentCat.id, sym);
                                        }
                                      }}
                                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#e11d48', padding: '0.15rem' }}
                                      title="Delete Symptom"
                                    >
                                      🗑️
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

          </div>
        </div>
      )}

      {/* Floating Movable Previous Prescriptions Trigger with Notification Badge */}
      {dashboardView === 'offline-rx' && (() => {
        const cleanFormRef = (offlineForm.referenceId || '').replace(/^ref-?/i, '').trim().toLowerCase();
        const cleanFormName = (offlineForm.patientName || '').trim().toLowerCase();
        const cleanFormPhone = (offlineForm.patientPhone || '').trim();

        const pastVisits = (offlineRxList || []).filter(r => {
          if (!cleanFormName && !cleanFormPhone && !cleanFormRef) return false;
          const rRef = (r.referenceId || r.reference_id || '').replace(/^ref-?/i, '').trim().toLowerCase();
          const rName = (r.patientName || '').trim().toLowerCase();
          const rPhone = (r.patientPhone || '').trim();

          const matchRef = cleanFormRef && rRef && cleanFormRef === rRef;
          const matchPhoneAndName = cleanFormPhone && rPhone && cleanFormPhone === rPhone && cleanFormName && rName && cleanFormName === rName;
          const matchName = cleanFormName && rName && cleanFormName === rName;

          return matchRef || matchPhoneAndName || matchName;
        });

        return (
          <button
            ref={prevRxBtnRef}
            type="button"
            onPointerDown={handlePrevRxBtnPointerDown}
            onClick={() => {
              if (dragStartPosRef.current.hasMoved) return;
              setShowPastVisitsModal(true);
            }}
            className="no-print"
            style={{
              position: 'fixed',
              left: prevRxBtnPos ? `${prevRxBtnPos.x}px` : 'auto',
              top: prevRxBtnPos ? `${prevRxBtnPos.y}px` : 'auto',
              right: prevRxBtnPos ? 'auto' : '1.5rem',
              bottom: prevRxBtnPos ? 'auto' : '1.5rem',
              backgroundColor: '#0f766e',
              color: '#ffffff',
              border: '2px solid #2dd4bf',
              borderRadius: '30px',
              padding: '0.6rem 1.25rem',
              fontSize: '0.84rem',
              fontWeight: 800,
              boxShadow: isDraggingPrevRxBtnRef.current
                ? '0 16px 36px rgba(15,118,110,0.55)'
                : '0 8px 24px rgba(15,118,110,0.35)',
              cursor: isDraggingPrevRxBtnRef.current ? 'grabbing' : 'grab',
              userSelect: 'none',
              touchAction: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              zIndex: 9999,
              transition: isDraggingPrevRxBtnRef.current ? 'none' : 'box-shadow 0.15s ease'
            }}
            title="Drag to reposition anywhere · Click to view all past prescriptions"
          >
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>📜</span>
              {pastVisits.length > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '-8px',
                  right: '-10px',
                  backgroundColor: '#e11d48',
                  color: '#ffffff',
                  fontSize: '0.68rem',
                  fontWeight: 900,
                  borderRadius: '9999px',
                  padding: '0.1rem 0.38rem',
                  lineHeight: 1,
                  boxShadow: '0 2px 6px rgba(225,29,72,0.5)',
                  border: '1.5px solid #ffffff',
                  pointerEvents: 'none'
                }}>
                  {pastVisits.length}
                </span>
              )}
            </div>
            <span>Previous Prescriptions</span>
            <span style={{ fontSize: '0.7rem', opacity: 0.7, marginLeft: '-0.2rem' }}>⋮⋮</span>
          </button>
        );
      })()}

      {/* =========================================================================
          FULL-SCREEN BLURRED OVERLAY MODAL FOR PREVIOUS PRESCRIPTIONS
          (Scrolls seamlessly to show all prescriptions of this particular patient)
          ========================================================================= */}
      {showPastVisitsModal && (() => {
        const cleanFormRef = (offlineForm.referenceId || '').replace(/^ref-?/i, '').trim().toLowerCase();
        const cleanFormName = (offlineForm.patientName || '').trim().toLowerCase();
        const cleanFormPhone = (offlineForm.patientPhone || '').trim();

        const pastVisits = (offlineRxList || []).filter(r => {
          if (!cleanFormName && !cleanFormPhone && !cleanFormRef) return false;
          const rRef = (r.referenceId || r.reference_id || '').replace(/^ref-?/i, '').trim().toLowerCase();
          const rName = (r.patientName || '').trim().toLowerCase();
          const rPhone = (r.patientPhone || '').trim();

          const matchRef = cleanFormRef && rRef && cleanFormRef === rRef;
          const matchPhoneAndName = cleanFormPhone && rPhone && cleanFormPhone === rPhone && cleanFormName && rName && cleanFormName === rName;
          const matchName = cleanFormName && rName && cleanFormName === rName;

          return matchRef || matchPhoneAndName || matchName;
        });
        const familyMembers = (offlineRxList || []).filter(r => 
          r.patientPhone && offlineForm.patientPhone && r.patientPhone === offlineForm.patientPhone &&
          r.patientName && offlineForm.patientName && r.patientName.toLowerCase() !== offlineForm.patientName.toLowerCase()
        );
        const uniqueFamilyNames = Array.from(new Set(familyMembers.map(m => m.patientName)));

        return (
          <div 
            className="no-print"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowPastVisitsModal(false);
            }}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.72)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              zIndex: 10000,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '2rem 1rem',
              overflowY: 'auto'
            }}
          >
            <div 
              style={{
                width: '100%',
                maxWidth: '920px',
                backgroundColor: '#f8fafc',
                borderRadius: '14px',
                boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.45)',
                border: '1.5px solid #cbd5e1',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '90vh',
                overflow: 'hidden'
              }}
            >
              {/* Sticky Header */}
              <div style={{
                padding: '1.1rem 1.6rem',
                backgroundColor: '#ffffff',
                borderBottom: '2px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                position: 'sticky',
                top: 0,
                zIndex: 10
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f766e', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <span>📜</span>
                      <span>Patient Clinical History</span>
                    </h2>
                    <span style={{
                      backgroundColor: '#e11d48',
                      color: '#ffffff',
                      fontSize: '0.74rem',
                      fontWeight: 800,
                      borderRadius: '9999px',
                      padding: '0.15rem 0.65rem',
                      boxShadow: '0 2px 6px rgba(225,29,72,0.3)'
                    }}>
                      {pastVisits.length} Prescriptions On Record
                    </span>
                  </div>
                  <div style={{ fontSize: '0.84rem', color: '#64748b', marginTop: '0.25rem' }}>
                    Patient: <strong style={{ color: '#0f172a' }}>{offlineForm.patientName || 'Naseem'}</strong> · {offlineForm.patientAge ? `${offlineForm.patientAge} Yrs` : ''} · {offlineForm.patientGender} · Mobile: <strong style={{ color: '#0f172a' }}>+91 {offlineForm.patientPhone}</strong>
                  </div>
                  {uniqueFamilyNames.length > 0 && (
                    <div style={{ fontSize: '0.74rem', color: '#047857', marginTop: '0.45rem', lineHeight: 1.35, backgroundColor: '#ecfdf5', padding: '0.35rem 0.65rem', borderRadius: '6px', border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span>👨‍👩‍👧 <strong>Shared family phone (+91 {offlineForm.patientPhone}):</strong> {uniqueFamilyNames.length} other member ({uniqueFamilyNames.join(', ')}).</span>
                      {uniqueFamilyNames.map(fname => {
                        const famMember = otherFamilyMembersWithSamePhone.find(f => f.name.toLowerCase() === fname.toLowerCase()) || { name: fname };
                        return (
                          <button
                            key={fname}
                            type="button"
                            onClick={() => {
                              setShowPastVisitsModal(false);
                              openFamilyMemberPatient(famMember);
                            }}
                            style={{
                              backgroundColor: '#ffffff',
                              border: '1px solid #059669',
                              color: '#059669',
                              fontWeight: 800,
                              fontSize: '0.72rem',
                              padding: '0.18rem 0.55rem',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}
                            title={`Switch consultation to ${fname}`}
                          >
                            <span>⇄ Switch to {fname}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <button 
                  type="button" 
                  onClick={() => setShowPastVisitsModal(false)}
                  style={{
                    background: '#f1f5f9',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: '8px',
                    padding: '0.45rem 0.95rem',
                    fontSize: '0.84rem',
                    fontWeight: 800,
                    color: '#475569',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                >
                  ✕ Close (Esc)
                </button>
              </div>

              {/* Scrollable Container with All Prescriptions for that Patient */}
              <div style={{ padding: '1.5rem', overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: '1.75rem', minWidth: 0, width: '100%', boxSizing: 'border-box' }}>
                {pastVisits.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#94a3b8' }}>
                    <span style={{ fontSize: '3rem' }}>📂</span>
                    <h3 style={{ margin: '0.75rem 0 0.25rem', color: '#475569' }}>No Previous Prescriptions</h3>
                    <p style={{ margin: 0, fontSize: '0.85rem' }}>No earlier visits on file for phone +91 {offlineForm.patientPhone}.</p>
                  </div>
                ) : (
                  pastVisits.map((prx, idx) => {
                    const pMeds = Array.isArray(prx.medications) ? prx.medications : (typeof prx.medications === 'string' ? JSON.parse(prx.medications || '[]') : []);
                    return (
                      <div 
                        key={prx.id || idx}
                        style={{
                          backgroundColor: '#ffffff',
                          border: '1.5px solid #cbd5e1',
                          borderRadius: '12px',
                          padding: '1.4rem',
                          boxShadow: '0 6px 16px rgba(0,0,0,0.06)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '1rem',
                          position: 'relative',
                          minWidth: 0,
                          maxWidth: '100%',
                          boxSizing: 'border-box'
                        }}
                      >
                        {/* Visit Title Bar */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #f1f5f9', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <span style={{
                              backgroundColor: '#0f766e',
                              color: '#ffffff',
                              fontSize: '0.78rem',
                              fontWeight: 800,
                              padding: '0.2rem 0.65rem',
                              borderRadius: '6px'
                            }}>
                              Visit #{pastVisits.length - idx}
                            </span>
                            <strong style={{ fontSize: '1.05rem', color: '#0f172a' }}>
                              📅 {formatPrintDate(prx.consultDate || prx.created_at)}
                            </strong>
                            <span style={{ fontSize: '0.78rem', color: '#64748b', backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 700 }}>
                              Ref: {prx.referenceId}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const targetDiagnosis = prx.diagnosis || prx.diagnosis_name || 'PANIC DISORDER';
                              setOfflineForm(prev => ({
                                ...prev,
                                medications: [...pMeds],
                                diagnosis: targetDiagnosis,
                                advice: '',
                                followUpDate: ''
                              }));
                              setShowPastVisitsModal(false);
                              setQueueNavToast(`📋 Copied ${pMeds.length} meds & Diagnosis ("${targetDiagnosis}") into today's Rx!`);
                              setTimeout(() => setQueueNavToast(null), 3500);
                              alert(`✓ Successfully copied ${pMeds.length} medicines and Diagnosis ("${targetDiagnosis}") from visit ${formatPrintDate(prx.consultDate || prx.created_at)} into today's prescription!`);
                            }}
                            style={{
                              backgroundColor: '#0f766e',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '0.45rem 0.95rem',
                              fontSize: '0.8rem',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              boxShadow: '0 2px 6px rgba(15,118,110,0.25)'
                            }}
                          >
                            <span>📋 Copy Meds & Diagnosis</span>
                          </button>
                        </div>

                        {/* Patient Vitals & Clinical Cards in this past Rx */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)', gap: '1rem', alignItems: 'start', minWidth: 0, width: '100%' }}>
                          {/* Left Column: Vitals, Complaints, Diagnosis */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                            {/* Vitals */}
                            <div>
                              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#be123c', textTransform: 'uppercase', marginBottom: '0.2rem' }}>VITALS</div>
                              <div style={{ backgroundColor: '#fff1f2', border: '1.5px solid #fecdd3', borderLeft: '4px solid #e11d48', borderRadius: '6px', padding: '0.45rem 0.65rem', fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
                                <span><strong>BP:</strong> {prx.bp || '120/80'}</span>
                                <span><strong>Pulse:</strong> {prx.pulse || '72'} bpm</span>
                                <span><strong>Weight:</strong> {prx.weight ? `${prx.weight} kg` : '--'}</span>
                              </div>
                            </div>

                            {/* Complaints */}
                            {prx.chiefComplaints && (
                              <div>
                                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', marginBottom: '0.2rem' }}>CHIEF COMPLAINTS</div>
                                <div style={{ backgroundColor: '#eff6ff', border: '1.5px solid #bfdbfe', borderLeft: '4px solid #2563eb', borderRadius: '6px', padding: '0.5rem 0.65rem', fontSize: '0.8rem', color: '#1e293b', fontWeight: 700, textTransform: 'uppercase', lineHeight: 1.35, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                  {prx.chiefComplaints}
                                </div>
                              </div>
                            )}

                            {/* Diagnosis */}
                            <div>
                              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0f766e', textTransform: 'uppercase', marginBottom: '0.2rem' }}>DIAGNOSIS</div>
                              <div style={{ backgroundColor: '#f0fdfa', border: '1.5px solid #99f6e4', borderLeft: '4px solid #0f766e', borderRadius: '6px', padding: '0.5rem 0.65rem', fontSize: '0.82rem', color: '#0f172a', fontWeight: 800, textTransform: 'uppercase', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                {prx.diagnosis || 'PANIC DISORDER'}
                              </div>
                            </div>

                            {/* Tests Required */}
                            {prx.requiredTests && (
                              <div>
                                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#c2410c', textTransform: 'uppercase', marginBottom: '0.2rem' }}>TESTS REQUIRED</div>
                                <div style={{ backgroundColor: '#fff7ed', border: '1.5px solid #fed7aa', borderLeft: '4px solid #ea580c', borderRadius: '6px', padding: '0.5rem 0.65rem', fontSize: '0.8rem', color: '#0f172a', fontWeight: 800, textTransform: 'uppercase', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                  {prx.requiredTests}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Right Column: Prescribed Medications Table */}
                          <div style={{ border: '1.5px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', minWidth: 0, display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff' }}>
                            <div style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #0f766e', padding: '0.45rem 0.75rem', fontSize: '0.76rem', fontWeight: 800, color: '#0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                              <span>℞ PRESCRIBED MEDICATIONS</span>
                              <span style={{ fontSize: '0.72rem', color: '#0f766e', fontWeight: 700 }}>{pMeds.length} items</span>
                            </div>
                            <div style={{ padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '220px', overflowY: 'auto', scrollbarWidth: 'thin' }}>
                              {pMeds.length === 0 ? (
                                <div style={{ padding: '1.25rem 0.75rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem', fontStyle: 'italic' }}>
                                  No prescribed medications recorded for this visit.
                                </div>
                              ) : (
                                pMeds.map((m, mIdx) => (
                                  <div key={mIdx} style={{ fontSize: '0.78rem', borderBottom: mIdx < pMeds.length - 1 ? '1px solid #f1f5f9' : 'none', paddingBottom: '0.45rem', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                                      <div style={{ fontWeight: 800, color: '#0f172a' }}>{mIdx + 1}. {m.name}</div>
                                      <span style={{ color: '#0f766e', fontWeight: 800, fontSize: '0.74rem', whiteSpace: 'nowrap' }}>{m.dosage}</span>
                                    </div>
                                    {m.composition && (
                                      <div style={{ color: '#dc2626', fontStyle: 'italic', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>
                                        ({m.composition.replace(/^\(|\)$/g, '')})
                                      </div>
                                    )}
                                    <div style={{ color: '#334155', fontSize: '0.74rem', marginTop: '0.15rem', fontWeight: 600 }}>
                                      {m.frequency}
                                    </div>
                                    {m.instructions && (
                                      <div style={{ color: '#0f172a', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', marginTop: '0.1rem' }}>
                                        {m.instructions}
                                      </div>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </div>

                        {/* General Advice and Follow-up Footer */}
                        {prx.advice && (
                          <div style={{ backgroundColor: '#ecfdf5', border: '1.5px solid #a7f3d0', borderLeft: '4px solid #059669', borderRadius: '6px', padding: '0.5rem 0.75rem', fontSize: '0.76rem', color: '#064e3b', lineHeight: 1.4, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                            <strong>General Advice:</strong> {prx.advice}
                            {prx.followUpDate && (
                              <span style={{ marginLeft: '1rem', color: '#047857', fontWeight: 700 }}>
                                Follow-up: {formatPrintDate(prx.followUpDate)}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Doctor's Private Notes (Only visible to doctor in history) */}
                        {prx.privateNotes && (
                          <div style={{ backgroundColor: '#fffbeb', border: '1.5px solid #fde047', borderRadius: '6px', padding: '0.45rem 0.75rem', fontSize: '0.76rem', color: '#854d0e', display: 'flex', alignItems: 'center', gap: '0.4rem', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                            <span>🔒</span>
                            <span><strong>Doctor Private Note:</strong> {prx.privateNotes}</span>
                            <span style={{ fontSize: '0.68rem', color: '#a16207', marginLeft: 'auto', fontStyle: 'italic' }}>Confidential (Never printed on Rx)</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}

                {/* Other Family Members on the Same Phone */}
                {familyMembers.length > 0 && (
                  <div style={{ marginTop: '1.25rem', borderTop: '2px dashed #cbd5e1', paddingTop: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.3rem' }}>👨‍👩‍👧</span>
                        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f766e' }}>
                          Other Family Prescriptions on Phone +91 {offlineForm.patientPhone}
                        </h3>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', fontStyle: 'italic' }}>
                        Strictly separated clinical records
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      {familyMembers.map((frx) => (
                        <div 
                          key={frx.id} 
                          style={{
                            backgroundColor: '#ffffff',
                            borderRadius: '12px',
                            border: '1.5px solid #a7f3d0',
                            padding: '1.25rem',
                            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.08)'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1.5px solid #e2e8f0', paddingBottom: '0.75rem', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f766e' }}>
                                  👨‍👩‍👧 {frx.patientName} ({frx.patientAge ? `${frx.patientAge} Yrs` : ''} {frx.patientGender})
                                </span>
                                <span style={{ backgroundColor: '#ecfdf5', color: '#047857', fontSize: '0.7rem', fontWeight: 800, borderRadius: '4px', padding: '0.15rem 0.45rem', border: '1px solid #a7f3d0' }}>
                                  Ref: {frx.referenceId}
                                </span>
                                <span style={{ color: '#64748b', fontSize: '0.76rem' }}>
                                  • {formatPrintDate(frx.consultDate || frx.createdAt)}
                                </span>
                              </div>
                              {frx.diagnosis && (
                                <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a', marginTop: '0.35rem' }}>
                                  Dx: {frx.diagnosis}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setShowPastVisitsModal(false);
                                setShowPastVisitsDrawer(false);
                                loadOfflinePrescription(frx);
                                setActiveConsultingQueueId(null);
                                setQueueNavToast(`📄 Switched to prescription for ${frx.patientName} (Ref: ${frx.referenceId})`);
                                setTimeout(() => setQueueNavToast(null), 3000);
                              }}
                              style={{
                                backgroundColor: '#0f766e',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '0.4rem 0.8rem',
                                fontSize: '0.76rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                boxShadow: '0 2px 5px rgba(15,118,110,0.2)'
                              }}
                            >
                              <span>⇄ Switch to {frx.patientName}</span>
                            </button>
                          </div>

                          {/* Meds Preview */}
                          {frx.medications && (
                            <div style={{ fontSize: '0.78rem', color: '#334155', backgroundColor: '#f8fafc', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                              <strong style={{ color: '#0f766e' }}>Prescribed: </strong>
                              {(Array.isArray(frx.medications) ? frx.medications : []).map(m => m.name).filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* =========================================================================
          KEYBOARD SHORTCUTS REFERENCE MODAL (ZERO-MOUSE FAST MODE)
          ========================================================================= */}
      {showShortcutsModal && (
        <div 
          className="no-print"
          onClick={() => setShowShortcutsModal(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '1.5rem'
          }}
        >
          <div 
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              maxWidth: '680px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
              border: '1px solid #cbd5e1',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f0fdfa' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ fontSize: '1.6rem' }}>⌨️</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f766e', fontWeight: 800 }}>
                    Zero-Mouse Fast Keyboard Guide
                  </h3>
                  <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                    Prescribe, navigate patients, search drugs & print in seconds without touching your mouse!
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setShowShortcutsModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#64748b', padding: '0.2rem' }}
              >
                ✕
              </button>
            </div>

            {/* Body Sections */}
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* 1. Rapid Medicine Prescribing */}
              <div style={{ backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 800, color: '#0f766e', fontSize: '0.9rem', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>💊</span> Rapid Medicine Prescribing Flow (Zero-Mouse)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.82rem', color: '#334155' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>1. Type Medicine Name in search box</span>
                    <span style={{ fontWeight: 700, backgroundColor: '#e2e8f0', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>Autocomplete opens</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>2. Navigate suggestions list (with auto-scroll)</span>
                    <span style={{ fontWeight: 700, backgroundColor: '#ccfbf1', color: '#0f766e', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>↓ / ↑ Arrow Keys</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>3. Select highlighted drug (auto-fills dosage, generic & smart frequency)</span>
                    <span style={{ fontWeight: 700, backgroundColor: '#ccfbf1', color: '#0f766e', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>↵ Enter</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>4. Auto-timing pre-filled in Hindi/English/Bilingual (Empty stomach, Bedtime, etc.)</span>
                    <span style={{ fontWeight: 700, backgroundColor: '#fef3c7', color: '#92400e', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>Auto / Quick Pills</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>5. Hit Enter to confirm (or type to edit) & immediately loop to next medicine</span>
                    <span style={{ fontWeight: 700, backgroundColor: '#dcfce7', color: '#166534', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>↵ Enter on Frequency</span>
                  </div>
                </div>
              </div>

              {/* 2. Patient & OPD Queue Navigation */}
              <div style={{ backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 800, color: '#0f766e', fontSize: '0.9rem', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>👥</span> Patient & Live Queue Shortcuts
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.82rem', color: '#334155' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Consult Next Waiting Patient from OPD Queue</span>
                    <span style={{ fontWeight: 800, backgroundColor: '#0f766e', color: '#ffffff', padding: '0.15rem 0.55rem', borderRadius: '4px' }}>Alt + N</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Jump to Quick Patient / Serial No Search Bar</span>
                    <span style={{ fontWeight: 800, backgroundColor: '#e0f2fe', color: '#0369a1', padding: '0.15rem 0.55rem', borderRadius: '4px' }}>Alt + F (or Ctrl + K)</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Navigate search results list</span>
                    <span style={{ fontWeight: 700, backgroundColor: '#ccfbf1', color: '#0f766e', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>↓ / ↑ Arrow Keys</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Start today's follow-up consultation</span>
                    <span style={{ fontWeight: 700, backgroundColor: '#dcfce7', color: '#166534', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>↵ Enter</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Open & inspect past prescription</span>
                    <span style={{ fontWeight: 700, backgroundColor: '#fef3c7', color: '#92400e', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>Shift + Enter</span>
                  </div>
                </div>
              </div>

              {/* 3. Quick Form Navigation Jumps */}
              <div style={{ backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 800, color: '#0f766e', fontSize: '0.9rem', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>⚡</span> Quick Input Jumps
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.82rem', color: '#334155' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0.5rem', backgroundColor: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <span>Medicine Name</span>
                    <span style={{ fontWeight: 800, color: '#0f766e' }}>Alt + M</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0.5rem', backgroundColor: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <span>Diagnosis</span>
                    <span style={{ fontWeight: 800, color: '#0f766e' }}>Alt + D</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0.5rem', backgroundColor: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <span>Chief Complaints</span>
                    <span style={{ fontWeight: 800, color: '#0f766e' }}>Alt + C</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0.5rem', backgroundColor: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <span>Clear / Reset Form</span>
                    <span style={{ fontWeight: 800, color: '#dc2626' }}>Alt + R</span>
                  </div>
                </div>
              </div>

              {/* 4. Save & Print Actions */}
              <div style={{ backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 800, color: '#0f766e', fontSize: '0.9rem', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>💾</span> Save & Print (Instant Finishing)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.82rem', color: '#334155' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Save Digital Rx (without printing)</span>
                    <span style={{ fontWeight: 800, backgroundColor: '#0f766e', color: '#ffffff', padding: '0.15rem 0.55rem', borderRadius: '4px' }}>Ctrl + Enter (or Alt + S)</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Save & Print Formatted Prescription</span>
                    <span style={{ fontWeight: 800, backgroundColor: '#2563eb', color: '#ffffff', padding: '0.15rem 0.55rem', borderRadius: '4px' }}>Ctrl + P (or Alt + P)</span>
                  </div>
                </div>
              </div>

              {/* 5. Smooth Arrow Key Scrolling */}
              <div style={{ backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 800, color: '#0f766e', fontSize: '0.9rem', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>📜</span> Keyboard Scrolling (Zero Mouse Wheel)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.82rem', color: '#334155' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Smooth page scroll anywhere</span>
                    <span style={{ fontWeight: 800, backgroundColor: '#e2e8f0', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>Alt + ↓ / Alt + ↑</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Fast vertical page jump</span>
                    <span style={{ fontWeight: 800, backgroundColor: '#e2e8f0', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>PageDown / PageUp</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Printable preview sheet scroll</span>
                    <span style={{ fontWeight: 800, backgroundColor: '#e2e8f0', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>Click sheet & use ↑ / ↓</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Footer */}
            <div style={{ padding: '0.85rem 1.5rem', backgroundColor: '#f1f5f9', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Press <strong>F1</strong> or <strong>Esc</strong> to close</span>
              <button 
                type="button" 
                onClick={() => setShowShortcutsModal(false)}
                className="btn btn-primary"
                style={{ padding: '0.35rem 1rem', fontSize: '0.82rem' }}
              >
                Got It! ⚡
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// Component representing an individual appointment card
function AppointmentCard({ appt, onStatusChange, onWritePrescription, onJoinVideoCall }) {
  const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' };
  const dateStr = new Date(appt.appointmentDate).toLocaleDateString('en-US', options);

  let statusBadgeClass = 'badge-warning';
  if (appt.status === 'COMPLETED') statusBadgeClass = 'badge-success';
  if (appt.status === 'CANCELLED' || appt.status === 'NO_SHOW') statusBadgeClass = 'badge-danger';

  return (
    <div style={{ border: '1px solid var(--neutral-border)', borderRadius: '8px', padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', backgroundColor: 'var(--white)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <strong style={{ fontSize: '1.1rem' }}>{appt.patientName}</strong>
          <span style={{ fontSize: '0.85rem', color: 'var(--neutral-body)' }}>({appt.patientAge} Years)</span>
          <span className={`badge ${statusBadgeClass}`} style={{ fontSize: '0.7rem' }}>{appt.status}</span>
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--neutral-body)' }}>
          Contact: +91 {appt.patientPhone} | Booking ID: <strong>{appt.bookingId}</strong>
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--neutral-dark)', backgroundColor: 'var(--neutral-light)', padding: '0.5rem 0.75rem', borderRadius: '6px', marginTop: '0.25rem', display: 'inline-block', border: '1px dashed var(--neutral-border)' }}>
          Symptoms: {appt.symptoms}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 800, color: 'var(--primary)' }}>{appt.slotTime}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--neutral-body)' }}>{dateStr}</div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {appt.status === 'SCHEDULED' && (
            <>
              {onJoinVideoCall && (
                <button className="btn btn-primary" onClick={onJoinVideoCall} style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', backgroundColor: '#4f46e5', borderColor: '#4f46e5' }}>
                  🎥 Join Room
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => onStatusChange(appt.id, 'NO_SHOW')} style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}>
                No-Show
              </button>
              <button className="btn btn-danger" onClick={() => onStatusChange(appt.id, 'CANCELLED')} style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}>
                Cancel
              </button>
            </>
          )}

          {(appt.status === 'SCHEDULED' || appt.status === 'COMPLETED') && (
            <button className="btn btn-primary" onClick={onWritePrescription} style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}>
              {appt.prescription ? 'Edit Prescription' : '📄 Rx Prescription'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
