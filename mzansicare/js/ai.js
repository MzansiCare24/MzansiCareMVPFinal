// AI utilities and demo implementations for hackathon features
// Note: These are client-side stubs. For production, back with serverless APIs or hosted models.

// --- AI Triage ---
async function analyzeSymptoms(symptoms, patientProfile = {}) {
  // Prefer callable function if available
  try {
    if (window.firebase && firebase.functions) {
      const fn = firebase.functions().httpsCallable('aiTriage');
      const res = await fn({ symptoms, profile: patientProfile });
      if (res && res.data && res.data.urgency) return res.data;
    }
  } catch (e) { console.warn('Callable aiTriage failed, falling back to client heuristic', e); }
  // Fallback: client heuristic
  const text = (symptoms || '').toLowerCase();
  let score = 0;
  const weights = {
    'chest pain': 3,
    breathless: 2,
    bleeding: 2,
    faint: 2,
    fever: 1,
    cough: 1,
    dehydration: 2,
  };
  Object.keys(weights).forEach(k => { if (text.includes(k)) score += weights[k]; });
  if ((patientProfile.age || 0) >= 65) score += 1;
  if ((patientProfile.conditions || '').toLowerCase().includes('pregnan')) score += 1;

  const urgency = score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low';
  const suggested_clinic = text.includes('chest') ? 'Emergency / GP' : text.includes('cough') ? 'GP / Respiratory' : 'General';
  const estimated_wait = urgency === 'high' ? '10-20 min' : urgency === 'medium' ? '30-60 min' : '60-120 min';
  return { urgency, suggested_clinic, estimated_wait };
}

// --- TTS helper ---
function speak(text) {
  try {
    if ('speechSynthesis' in window && text) {
      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = 'en-ZA';
      window.speechSynthesis.speak(u);
    }
  } catch {}
}

// --- Medication Checker (mocked with simple rules) ---
class MedicationAI {
  async checkInteractions(currentMeds = [], newMed = '', patientConditions = []) {
    // Prefer callable function if available
    try {
      if (window.firebase && firebase.functions) {
        const fn = firebase.functions().httpsCallable('aiMedCheck');
        const res = await fn({ currentMeds, newMed, patientConditions });
        if (res && res.data) return res.data;
      }
    } catch (e) { console.warn('Callable aiMedCheck failed, falling back to client rules', e); }
    const lowerMeds = currentMeds.map(m => m.toLowerCase().trim());
    const lowerNew = (newMed || '').toLowerCase().trim();
    const interactions = [];

    // Demo: Warfarin + NSAIDs → bleeding risk
    if (lowerMeds.includes('warfarin') && ['ibuprofen', 'aspirin', 'naproxen'].includes(lowerNew)) {
      interactions.push({
        drugs: ['Warfarin', newMed],
        risk: 'high',
        effect: 'Increased bleeding risk',
        suggestion: 'Consider paracetamol (acetaminophen) and consult your clinician.'
      });
    }

    // Demo: Asthma + non-selective beta blockers
    if (patientConditions.map(c => c.toLowerCase()).some(c => c.includes('asthma')) && lowerNew.includes('propranolol')) {
      interactions.push({
        drugs: [newMed],
        risk: 'medium',
        effect: 'May worsen bronchospasm in asthma',
        suggestion: 'Ask about cardioselective alternatives or non-pharmacological options.'
      });
    }

    return {
      safe: interactions.length === 0,
      interactions,
      south_africa_specific: true
    };
  }
}

// --- Document OCR ---
class DocumentAIScanner {
  async #fileToImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  #imageToImageData(img) {
    const canvas = document.createElement('canvas');
    const maxSide = 1024; // avoid massive canvases
    let { width, height } = img;
    const scale = Math.min(1, maxSide / Math.max(width, height));
    width = Math.floor(width * scale); height = Math.floor(height * scale);
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    return { data: imageData.data, width, height };
  }
  async scanMedicalCard(file) {
    if (!window.Tesseract) throw new Error('Tesseract not loaded');
    // 1) OCR via Tesseract
    const result = await Tesseract.recognize(file, 'eng');
    const text = result?.data?.text || '';
    // Heuristic extraction (demo). Replace with regex/NLP for better results.
    const extracted = {
      patient_name: (/name[:\s]+([A-Za-z\s]+)/i.exec(text) || [])[1] || '',
      clinic_id: (/(clinic id|id)[:\s]+([A-Za-z0-9\-]+)/i.exec(text) || [])[2] || '',
      blood_type: (/(blood)[:\s]+([ABO][+-])/i.exec(text) || [])[2] || '',
      conditions: []
    };

    // 2) Try to decode QR code from the image if a QR exists
    try {
      if (window.jsQR) {
        const img = await this.#fileToImage(file);
        const { data, width, height } = this.#imageToImageData(img);
        const code = jsQR(data, width, height, { inversionAttempts: 'dontInvert' });
        if (code && code.data) {
          extracted.qr_text = code.data;
          // If QR payload is JSON, merge meaningful fields
          try {
            const parsed = JSON.parse(code.data);
            if (parsed && typeof parsed === 'object') {
              if (parsed.name) extracted.patient_name = extracted.patient_name || parsed.name;
              if (parsed.clinicId) extracted.clinic_id = extracted.clinic_id || parsed.clinicId;
              if (parsed.bloodType) extracted.blood_type = extracted.blood_type || parsed.bloodType;
              if (parsed.conditions) extracted.conditions = Array.isArray(parsed.conditions) ? parsed.conditions : String(parsed.conditions).split(',').map(s=>s.trim()).filter(Boolean);
              if (parsed.medications) extracted.medications = Array.isArray(parsed.medications) ? parsed.medications : String(parsed.medications).split(',').map(s=>s.trim()).filter(Boolean);
              if (parsed.emergencyContact) extracted.emergency_contact = parsed.emergencyContact;
            }
          } catch { /* QR was not JSON; keep raw text */ }
        }
      }
    } catch (qrErr) {
      console.warn('QR decode failed', qrErr);
    }

    return { extracted_data: extracted, confidence: result?.data?.confidence || 0 };
  }
  async saveToProfile(extracted) {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not signed in');
      const ref = db.collection('patients').doc(user.uid);
      const payload = {};
      if (extracted.patient_name) payload.name = extracted.patient_name;
      if (extracted.clinic_id) payload.clinicId = extracted.clinic_id;
      if (extracted.blood_type) payload.bloodType = extracted.blood_type;
      if (Array.isArray(extracted.conditions) && extracted.conditions.length) payload.conditions = extracted.conditions.join(', ');
      if (Object.keys(payload).length) await ref.set(payload, { merge: true });
      return true;
    } catch (e) { console.warn('Failed to save OCR to profile', e); return false; }
  }
}

// --- Queue Optimizer (baseline heuristic) ---
class QueueOptimizer {
  optimizeSchedule(appointments = [], staffAvailability = {}, emergencyCases = 0) {
    // Simple heuristic: spread appointments and account for emergencies.
    const predicted_wait_times = {};
    const peaks = ['10:00', '11:00', '14:00'];
    peaks.forEach(t => predicted_wait_times[t] = emergencyCases > 0 ? '45-60 min' : '20-40 min');
    return {
      optimized_schedule: appointments, // unchanged for demo
      predicted_wait_times,
      suggestions: [
        emergencyCases > 0 ? 'Allocate one staff to triage emergencies.' : 'Maintain current staffing.',
        'Offer pre-screening via AI Triage to route patients effectively.'
      ]
    };
  }
}

// ---- UI wiring for modals ----
(function(){
  function bindOpen(btnId, modalId) {
    const btn = document.getElementById(btnId);
    const modal = document.getElementById(modalId);
    if (btn && modal) btn.addEventListener('click', ()=> modal.style.display='flex');
  }
  function bindClose() {
    document.querySelectorAll('.close-modal').forEach(x=>{
      x.addEventListener('click', ()=>{
        const target = x.getAttribute('data-close');
        const m = target ? document.querySelector(target) : x.closest('.modal');
        if (m) m.style.display='none';
      });
    });
    window.addEventListener('click', (e)=>{
      document.querySelectorAll('.modal').forEach(m=>{ if(e.target===m) m.style.display='none'; });
    });
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    bindOpen('open-triage','triage-modal');
    bindOpen('open-med-ai','med-ai-modal');
    bindOpen('open-ocr','ocr-modal');
    bindClose();

    // Triage submit
    const triageForm = document.getElementById('triage-form');
    const triageResult = document.getElementById('triage-result');
    const triageMic = document.getElementById('triage-mic');
    if (triageForm && triageResult) {
      triageForm.addEventListener('submit', async (e)=>{
        e.preventDefault();
        // Show lottie loader
        const triageLoad = document.getElementById('triage-loading');
        let anim; if (triageLoad && window.lottie) {
          triageLoad.style.display='block';
          anim = lottie.loadAnimation({ container: triageLoad, renderer: 'svg', loop: true, autoplay: true, path: 'https://assets1.lottiefiles.com/packages/lf20_ydo1amjm.json' });
        }
        const symptoms = document.getElementById('triage-symptoms').value;
        const profile = {
          age: window.currentUserProfile?.age || 35,
          conditions: window.currentUserProfile?.conditions || ''
        };
        triageResult.innerHTML = 'Analyzing…';
        try {
          const out = await analyzeSymptoms(symptoms, profile);
          triageResult.innerHTML = `
            <div class="triage-output urgency-${out.urgency}">
              <p><strong>Urgency:</strong> ${out.urgency.toUpperCase()}</p>
              <p><strong>Suggested Clinic:</strong> ${out.suggested_clinic}</p>
              <p><strong>Estimated Wait:</strong> ${out.estimated_wait}</p>
            </div>`;
          // Speak results
          speak(`Urgency ${out.urgency}. Suggested clinic ${out.suggested_clinic}. Estimated wait ${out.estimated_wait}.`);
        } catch(err) {
          triageResult.textContent = 'Error analyzing symptoms.';
        } finally {
          if (anim) { anim.destroy(); triageLoad.style.display='none'; }
        }
      });
    }
    // Speech-to-text for triage using Web Speech API
    if (triageMic) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const rec = new SpeechRecognition();
        rec.continuous = false; rec.interimResults = true; rec.lang = 'en-ZA';
        const textarea = document.getElementById('triage-symptoms');
        let finalText = '';
        triageMic.addEventListener('click', ()=>{
          finalText=''; textarea.value=''; rec.start(); triageMic.disabled = true;
          triageMic.innerHTML = '<i class="fas fa-microphone-slash"></i>';
        });
        rec.onresult = (e)=>{
          let interim = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const t = e.results[i][0].transcript;
            if (e.results[i].isFinal) finalText += t + ' ';
            else interim += t;
          }
          textarea.value = (finalText + interim).trim();
        };
        rec.onend = ()=>{ triageMic.disabled = false; triageMic.innerHTML = '<i class="fas fa-microphone"></i>'; };
        rec.onerror = ()=>{ triageMic.disabled = false; triageMic.innerHTML = '<i class="fas fa-microphone"></i>'; };
      } else {
        triageMic.title = 'Speech recognition not supported on this browser';
      }
    }

    // Medication checker submit + voice dictation
    const medForm = document.getElementById('med-ai-form');
    const medResult = document.getElementById('med-ai-result');
    if (medForm && medResult) {
      medForm.addEventListener('submit', (e)=>{
        e.preventDefault();
        const current = (document.getElementById('current-meds').value||'').split(',').map(s=>s.trim()).filter(Boolean);
        const newMed = document.getElementById('new-med').value;
        const conds = String(window.currentUserProfile?.conditions||'').split(',').map(s=>s.trim()).filter(Boolean);
        const engine = new MedicationAI();
        Promise.resolve(engine.checkInteractions(current, newMed, conds)).then(out=>{
          if (out.safe) {
            const msg = 'No major interactions detected.';
            medResult.innerHTML = '<div class="badge ok">'+msg+'</div>';
            speak(msg);
          } else {
            const html = out.interactions.map(i=>`
              <div class="interaction">
                <p><strong>Risk:</strong> ${i.risk}</p>
                <p><strong>Effect:</strong> ${i.effect}</p>
                <p><strong>Suggestion:</strong> ${i.suggestion}</p>
              </div>`).join('');
            medResult.innerHTML = html;
            const summary = out.interactions.map(i=>`${i.risk} risk. ${i.effect}. ${i.suggestion}`).join(' Next: ');
            speak(summary);
          }
        });
      });
      // Voice dictation buttons
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        function attachMic(btnId, targetInputId) {
          const btn = document.getElementById(btnId);
          const input = document.getElementById(targetInputId);
          if (!btn || !input) return;
          const rec = new SpeechRecognition();
          rec.continuous = false; rec.interimResults = true; rec.lang = 'en-ZA';
          let finalText = '';
          btn.addEventListener('click', ()=>{ finalText=''; input.value=''; rec.start(); btn.disabled=true; btn.innerHTML='<i class="fas fa-microphone-slash"></i>'; });
          rec.onresult = (e)=>{
            let interim='';
            for (let i=e.resultIndex;i<e.results.length;i++){
              const t=e.results[i][0].transcript;
              if (e.results[i].isFinal) finalText += t + ' ';
              else interim += t;
            }
            input.value = (finalText + interim).trim();
          };
          function reset(){ btn.disabled=false; btn.innerHTML='<i class="fas fa-microphone"></i>'; }
          rec.onend = reset; rec.onerror = reset;
        }
        attachMic('med-current-mic','current-meds');
        attachMic('med-new-mic','new-med');
      }
    }

    // OCR
    const ocrFile = document.getElementById('ocr-file');
    const ocrResult = document.getElementById('ocr-result');
    if (ocrFile && ocrResult) {
      ocrFile.addEventListener('change', async (e)=>{
        const file = e.target.files[0];
        if (!file) return;
        ocrResult.textContent = 'Scanning…';
        try {
          const scanner = new DocumentAIScanner();
          const out = await scanner.scanMedicalCard(file);
          ocrResult.innerHTML = `
            <pre>${JSON.stringify(out.extracted_data, null, 2)}</pre>
            <small>Confidence: ${Math.round((out.confidence||0))}%</small>
            <div style="margin-top:10px;display:flex;gap:8px;">
              <button id="ocr-save" class="btn-primary">Save to Profile</button>
            </div>`;
          // Speak a quick summary
          try { const name = out.extracted_data?.patient_name || 'patient'; speak(`Scanned card for ${name}. Ready to save to profile.`); } catch {}
          const saveBtn = document.getElementById('ocr-save');
          if (saveBtn) saveBtn.addEventListener('click', async ()=>{
            saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
            const ok = await scanner.saveToProfile(out.extracted_data || {});
            saveBtn.textContent = ok ? 'Saved!' : 'Failed';
            setTimeout(()=>{ const modal = document.getElementById('ocr-modal'); if (modal) modal.style.display='none'; }, 800);
          });
        } catch(err) {
          ocrResult.textContent = 'OCR failed. Ensure Tesseract loaded and try another image.';
        }
      });
    }
  });
})();
