import mongoose from 'mongoose';

const lawyerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    city: { type: String, required: true, trim: true, index: true },
    languages: { type: [String], default: [] },
    specialization: { type: String, required: true, trim: true, index: true },
    services: { type: [String], default: [] },
    barCouncilNumber: { type: String, trim: true },
    practiceYears: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
    verified: { type: Boolean, default: false },
    onboardingStatus: {
      type: String,
      enum: ['draft', 'submitted', 'approved'],
      default: 'submitted',
    },
    fee: { type: String, required: true, trim: true },
    availability: { type: String, required: true, trim: true },
    about: { type: String, required: true, trim: true },
  },
  {
    timestamps: true,
  },
);

export const Lawyer = mongoose.models.Lawyer || mongoose.model('Lawyer', lawyerSchema);
