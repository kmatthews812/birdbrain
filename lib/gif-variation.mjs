const scenes = {
  dance: [
    'A tiny disco stage with a mirror ball; moonwalk, wing pops and a cheeky bow; purple and gold lighting.',
    'A woodland tap-dance platform with mushroom footlights; quick heel clicks and a hopping shuffle; warm sunset colors.',
    'A beach dance floor with miniature palm trees; a wobbly hula, side steps and a wing wave; turquoise and coral colors.',
    'A retro roller-disco floor; skating-style glides, a funny balance wobble and a spin; neon pink and blue accents.',
    'A garden jazz stage with flower spotlights; a Charleston kick, wing swing and jaunty strut; spring greens and yellow.',
    'A moonlit rooftop dance party; robot moves, a slow-motion slide and triumphant wing pose; silver and violet accents.',
  ],
  match: [
    'A toy arena decorated like a jungle; a banana-peel-style dodge, springy rope rebound and synchronized tumble; lime and orange accents.',
    'A tiny space-themed ring with star lights; exaggerated low-gravity hops, a slow-motion feint and soft mat bounce; silver and blue accents.',
    'A beach-boardwalk ring with palm decorations; a playful towel twirl, crablike sidesteps and harmless pratfall; coral and turquoise accents.',
    'A carnival ring with striped corner cushions; a comically overconfident strut, cushion dodge and dizzy spin; red and gold accents.',
    'A medieval toy-tournament ring; pillow shields, theatrical feints and a gentle rolling tumble; purple and emerald accents.',
    'A frosty winter-festival ring with padded snowflake corners; slippery-footed shuffles, wing windmills and a soft belly slide; icy blue and pink accents.',
  ],
};
const bags = new Map();
const last = new Map();

export function nextGifVariation(kind) {
  let choices = bags.get(kind);
  if (!choices?.length) choices = scenes[kind].filter(scene => scene !== last.get(kind));
  const index = Math.floor(Math.random() * choices.length);
  const [scene] = choices.splice(index, 1);
  bags.set(kind, choices);
  last.set(kind, scene);
  return `Scene variation: ${scene} Invent fresh details and timing within this scene.`;
}
