import mongoose from 'mongoose';

let connectionPromise;

export async function connectToDatabase() {
  if (connectionPromise) {
    return connectionPromise;
  }

  if (!process.env.MONGODB_URI) {
    return null;
  }

  connectionPromise = mongoose
    .connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    })
    .then((connection) => connection)
    .catch((error) => {
      connectionPromise = null;
      console.error('MongoDB connection failed:', error.message);
      return null;
    });

  return connectionPromise;
}

export function isDatabaseReady() {
  return mongoose.connection.readyState === 1;
}
