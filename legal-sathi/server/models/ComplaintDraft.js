import mongoose from 'mongoose';

const legalLawSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    reason: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const filingChannelSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const evidenceFileSchema = new mongoose.Schema(
  {
    originalName: { type: String, required: true, trim: true },
    storedName: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true },
    size: { type: Number, required: true },
  },
  { _id: false },
);

const complaintDraftSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    incidentType: { type: String, required: true, trim: true, index: true },
    location: { type: String, required: true, trim: true },
    summary: { type: String, required: true, trim: true },
    evidence: { type: String, default: '', trim: true },
    evidenceFiles: { type: [evidenceFileSchema], default: [] },
    accusedKnown: { type: Boolean, default: false },
    complaintType: { type: String, required: true, trim: true },
    sections: { type: [legalLawSchema], default: [] },
    nextSteps: { type: [String], default: [] },
    filingChannels: { type: [filingChannelSchema], default: [] },
    firDraft: { type: String, required: true },
  },
  {
    timestamps: true,
  },
);

export const ComplaintDraft =
  mongoose.models.ComplaintDraft || mongoose.model('ComplaintDraft', complaintDraftSchema);
