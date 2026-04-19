import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, index: true },
    phone: { type: String, trim: true, index: true },
    city: { type: String, trim: true },
    verifiedPhone: { type: Boolean, default: false },
    lastVerifiedAt: { type: Date },
    role: {
      type: String,
      enum: ['citizen', 'lawyer'],
      default: 'citizen',
    },
  },
  {
    timestamps: true,
  },
);

export const User = mongoose.models.User || mongoose.model('User', userSchema);
