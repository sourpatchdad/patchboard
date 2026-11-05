// Real shows and films for demo mode, so the screenshots and the demo look
// like a real library. Posters load in the browser straight from TVmaze
// (shows) and Wikipedia (films); the artwork belongs to its studios.
// Episode labels are codes only, so the demo invents nothing about a real
// episode.

const SHOWS: Record<string, string> = {
  Severance: 'https://static.tvmaze.com/uploads/images/medium_portrait/548/1371406.jpg',
  'The Bear': 'https://static.tvmaze.com/uploads/images/medium_portrait/629/1574642.jpg',
  'Shōgun': 'https://static.tvmaze.com/uploads/images/medium_portrait/506/1265637.jpg',
  'Slow Horses': 'https://static.tvmaze.com/uploads/images/medium_portrait/641/1604425.jpg',
  Andor: 'https://static.tvmaze.com/uploads/images/medium_portrait/564/1411766.jpg',
  'The Last of Us': 'https://static.tvmaze.com/uploads/images/medium_portrait/563/1409008.jpg',
  Silo: 'https://static.tvmaze.com/uploads/images/medium_portrait/631/1577677.jpg',
  Fallout: 'https://static.tvmaze.com/uploads/images/medium_portrait/599/1499142.jpg',
  'The Pitt': 'https://static.tvmaze.com/uploads/images/medium_portrait/606/1516776.jpg',
  'The White Lotus': 'https://static.tvmaze.com/uploads/images/medium_portrait/557/1393876.jpg',
};

const FILMS: Record<string, string> = {
  'Dune: Part Two': 'https://upload.wikimedia.org/wikipedia/en/5/52/Dune_Part_Two_poster.jpeg',
  Oppenheimer: 'https://upload.wikimedia.org/wikipedia/en/4/4a/Oppenheimer_%28film%29.jpg',
  'Past Lives': 'https://upload.wikimedia.org/wikipedia/en/d/da/Past_Lives_film_poster.png',
  'The Holdovers': 'https://upload.wikimedia.org/wikipedia/en/6/62/Holdovers_film_poster.jpg',
  'Poor Things': 'https://upload.wikimedia.org/wikipedia/en/f/f3/Poor_Things_poster.jpg',
  Sinners: 'https://upload.wikimedia.org/wikipedia/en/5/5f/Sinners_%282025_film%29_poster.jpg',
  'One Battle After Another': 'https://upload.wikimedia.org/wikipedia/en/5/5d/One_Battle_After_Another.jpg',
  Weapons: 'https://upload.wikimedia.org/wikipedia/en/6/6d/Weapons_film_2025.jpeg',
  'Spider-Man: Across the Spider-Verse': 'https://upload.wikimedia.org/wikipedia/en/b/b4/Spider-Man-_Across_the_Spider-Verse_poster.jpg',
};

/** The poster for a demo title, or undefined (Trakt-only items have none, as on a real install). */
export const poster = (title: string): string | undefined => SHOWS[title] ?? FILMS[title];
