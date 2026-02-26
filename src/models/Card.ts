import mongoose from 'mongoose';

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