# Legal Sathi

Legal Sathi is a deployable MVP for an India-focused legal platform with three core jobs:

- explain likely legal remedies in plain language
- guide citizens through a complaint flow
- connect users with lawyers

It is intentionally built as a web-first prototype so you can validate the product before investing in the full React Native + Redux + MongoDB roadmap.

## Features

- AI legal assistant for common real-world problems
- Complaint wizard with FIR-style draft generation
- Lawyer marketplace with filters and verified profiles
- Legal awareness feed with daily rights and safety content
- Profile area showing saved AI conversations and complaint drafts

## Stack

- Frontend: React + Vite + TypeScript
- Backend: Node.js + Express
- Deployment: single-service Node deploy on Render, Railway, or similar

## Local setup

1. Copy `.env.example` to `.env`
2. Fill in at least `OPENAI_API_KEY` if you want live AI responses
3. Run:

```bash
npm install
npm run dev
```

Client runs on `http://localhost:5174` and API runs on `http://localhost:8788`.

## Deployment credentials

These are the credentials or environment values you should prepare before deploying:

- `OPENAI_API_KEY`: required for live AI legal guidance
- `OPENAI_MODEL`: optional model override, defaults to `gpt-4.1-mini`
- `PORT`: supplied by most hosts automatically
- `CORS_ORIGIN`: useful if frontend and API are deployed separately
- `MONGODB_URI`: enables persistent lawyer profiles and complaint drafts
- `UPLOAD_DIR`: optional local upload directory for complaint evidence files
- `CLOUDINARY_URL`: enables Cloudinary-backed evidence uploads
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`: enable Twilio Verify OTP delivery and verification
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`: enable Razorpay order creation for paid consultations

## External services you will likely need next

- OpenAI API account for the assistant
- MongoDB Atlas for production persistence
- Twilio or MSG91 for OTP login and lawyer/user notifications
- Razorpay if you want paid consultations
- Cloudinary or S3-compatible storage for complaint evidence uploads

## What persists now

When `MONGODB_URI` is configured and reachable, the app now persists:

- lawyer profiles in MongoDB
- complaint drafts generated from the complaint wizard
- user profile sessions created through the profile form

If MongoDB is missing or unavailable, the app still runs in demo mode with:

- seeded in-memory/sample lawyers
- temporary in-memory complaint draft storage

## Uploads

The complaint flow now supports evidence uploads through the Express server.

- Local development stores files in `uploads/evidence`
- The app serves uploaded files at `/uploads/...`
- On Render, local disk is ephemeral, so uploads are suitable for MVP/demo usage only
- For production retention, move uploads to Cloudinary, S3, or another object storage provider
- If `CLOUDINARY_URL` is configured, evidence files are uploaded to Cloudinary instead of local disk

## OTP and payments

The profile flow now supports OTP-style phone verification and the lawyer marketplace supports consultation order creation.

- If Twilio Verify credentials are configured, OTP sending and verification use Twilio Verify
- Without Twilio credentials, the app falls back to mock OTP mode for demo usage
- If Razorpay credentials are configured, the app creates real Razorpay orders through the Orders API
- Without Razorpay credentials, the app falls back to mock order creation so the UI remains testable

## Render deployment

1. Create a new Web Service on Render and point it to this project folder.
2. Use the included `render.yaml` or set:

```bash
Build Command: npm install && npm run build
Start Command: npm start
```

3. Add these environment variables in Render:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `MONGODB_URI`
- `CORS_ORIGIN` if needed
- `NODE_ENV=production`
- `CLOUDINARY_URL` if you want cloud uploads
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_VERIFY_SERVICE_SID`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`

4. Render will expose the app on its assigned domain and use `/api/health` as the health check.

## Product caution

This MVP gives informational guidance only. It does not replace a licensed advocate or police/legal authority. The fallback legal mappings in the API are intentionally narrow for safety.

## Government references used for the fallback logic

- India Code: Bharatiya Nyaya Sanhita, 2023
- National Cyber Crime Reporting Portal
- Digital Police Portal
