export const formatTime = (secs) => {
  if (isNaN(secs) || secs < 0) return "00:00:00";
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  const seconds = Math.floor(secs % 60);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

export const formatRemainingTime = (secs) => {
  if (isNaN(secs) || secs <= 0) return "-00:00";
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  const seconds = Math.floor(secs % 60);
  if (hours > 0) {
    return `-${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `-${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

