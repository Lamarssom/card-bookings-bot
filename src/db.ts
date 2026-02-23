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

const cardSchema = new mongoose.Schema({
  fixtureId: { type: Number, required: true, unique: false },
  match: { type: String, required: true },
  leagueId: Number,
  leagueName: String,
  date: { type: Date, required: true },
  homeTeam: String,
  awayTeam: String,
  team: { type: String, required: true },
  player: { type: String, required: true },
  cardType: { type: String, enum: ['YELLOW_CARD', 'RED_CARD'], required: true },
  minute: { type: Number, required: true },
  extraTime: Number,
  matchday: Number,
  timestamp: { type: Date, default: Date.now },
}, {
  timestamps: true,
  indexes: [
    { leagueId: 1, matchday: 1, date: -1 },
    { team: 1, leagueId: 1, matchday: 1 },
    { homeTeam: 1, leagueId: 1 },
    { awayTeam: 1, leagueId: 1 },
    { date: -1 },
  ],
});

cardSchema.index({ fixtureId: 1, player: 1 }, { unique: true });

export const Card = mongoose.model('Card', cardSchema);