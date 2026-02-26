import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cardbookings';

export async function connectDB() {
  try {
    await mongoose.connect(mongoUri);
    console.log('MongoDB connected successfully! 📦');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
}