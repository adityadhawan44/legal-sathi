import { ChangeEvent, FormEvent, startTransition, useDeferredValue, useEffect, useState } from 'react';

type TabKey = 'home' | 'ask' | 'complaint' | 'lawyers' | 'profile';

type FeedItem = {
  id: string;
  tag: string;
  title: string;
  body: string;
  sourceLabel: string;
  sourceUrl: string;
  stats: { likes: number; saves: number; shares: number };
};

type LegalLaw = {
  label: string;
  reason: string;
};

type FilingChannel = {
  label: string;
  url: string;
};

type EvidenceFile = {
  originalName: string;
  storedName: string;
  url: string;
  mimeType: string;
  size: number;
};

type UserProfile = {
  _id?: string;
  id?: string;
  name: string;
  email?: string;
  phone?: string;
  city?: string;
  verifiedPhone?: boolean;
  lastVerifiedAt?: string;
  role?: 'citizen' | 'lawyer';
};

type LegalResponse = {
  category: string;
  severity: string;
  summary: string;
  laws: LegalLaw[];
  immediateActions: string[];
  nextSteps: string[];
  filingChannels: FilingChannel[];
  disclaimer: string;
};

type ComplaintDraft = {
  _id?: string;
  id?: string;
  title: string;
  incidentType?: string;
  location?: string;
  summary?: string;
  evidence?: string;
  evidenceFiles?: EvidenceFile[];
  accusedKnown?: boolean;
  complaintType: string;
  sections: LegalLaw[];
  nextSteps: string[];
  filingChannels: FilingChannel[];
  firDraft: string;
  createdAt?: string;
};

type Lawyer = {
  _id?: string;
  id?: string;
  name: string;
  city: string;
  languages: string[];
  specialization: string;
  rating: number;
  verified: boolean;
  fee: string;
  availability: string;
  about: string;
};

type HealthResponse = {
  database: string;
  uploads: string;
  otp: string;
  payments: string;
};

type PaymentOrderResponse = {
  mode: string;
  keyId: string;
  order: {
    id: string;
    amount: number;
    currency: string;
    receipt: string;
    status?: string;
  };
};

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'home', label: 'Home' },
  { key: 'ask', label: 'Ask AI' },
  { key: 'complaint', label: 'Complaint' },
  { key: 'lawyers', label: 'Lawyers' },
  { key: 'profile', label: 'Profile' },
];

const defaultQuestion = 'Someone scammed me online through UPI after promising a refund.';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [backendStatus, setBackendStatus] = useState('Checking server...');
  const [serviceModes, setServiceModes] = useState({
    uploads: 'checking',
    otp: 'checking',
    payments: 'checking',
  });
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [userLoading, setUserLoading] = useState(false);
  const [askPrompt, setAskPrompt] = useState(defaultQuestion);
  const [askResult, setAskResult] = useState<LegalResponse | null>(null);
  const [askLoading, setAskLoading] = useState(false);
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [lawyerCity, setLawyerCity] = useState('');
  const [lawyerSpecialization, setLawyerSpecialization] = useState('');
  const [lawyerSearch, setLawyerSearch] = useState('');
  const [complaintForm, setComplaintForm] = useState({
    incidentType: 'Online Scam',
    location: 'Bengaluru, Karnataka',
    summary: 'I transferred money after a fraudulent promise and now the person is unreachable.',
    evidence: 'UPI screenshots, transaction ID, mobile number, WhatsApp chat.',
    accusedKnown: false,
  });
  const [complaintDraft, setComplaintDraft] = useState<ComplaintDraft | null>(null);
  const [complaintLoading, setComplaintLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<EvidenceFile[]>([]);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const [savedDrafts, setSavedDrafts] = useState<ComplaintDraft[]>([]);
  const [otpCode, setOtpCode] = useState('');
  const [otpFeedback, setOtpFeedback] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [paymentFeedback, setPaymentFeedback] = useState('');
  const [paymentLoadingFor, setPaymentLoadingFor] = useState<string | null>(null);
  const [userForm, setUserForm] = useState({
    name: 'Arjun Mehta',
    email: 'arjun@example.com',
    phone: '+91 9876543210',
    city: 'Bengaluru',
    role: 'citizen',
  });
  const [lawyerOnboarding, setLawyerOnboarding] = useState({
    name: 'Adv. Neha Verma',
    email: 'neha@legalmail.in',
    phone: '+91 9988776655',
    city: 'Delhi',
    specialization: 'Cyber Crime',
    languages: 'Hindi, English',
    services: 'Consultation, Complaint Drafting, Police Representation',
    barCouncilNumber: 'D/1234/2020',
    practiceYears: '5',
    fee: 'Starts at Rs. 2,000',
    availability: 'Available this week',
    about: 'Representing complainants in cyber fraud, online abuse, and digital evidence-heavy cases.',
  });
  const [lawyerSubmitLoading, setLawyerSubmitLoading] = useState(false);

  const deferredLawyerSearch = useDeferredValue(lawyerSearch);

  useEffect(() => {
    void loadHealth();
    void loadFeed();
    void loadLawyers();
    void loadComplaints();

    const savedQueries = localStorage.getItem('legal-sathi-recent-queries');
    const savedUser = localStorage.getItem('legal-sathi-user');
    if (savedQueries) {
      setRecentQueries(JSON.parse(savedQueries));
    }
    if (savedUser) {
      setCurrentUser(JSON.parse(savedUser));
    }
  }, []);

  useEffect(() => {
    void loadLawyers();
  }, [lawyerCity, lawyerSpecialization, deferredLawyerSearch]);

  async function loadHealth() {
    const response = await fetch('/api/health');
    const data = (await response.json()) as HealthResponse;
    const statusMap: Record<string, string> = {
      connected: 'MongoDB connected',
      'configured-not-connected': 'MongoDB configured but not reachable',
      'demo-mode': 'Demo mode without MongoDB',
    };
    setBackendStatus(statusMap[data.database] ?? 'Server online');
    setServiceModes({
      uploads: data.uploads,
      otp: data.otp,
      payments: data.payments,
    });
  }

  async function loadFeed() {
    const response = await fetch('/api/feed');
    const data = (await response.json()) as { items: FeedItem[] };
    setFeedItems(data.items);
  }

  async function loadLawyers() {
    const params = new URLSearchParams();
    if (lawyerCity) params.set('city', lawyerCity);
    if (lawyerSpecialization) params.set('specialization', lawyerSpecialization);
    if (deferredLawyerSearch) params.set('search', deferredLawyerSearch);

    const suffix = params.size > 0 ? `?${params.toString()}` : '';
    const response = await fetch(`/api/lawyers${suffix}`);
    const data = (await response.json()) as { items: Lawyer[] };
    setLawyers(data.items);
  }

  async function loadComplaints() {
    const response = await fetch('/api/complaints');
    const data = (await response.json()) as { items: ComplaintDraft[] };
    setSavedDrafts(data.items);
  }

  async function handleUserSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUserLoading(true);

    try {
      const response = await fetch('/api/users/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userForm),
      });
      const data = (await response.json()) as { item: UserProfile };
      setCurrentUser(data.item);
      localStorage.setItem('legal-sathi-user', JSON.stringify(data.item));
      setOtpFeedback('');
    } finally {
      setUserLoading(false);
    }
  }

  async function handleSendOtp() {
    if (!userForm.phone) {
      setOtpFeedback('Add a phone number first.');
      return;
    }

    setOtpLoading(true);
    try {
      const response = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: userForm.phone }),
      });
      const data = (await response.json()) as { mode: string; code?: string };
      setOtpFeedback(
        data.mode === 'mock' && data.code
          ? `Mock OTP generated: ${data.code}`
          : 'OTP sent. Check your phone.',
      );
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleVerifyOtp() {
    const userId = currentUser?._id ?? currentUser?.id;
    if (!userForm.phone || !otpCode || !userId) {
      setOtpFeedback('Save your profile and enter the OTP code first.');
      return;
    }

    setOtpLoading(true);
    try {
      const response = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: userForm.phone,
          code: otpCode,
          userId,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setOtpFeedback(data.error ?? 'Verification failed.');
        return;
      }
      const updatedUser = data.item as UserProfile | null;
      if (updatedUser) {
        setCurrentUser(updatedUser);
        localStorage.setItem('legal-sathi-user', JSON.stringify(updatedUser));
      }
      setOtpFeedback('Phone verified successfully.');
      setOtpCode('');
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleEvidenceUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append('files', file));
    setUploadLoading(true);

    try {
      const response = await fetch('/api/uploads/evidence', {
        method: 'POST',
        body: formData,
      });
      const data = (await response.json()) as { items: EvidenceFile[] };
      setUploadedFiles((current) => [...current, ...data.items]);
    } finally {
      setUploadLoading(false);
      event.target.value = '';
    }
  }

  async function handleAskSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAskLoading(true);

    try {
      const response = await fetch('/api/legal-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: askPrompt }),
      });
      const data = (await response.json()) as LegalResponse;
      startTransition(() => {
        setAskResult(data);
      });

      const updatedQueries = [askPrompt, ...recentQueries.filter((item) => item !== askPrompt)].slice(0, 5);
      setRecentQueries(updatedQueries);
      localStorage.setItem('legal-sathi-recent-queries', JSON.stringify(updatedQueries));
    } finally {
      setAskLoading(false);
    }
  }

  async function handleComplaintSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setComplaintLoading(true);

    try {
      const response = await fetch('/api/complaints/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...complaintForm,
          userId: currentUser?._id ?? currentUser?.id,
          evidenceFiles: uploadedFiles,
        }),
      });
      const data = (await response.json()) as ComplaintDraft;
      setComplaintDraft(data);
      void loadComplaints();
    } finally {
      setComplaintLoading(false);
    }
  }

  async function handleLawyerOnboardingSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLawyerSubmitLoading(true);

    try {
      await fetch('/api/lawyers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lawyerOnboarding),
      });
      await loadLawyers();
      setLawyerOnboarding({
        name: '',
        email: '',
        phone: '',
        city: '',
        specialization: '',
        languages: '',
        services: '',
        barCouncilNumber: '',
        practiceYears: '',
        fee: '',
        availability: '',
        about: '',
      });
    } finally {
      setLawyerSubmitLoading(false);
    }
  }

  async function handleCreateConsultationOrder(lawyer: Lawyer) {
    setPaymentLoadingFor(lawyer._id ?? lawyer.id ?? lawyer.name);
    setPaymentFeedback('');

    try {
      const response = await fetch('/api/payments/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 200000,
          receipt: `consult-${Date.now()}`,
          notes: {
            lawyer: lawyer.name,
            specialization: lawyer.specialization,
            customer: currentUser?.name ?? 'Guest',
          },
        }),
      });
      const data = (await response.json()) as PaymentOrderResponse;
      setPaymentFeedback(
        `${data.mode === 'razorpay' ? 'Razorpay' : 'Mock'} order created: ${data.order.id}`,
      );
    } finally {
      setPaymentLoadingFor(null);
    }
  }

  return (
    <div className="app">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <header className="topbar">
        <div>
          <p className="eyebrow">India-first legal support</p>
          <h1>Legal Sathi</h1>
        </div>
        <div className="topbar-actions">
          <span className="badge">{backendStatus}</span>
          <span className="badge">AI + Lawyer Hybrid</span>
          <span className="badge">Uploads: {serviceModes.uploads}</span>
          <button className="primary-chip" onClick={() => setActiveTab('ask')} type="button">
            Ask AI
          </button>
        </div>
      </header>

      <main className="layout">
        <section className="demo-banner">
          <strong>Public demo mode</strong>
          <span>
            Running without paid integrations. AI, OTP, payments, uploads, and saved data use safe demo fallbacks unless
            live credentials are added later.
          </span>
        </section>

        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Complaint system + marketplace + awareness feed</p>
            <h2>Understand your rights, draft complaints, and reach the right lawyer faster.</h2>
            <p className="hero-text">
              Designed for Indian citizens with plain-language triage, BNS-aware fallback mappings, and action-first
              flows that reduce fear and confusion.
            </p>
            <div className="hero-cta">
              <button className="primary-button" onClick={() => setActiveTab('complaint')} type="button">
                Start a complaint
              </button>
              <button className="ghost-button" onClick={() => setActiveTab('lawyers')} type="button">
                Find lawyers
              </button>
            </div>
          </div>

          <div className="hero-panel">
            <div className="hero-stat-card">
              <span>Fast lane</span>
              <strong>AI triage in seconds</strong>
              <p>Ask what happened. Get likely category, next steps, and filing channels.</p>
            </div>
            <div className="hero-stat-grid">
              <article>
                <strong>4</strong>
                <span>problems solved in one app</span>
              </article>
              <article>
                <strong>1930</strong>
                <span>cyber helpline highlighted for fraud flows</span>
              </article>
              <article>
                <strong>112</strong>
                <span>emergency prompt when safety is at risk</span>
              </article>
            </div>
          </div>
        </section>

        <section className="mobile-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={tab.key === activeTab ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveTab(tab.key)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </section>

        {activeTab === 'home' && (
          <section className="tab-content">
            <div className="section-head">
              <div>
                <p className="eyebrow">Legal awareness feed</p>
                <h3>Stay informed like a legal Twitter timeline</h3>
              </div>
              <button className="ghost-button" onClick={() => setActiveTab('ask')} type="button">
                Floating Ask AI
              </button>
            </div>

            <div className="feed-grid">
              {feedItems.map((item) => (
                <article className="feed-card" key={item.id}>
                  <div className="feed-tag-row">
                    <span className="tag">{item.tag}</span>
                    <a href={item.sourceUrl} rel="noreferrer" target="_blank">
                      {item.sourceLabel}
                    </a>
                  </div>
                  <h4>{item.title}</h4>
                  <p>{item.body}</p>
                  <div className="feed-actions">
                    <span>Like {item.stats.likes}</span>
                    <span>Save {item.stats.saves}</span>
                    <span>Share {item.stats.shares}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'ask' && (
          <section className="tab-content two-column">
            <div className="panel">
              <div className="section-head compact">
                <div>
                  <p className="eyebrow">AI legal assistant</p>
                  <h3>Describe the problem in plain English or Hindi</h3>
                </div>
              </div>

              <form className="stack" onSubmit={handleAskSubmit}>
                <textarea
                  className="input textarea"
                  value={askPrompt}
                  onChange={(event) => setAskPrompt(event.target.value)}
                  placeholder="Example: Someone blackmailed me for money after stealing my photos."
                />
                <button className="primary-button full" disabled={askLoading} type="submit">
                  {askLoading ? 'Checking likely legal path...' : 'Get legal guidance'}
                </button>
              </form>

              <div className="suggestion-row">
                {[
                  'Someone scammed me online',
                  'My phone was snatched on the road',
                  'I am being blackmailed for money',
                ].map((item) => (
                  <button className="suggestion-chip" key={item} onClick={() => setAskPrompt(item)} type="button">
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="panel result-panel">
              {askResult ? (
                <>
                  <div className="result-header">
                    <span className="tag">{askResult.category}</span>
                    <strong>{askResult.severity}</strong>
                  </div>
                  <p className="lead">{askResult.summary}</p>

                  <div className="result-block">
                    <h4>Likely sections</h4>
                    {askResult.laws.map((law) => (
                      <div className="law-card" key={law.label}>
                        <strong>{law.label}</strong>
                        <p>{law.reason}</p>
                      </div>
                    ))}
                  </div>

                  <div className="result-block">
                    <h4>Immediate actions</h4>
                    <ul>
                      {askResult.immediateActions.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="result-block">
                    <h4>Where to file</h4>
                    <div className="link-stack">
                      {askResult.filingChannels.map((channel) => (
                        <a href={channel.url} key={channel.label} rel="noreferrer" target="_blank">
                          {channel.label}
                        </a>
                      ))}
                    </div>
                  </div>

                  <p className="disclaimer">{askResult.disclaimer}</p>
                </>
              ) : (
                <div className="empty-state">
                  <h4>No case analyzed yet</h4>
                  <p>The result card will show category, likely BNS mapping, action steps, and complaint channels.</p>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === 'complaint' && (
          <section className="tab-content two-column">
            <div className="panel">
              <div className="section-head compact">
                <div>
                  <p className="eyebrow">Complaint filing system</p>
                  <h3>Wizard-style intake</h3>
                </div>
              </div>

              <form className="stack" onSubmit={handleComplaintSubmit}>
                <label className="field">
                  <span>Type of offence</span>
                  <input
                    className="input"
                    value={complaintForm.incidentType}
                    onChange={(event) => setComplaintForm({ ...complaintForm, incidentType: event.target.value })}
                  />
                </label>

                <label className="field">
                  <span>Location</span>
                  <input
                    className="input"
                    value={complaintForm.location}
                    onChange={(event) => setComplaintForm({ ...complaintForm, location: event.target.value })}
                  />
                </label>

                <label className="field">
                  <span>Incident details</span>
                  <textarea
                    className="input textarea"
                    value={complaintForm.summary}
                    onChange={(event) => setComplaintForm({ ...complaintForm, summary: event.target.value })}
                  />
                </label>

                <label className="field">
                  <span>Evidence available</span>
                  <textarea
                    className="input textarea short"
                    value={complaintForm.evidence}
                    onChange={(event) => setComplaintForm({ ...complaintForm, evidence: event.target.value })}
                  />
                </label>

                <label className="field">
                  <span>Upload screenshots, PDFs, or supporting files</span>
                  <input className="input" multiple onChange={handleEvidenceUpload} type="file" />
                </label>

                {uploadedFiles.length > 0 && (
                  <div className="upload-list">
                    {uploadedFiles.map((file) => (
                      <div className="upload-item" key={`${file.storedName}-${file.size}`}>
                        <strong>{file.originalName}</strong>
                        <span>{Math.round(file.size / 1024)} KB uploaded</span>
                      </div>
                    ))}
                  </div>
                )}

                <label className="checkbox">
                  <input
                    checked={complaintForm.accusedKnown}
                    onChange={(event) => setComplaintForm({ ...complaintForm, accusedKnown: event.target.checked })}
                    type="checkbox"
                  />
                  <span>I know or can partly identify the accused</span>
                </label>

                <button className="primary-button full" disabled={complaintLoading} type="submit">
                  {complaintLoading ? 'Generating complaint draft...' : 'Generate FIR-style draft'}
                </button>
                {uploadLoading && <p className="helper-text">Uploading evidence...</p>}
              </form>
            </div>

            <div className="panel result-panel">
              {complaintDraft ? (
                <>
                  <div className="result-header">
                    <span className="tag">{complaintDraft.complaintType}</span>
                    <strong>Draft ready</strong>
                  </div>
                  <div className="result-block">
                    <h4>Likely sections attached</h4>
                    {complaintDraft.sections.map((law) => (
                      <div className="law-card" key={law.label}>
                        <strong>{law.label}</strong>
                        <p>{law.reason}</p>
                      </div>
                    ))}
                  </div>
                  <div className="result-block">
                    <h4>FIR preview</h4>
                    <pre className="draft-preview">{complaintDraft.firDraft}</pre>
                  </div>
                  <div className="result-block">
                    <h4>Next filing steps</h4>
                    <ul>
                      {complaintDraft.nextSteps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <h4>No draft generated yet</h4>
                  <p>Once submitted, Legal Sathi will draft a clean police-facing complaint with likely legal mapping.</p>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === 'lawyers' && (
          <section className="tab-content">
            <div className="section-head">
              <div>
                <p className="eyebrow">Lawyer marketplace</p>
                <h3>Browse by city, expertise, and urgency</h3>
              </div>
            </div>

            <div className="filters">
              <input
                className="input"
                placeholder="Search lawyer or language"
                value={lawyerSearch}
                onChange={(event) => setLawyerSearch(event.target.value)}
              />
              <input
                className="input"
                placeholder="City"
                value={lawyerCity}
                onChange={(event) => setLawyerCity(event.target.value)}
              />
              <input
                className="input"
                placeholder="Specialization"
                value={lawyerSpecialization}
                onChange={(event) => setLawyerSpecialization(event.target.value)}
              />
            </div>

            <div className="lawyer-grid">
              {lawyers.map((lawyer) => (
                <article className="lawyer-card" key={lawyer._id ?? lawyer.id ?? lawyer.name}>
                  <div className="lawyer-head">
                    <div>
                      <h4>{lawyer.name}</h4>
                      <p>
                        {lawyer.city} - {lawyer.specialization}
                      </p>
                    </div>
                    {lawyer.verified && <span className="verified">Verified</span>}
                  </div>
                  <p>{lawyer.about}</p>
                  <div className="lawyer-meta">
                    <span>Rating {lawyer.rating}</span>
                    <span>{lawyer.fee}</span>
                    <span>{lawyer.availability}</span>
                  </div>
                  <div className="lawyer-meta">
                    <span>{lawyer.languages.join(', ')}</span>
                  </div>
                  <div className="card-actions">
                    <button className="primary-chip" type="button">
                      Call
                    </button>
                    <button className="ghost-button small" type="button">
                      Chat
                    </button>
                    <button
                      className="ghost-button small"
                      onClick={() => void handleCreateConsultationOrder(lawyer)}
                      type="button"
                    >
                      {paymentLoadingFor === (lawyer._id ?? lawyer.id ?? lawyer.name)
                        ? 'Creating order...'
                        : 'Pay consultation'}
                    </button>
                  </div>
                </article>
              ))}
            </div>

            {paymentFeedback && <p className="helper-text">{paymentFeedback}</p>}

            <div className="panel onboarding-panel">
              <div className="section-head compact">
                <div>
                  <p className="eyebrow">For lawyers</p>
                  <h3>Join the marketplace</h3>
                </div>
              </div>

              <form className="stack" onSubmit={handleLawyerOnboardingSubmit}>
                <div className="three-grid">
                  <input
                    className="input"
                    placeholder="Full name"
                    value={lawyerOnboarding.name}
                    onChange={(event) => setLawyerOnboarding({ ...lawyerOnboarding, name: event.target.value })}
                  />
                  <input
                    className="input"
                    placeholder="Email"
                    value={lawyerOnboarding.email}
                    onChange={(event) => setLawyerOnboarding({ ...lawyerOnboarding, email: event.target.value })}
                  />
                  <input
                    className="input"
                    placeholder="Phone"
                    value={lawyerOnboarding.phone}
                    onChange={(event) => setLawyerOnboarding({ ...lawyerOnboarding, phone: event.target.value })}
                  />
                </div>

                <div className="three-grid">
                  <input
                    className="input"
                    placeholder="City"
                    value={lawyerOnboarding.city}
                    onChange={(event) => setLawyerOnboarding({ ...lawyerOnboarding, city: event.target.value })}
                  />
                  <input
                    className="input"
                    placeholder="Specialization"
                    value={lawyerOnboarding.specialization}
                    onChange={(event) => setLawyerOnboarding({ ...lawyerOnboarding, specialization: event.target.value })}
                  />
                  <input
                    className="input"
                    placeholder="Bar Council Number"
                    value={lawyerOnboarding.barCouncilNumber}
                    onChange={(event) => setLawyerOnboarding({ ...lawyerOnboarding, barCouncilNumber: event.target.value })}
                  />
                </div>

                <div className="three-grid">
                  <input
                    className="input"
                    placeholder="Languages"
                    value={lawyerOnboarding.languages}
                    onChange={(event) => setLawyerOnboarding({ ...lawyerOnboarding, languages: event.target.value })}
                  />
                  <input
                    className="input"
                    placeholder="Services"
                    value={lawyerOnboarding.services}
                    onChange={(event) => setLawyerOnboarding({ ...lawyerOnboarding, services: event.target.value })}
                  />
                  <input
                    className="input"
                    placeholder="Years of practice"
                    value={lawyerOnboarding.practiceYears}
                    onChange={(event) => setLawyerOnboarding({ ...lawyerOnboarding, practiceYears: event.target.value })}
                  />
                </div>

                <div className="three-grid">
                  <input
                    className="input"
                    placeholder="Fee"
                    value={lawyerOnboarding.fee}
                    onChange={(event) => setLawyerOnboarding({ ...lawyerOnboarding, fee: event.target.value })}
                  />
                  <input
                    className="input"
                    placeholder="Availability"
                    value={lawyerOnboarding.availability}
                    onChange={(event) => setLawyerOnboarding({ ...lawyerOnboarding, availability: event.target.value })}
                  />
                </div>

                <textarea
                  className="input textarea short"
                  placeholder="Professional summary"
                  value={lawyerOnboarding.about}
                  onChange={(event) => setLawyerOnboarding({ ...lawyerOnboarding, about: event.target.value })}
                />

                <button className="primary-button" disabled={lawyerSubmitLoading} type="submit">
                  {lawyerSubmitLoading ? 'Submitting profile...' : 'Submit lawyer profile'}
                </button>
              </form>
            </div>
          </section>
        )}

        {activeTab === 'profile' && (
          <section className="tab-content two-column">
            <div className="panel">
              <p className="eyebrow">Profile</p>
              <h3>Citizen dashboard</h3>
              <div className="profile-card">
                <strong>{currentUser?.name ?? 'No saved profile yet'}</strong>
                <p>
                  {currentUser?.city ?? 'Set your city'} - {currentUser?.email ?? currentUser?.phone ?? 'Add contact details'}
                </p>
                <p>{currentUser?.verifiedPhone ? 'Phone verified' : `OTP mode: ${serviceModes.otp}`}</p>
              </div>
              <div className="mini-grid">
                <article>
                  <strong>{recentQueries.length}</strong>
                  <span>recent AI checks</span>
                </article>
                <article>
                  <strong>{savedDrafts.length}</strong>
                  <span>saved complaint drafts</span>
                </article>
              </div>
            </div>

            <div className="panel">
              <div className="result-block">
                <h4>Save profile</h4>
                <form className="stack" onSubmit={handleUserSubmit}>
                  <input
                    className="input"
                    placeholder="Full name"
                    value={userForm.name}
                    onChange={(event) => setUserForm({ ...userForm, name: event.target.value })}
                  />
                  <input
                    className="input"
                    placeholder="Email"
                    value={userForm.email}
                    onChange={(event) => setUserForm({ ...userForm, email: event.target.value })}
                  />
                  <input
                    className="input"
                    placeholder="Phone"
                    value={userForm.phone}
                    onChange={(event) => setUserForm({ ...userForm, phone: event.target.value })}
                  />
                  <input
                    className="input"
                    placeholder="City"
                    value={userForm.city}
                    onChange={(event) => setUserForm({ ...userForm, city: event.target.value })}
                  />
                  <button className="primary-button" disabled={userLoading} type="submit">
                    {userLoading ? 'Saving profile...' : 'Save profile'}
                  </button>
                </form>
              </div>

              <div className="result-block">
                <h4>Verify phone with OTP</h4>
                <div className="stack">
                  <div className="card-actions">
                    <button className="primary-button" disabled={otpLoading} onClick={() => void handleSendOtp()} type="button">
                      {otpLoading ? 'Sending OTP...' : 'Send OTP'}
                    </button>
                  </div>
                  <input
                    className="input"
                    placeholder="Enter OTP code"
                    value={otpCode}
                    onChange={(event) => setOtpCode(event.target.value)}
                  />
                  <button className="ghost-button" disabled={otpLoading} onClick={() => void handleVerifyOtp()} type="button">
                    {otpLoading ? 'Verifying...' : 'Verify OTP'}
                  </button>
                  {otpFeedback && <p className="helper-text">{otpFeedback}</p>}
                </div>
              </div>

              <div className="result-block">
                <h4>Recent AI queries</h4>
                <ul>
                  {recentQueries.length > 0 ? recentQueries.map((query) => <li key={query}>{query}</li>) : <li>No queries saved yet.</li>}
                </ul>
              </div>

              <div className="result-block">
                <h4>Saved complaints</h4>
                <ul>
                  {savedDrafts.length > 0
                    ? savedDrafts.map((draft) => (
                        <li key={draft._id ?? draft.id ?? draft.title}>
                          {draft.title}
                          {draft.location ? ` - ${draft.location}` : ''}
                        </li>
                      ))
                    : <li>No complaint drafts saved yet.</li>}
                </ul>
              </div>

              <div className="result-block">
                <h4>Settings to add next</h4>
                <ul>
                  <li>Twilio Verify-backed OTP is supported when credentials are configured</li>
                  <li>Cloudinary-backed evidence storage is supported when configured</li>
                  <li>Razorpay order creation is supported for paid consultations</li>
                </ul>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
