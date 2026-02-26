import mongoose from 'mongoose';

const fixtureSchema = new mongoose.Schema({
  homeTeam: { type: String, required: true },
  awayTeam: { type: String, required: true },
  date: { type: Date, required: true },
  leagueId: Number,
  leagueName: String,
  round: String,
  status: { type: String, default: 'SCHEDULED' }
}, { timestamps: true });

fixtureSchema.index({ homeTeam: 1, awayTeam: 1, date: 1 }, { unique: true });

export const Fixture = mongoose.model('Fixture', fixtureSchema);