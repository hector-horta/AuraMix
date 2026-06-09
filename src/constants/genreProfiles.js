export const GENRE_PROFILES = [
  {
    name: 'Deep House',
    emoji: '🌊',
    color: '#4A90D9',
    bpm: { mid: 121.5, sigma: 3.5 },
    centroid: { mid: 2000, sigma: 400 },
    bassRatio: { mid: 0.40, sigma: 0.08 },
    onsetDensity: { mid: 4.0, sigma: 0.8 }
  },
  {
    name: 'House',
    emoji: '🏠',
    color: '#F5A623',
    bpm: { mid: 126, sigma: 5 },
    centroid: { mid: 2750, sigma: 600 },
    bassRatio: { mid: 0.35, sigma: 0.08 },
    onsetDensity: { mid: 5.0, sigma: 0.8 }
  },
  {
    name: 'Tech House',
    emoji: '👽',
    color: '#9d4ede',
    bpm: { mid: 128, sigma: 4 },
    centroid: { mid: 3250, sigma: 600 },
    bassRatio: { mid: 0.375, sigma: 0.06 },
    onsetDensity: { mid: 6.0, sigma: 0.8 }
  },
  {
    name: 'Techno',
    emoji: '🟥',
    color: '#E74C3C',
    bpm: { mid: 136.5, sigma: 7 },
    centroid: { mid: 3750, sigma: 1000 },
    bassRatio: { mid: 0.45, sigma: 0.08 },
    onsetDensity: { mid: 6.5, sigma: 1.0 }
  },
  {
    name: 'Trance',
    emoji: '✨',
    color: '#00CED1',
    bpm: { mid: 137.5, sigma: 6 },
    centroid: { mid: 4250, sigma: 1000 },
    bassRatio: { mid: 0.225, sigma: 0.06 },
    onsetDensity: { mid: 5.0, sigma: 0.8 }
  },
  {
    name: 'Drum & Bass',
    emoji: '⚡',
    color: '#FF6B35',
    bpm: { mid: 170, sigma: 8 },
    centroid: { mid: 3000, sigma: 800 },
    bassRatio: { mid: 0.50, sigma: 0.08 },
    onsetDensity: { mid: 8.0, sigma: 1.5 }
  },
  {
    name: 'Dubstep',
    emoji: '🔊',
    color: '#8B00FF',
    bpm: { mid: 140, sigma: 5 },
    centroid: { mid: 2250, sigma: 600 },
    bassRatio: { mid: 0.60, sigma: 0.08 },
    onsetDensity: { mid: 3.5, sigma: 1.0 }
  },
  {
    name: 'Hip-Hop / R&B',
    emoji: '🎤',
    color: '#FFD700',
    bpm: { mid: 87.5, sigma: 15 },
    centroid: { mid: 1750, sigma: 600 },
    bassRatio: { mid: 0.45, sigma: 0.08 },
    onsetDensity: { mid: 3.0, sigma: 0.8 }
  },
  {
    name: 'Reggaetón',
    emoji: '🔥',
    color: '#2ECC71',
    bpm: { mid: 94, sigma: 5 },
    centroid: { mid: 2250, sigma: 650 },
    bassRatio: { mid: 0.40, sigma: 0.08 },
    onsetDensity: { mid: 4.0, sigma: 0.8 }
  },
  {
    name: 'Pop',
    emoji: '🍭',
    color: '#FF69B4',
    bpm: { mid: 117.5, sigma: 15 },
    centroid: { mid: 3000, sigma: 850 },
    bassRatio: { mid: 0.225, sigma: 0.06 },
    onsetDensity: { mid: 4.0, sigma: 0.8 }
  },
  {
    name: 'Progressive House',
    emoji: '🌀',
    color: '#00BFFF',
    bpm: { mid: 125, sigma: 4 },
    centroid: { mid: 3000, sigma: 500 },
    bassRatio: { mid: 0.28, sigma: 0.06 },
    onsetDensity: { mid: 4.5, sigma: 0.8 }
  },
  {
    name: 'Indie/Rock',
    emoji: '🎸',
    color: '#CD853F',
    bpm: { mid: 120, sigma: 12 },
    centroid: { mid: 3900, sigma: 800 },
    bassRatio: { mid: 0.16, sigma: 0.04 },
    onsetDensity: { mid: 4.2, sigma: 0.8 }
  },
  {
    name: 'Ambient/Chill',
    emoji: '🍃',
    color: '#1ABC9C',
    bpm: { mid: 85, sigma: 20 },
    centroid: { mid: 1500, sigma: 400 },
    bassRatio: { mid: 0.175, sigma: 0.06 },
    onsetDensity: { mid: 1.0, sigma: 0.8 }
  }
];

export const GENRE_COLORS = GENRE_PROFILES.reduce((acc, p) => {
  acc[p.name] = p.color;
  return acc;
}, {});

export const GENRE_EMOJIS = GENRE_PROFILES.reduce((acc, p) => {
  acc[p.name] = p.emoji;
  return acc;
}, {});
