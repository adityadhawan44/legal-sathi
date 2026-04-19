import cors from 'cors';
import { v2 as cloudinary } from 'cloudinary';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { connectToDatabase, isDatabaseReady } from './db.js';
import { feedItems, lawyers as demoLawyers } from './data/demoData.js';
import { ComplaintDraft } from './models/ComplaintDraft.js';
import { Lawyer } from './models/Lawyer.js';
import { User } from './models/User.js';

const app = express();
const port = Number(process.env.PORT || 8788);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, '../dist');
const uploadsPath = path.resolve(__dirname, '../uploads/evidence');
const inMemoryComplaintDrafts = [];
const inMemoryUsers = [];
const otpStore = new Map();

if (process.env.CLOUDINARY_URL) {
  cloudinary.config({ secure: true });
}

fs.mkdirSync(uploadsPath, { recursive: true });

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => {
    callback(null, uploadsPath);
  },
  filename: (_request, file, callback) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    callback(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 5,
  },
});

app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
  }),
);
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    app: 'legal-sathi',
    date: new Date().toISOString(),
    database: isDatabaseReady() ? 'connected' : process.env.MONGODB_URI ? 'configured-not-connected' : 'demo-mode',
    uploads: process.env.CLOUDINARY_URL ? 'cloudinary' : 'local',
    otp: hasTwilioConfig() ? 'twilio-verify' : 'mock',
    payments: hasRazorpayConfig() ? 'razorpay' : 'mock',
  });
});

app.get('/api/feed', (_request, response) => {
  response.json({ items: feedItems });
});

app.get('/api/users/:id', async (request, response) => {
  const { id } = request.params;

  if (isDatabaseReady()) {
    const user = await User.findById(id).lean();
    response.json({ item: user });
    return;
  }

  const user = inMemoryUsers.find((entry) => entry.id === id) ?? null;
  response.json({ item: user });
});

app.post('/api/users/session', async (request, response) => {
  const payload = normalizeUserPayload(request.body ?? {});

  if (!payload.name || (!payload.email && !payload.phone)) {
    response.status(400).json({ error: 'Name and either email or phone are required.' });
    return;
  }

  if (isDatabaseReady()) {
    const existingUser = await User.findOne({
      $or: [
        ...(payload.email ? [{ email: payload.email }] : []),
        ...(payload.phone ? [{ phone: payload.phone }] : []),
      ],
    });

    const user = existingUser
      ? await User.findByIdAndUpdate(existingUser._id, payload, { new: true })
      : await User.create(payload);

    response.json({ item: user });
    return;
  }

  const existingUser = inMemoryUsers.find((entry) => entry.email === payload.email || entry.phone === payload.phone);
  if (existingUser) {
    Object.assign(existingUser, payload);
    response.json({ item: existingUser });
    return;
  }

  const user = { id: `demo-user-${Date.now()}`, createdAt: new Date().toISOString(), ...payload };
  inMemoryUsers.push(user);
  response.json({ item: user });
});

app.post('/api/auth/otp/send', async (request, response) => {
  const phone = String(request.body?.phone || '').trim();

  if (!phone) {
    response.status(400).json({ error: 'Phone is required.' });
    return;
  }

  if (hasTwilioConfig()) {
    const verification = await sendTwilioVerification(phone);
    response.json({
      mode: 'twilio-verify',
      status: verification.status ?? 'pending',
      to: phone,
    });
    return;
  }

  const code = `${Math.floor(100000 + Math.random() * 900000)}`;
  otpStore.set(phone, {
    code,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
  response.json({
    mode: 'mock',
    status: 'pending',
    to: phone,
    code,
  });
});

app.post('/api/auth/otp/verify', async (request, response) => {
  const phone = String(request.body?.phone || '').trim();
  const code = String(request.body?.code || '').trim();
  const userId = String(request.body?.userId || '').trim();

  if (!phone || !code) {
    response.status(400).json({ error: 'Phone and code are required.' });
    return;
  }

  let approved = false;

  if (hasTwilioConfig()) {
    const verificationCheck = await verifyTwilioCode(phone, code);
    approved = Boolean(verificationCheck.valid) || verificationCheck.status === 'approved';
  } else {
    const entry = otpStore.get(phone);
    approved = Boolean(entry && entry.code === code && entry.expiresAt > Date.now());
    if (approved) {
      otpStore.delete(phone);
    }
  }

  if (!approved) {
    response.status(400).json({ error: 'Invalid or expired OTP.' });
    return;
  }

  let updatedUser = null;
  if (userId) {
    if (isDatabaseReady()) {
      updatedUser = await User.findByIdAndUpdate(
        userId,
        { verifiedPhone: true, lastVerifiedAt: new Date() },
        { new: true },
      );
    } else {
      const target = inMemoryUsers.find((entry) => entry.id === userId);
      if (target) {
        target.verifiedPhone = true;
        target.lastVerifiedAt = new Date().toISOString();
        updatedUser = target;
      }
    }
  }

  response.json({
    status: 'approved',
    item: updatedUser,
  });
});

app.get('/api/lawyers', async (request, response) => {
  const city = String(request.query.city || '').toLowerCase();
  const specialization = String(request.query.specialization || '').toLowerCase();
  const search = String(request.query.search || '').toLowerCase();

  const items = isDatabaseReady()
    ? await Lawyer.find(buildLawyerQuery({ city, specialization, search }))
        .sort({ verified: -1, rating: -1, createdAt: -1 })
        .lean()
    : filterLawyers(demoLawyers, { city, specialization, search }).map((lawyer, index) => ({
        id: `demo-lawyer-${index + 1}`,
        ...lawyer,
      }));

  response.json({ items });
});

app.post('/api/lawyers', async (request, response) => {
  const payload = normalizeLawyerPayload(request.body ?? {});

  if (!payload.name || !payload.city || !payload.specialization || !payload.fee || !payload.availability || !payload.about || !payload.email || !payload.phone) {
    response.status(400).json({ error: 'Name, email, phone, city, specialization, fee, availability, and about are required.' });
    return;
  }

  if (!isDatabaseReady()) {
    response.status(503).json({
      error: 'MongoDB is not connected. Add MONGODB_URI to enable lawyer persistence.',
    });
    return;
  }

  const createdLawyer = await Lawyer.create(payload);
  response.status(201).json({ item: createdLawyer });
});

app.post('/api/uploads/evidence', upload.array('files', 5), async (request, response) => {
  const files = request.files ?? [];

  const uploadedFiles = process.env.CLOUDINARY_URL
    ? await Promise.all(
        files.map(async (file) => {
          const result = await cloudinary.uploader.upload(file.path, {
            resource_type: 'auto',
            folder: 'legal-sathi/evidence',
          });
          try {
            fs.unlinkSync(file.path);
          } catch {}

          return {
            originalName: file.originalname,
            storedName: result.public_id,
            url: result.secure_url,
            mimeType: file.mimetype,
            size: file.size,
          };
        }),
      )
    : files.map((file) => ({
        originalName: file.originalname,
        storedName: file.filename,
        url: `/uploads/evidence/${file.filename}`,
        mimeType: file.mimetype,
        size: file.size,
      }));

  response.status(201).json({ items: uploadedFiles });
});

app.post('/api/payments/order', async (request, response) => {
  const amount = Number(request.body?.amount || 0);
  const receipt = String(request.body?.receipt || `consultation-${Date.now()}`);
  const notes = request.body?.notes ?? {};

  if (!Number.isFinite(amount) || amount <= 0) {
    response.status(400).json({ error: 'A positive amount is required.' });
    return;
  }

  if (hasRazorpayConfig()) {
    const razorpayOrder = await createRazorpayOrder({ amount, receipt, notes });
    response.status(201).json({
      mode: 'razorpay',
      keyId: process.env.RAZORPAY_KEY_ID,
      order: razorpayOrder,
    });
    return;
  }

  response.status(201).json({
    mode: 'mock',
    keyId: 'rzp_test_mock',
    order: {
      id: `order_mock_${Date.now()}`,
      amount,
      currency: 'INR',
      receipt,
      notes,
      status: 'created',
    },
  });
});

app.get('/api/complaints', async (_request, response) => {
  const items = isDatabaseReady()
    ? await ComplaintDraft.find().sort({ createdAt: -1 }).limit(20).lean()
    : inMemoryComplaintDrafts.slice().reverse();

  response.json({ items });
});

app.post('/api/legal-assistant', async (request, response) => {
  const prompt = String(request.body?.prompt || '').trim();

  if (!prompt) {
    response.status(400).json({ error: 'Prompt is required.' });
    return;
  }

  try {
    const aiResult = await maybeGenerateLegalAdvice(prompt);
    response.json(aiResult ?? legalFallback(prompt));
  } catch (error) {
    response.json(legalFallback(prompt, error instanceof Error ? error.message : 'Unknown error'));
  }
});

app.post('/api/complaints/draft', async (request, response) => {
  const payload = {
    userId: String(request.body?.userId || '').trim(),
    incidentType: String(request.body?.incidentType || '').trim(),
    location: String(request.body?.location || '').trim(),
    summary: String(request.body?.summary || '').trim(),
    evidence: String(request.body?.evidence || '').trim(),
    evidenceFiles: Array.isArray(request.body?.evidenceFiles) ? request.body.evidenceFiles : [],
    accusedKnown: Boolean(request.body?.accusedKnown),
  };

  if (!payload.incidentType || !payload.location || !payload.summary) {
    response.status(400).json({ error: 'Incident type, location, and summary are required.' });
    return;
  }

  const mapped = legalFallback(`${payload.incidentType}. ${payload.summary}`);
  const draft = {
    title: `Draft complaint for ${payload.incidentType}`,
    userId: payload.userId || undefined,
    incidentType: payload.incidentType,
    location: payload.location,
    summary: payload.summary,
    evidence: payload.evidence,
    evidenceFiles: payload.evidenceFiles,
    accusedKnown: payload.accusedKnown,
    complaintType: mapped.category,
    sections: mapped.laws,
    nextSteps: mapped.nextSteps,
    filingChannels: mapped.filingChannels,
    firDraft: createFirDraft(payload, mapped),
  };

  if (isDatabaseReady()) {
    const savedDraft = await ComplaintDraft.create(draft);
    response.json(savedDraft);
    return;
  }

  const inMemoryDraft = {
    id: `demo-complaint-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...draft,
  };
  inMemoryComplaintDrafts.push(inMemoryDraft);
  response.json(inMemoryDraft);
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(distPath));
  app.get(/.*/, (_request, response) => {
    response.sendFile(path.join(distPath, 'index.html'));
  });
}

void bootstrap();

async function bootstrap() {
  await connectToDatabase();

  if (isDatabaseReady()) {
    await seedLawyersIfEmpty();
  }

  app.listen(port, () => {
    console.log(`Legal Sathi server running on http://localhost:${port}`);
  });
}

async function seedLawyersIfEmpty() {
  const existingCount = await Lawyer.countDocuments();
  if (existingCount === 0) {
    await Lawyer.insertMany(demoLawyers);
  }
}

function normalizeLawyerPayload(payload) {
  return {
    name: String(payload.name || '').trim(),
    email: String(payload.email || '').trim().toLowerCase(),
    phone: String(payload.phone || '').trim(),
    city: String(payload.city || '').trim(),
    languages: Array.isArray(payload.languages)
      ? payload.languages.map((item) => String(item).trim()).filter(Boolean)
      : String(payload.languages || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
    specialization: String(payload.specialization || '').trim(),
    services: Array.isArray(payload.services)
      ? payload.services.map((item) => String(item).trim()).filter(Boolean)
      : String(payload.services || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
    barCouncilNumber: String(payload.barCouncilNumber || '').trim(),
    practiceYears: Number(payload.practiceYears || 0),
    rating: Number(payload.rating || 0),
    verified: Boolean(payload.verified),
    onboardingStatus: String(payload.onboardingStatus || 'submitted').trim(),
    fee: String(payload.fee || '').trim(),
    availability: String(payload.availability || '').trim(),
    about: String(payload.about || '').trim(),
  };
}

function normalizeUserPayload(payload) {
  return {
    name: String(payload.name || '').trim(),
    email: String(payload.email || '').trim().toLowerCase(),
    phone: String(payload.phone || '').trim(),
    city: String(payload.city || '').trim(),
    verifiedPhone: Boolean(payload.verifiedPhone),
    role: payload.role === 'lawyer' ? 'lawyer' : 'citizen',
  };
}

function hasTwilioConfig() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_VERIFY_SERVICE_SID,
  );
}

function hasRazorpayConfig() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

async function sendTwilioVerification(phone) {
  const body = new URLSearchParams({
    To: phone,
    Channel: 'sms',
  });

  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${process.env.TWILIO_VERIFY_SERVICE_SID}/Verifications`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`,
        ).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    },
  );

  if (!response.ok) {
    throw new Error('Twilio verification request failed');
  }

  return response.json();
}

async function verifyTwilioCode(phone, code) {
  const body = new URLSearchParams({
    To: phone,
    Code: code,
  });

  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${process.env.TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`,
        ).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    },
  );

  if (!response.ok) {
    throw new Error('Twilio verification check failed');
  }

  return response.json();
}

async function createRazorpayOrder({ amount, receipt, notes }) {
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`,
      ).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount,
      currency: 'INR',
      receipt,
      notes,
    }),
  });

  if (!response.ok) {
    throw new Error('Razorpay order creation failed');
  }

  return response.json();
}

function buildLawyerQuery({ city, specialization, search }) {
  const query = {};

  if (city) {
    query.city = { $regex: escapeRegex(city), $options: 'i' };
  }

  if (specialization) {
    query.specialization = { $regex: escapeRegex(specialization), $options: 'i' };
  }

  if (search) {
    query.$or = [
      { name: { $regex: escapeRegex(search), $options: 'i' } },
      { city: { $regex: escapeRegex(search), $options: 'i' } },
      { specialization: { $regex: escapeRegex(search), $options: 'i' } },
      { languages: { $elemMatch: { $regex: escapeRegex(search), $options: 'i' } } },
    ];
  }

  return query;
}

function filterLawyers(items, { city, specialization, search }) {
  return items.filter((lawyer) => {
    const matchesCity = !city || lawyer.city.toLowerCase().includes(city);
    const matchesSpecialization = !specialization || lawyer.specialization.toLowerCase().includes(specialization);
    const haystack = `${lawyer.name} ${lawyer.city} ${lawyer.specialization} ${lawyer.languages.join(' ')}`.toLowerCase();
    const matchesSearch = !search || haystack.includes(search);
    return matchesCity && matchesSpecialization && matchesSearch;
  });
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function maybeGenerateLegalAdvice(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const result = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text:
                'You are an India-focused legal triage assistant. Do not claim to be a lawyer. Return strict JSON only. Prefer practical, non-alarmist guidance. Cite only likely laws, never fabricate certainty.',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: prompt,
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'legal_triage',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              category: { type: 'string' },
              severity: { type: 'string' },
              summary: { type: 'string' },
              laws: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    label: { type: 'string' },
                    reason: { type: 'string' },
                  },
                  required: ['label', 'reason'],
                },
              },
              immediateActions: {
                type: 'array',
                items: { type: 'string' },
              },
              nextSteps: {
                type: 'array',
                items: { type: 'string' },
              },
              filingChannels: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    label: { type: 'string' },
                    url: { type: 'string' },
                  },
                  required: ['label', 'url'],
                },
              },
              disclaimer: { type: 'string' },
            },
            required: [
              'category',
              'severity',
              'summary',
              'laws',
              'immediateActions',
              'nextSteps',
              'filingChannels',
              'disclaimer',
            ],
          },
        },
      },
    }),
  });

  if (!result.ok) {
    throw new Error('OpenAI request failed');
  }

  const data = await result.json();
  const content = data.output?.[0]?.content?.[0]?.text;
  return content ? JSON.parse(content) : null;
}

function legalFallback(prompt, note) {
  const text = prompt.toLowerCase();
  const base = {
    severity: 'Act quickly',
    disclaimer:
      'This is general legal information for triage, not a substitute for a licensed advocate or police direction.',
    filingChannels: [
      {
        label: 'National Cyber Crime Reporting Portal',
        url: 'https://www.cybercrime.gov.in/',
      },
      {
        label: 'Digital Police Portal',
        url: 'https://digitalpolice.gov.in/',
      },
    ],
  };

  if (text.includes('scam') || text.includes('fraud') || text.includes('upi') || text.includes('online payment')) {
    return {
      ...base,
      category: 'Cyber fraud / cheating',
      summary: note
        ? `Fallback guidance used because live AI was unavailable: ${note}`
        : 'This looks like a deception-based money or property loss. Preserve transaction proof and report immediately, especially if the transfer is recent.',
      laws: [
        {
          label: 'BNS Section 318 - Cheating',
          reason: 'Used where deception dishonestly induces delivery of money, property, or a harmful act.',
        },
      ],
      immediateActions: [
        'Call 1930 immediately if the fraud is recent and financial.',
        'Take screenshots of chats, UPI IDs, bank alerts, URLs, and merchant details.',
        'Do not delete the app, message thread, or call log linked to the incident.',
      ],
      nextSteps: [
        'File on the National Cyber Crime Reporting Portal.',
        'Keep transaction ID, UTR number, amount, date, and suspect identifier ready.',
        'If money is substantial or threats continue, also approach the local police station.',
      ],
    };
  }

  if (text.includes('snatch') || text.includes('snatching')) {
    return {
      ...base,
      category: 'Property offence / snatching',
      summary: 'This appears closer to a forceful property-taking incident and should be treated as an urgent police complaint.',
      laws: [
        {
          label: 'BNS Section 304 - Snatching',
          reason: 'Used where property is suddenly taken from a person in a direct snatching incident.',
        },
      ],
      immediateActions: [
        'Note the exact place, time, route, and direction in which the accused fled.',
        'Preserve CCTV leads, eyewitness contacts, and device IMEI or serial number.',
        'Block bank cards, SIM, and linked wallets if a phone or wallet was taken.',
      ],
      nextSteps: [
        'Visit the nearest police station or use state police citizen services where available.',
        'Request the complaint or FIR acknowledgement number.',
        'Track device blocking and linked financial misuse immediately.',
      ],
    };
  }

  if (text.includes('stole') || text.includes('stolen') || text.includes('theft')) {
    return {
      ...base,
      category: 'Property offence / theft',
      summary: 'This appears to be a theft matter. The strongest early evidence is ownership proof, location details, and timeline consistency.',
      laws: [
        {
          label: 'BNS Section 303 - Theft',
          reason: 'Used for dishonest taking of movable property without consent.',
        },
      ],
      immediateActions: [
        'Collect purchase proof, IMEI, vehicle number, or ownership records.',
        'Write down when you last saw the property and where it went missing.',
        'Check nearby CCTV points before footage is overwritten.',
      ],
      nextSteps: [
        'File a police complaint with serial numbers and proof of ownership.',
        'If the theft happened in a home, vehicle, or place of worship, tell the officer clearly because aggravated provisions may matter.',
        'Store a digital copy of the complaint acknowledgement.',
      ],
    };
  }

  if (text.includes('blackmail') || text.includes('extort') || text.includes('threaten me for money')) {
    return {
      ...base,
      category: 'Extortion / coercion',
      summary: 'This looks like an extortion-type scenario. Preserve the threats exactly as received and avoid negotiating beyond what is needed for safety.',
      laws: [
        {
          label: 'BNS Section 308 - Extortion',
          reason: 'Used when property or money is induced through fear or coercive pressure.',
        },
      ],
      immediateActions: [
        'Keep the original chats, recordings, screenshots, and account details.',
        'Do not edit or crop the evidence.',
        'If there is a risk of immediate harm, contact 112 and local police at once.',
      ],
      nextSteps: [
        'File a complaint with the threat timeline and payment demands.',
        'Ask a lawyer to review whether urgent protective steps are needed.',
        'If the threat moved online, also file through the cybercrime portal.',
      ],
    };
  }

  return {
    ...base,
    category: 'General legal triage',
    summary:
      'Your situation may involve multiple laws. Start by preserving evidence, documenting a clear timeline, and choosing the correct complaint channel based on whether the issue is cyber-related or local-station based.',
    laws: [
      {
        label: 'Needs fact-based legal review',
        reason: 'The fallback engine only maps a narrow set of common categories safely.',
      },
    ],
    immediateActions: [
      'Write down what happened in chronological order.',
      'Collect screenshots, IDs, receipts, witness names, and location details.',
      'If there is immediate danger, call 112 or go to the nearest police station.',
    ],
    nextSteps: [
      'Use Ask AI for a more detailed narrative or consult a lawyer from the marketplace.',
      'Choose the cybercrime portal for online offences and police channels for non-cyber offences.',
      'Keep all acknowledgement numbers and copies of submitted evidence.',
    ],
  };
}

function createFirDraft(payload, mapped) {
  return `To,\nThe Station House Officer\n${payload.location}\n\nSubject: Complaint regarding ${payload.incidentType}\n\nRespected Sir/Madam,\n\nI wish to lodge a complaint regarding an incident of ${payload.incidentType}. The incident took place in or around ${payload.location}.\n\nBrief facts:\n${payload.summary}\n\nEvidence available:\n${payload.evidence || 'I will provide available supporting documents, screenshots, and identifiers during filing.'}\n\nWhether accused is known:\n${payload.accusedKnown ? 'Yes, the accused is known or partly identifiable.' : 'No, the accused is not clearly identified at this stage.'}\n\nBased on the available facts, the matter may require examination under the following likely legal heads:\n${mapped.laws.map((law) => `- ${law.label}: ${law.reason}`).join('\n')}\n\nI request you to kindly take appropriate legal action, register my complaint/FIR as applicable, and provide an acknowledgement.\n\nSincerely,\n[Your Name]\n[Mobile Number]\n[Address]\n[Date]`;
}
