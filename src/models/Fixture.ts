import mongoose from 'mongoose';

const fixtureSchema = new mongoose.Schema({
  apiFixtureId: { type: Number, unique: true }, // important
  homeTeam: { type: String, required: true },
  awayTeam: { type: String, required: true },
  date: { type: Date, required: true },
  leagueId: Number,
  leagueName: String,
  round: String,
  status: { type: String, default: 'SCHEDULED' }
}, { timestamps: true });

fixtureSchema.index({ leagueId: 1, date: -1 });

export const Fixture = mongoose.model('Fixture', fixtureSchema);