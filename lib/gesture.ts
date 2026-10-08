export type DetectedGesture = 'rock' | 'paper' | 'scissors' | null;

export function mapGesture(name?: string): DetectedGesture {
  switch ((name ?? '').toLowerCase()) {
    case 'closed_fist': return 'rock';
    case 'open_palm': return 'paper';
    case 'victory': return 'scissors';
    default: return null;
  }
}
