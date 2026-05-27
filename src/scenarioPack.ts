import type { Encounter, EventCategory, LocationId, TaskTemplate } from "./types";

type ScenarioPackItem = Encounter & {
  initialBleep: {
    message: string;
    sender: string;
    claimedUrgency: string;
    trueUrgency: "critical" | "high" | "medium" | "low" | "nonsense";
    timeToDeterioration: number;
  };
};

const standardAssessment = {
  best: { time: 5, focus: -3, patientSafety: 3, clinicalConfidence: 2, score: 20 },
  partial: { time: 8, focus: -4, patientSafety: -2 },
  unsafe: { time: 4, patientSafety: -8, reputation: -2, dangerousDelays: 1 },
};

const standardManagement = {
  best: { time: 12, stamina: -5, focus: -5, patientSafety: 8, reputation: 4, clinicalConfidence: 4, patientsStabilised: 1, emergenciesHandled: 1, score: 120, handoverQuality: 3 },
  partial: { time: 15, focus: -6, patientSafety: 1, score: 40 },
  unsafe: { time: 10, patientSafety: -12, reputation: -4, dangerousDelays: 1, datix: 1, score: -80 },
};

const scenarios: ScenarioPackItem[] = [
  {
    id: "occult_sepsis_adrenal_crisis",
    title: "The low blood pressure that is not just dehydration",
    locationId: "mau",
    category: "emergency",
    initialBleep: { message: "Please review low BP, probably dry. Nurse worried as patient looks grey.", sender: "MAU FY1", claimedUrgency: "Can you review when free?", trueUrgency: "critical", timeToDeterioration: 20 },
    vignette: "A 68-year-old was admitted with diarrhoea and dizziness. ED handover says gastroenteritis and fluids, for senior review in the morning. Drug history is unreconciled; their spouse mentions long-term steroid tablets for lung inflammation.",
    observations: "RR 24, SpO2 95% air, HR 118, BP 82/48, temp 37.4, CRT 4 seconds, GCS 14, glucose 3.4.",
    examination: "Cool peripheries, dry mucosa, diffuse abdominal tenderness without guarding, chest clear, slow answers.",
    investigations: ["VBG pH 7.31, lactate 4.2, Na 126, K 5.8, glucose 3.4", "ECG sinus tachycardia with mildly peaked T waves", "CRP 96, WCC 15.8, creatinine 184 from 82", "Medication history unavailable overnight"],
    choices: [],
    steps: [
      {
        id: "assessment",
        title: "Assessment and prioritisation",
        vignette: "The bleep sounds like dehydration, but the physiology is shock plus steroid exposure.",
        observations: "RR 24, SpO2 95% air, HR 118, BP 82/48, temp 37.4, CRT 4 seconds, GCS 14, glucose 3.4. Minimal urine output.",
        examination: "Cool peripheries, dry mucosa, diffuse abdominal tenderness without guarding, no rash, chest clear.",
        investigations: ["VBG pH 7.31, lactate 4.2, Na 126, K 5.8, glucose 3.4", "ECG sinus tachycardia with mildly peaked T waves", "CRP 96, WCC 15.8, creatinine 184 from 82"],
        choices: [
          { id: "assessment_best", label: "Treat as shock with possible adrenal crisis and sepsis", detail: "ABCDE, cultures, broad-spectrum antibiotics, IV crystalloid with reassessment, IV hydrocortisone, glucose and hyperkalaemia treatment, catheter, ICU outreach.", feedback: "Best choice. The key is recognising adrenal crisis as a parallel life-threatening process, not waiting for certainty.", nextStepId: "management", consequence: standardAssessment.best },
          { id: "assessment_partial", label: "Give IV fluids and send stool cultures", detail: "Treat presumed gastroenteritis-related hypovolaemia and reassess after the first litre.", feedback: "Fluids help, but shock with hyperkalaemia, hypoglycaemia and steroid exposure needs endocrine and sepsis treatment now.", nextStepId: "management", consequence: standardAssessment.partial },
          { id: "assessment_unsafe", label: "Wait for medication reconciliation before giving steroids", detail: "Avoid empiric hydrocortisone until the steroid history is confirmed.", feedback: "Unsafe. Suspected adrenal crisis is treated before confirmation.", nextStepId: "management", unsafe: true, consequence: standardAssessment.unsafe },
        ],
      },
      {
        id: "management",
        title: "Management and escalation",
        vignette: "After 500 mL crystalloid, BP is still poor and the metabolic problems are worse.",
        observations: "BP 86/50, HR 122, lactate 4.7, glucose 2.9, potassium 6.1.",
        examination: "More drowsy but rousable. Diffuse abdominal tenderness without peritonism. No obvious bleeding.",
        investigations: ["Repeat ECG taller T waves, QRS normal", "CXR no consolidation", "Urine dip nitrite positive, blood 2+, leukocytes 2+", "Cortisol cannot be processed urgently overnight"],
        choices: [
          { id: "best", label: "Stabilise physiology before diagnostic certainty", detail: "Hydrocortisone now, sepsis six, hypoglycaemia treatment, calcium and insulin-dextrose, catheter, ICU for fluid-refractory shock, document steroid dependence.", feedback: "Best management. This treats reversible threats while keeping sepsis source and surgical abdomen in the differential.", resolves: true, consequence: standardManagement.best },
          { id: "partial", label: "Escalate to ICU for persistent hypotension after fluids", detail: "Request ICU and prepare for vasopressors, but defer hydrocortisone and hyperkalaemia treatment until endocrine advice.", feedback: "Escalation is right, but ICU is not a substitute for immediate resuscitation.", resolves: true, consequence: standardManagement.partial },
          { id: "unsafe", label: "Prescribe loperamide and ward-based fluids overnight", detail: "Assume infective diarrhoea with dehydration and leave repeat bloods for 06:00.", feedback: "Unsafe. This misses shock, hyperkalaemia, hypoglycaemia, AKI and likely adrenal crisis.", resolves: true, unsafe: true, consequence: standardManagement.unsafe },
        ],
      },
    ],
  },
  {
    id: "silent_stemi_lbbb",
    title: "The fall with indigestion and a difficult ECG",
    locationId: "ed_resus",
    category: "emergency",
    initialBleep: { message: "Older patient in resus after collapse, troponin sent. ECG looks like old LBBB. ED asking med reg to accept.", sender: "ED SHO", claimedUrgency: "Admission decision", trueUrgency: "critical", timeToDeterioration: 15 },
    vignette: "An 81-year-old brought in after an unwitnessed fall denies chest pain but has nausea, sweating and indigestion. Previous ECG is not immediately available.",
    observations: "RR 22, SpO2 94% on 2 L, HR 46, BP 88/56, temp 36.1, GCS 15.",
    examination: "Pale, clammy, cool peripheries, mild basal crackles, no focal neurology or obvious traumatic injury.",
    investigations: ["ECG LBBB pattern with concordant inferior ST elevation and anterior ST depression", "VBG pH 7.29, lactate 3.6", "Troponin pending", "Cardiology registrar covering two sites"],
    choices: [],
    steps: [
      {
        id: "assessment",
        title: "Assessment and prioritisation",
        vignette: "The referral is framed as collapse, but the patient looks like a coronary occlusion with shock.",
        observations: "HR 46, BP 88/56, clammy and nauseated. Oxygen requirement 2 L.",
        examination: "Pale, clammy, basal crackles, no clear trauma or focal neurology.",
        investigations: ["ECG broad QRS/LBBB with concordant inferior ST elevation and reciprocal depression", "Lactate 3.6", "Troponin pending"],
        choices: [
          { id: "assessment_best", label: "Treat as occlusive MI despite atypical history", detail: "Do not wait for troponin; give aspirin if safe, call cardiology for immediate reperfusion discussion, and manage bradycardic shock in resus.", feedback: "Best choice. Atypical symptoms and presumed old LBBB should not delay reperfusion assessment.", nextStepId: "management", consequence: standardAssessment.best },
          { id: "assessment_partial", label: "Repeat ECG and wait for first troponin", detail: "Monitor, repeat ECG in 15 minutes, and decide once troponin returns.", feedback: "Serial ECGs help, but waiting for troponin in unstable occlusion physiology is dangerous.", nextStepId: "management", consequence: standardAssessment.partial },
          { id: "assessment_unsafe", label: "Accept to MAU as collapse query UTI", detail: "Treat as infection or dehydration with routine telemetry and repeat troponin later.", feedback: "Unsafe. This deprioritises a likely occlusive MI with bradycardic shock.", nextStepId: "management", unsafe: true, consequence: standardAssessment.unsafe },
        ],
      },
      {
        id: "management",
        title: "Management and escalation",
        vignette: "The patient develops intermittent complete heart block and worsening pulmonary oedema.",
        observations: "BP 76/44, HR 38, intermittent complete heart block, rising oxygen requirement.",
        examination: "Worsening crackles, cool mottled hands, no major trauma.",
        investigations: ["Repeat ECG persistent concordant inferior ST elevation", "Early troponin only mildly elevated", "K 4.6, Mg 0.78"],
        choices: [
          { id: "best", label: "Activate urgent cardiology pathway and treat bradycardic cardiogenic shock", detail: "Call interventional cardiology, discuss PPCI/thrombolysis pathway, prepare atropine and pacing, avoid nitrates, consider cautious RV-infarct fluids, involve ICU.", feedback: "Best management. Do not be reassured by a low early troponin.", resolves: true, consequence: standardManagement.best },
          { id: "partial", label: "Give atropine and ask for medical HDU bed", detail: "Treat bradycardia and plan cardiology review in the morning.", feedback: "Atropine may be needed, but HDU without reperfusion discussion is incomplete.", resolves: true, consequence: standardManagement.partial },
          { id: "unsafe", label: "Give GTN and IV furosemide for pulmonary oedema", detail: "Treat crackles as LV failure while waiting for cardiology.", feedback: "Unsafe. Nitrates and diuresis can worsen hypotensive inferior or RV infarction.", resolves: true, unsafe: true, consequence: standardManagement.unsafe },
        ],
      },
    ],
  },
  {
    id: "hypercapnic_drowsiness_oxygen",
    title: "The sleepy COPD patient after a good oxygen response",
    locationId: "respiratory",
    category: "urgent",
    initialBleep: { message: "COPD patient drowsy. Sats finally 99% on non-rebreathe. Can you prescribe something for agitation?", sender: "Respiratory ward nurse", claimedUrgency: "Medication request", trueUrgency: "high", timeToDeterioration: 30 },
    vignette: "A 72-year-old with severe COPD was admitted with infective exacerbation. The day plan says target sats 88-92%, but oxygen was increased during a busy drug round.",
    observations: "RR 10, SpO2 99% on 15 L, HR 104, BP 148/82, temp 37.9, GCS 12.",
    examination: "Drowsy, widespread wheeze with poor air entry, mild oedema, no focal neurology.",
    investigations: ["ABG on 15 L: pH 7.21, pCO2 11.2, pO2 28.0, HCO3 34", "CXR hyperinflation, possible RLL infiltrate", "Prior NIV for type 2 respiratory failure"],
    choices: [],
    steps: [
      {
        id: "assessment",
        title: "Assessment and prioritisation",
        vignette: "The sats look better, but the patient is becoming hypercapnic and drowsy.",
        observations: "RR 10, SpO2 99% on non-rebreathe, GCS 12.",
        examination: "Drowsy, poor air entry, pulling at the mask.",
        investigations: ["ABG pH 7.21, pCO2 11.2, pO2 28.0", "Prior NIV admission"],
        choices: [
          { id: "assessment_best", label: "Recognise oxygen-induced hypercapnic respiratory failure", detail: "Reduce to controlled Venturi 88-92%, repeat ABG, arrange NIV, treat exacerbation and discuss escalation.", feedback: "Best choice. The apparent oxygen success is the trap.", nextStepId: "management", consequence: standardAssessment.best },
          { id: "assessment_partial", label: "Continue high-flow oxygen and repeat ABG later", detail: "Keep saturations high while arranging repeat gas and respiratory review.", feedback: "Repeating gases helps, but continued excessive oxygen worsens hypercapnia.", nextStepId: "management", consequence: standardAssessment.partial },
          { id: "assessment_unsafe", label: "Give lorazepam for mask intolerance", detail: "Sedate to help them tolerate oxygen.", feedback: "Unsafe. Sedation can suppress respiratory drive in severe hypercapnic acidosis.", nextStepId: "management", unsafe: true, consequence: standardAssessment.unsafe },
        ],
      },
      {
        id: "management",
        title: "Management and escalation",
        vignette: "Controlled oxygen improves saturations, but acidosis persists and the patient is tiring.",
        observations: "SpO2 90% on 28% Venturi. ABG pH 7.24, pCO2 10.4, pO2 8.0.",
        examination: "Persistent poor air entry, accessory muscle use, one-word responses.",
        investigations: ["NIV machine on ward is in use", "Outreach covering ICU and ED", "Cultures pending"],
        choices: [
          { id: "best", label: "Start acute NIV with senior escalation planning", detail: "Arrange NIV in a monitored area, prescribe bronchodilators/steroids/antibiotics, repeat ABG, involve respiratory/ICU and clarify ceiling.", feedback: "Best management. Persistent respiratory acidosis is an NIV indication.", resolves: true, consequence: standardManagement.best },
          { id: "partial", label: "Optimise medical therapy and recheck gas in one hour", detail: "Nebulisers, steroids, antibiotics and controlled oxygen.", feedback: "Supportive treatment is right, but NIV should not wait with persistent acidosis and fatigue.", resolves: true, consequence: standardManagement.partial },
          { id: "unsafe", label: "Put the non-rebreathe mask back on because the patient is breathless", detail: "Prioritise visible breathlessness with 15 L oxygen.", feedback: "Unsafe. Breathlessness is not the same as hypoxaemia.", resolves: true, unsafe: true, consequence: standardManagement.unsafe },
        ],
      },
    ],
  },
  {
    id: "hyponatraemia_seizure_desmopressin",
    title: "The seizure after routine IV fluids",
    locationId: "elderly",
    category: "emergency",
    initialBleep: { message: "Patient had a short seizure, now confused. Sodium was low earlier. Ward very short staffed.", sender: "Elderly care FY1", claimedUrgency: "Urgent review", trueUrgency: "critical", timeToDeterioration: 25 },
    vignette: "An 84-year-old admitted with falls and poor intake received maintenance IV fluids. The admission note mentions thiazide use, but the drug chart still includes it.",
    observations: "RR 18, SpO2 96%, HR 92, BP 138/74, GCS 13 after a 90-second generalised seizure.",
    examination: "Confused, no focal neurology, no meningism, no oedema.",
    investigations: ["Na 112, previously 118 six hours earlier", "Low serum osmolality, high urine osmolality", "Glucose and calcium normal", "CT requested but not done"],
    choices: [],
    steps: [
      {
        id: "assessment",
        title: "Assessment and prioritisation",
        vignette: "The seizure has stopped, but severe symptomatic hyponatraemia is still the emergency.",
        observations: "GCS 13 post-seizure. Sodium 112 after a rapid fall.",
        examination: "Confusion without focal neurology.",
        investigations: ["Na 112", "Low serum osmolality", "Urine osmolality high", "Thiazide still prescribed"],
        choices: [
          { id: "assessment_best", label: "Treat as severe symptomatic hyponatraemia now", detail: "Stop thiazide/hypotonic fluids, give cautious hypertonic saline bolus per protocol, monitor sodium closely and seek renal/endocrine advice.", feedback: "Best choice. CT should not delay treatment of a life-threatening electrolyte problem.", nextStepId: "management", consequence: standardAssessment.best },
          { id: "assessment_partial", label: "Arrange urgent CT head and repeat sodium afterwards", detail: "Prioritise intracranial pathology and avoid correction until bleeding is excluded.", feedback: "CT may be needed, but treatment should happen in parallel.", nextStepId: "management", consequence: standardAssessment.partial },
          { id: "assessment_unsafe", label: "Give a litre of 0.9% saline rapidly", detail: "Assume hypovolaemic hyponatraemia from poor intake.", feedback: "Unsafe. Symptomatic severe hyponatraemia needs controlled hypertonic treatment and close monitoring.", nextStepId: "management", unsafe: true, consequence: standardAssessment.unsafe },
        ],
      },
      {
        id: "management",
        title: "Management and escalation",
        vignette: "Initial treatment improves GCS, but sodium is rising quickly with brisk urine output.",
        observations: "GCS 14, Na 118 within two hours, urine output 900 mL in two hours.",
        examination: "No further seizure, dry mucosa, no focal deficit.",
        investigations: ["K 3.4", "CT head no acute bleed", "Endocrine phone advice only"],
        choices: [
          { id: "best", label: "Prevent overcorrection while continuing close monitoring", detail: "Stop further hypertonic saline, check Na every 2 hours, replace K carefully, consider desmopressin/free water with senior advice, strict fluid balance.", feedback: "Best management. After symptom control, the hidden danger is osmotic demyelination from overcorrection.", resolves: true, consequence: standardManagement.best },
          { id: "partial", label: "Continue hypertonic saline until sodium is above 125", detail: "Aim for a safer sodium overnight because they seized.", feedback: "Understandable, but the priority is controlled correction rather than normalisation.", resolves: true, consequence: standardManagement.partial },
          { id: "unsafe", label: "Stop monitoring because the seizure has resolved", detail: "Leave routine U&E for morning and ask nurses to call if another seizure occurs.", feedback: "Unsafe. Rapid sodium shifts after cause removal may be missed.", resolves: true, unsafe: true, consequence: standardManagement.unsafe },
        ],
      },
    ],
  },
  {
    id: "pe_shock_pregnancy_postpartum",
    title: "The postpartum breathlessness on the surgical ward",
    locationId: "surgical",
    category: "emergency",
    initialBleep: { message: "Post-op patient breathless and anxious. Surgical team in theatre. Can med reg review?", sender: "Surgical ward nurse", claimedUrgency: "Urgent review", trueUrgency: "critical", timeToDeterioration: 10 },
    vignette: "A 34-year-old is two weeks postpartum and day one after laparoscopic appendicectomy. VTE assessment is incomplete; they say something is very wrong.",
    observations: "RR 34, SpO2 88% on 4 L, HR 138, BP 86/52, temp 37.2.",
    examination: "Distressed, clear chest, possible raised JVP, soft abdomen, left calf mildly swollen.",
    investigations: ["ECG sinus tachycardia with right-axis strain pattern", "VBG pH 7.34, lactate 3.8", "Hb 109, platelets 212", "CTPA delayed by trauma call"],
    choices: [],
    steps: [
      {
        id: "assessment",
        title: "Assessment and prioritisation",
        vignette: "The patient is post-op and postpartum, but the physiology is obstructive shock until proven otherwise.",
        observations: "RR 34, SpO2 88% on oxygen, HR 138, BP 86/52.",
        examination: "Clear lungs, calf asymmetry, soft abdomen.",
        investigations: ["ECG RV strain pattern", "Lactate 3.8", "CTPA access delayed"],
        choices: [
          { id: "assessment_best", label: "Treat as high-risk PE with shock while excluding immediate alternatives", detail: "ABCDE, oxygen, senior help, bedside echo if available, urgent CTPA if stable, anticoagulate if safe, ICU and surgical/obstetric seniors.", feedback: "Best choice. Surgical ownership does not make this less of a medical emergency.", nextStepId: "management", consequence: standardAssessment.best },
          { id: "assessment_partial", label: "Request CTPA and wait for imaging before treatment", detail: "Keep oxygen running and avoid anticoagulation because the patient is post-operative.", feedback: "Imaging matters, but shock makes passive delay unsafe.", nextStepId: "management", consequence: standardAssessment.partial },
          { id: "assessment_unsafe", label: "Treat as panic attack after surgery", detail: "Reassure, sedate, and ask surgery to review later.", feedback: "Unsafe. Severe hypoxia and hypotension are not anxiety.", nextStepId: "management", unsafe: true, consequence: standardAssessment.unsafe },
        ],
      },
      {
        id: "management",
        title: "Management and escalation",
        vignette: "Echo suggests RV failure and CTPA is delayed.",
        observations: "BP 82/48 despite cautious fluid, SpO2 91% on 15 L, clammy and presyncopal.",
        examination: "Clear lungs, cool peripheries, calf swelling, no wound bleeding.",
        investigations: ["Bedside echo: dilated RV, septal flattening, underfilled LV", "CXR clear", "CTPA delayed 45 minutes"],
        choices: [
          { id: "best", label: "Escalate for reperfusion decision in presumed massive PE", detail: "Call ICU, haematology, obstetric and surgical seniors for thrombolysis/catheter/surgical option decision, prepare vasopressors and document bleeding risks.", feedback: "Best management. Obstructive shock with supportive echo may need treatment before perfect certainty.", resolves: true, consequence: standardManagement.best },
          { id: "partial", label: "Give treatment-dose LMWH and keep waiting for CTPA", detail: "Start anticoagulation and monitor on the ward until imaging.", feedback: "Anticoagulation is useful but insufficient in shock.", resolves: true, consequence: standardManagement.partial },
          { id: "unsafe", label: "Give large fluid boluses for presumed sepsis", detail: "Treat hypotension with repeated litres while awaiting blood cultures.", feedback: "Unsafe. Excessive fluids can worsen RV failure.", resolves: true, unsafe: true, consequence: standardManagement.unsafe },
        ],
      },
    ],
  },
  {
    id: "digoxin_toxicity_hyperkalaemia",
    title: "The vomiting patient with a slow irregular pulse",
    locationId: "cardiology",
    category: "urgent",
    initialBleep: { message: "AF patient vomiting, pulse 38. Cardiology bed but no cardiology reg on site.", sender: "Cardiology ward FY1", claimedUrgency: "Urgent ECG review", trueUrgency: "high", timeToDeterioration: 35 },
    vignette: "A 79-year-old with heart failure and AF has been nauseated all evening after diuretic escalation. Chart includes digoxin, bisoprolol, ramipril and spironolactone.",
    observations: "RR 18, SpO2 95%, HR 38 irregular, BP 94/58, GCS 15 but light-headed.",
    examination: "Cool hands, mild confusion, bibasal crackles, yellow visual symptoms.",
    investigations: ["ECG slow AF with ectopics and scooped ST", "K 6.4, creatinine 212 from 95, Mg 0.62", "Digoxin level delayed", "Troponin mildly elevated"],
    choices: [],
    steps: [
      {
        id: "assessment",
        title: "Assessment and prioritisation",
        vignette: "The ECG is abnormal, but the medication context is the clue.",
        observations: "Slow irregular pulse, borderline BP, vomiting and visual symptoms.",
        examination: "Cool, mildly confused, crackles but no acute pulmonary oedema.",
        investigations: ["K 6.4", "AKI", "Slow AF with ventricular ectopy", "Digoxin level delayed"],
        choices: [
          { id: "assessment_best", label: "Suspect clinically significant digoxin toxicity with hyperkalaemia", detail: "Stop digoxin and AV nodal blockers, monitor, treat hyperkalaemia, correct magnesium, assess AKI and contact toxicology/cardiology about Fab.", feedback: "Best choice. Do not wait for the digoxin level when the clinical syndrome is clear.", nextStepId: "management", consequence: standardAssessment.best },
          { id: "assessment_partial", label: "Treat hyperkalaemia and repeat ECG", detail: "Give calcium and insulin-dextrose, telemetry, and review after potassium improves.", feedback: "Correct but incomplete; the driver may need antidote and medication rationalisation.", nextStepId: "management", consequence: standardAssessment.partial },
          { id: "assessment_unsafe", label: "Give extra beta-blocker for ventricular ectopics", detail: "Suppress ectopy with bisoprolol.", feedback: "Unsafe. Extra AV nodal blockade can precipitate severe block or arrest.", nextStepId: "management", unsafe: true, consequence: standardAssessment.unsafe },
        ],
      },
      {
        id: "management",
        title: "Management and escalation",
        vignette: "Potassium improves only partly and rhythm instability continues.",
        observations: "K 5.9, HR 28-42, BP 88/54, runs of ventricular ectopy.",
        examination: "Drowsier between nausea episodes, crackles unchanged.",
        investigations: ["Repeat ECG slow AF, bigeminy, intermittent junctional escape", "Creatinine 236", "Antidote access requires consultant authorisation"],
        choices: [
          { id: "best", label: "Escalate for digoxin antibody fragments and monitored care", detail: "Call toxicology/NPIS and cardiology consultant, arrange Fab for life-threatening toxicity, continue monitoring/electrolyte correction and involve ICU if unstable.", feedback: "Best management. Severe bradyarrhythmia, ectopy and hyperkalaemia justify antidote discussion before the level returns.", resolves: true, consequence: standardManagement.best },
          { id: "partial", label: "Hold digoxin and monitor until the level returns", detail: "Stop digoxin and ask morning cardiology to decide on antidote.", feedback: "Stopping is right, but life-threatening features make delay risky.", resolves: true, consequence: standardManagement.partial },
          { id: "unsafe", label: "Synchronised DC cardioversion for slow AF", detail: "Treat as unstable AF in the ward treatment room.", feedback: "Unsafe. Cardioversion in digoxin toxicity can precipitate malignant arrhythmias.", resolves: true, unsafe: true, consequence: standardManagement.unsafe },
        ],
      },
    ],
  },
  {
    id: "neutropenic_sepsis_afebrile",
    title: "The oncology patient who is not febrile",
    locationId: "ed_resus",
    category: "emergency",
    initialBleep: { message: "Chemo patient generally weak, not septic as temp normal. ED wants medics to clerk.", sender: "ED coordinator", claimedUrgency: "Routine clerking", trueUrgency: "critical", timeToDeterioration: 20 },
    vignette: "A 58-year-old receiving chemotherapy for lymphoma has rigors at home, diarrhoea and profound fatigue. They are afebrile after paracetamol; oncology hotline note has not reached ED.",
    observations: "RR 26, SpO2 96%, HR 124, BP 92/50, temp 36.2, lactate 3.9.",
    examination: "Looks unwell, dry mouth, mild abdominal tenderness, slightly erythematous Hickman line.",
    investigations: ["WCC 0.4, neutrophils 0.1, platelets 48", "CRP 184, creatinine 138", "CXR clear", "Cultures difficult due to line access uncertainty"],
    choices: [],
    steps: [
      {
        id: "assessment",
        title: "Assessment and prioritisation",
        vignette: "Normal temperature is misleading in a chemotherapy patient with shock physiology.",
        observations: "HR 124, BP 92/50, lactate 3.9, afebrile after paracetamol.",
        examination: "Unwell, mild abdominal tenderness, line erythema.",
        investigations: ["Neutrophils 0.1", "Platelets 48", "CRP 184", "Creatinine rising"],
        choices: [
          { id: "assessment_best", label: "Treat as neutropenic sepsis immediately despite no fever", detail: "Resus/monitoring, cultures if no delay, anti-pseudomonal antibiotics within one hour, fluids, oncology/haematology and abdominal source assessment.", feedback: "Best choice. Normal temperature does not exclude neutropenic sepsis.", nextStepId: "management", consequence: standardAssessment.best },
          { id: "assessment_partial", label: "Send cultures first and wait for protocol confirmation", detail: "Clarify local policy and obtain all cultures before antibiotics.", feedback: "Cultures matter, but antibiotics must not wait for difficult line cultures.", nextStepId: "management", consequence: standardAssessment.partial },
          { id: "assessment_unsafe", label: "Admit to side room for fluids and stool culture", detail: "Review antibiotics if fever develops.", feedback: "Unsafe. Waiting for fever in neutropenic shock risks rapid deterioration.", nextStepId: "management", unsafe: true, consequence: standardAssessment.unsafe },
        ],
      },
      {
        id: "management",
        title: "Management and escalation",
        vignette: "Shock persists after antibiotics and abdominal pain worsens.",
        observations: "BP 86/48, HR 132, lactate 4.6.",
        examination: "Right lower quadrant tenderness, cool peripheries, line erythema unchanged.",
        investigations: ["Platelets 42, INR 1.4", "CT abdomen delayed", "Cultures pending"],
        choices: [
          { id: "best", label: "Escalate septic shock and investigate neutropenic enterocolitis", detail: "ICU for vasopressor-level shock, broaden antimicrobial plan with haematology/microbiology, push urgent CT, isolation, avoid rectal procedures.", feedback: "Best management. Persistent shock and abdominal pain in neutropenia is high-risk.", resolves: true, consequence: standardManagement.best },
          { id: "partial", label: "Give more fluid and await CT slot", detail: "Continue fluids and analgesia in ED majors.", feedback: "Fluids help, but persistent shock needs ICU and urgent source evaluation.", resolves: true, consequence: standardManagement.partial },
          { id: "unsafe", label: "Perform rectal examination to assess colitis severity", detail: "Look for blood, impaction or colitis before deciding CT urgency.", feedback: "Unsafe. Rectal examination is avoided in profound neutropenia and thrombocytopenia.", resolves: true, unsafe: true, consequence: standardManagement.unsafe },
        ],
      },
    ],
  },
  {
    id: "aortic_dissection_mimic_stroke",
    title: "The stroke call with chest heaviness",
    locationId: "radiology",
    category: "emergency",
    initialBleep: { message: "Stroke thrombolysis query in CT. BP very high, radiology asking if safe to proceed.", sender: "Stroke nurse", claimedUrgency: "Immediate decision", trueUrgency: "critical", timeToDeterioration: 15 },
    vignette: "A 63-year-old arrived with sudden left arm weakness and dysarthria. Remote stroke thrombolysis is being discussed; on the trolley they mention earlier severe chest heaviness.",
    observations: "RR 20, SpO2 97%, HR 96, BP 218/104 right arm and 178/92 left arm, GCS 15.",
    examination: "Mild dysarthria, left arm 4/5, unequal radial pulses, possible early diastolic murmur.",
    investigations: ["CT head no acute bleed", "ECG non-specific ST changes", "Troponin pending", "CTA requires protocol approval"],
    choices: [],
    steps: [
      {
        id: "assessment",
        title: "Assessment and prioritisation",
        vignette: "The stroke syndrome is real, but thrombolysis has a dangerous possible contraindication.",
        observations: "Marked hypertension with inter-arm BP difference.",
        examination: "Pulse discrepancy and possible murmur alongside mild stroke signs.",
        investigations: ["CT head clear", "ECG non-specific", "Creatinine 88"],
        choices: [
          { id: "assessment_best", label: "Pause thrombolysis and assess for aortic dissection", detail: "Avoid thrombolysis, request CTA aorta/cerebral vessels if feasible, control BP carefully and involve vascular/cardiothoracic and stroke consultants.", feedback: "Best choice. Chest pain, pulse/BP discrepancy and murmur make dissection a must-not-miss.", nextStepId: "management", consequence: standardAssessment.best },
          { id: "assessment_partial", label: "Lower BP for standard thrombolysis threshold", detail: "Treat hypertension and continue stroke pathway.", feedback: "BP control matters, but dissection red flags must be resolved before thrombolysis.", nextStepId: "management", consequence: standardAssessment.partial },
          { id: "assessment_unsafe", label: "Proceed with thrombolysis because CT head is clear", detail: "Prioritise time-to-needle.", feedback: "Unsafe. Thrombolysis in dissection can be catastrophic.", nextStepId: "management", unsafe: true, consequence: standardAssessment.unsafe },
        ],
      },
      {
        id: "management",
        title: "Management and escalation",
        vignette: "CTA confirms a type A dissection extending into great vessels.",
        observations: "BP 210/100, recurrent tearing interscapular pain, fluctuating neurology.",
        examination: "Weak left radial pulse, mild pulmonary oedema.",
        investigations: ["CTA Stanford type A dissection", "Troponin mildly elevated", "Cardiothoracic referral needed"],
        choices: [
          { id: "best", label: "Control impulse and arrange emergency transfer", detail: "IV beta-blockade or alternative before vasodilator if needed, analgesia, cardiothoracic/ICU calls, nil by mouth, avoid anticoagulation/thrombolysis.", feedback: "Best management. Type A dissection is a surgical emergency; reduce shear stress while transfer is arranged.", resolves: true, consequence: standardManagement.best },
          { id: "partial", label: "Give IV antihypertensive infusion to lower BP rapidly", detail: "Use vasodilator therapy while arranging referral.", feedback: "BP reduction without rate control can increase reflex tachycardia and shear stress.", resolves: true, consequence: standardManagement.partial },
          { id: "unsafe", label: "Start heparin for possible ACS and stroke", detail: "Treat the troponin and neurological symptoms as thrombotic disease.", feedback: "Unsafe. Anticoagulation in type A dissection increases bleeding risk.", resolves: true, unsafe: true, consequence: standardManagement.unsafe },
        ],
      },
    ],
  },
  {
    id: "tumour_lysis_after_steroids",
    title: "The lymphoma patient with tingling lips",
    locationId: "pharmacy",
    category: "urgent",
    initialBleep: { message: "New lymphoma patient has abnormal bloods after steroids. Pharmacy asking if allopurinol is enough.", sender: "On-call pharmacist", claimedUrgency: "Prescription query", trueUrgency: "high", timeToDeterioration: 40 },
    vignette: "A 45-year-old with bulky suspected lymphoma received high-dose steroids for airway symptoms while awaiting tissue confirmation. They are an outlier on a surgical ward.",
    observations: "RR 22, SpO2 96%, HR 112, BP 124/76, nausea and perioral tingling.",
    examination: "Bulky nodes, no stridor now, mild dehydration, palpable spleen.",
    investigations: ["K 6.2, phosphate 2.4, calcium 1.82, urate 0.86", "Creatinine 162 from 76, LDH high", "ECG peaked T waves", "Rasburicase access delayed"],
    choices: [],
    steps: [
      {
        id: "assessment",
        title: "Assessment and prioritisation",
        vignette: "Steroids have treated the airway but may have triggered tumour lysis.",
        observations: "Nausea, tingling, tachycardia.",
        examination: "Bulky lymphoma signs, not fluid overloaded.",
        investigations: ["K 6.2", "Phosphate 2.4", "Calcium 1.82", "Urate 0.86", "AKI"],
        choices: [
          { id: "assessment_best", label: "Treat as established tumour lysis syndrome with hyperkalaemia", detail: "ECG-monitored hyperkalaemia treatment, careful IV hydration, stop nephrotoxins, urgent haematology for rasburicase, frequent TLS bloods and renal/ICU involvement.", feedback: "Best choice. Allopurinol alone is inadequate once severe biochemical TLS is present.", nextStepId: "management", consequence: standardAssessment.best },
          { id: "assessment_partial", label: "Prescribe allopurinol and repeat bloods in the morning", detail: "Treat hyperuricaemia prophylactically and wait for haematology.", feedback: "Partially relevant but insufficient for established TLS with ECG changes and AKI.", nextStepId: "management", consequence: standardAssessment.partial },
          { id: "assessment_unsafe", label: "Give calcium replacement for hypocalcaemia symptoms", detail: "Treat tingling by normalising calcium.", feedback: "Unsafe if indiscriminate. TLS hypocalcaemia is not routinely corrected unless needed for cardioprotection.", nextStepId: "management", unsafe: true, consequence: standardAssessment.unsafe },
        ],
      },
      {
        id: "management",
        title: "Management and escalation",
        vignette: "Kidney function and phosphate worsen despite initial potassium treatment.",
        observations: "K 5.8, creatinine 188, urine output 15 mL/hour.",
        examination: "No overload yet, nausea persists, airway controlled.",
        investigations: ["Phosphate 2.7, calcium 1.76, urate 0.92", "ECG improved but abnormal", "Renal asks if dialysis likely overnight"],
        choices: [
          { id: "best", label: "Escalate TLS as a renal-risk emergency", detail: "Arrange rasburicase after contraindication check, continue electrolyte monitoring, maintain urine output carefully, avoid K/phosphate loads, involve renal/ICU early.", feedback: "Best management. Anticipate renal replacement rather than chasing isolated results.", resolves: true, consequence: standardManagement.best },
          { id: "partial", label: "Continue fluids and repeat TLS bloods four-hourly", detail: "Monitor and wait for haematology to decide on rasburicase.", feedback: "Monitoring and fluids are necessary but not enough with rising urate/phosphate and oliguria.", resolves: true, consequence: standardManagement.partial },
          { id: "unsafe", label: "Give potassium-containing maintenance fluids overnight", detail: "Use standard maintenance because the patient is not eating.", feedback: "Unsafe. Potassium and phosphate handling is already failing.", resolves: true, unsafe: true, consequence: standardManagement.unsafe },
        ],
      },
    ],
  },
  {
    id: "meningitis_with_anticoagulation",
    title: "The confused patient who needs antibiotics before a scan",
    locationId: "mau",
    category: "emergency",
    initialBleep: { message: "Confused patient with headache, on apixaban. FY1 asking whether LP can wait until morning.", sender: "MAU nurse-in-charge", claimedUrgency: "Procedure planning", trueUrgency: "critical", timeToDeterioration: 30 },
    vignette: "A 70-year-old has new confusion, headache and vomiting. Family say they were normal at lunchtime. They take apixaban for AF.",
    observations: "RR 24, SpO2 95%, HR 116, BP 156/84, temp 39.1, GCS 13.",
    examination: "Photophobia, neck stiffness, no rash, no clear focal weakness.",
    investigations: ["CRP 146, WCC 18.9", "Apixaban taken this morning", "CT delayed 60 minutes", "Cultures not yet taken"],
    choices: [],
    steps: [
      {
        id: "assessment",
        title: "Assessment and prioritisation",
        vignette: "The LP question is distracting from the time-critical treatment.",
        observations: "Fever, confusion, tachycardia, GCS 13.",
        examination: "Photophobia and neck stiffness without rash.",
        investigations: ["Apixaban today", "CT delayed", "Blood cultures not yet taken"],
        choices: [
          { id: "assessment_best", label: "Give immediate meningitis treatment and defer LP safely", detail: "Cultures if no delay, IV ceftriaxone plus adjuncts per policy, consider aciclovir, dexamethasone timing, defer LP due to anticoagulation/possible CT indication.", feedback: "Best choice. The priority is early treatment, not LP.", nextStepId: "management", consequence: standardAssessment.best },
          { id: "assessment_partial", label: "Wait for CT head before antibiotics", detail: "Avoid masking CSF and image first because the patient is confused.", feedback: "CT may be required, but antibiotics should not be delayed.", nextStepId: "management", consequence: standardAssessment.partial },
          { id: "assessment_unsafe", label: "Perform LP now because meningitis is time-critical", detail: "Proceed before antibiotics despite apixaban.", feedback: "Unsafe. LP while anticoagulated risks spinal haematoma; treatment can proceed without LP.", nextStepId: "management", unsafe: true, consequence: standardAssessment.unsafe },
        ],
      },
      {
        id: "management",
        title: "Management and escalation",
        vignette: "Antibiotics are in, but encephalopathy persists and the diagnosis is still broad.",
        observations: "GCS 12-13, febrile, agitated, BP 168/90.",
        examination: "Neck stiffness, possible subtle facial droop.",
        investigations: ["CT head no bleed/mass", "Blood cultures positive signal pending organism", "No side room immediately available"],
        choices: [
          { id: "best", label: "Continue CNS sepsis pathway and plan delayed diagnostics", detail: "Continue antimicrobials/antiviral cover if needed, discuss with micro/neurology/ID, delayed LP when safe, manage agitation, isolate as feasible, public health if indicated.", feedback: "Best management. Negative CT does not make immediate LP safe on apixaban.", resolves: true, consequence: standardManagement.best },
          { id: "partial", label: "Continue ceftriaxone only and document LP deferred", detail: "Leave virology or neurology questions until morning.", feedback: "Ceftriaxone matters, but fluctuating confusion and focal signs need active consideration.", resolves: true, consequence: standardManagement.partial },
          { id: "unsafe", label: "Stop antimicrobials because CT is reassuring", detail: "Assume delirium from viral illness or dehydration.", feedback: "Unsafe. CT does not exclude meningitis or encephalitis.", resolves: true, unsafe: true, consequence: standardManagement.unsafe },
        ],
      },
    ],
  },
  {
    id: "sickle_chest_pain_hidden_acs",
    title: "The sickle pain crisis that is becoming acute chest",
    locationId: "mau",
    category: "urgent",
    initialBleep: { message: "Sickle patient still in pain despite morphine. Sats a bit lower. Can you prescribe more analgesia?", sender: "MAU nurse", claimedUrgency: "Analgesia review", trueUrgency: "high", timeToDeterioration: 45 },
    vignette: "A 29-year-old with sickle cell disease was admitted with limb and back pain. The initial plan focused on analgesia and fluids; haematology is remote.",
    observations: "RR 28, SpO2 91% air, HR 118, BP 132/76, temp 38.2, pain 9/10.",
    examination: "Distressed, reduced right basal air entry, pleuritic chest pain, no focal neurology.",
    investigations: ["CXR subtle new right basal opacity", "Hb 72 from baseline 86", "WCC 17.4, CRP 64", "VBG lactate 1.9"],
    choices: [],
    steps: [
      {
        id: "assessment",
        title: "Assessment and prioritisation",
        vignette: "The analgesia request is real, but oxygenation and the CXR change the problem.",
        observations: "RR 28, SpO2 91%, fever, severe pain.",
        examination: "Reduced right basal air entry and pleuritic pain.",
        investigations: ["New right basal opacity", "Hb drop", "Inflammatory markers raised"],
        choices: [
          { id: "assessment_best", label: "Recognise early acute chest syndrome", detail: "Treat pain plus oxygen, antibiotics, incentive spirometry, cautious fluids, repeat gases/imaging if worse and urgent haematology about transfusion.", feedback: "Best choice. Hypoxia, fever and infiltrate make acute chest the key diagnosis.", nextStepId: "management", consequence: standardAssessment.best },
          { id: "assessment_partial", label: "Escalate opioid analgesia and recheck observations", detail: "Improve pain control and ask for repeat obs in 30 minutes.", feedback: "Analgesia is essential, but this misses evolving respiratory pathology.", nextStepId: "management", consequence: standardAssessment.partial },
          { id: "assessment_unsafe", label: "Give excess IV fluids to flush the crisis", detail: "Several litres of crystalloid quickly.", feedback: "Unsafe. Overhydration can worsen pulmonary complications.", nextStepId: "management", unsafe: true, consequence: standardAssessment.unsafe },
        ],
      },
      {
        id: "management",
        title: "Management and escalation",
        vignette: "Hypoxia and infiltrates progress despite PCA setup.",
        observations: "SpO2 88% on 4 L, RR 32, HR 128, temp 38.5.",
        examination: "Increasing work of breathing, right basal crackles, no clinical overload.",
        investigations: ["ABG pO2 8.0 on 4 L", "CXR progression", "Exchange transfusion requires coordination"],
        choices: [
          { id: "best", label: "Escalate for urgent transfusion decision and higher-level monitoring", detail: "Call haematology consultant, ICU/outreach and transfusion lab; continue oxygen, antibiotics, analgesia, spirometry and avoid overload.", feedback: "Best management. Worsening hypoxia in acute chest needs urgent specialist transfusion planning.", resolves: true, consequence: standardManagement.best },
          { id: "partial", label: "Continue antibiotics, oxygen and PCA overnight", detail: "Treat as pneumonia complicating pain crisis and wait for morning haematology.", feedback: "Supportive care is right, but worsening oxygenation needs immediate escalation.", resolves: true, consequence: standardManagement.partial },
          { id: "unsafe", label: "Increase opioid boluses without respiratory reassessment", detail: "Assume tachypnoea is pain-driven.", feedback: "Unsafe. Sedation without reassessment may compound respiratory failure.", resolves: true, unsafe: true, consequence: standardManagement.unsafe },
        ],
      },
    ],
  },
  {
    id: "thyroid_storm_af",
    title: "The tachyarrhythmia that is more than the rhythm",
    locationId: "cardiology",
    category: "emergency",
    initialBleep: { message: "AF patient rate 160, not responding to bisoprolol. Temp 38.8. Cardiology asking for medical opinion.", sender: "Cardiology FY1", claimedUrgency: "Senior opinion", trueUrgency: "critical", timeToDeterioration: 20 },
    vignette: "A 44-year-old with known AF is admitted for rate control. In the weeks before admission she had progressive weight loss, heat intolerance, and loose stools. She is now agitated, sweating profusely, and her rate has not responded to two doses of bisoprolol.",
    observations: "HR 162 irregular, BP 148/62, RR 24, SpO2 95%, temperature 38.9, GCS 14.",
    examination: "Fine tremor, lid lag, exophthalmos, diffuse goitre, warm vasodilated peripheries, bounding pulse.",
    investigations: ["ECG fast AF", "TSH undetectable, T4 pending", "CRP 28, WCC 9.2 without clear infection source", "Troponin mildly elevated", "LFTs mildly deranged"],
    choices: [],
    steps: [
      {
        id: "assessment",
        title: "Assessment and prioritisation",
        vignette: "The AF is the presenting rhythm but the underlying problem is endocrine.",
        observations: "Rate 162, temperature 38.9, agitated and sweating profusely.",
        examination: "Goitre, exophthalmos, lid lag, fine tremor, warm vasodilated peripheries.",
        investigations: ["TSH undetectable", "No clear infection source", "Poor rate response to two doses of bisoprolol"],
        choices: [
          { id: "assessment_best", label: "Recognise thyroid storm: apply Burch-Wartofsky criteria, treat now without waiting for T4", detail: "Rate-refractory AF with fever, exophthalmos, goitre, tremor, and weeks of weight loss and heat intolerance points to thyroid storm. Treatment cannot safely wait for T4 confirmation.", feedback: "Best choice. Burch-Wartofsky score supports storm. T4 cannot change the treatment decision — it can only delay it.", nextStepId: "management", consequence: standardAssessment.best },
          { id: "assessment_partial", label: "Treat as fast AF with possible thyroid excess: increase rate control, await T4 before antithyroid treatment", detail: "Reasonable management of hyperthyroid AF, but storm severity requires antithyroid drugs now rather than after confirmatory results.", feedback: "Rate control improves transiently but does not address the storm. The T4 result later confirms severe hyperthyroidism.", nextStepId: "management", consequence: standardAssessment.partial },
          { id: "assessment_unsafe", label: "Perform synchronised DC cardioversion for rate-refractory AF with haemodynamic compromise", detail: "The rate is not responding to medication and the patient appears compromised.", feedback: "Unsafe. Cardioversion in thyroid storm is likely to immediately revert without antithyroid treatment to address the underlying drive.", nextStepId: "management", unsafe: true, consequence: standardAssessment.unsafe },
        ],
      },
      {
        id: "management",
        title: "Management and escalation",
        vignette: "T4 confirms severe hyperthyroidism. Rate remains above 140 despite propranolol and the patient is now confused.",
        observations: "HR 148 irregular, BP 136/60, temperature 39.2, GCS 13, worsening agitation.",
        examination: "Worsening tremor, confusion, clinically decompensating.",
        investigations: ["T4 greater than 100 pmol/L (assay maximum)", "TSH undetectable", "No identifiable precipitant for storm", "Cortisol 180 nmol/L"],
        choices: [
          { id: "best", label: "Antithyroid drugs first, then Lugol's iodine, propranolol, hydrocortisone, HDU, endocrinology", detail: "Carbimazole or PTU blocks new thyroid hormone synthesis. Lugol's iodine blocks hormone release but must be given after antithyroid drugs to prevent iodine load worsening hyperthyroidism. Propranolol reduces adrenergic symptoms and peripheral T4 to T3 conversion. Hydrocortisone for relative adrenal insufficiency and further T4 to T3 conversion inhibition.", feedback: "Best management. The sequence matters: antithyroid drugs before iodine. Endocrinology confirms the plan. The nursing staff are visibly relieved that someone has named the diagnosis.", resolves: true, consequence: standardManagement.best },
          { id: "partial", label: "High-dose propranolol and urgent endocrinology review in the morning", detail: "Propranolol controls the sympathoadrenergic features partially, but without antithyroid drugs the thyroid storm continues overnight.", feedback: "Partial symptom control without antithyroid treatment allows the storm to progress. Morning endocrinology prompts urgent antithyroid treatment.", resolves: true, consequence: standardManagement.partial },
          { id: "unsafe", label: "Increase bisoprolol and prescribe paracetamol for the fever", detail: "The rate remains the clinical focus and the fever is treated as a separate incidental problem.", feedback: "Unsafe. Bisoprolol is less effective than propranolol in thyroid storm and does not inhibit T4 to T3 conversion. Paracetamol does not address storm physiology.", resolves: true, unsafe: true, consequence: standardManagement.unsafe },
        ],
      },
    ],
  },
  {
    id: "metformin_lactic_acidosis_aki",
    title: "The diabetic patient with normal ketones and severe acidosis",
    locationId: "icu",
    category: "emergency",
    initialBleep: { message: "T2DM patient acidotic but ketones normal. ED asking if suitable for MAU.", sender: "ED FY2", claimedUrgency: "Admission destination advice", trueUrgency: "critical", timeToDeterioration: 20 },
    vignette: "A 67-year-old with T2DM, heart failure and CKD has vomiting and reduced intake. They take metformin, ramipril, spironolactone and furosemide.",
    observations: "RR 34, SpO2 97%, HR 112, BP 94/58, temp 35.9, GCS 14, glucose 9.8, ketones 0.3.",
    examination: "Kussmaul breathing, dry mucosa, cool peripheries, mild abdominal tenderness.",
    investigations: ["VBG pH 7.03, HCO3 6, lactate 12.8", "K 6.7, creatinine 486 from 150", "ECG peaked T waves, borderline widened QRS", "Urine ketone negative"],
    choices: [],
    steps: [
      {
        id: "assessment",
        title: "Assessment and prioritisation",
        vignette: "Normal ketones do not make this safe for MAU.",
        observations: "Severe tachypnoea, borderline shock, glucose 9.8, ketones 0.3.",
        examination: "Deep sighing respirations and dehydration without pulmonary oedema.",
        investigations: ["pH 7.03", "Lactate 12.8", "K 6.7", "Creatinine 486"],
        choices: [
          { id: "assessment_best", label: "Treat as severe lactic acidosis with AKI and hyperkalaemia", detail: "Immediate hyperkalaemia treatment, stop metformin/RAAS drugs, careful fluids, search for sepsis/hypoperfusion and call ICU/renal for likely RRT.", feedback: "Best choice. Normal ketones redirect attention to metformin-associated lactic acidosis and renal failure.", nextStepId: "management", consequence: standardAssessment.best },
          { id: "assessment_partial", label: "Start DKA protocol because the patient is diabetic and acidotic", detail: "Begin fixed-rate insulin and IV fluids.", feedback: "Understandable, but ketones are normal and glucose modest; this distracts from hyperkalaemia, lactate and renal failure.", nextStepId: "management", consequence: standardAssessment.partial },
          { id: "assessment_unsafe", label: "Accept to MAU because oxygenation is normal", detail: "Admit for fluids and repeat VBG in two hours.", feedback: "Unsafe. Severe metabolic acidosis, hyperkalaemia and renal failure can collapse despite normal SpO2.", nextStepId: "management", unsafe: true, consequence: standardAssessment.unsafe },
        ],
      },
      {
        id: "management",
        title: "Management and escalation",
        vignette: "Temporising treatment helps the ECG but physiology remains grim.",
        observations: "K 6.3, BP 88/52, lactate 13.4, pH 7.04.",
        examination: "Drowsier, Kussmaul breathing, anuric after catheter.",
        investigations: ["Persistent pH 7.04", "Negligible urine output", "Cultures pending", "Renal ultrasound not available until morning"],
        choices: [
          { id: "best", label: "Escalate for urgent critical care and dialysis-level support", detail: "ICU admission, renal consultant for urgent RRT, continue hyperkalaemia temporising, treat possible sepsis and communicate severity clearly.", feedback: "Best management. Persistent severe acidosis, oliguria and refractory hyperkalaemia need organ support.", resolves: true, consequence: standardManagement.best },
          { id: "partial", label: "Give sodium bicarbonate and repeat blood gas", detail: "Try to correct pH pharmacologically while continuing fluids.", feedback: "Bicarbonate may have selected use, but does not replace dialysis or hyperkalaemia management.", resolves: true, consequence: standardManagement.partial },
          { id: "unsafe", label: "Continue metformin because glucose is acceptable", detail: "Leave medication review to the diabetes team.", feedback: "Unsafe. Metformin must be stopped in severe AKI and suspected metformin-associated lactic acidosis.", resolves: true, unsafe: true, consequence: standardManagement.unsafe },
        ],
      },
    ],
  },
];

export const scenarioPackEncounters: Encounter[] = scenarios.map(({ initialBleep: _initialBleep, ...encounter }) => ({
  ...encounter,
  choices: encounter.steps?.[encounter.steps.length - 1]?.choices ?? encounter.choices,
}));

function ignoredConsequence(trueUrgency: TaskTemplate["trueUrgency"]) {
  if (trueUrgency === "critical") return { patientSafety: -24, dangerousDelays: 1, datix: 1 };
  if (trueUrgency === "high") return { patientSafety: -16, dangerousDelays: 1 };
  return { patientSafety: -8, reputation: -2 };
}

function weightFor(trueUrgency: TaskTemplate["trueUrgency"]) {
  if (trueUrgency === "critical") return 11;
  if (trueUrgency === "high") return 9;
  if (trueUrgency === "medium") return 7;
  return 4;
}

export const scenarioPackTasks: TaskTemplate[] = scenarios.map((scenario) => ({
  id: `pack_${scenario.id}`,
  locationId: scenario.locationId as LocationId,
  message: scenario.initialBleep.message,
  sender: scenario.initialBleep.sender,
  source: "pager",
  claimedUrgency: scenario.initialBleep.claimedUrgency,
  trueUrgency: scenario.initialBleep.trueUrgency,
  category: scenario.category as EventCategory,
  encounterId: scenario.id,
  timeToDeterioration: scenario.initialBleep.timeToDeterioration,
  weight: weightFor(scenario.initialBleep.trueUrgency),
  vague: scenario.category === "ambiguous",
  regSense: false,
  ignored: ignoredConsequence(scenario.initialBleep.trueUrgency),
  handledWell: { score: scenario.initialBleep.trueUrgency === "critical" ? 70 : 55, clinicalConfidence: 2 },
}));
