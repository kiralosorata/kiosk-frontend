/* =====================================================
 * ER TRIAGE KIOSK – MASTER SCRIPT (cleaned‑up version)
 * – Keeps your original click‑handler pattern
 * – Adds Help flow & BFAST / STEMI detection
 * – Preserves resetFlow()
 * =====================================================*/

/* ------------------ CONFIG ------------------ */
const API_ROOT = 'https://kiosk-backend-1-3.onrender.com'; // change for deployment

/* ------------------ SIMPLE STATE ------------------ */
let historyStack = [];
let patientData  = {
  name: '',
  age: '',
  complaint: '',
  relation: ''
};

/* ------------------ NAVIGATION ------------------ */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id)?.classList.remove('hidden');
}

function navigateTo(id) {
  const current = document.querySelector('.screen:not(.hidden)');
  if (current) historyStack.push(current.id);
  showScreen(id);
}

function goBack() {
  if (historyStack.length) showScreen(historyStack.pop());
}

/* ------------------ GENERIC CLICK HANDLERS ------------------ */
// Static buttons with data‑next attribute
function wireDataNextButtons() {
  document.querySelectorAll('[data-next]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.getAttribute('data-next')));
  });
}
wireDataNextButtons(); // run once on load

// Explicit buttons outside data‑next
const answeringFor = document.getElementById('answering-for');
if (answeringFor) answeringFor.onclick = () => navigateTo('screen-relation-check');

const otherRelation = document.getElementById('other-relation');
if (otherRelation) otherRelation.onclick = () => navigateTo('screen-other-relation');

/* relationship buttons */
document.querySelectorAll('.rel-btn').forEach(btn => {
  btn.onclick = () => {
    patientData.relation = btn.dataset.rel;
    navigateTo('screen-duration-check');
  };
});

/* Sidebar – Help */
const helpDiv = document.querySelector('.help-section');
if (helpDiv) helpDiv.addEventListener('click', () => navigateTo('screen-help-offer'));

/* ------------------ ID LOOKUP (realistic) ------------------ */
async function lookupID() {
  const input      = document.getElementById('philhealth-id');
  const raw        = input.value.trim();
  const numericID  = raw.replace(/\D/g, '');     // keep digits only

  // ❶  quick client-side format check – PhilHealth IDs are 12 digits
  if (numericID.length !== 12) {
    alert('A PhilHealth ID must be exactly 12 digits (xxxxxxxxxxxx).');
    return;
  }

  try {
    // ❷  ask the backend if this patient exists
    const res = await fetch(`${API_ROOT}/api/patients/${numericID}`);

    if (res.ok) {
      // existing patient → fill state and proceed
      const profile         = await res.json();
      Object.assign(patientData, profile);       // update name, age, etc.
      navigateTo('screen-id-found');
    } else if (res.status === 404) {
      // not found → new-patient flow
      navigateTo('screen-new-patient');
    } else {
      throw new Error(`Server responded ${res.status}`);
    }
  } catch (err) {
    console.error(err);
    alert('Could not verify PhilHealth ID. Please try again or ask for help.');
  }
}


/* ------------------ TOGGLE OTHER INPUT ------------------ */
function toggleOtherInput() {
  const otherInput = document.getElementById('chief-complaint-input');
  otherInput.style.display =
    document.getElementById('chief-complaint').value === 'Other' ? 'block' : 'none';
}

/* ------------------ SUBMIT SELF‑ASSESSMENT ------------------ */
const submitBtn = document.getElementById('submit-assessment');
if (submitBtn) submitBtn.onclick = async () => {
  const dropdownVal = document.getElementById('chief-complaint').value;
  const otherVal    = document.getElementById('chief-complaint-input').value.trim();
  patientData.complaint = dropdownVal === 'Other' ? otherVal : dropdownVal;

  const maybeName = document.getElementById('patient-name');
  if (maybeName) {
    patientData.name = maybeName.value || patientData.name;
    patientData.age  = document.getElementById('patient-age').value || patientData.age;
  }

  if (!patientData.name || !patientData.age || !patientData.complaint) {
    alert('Please complete patient name, age, and complaint.');
    return;
  }

  /* Immediate ESI‑1 local rule */
  if (/BFAST|STEMI/i.test(patientData.complaint)) {
    document.getElementById('esi-message').innerText =
      '🚨 EMERGENCY: Immediate care required (ESI‑1). A nurse is on the way.';
    navigateTo('screen-results');
    return;
  }

  /* Remote ML triage */
  try {

    patientData.painScale      = document.getElementById('pain-scale').value.trim();
    patientData.symptomChecker = document.getElementById('symptom-checker').value.trim();
    patientData.duration       = document.getElementById('duration').value.trim();
    patientData.bodyPart       = document.getElementById('body-part').value.trim();
    const res = await fetch(`${API_ROOT}/api/triage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patientData)
    });
    if (!res.ok) throw new Error('Server error');
    const data = await res.json();

    document.getElementById('esi-message').innerText =
      `🩺 AI assigned ESI ${data.esi} (${explainESI(data.esi)})\nQueue #${data.queue}`;
    navigateTo('screen-results');
  } catch (err) {
    console.error(err);
    alert('Could not submit assessment. Please try again.');
  }
};

function explainESI(num) {
  return {
    1: 'Resuscitation',
    2: 'Emergent',
    3: 'Urgent',
    4: 'Less‑Urgent',
    5: 'Non‑Urgent'
  }[num] || '';
}

/* ------------------ RESET ------------------ */
function resetFlow() {
  historyStack = [];
  patientData  = { name: '', age: '', complaint: '', relation: '' };
  document.querySelectorAll('input').forEach(i => (i.value = ''));
  document.getElementById('chief-complaint').value = '';
  document.getElementById('chief-complaint-input').style.display = 'none';
  showScreen('screen-start');
}

/* ------------------ INIT ------------------ */
resetFlow();

/* Expose only helpers the HTML inline handlers rely on */
window.lookupID         = lookupID;
window.toggleOtherInput = toggleOtherInput;
window.resetFlow        = resetFlow;
