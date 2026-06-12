/**
 * Utility function to parse an audio file's name and extract artist and title.
 * Handles splitters like " - " and "-" and trims whitespaces.
 * @param {string} filename - The full name of the file (including extension).
 * @returns {{ artist: string, title: string }}
 */
export function parseFilename(filename) {
  const fullName = filename.replace(/\.[^/.]+$/, ""); // Strip extension
  let artist = 'Artista Desconocido';
  let title = fullName;

  const parts = fullName.split(/\s+-\s+/);
  if (parts.length > 1) {
    artist = parts[0].trim();
    title = parts.slice(1).join(' - ').trim();
  } else {
    const hyphenParts = fullName.split('-');
    if (hyphenParts.length > 1) {
      artist = hyphenParts[0].trim();
      title = hyphenParts.slice(1).join('-').trim();
    }
  }

  return { artist, title };
}
