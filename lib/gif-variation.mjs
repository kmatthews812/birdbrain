const scenes = {
  dance: [
    'Dance: Twerking. Bend the knees and bounce the feathered rump with quick rhythmic tail-feather shakes, wings braced on thighs; goofy cartoon booty-wiggle comedy on a neon dance floor.',
    'Dance: Running Man. Alternate high knee lifts with the planted foot sliding backward, pumping opposite wings as if running in place; a retro street-dance stage.',
    'Dance: Macarena. Perform the recognizable arm sequence using wings: reach forward, turn palms up, touch opposite shoulders, touch head then hips, hip wiggle and quarter-turn hop; a wedding dance floor.',
    'Dance: Meatstick. Recreate the recognizable Phish Meatstick group-dance routine with bird-adapted synchronized wing gestures, bent-knee bounces and side-to-side motion; a colorful jam-band festival stage.',
    'Dance: Griddy. Do the Justin Jefferson-style touchdown celebration: alternating heel taps in a bouncy forward shuffle, loose wing swings, then wing-tip goggles near the eyes; a miniature football end zone.',
    'Dance: Pole dance. Use a shiny vertical stripper pole on a miniature cabaret stage: grip with a wing and foot, circle the pole, spin around it with tail feathers fanned, then land in a ridiculous proud pose; acrobatic slapstick, fully feathered and non-explicit, no stripping.',
    'Dance: Moonwalk. Slide backward while alternating a raised heel and flat foot so the bird seems to walk forward; finish with a toe stand on a glowing sidewalk.',
    'Dance: Robot. Use sharply segmented wing, neck and knee isolations, mechanical head turns and freeze frames; a retro arcade floor.',
    'Dance: Carlton. Do the Carlton-style exuberant side-to-side shuffle, bent-wing swings across the chest, shoulder bounces and a proudly goofy head bob; a fancy living room.',
    'Dance: Floss. Swing straight wings together across the front then behind the hips, reversing sides while hips counter-swing; a playground talent-show stage.',
    'Dance: Gangnam Style. Bounce with crossed wings miming horse reins, then raise one wing to twirl an imaginary lasso; a bright toy stable dance floor.',
    'Dance: Chicken Dance. Use wing tips as opening and closing beaks, flap elbows, wiggle downward at the knees and clap wings; an absurdly formal barn dance.',
    'Dance: YMCA. Form recognizable Y, M, C and A silhouettes with wings overhead and at the head, stepping side to side; a glittery community disco.',
    'Dance: Disco Point. Plant wide feet and repeatedly point one wing diagonally up then across the body down, hips swaying; a mirror-ball dance floor.',
    'Dance: Hammer Shuffle. Do fast low side-to-side traveling shuffles with bent knees and pumping wings, then freeze in a wide stance; a neon nineties stage.',
    'Dance: Cabbage Patch. Circle both wings together horizontally in front of the chest while rocking hips and stepping side to side; a backyard barbecue.',
    'Dance: Sprinkler. Hold one wing behind the head and extend the other outward, pivoting in short ratcheting bursts then sweeping back; a garden lawn.',
    'Dance: Lawnmower. Mime yanking a mower starter cord, then lean forward and push an imaginary mower with shuffling feet; a tiny suburban lawn.',
    'Dance: Shopping Cart. Push an imaginary shopping cart with one wing while the other plucks groceries from a shelf, stepping and bouncing; a miniature supermarket aisle.',
    'Dance: Worm. Undulate in a clear wave from chest through belly to feet across a padded floor, then pop upright; a school-dance gym.',
    'Dance: Mashed Potato. Swivel heels in and out with toes pivoting and alternate small backward steps, knees knocking and wings grooving; a vintage diner.',
    'Dance: Twist. Keep feet planted while twisting heels, knees and hips together side to side, gradually dipping lower; a sixties dance-party floor.',
    'Dance: Charleston. Alternate forward toe kicks and backward foot taps with swiveling knees and counter-swinging wings; an art-deco stage.',
    'Dance: Hokey Pokey. Put one foot in, pull it out, shake it, repeat with a wing, then turn around; a colorful party circle.',
    'Dance: Bunny Hop. Tap a foot sideways, switch feet, hop forward, hop backward, then make three tiny forward hops; a confetti parade route.',
    'Dance: Electric Slide. Show a recognizable grapevine right, grapevine left, backward steps, rock forward and quarter turn; a wedding reception dance floor.',
    'Dance: Cha Cha Slide. Slide sideways, step back, hop, stomp alternate feet and do a compact cha-cha step; a bright school-party stage.',
    'Dance: Cotton Eye Joe. Do energetic country-line-dance heel digs, toe taps, little kicks and hopping quarter turns; a miniature hay-bale barn.',
    'Dance: Dougie. Lean side to side with relaxed shoulder rolls, bent-knee sways and one wing brushing over the head; a neighborhood block party.',
    'Dance: Crank That. Do the Soulja Boy routine with heel pivots, a cross-step, wing cranks and the recognizable Superman flying-wing pose; a bright rooftop stage.',
    'Dance: Dab. Drop the head into one bent wing while extending the other diagonally upward, bounce twice and reverse sides; a tiny sports victory podium.',
    'Dance: Vogue. Strike precise angular wing poses framing the face, rotate wing tips and freeze in dramatic fashion poses; a tiny runway with flashbulb lights.',
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
