import DefaultView from './default-view.jsx';
import BirdDance from './bird-dance.jsx';
import CelebrityDeathMatch from './celebrity-death-match.jsx';

export const visualizations = [
  { id: 'default-view', name: 'Default View', createdBy: 'Kevin', Component: DefaultView },
  { id: 'celebrity-death-match', name: 'Celebrity Death Match', createdBy: 'Kevin', Component: CelebrityDeathMatch },
  { id: 'bird-dance', name: 'Bird Dance', createdBy: 'Kevin', Component: BirdDance },
];

export function selectVisualization(entries, previousId, random = Math.random) {
  const choices = entries.length > 1 ? entries.filter(entry => entry.id !== previousId) : entries;
  return choices[Math.floor(random() * choices.length)] || null;
}
