// Every game on the site. The homepage and each game's lobby read from here,
// so adding a game = one entry + one route component.

import { BATTLESHIP_FEATS } from './battleship/feats'

export type Category = 'word' | 'board' | 'card' | 'puzzle' | 'sport'

export interface RuleStep {
  title: string
  body: string
}

export interface GameMeta {
  slug: string
  name: string
  /** up to 5 letters shown as tiles on the homepage card */
  tiles: string
  blurb: string
  category: Category
  /** e.g. "80 sec" — shown in the card meta line */
  length: string
  /** 'vs Ops': only against the computer for now (no room, no pass & play) */
  modes: 'online' | 'online + local' | 'local' | 'vs Ops'
  status: 'live' | 'soon'
  /** has a computer opponent (Ops) in the lobby — shown on the homepage card */
  ops?: boolean
  /** how many can play, [fewest, most] — missing means exactly two */
  players?: [number, number]
  /** offer a fullscreen button during the match (big boards that benefit on iPad / desktop) */
  fullscreen?: boolean
  /** short tagline shown under the title in the game's lobby */
  tagline?: string
  /** others can watch an online match with the room code (its match screen knows about watchers) */
  watch?: boolean
  rules?: RuleStep[]
}

export const GAMES: GameMeta[] = [
  {
    slug: 'wordhunt', tiles: 'HUNT',
    name: 'Word Hunt',
    blurb: 'Same 4×4 grid, same 80 seconds. Drag through touching letters to find as many words as you can.',
    category: 'word',
    length: '80 sec',
    modes: 'online',
    status: 'live',
    tagline: 'Same grid · 80 seconds · most points wins',
    rules: [
      { title: 'Same grid, both of you', body: 'You and your opponent get the same 4×4 letter grid at the same moment.' },
      { title: 'Drag to spell', body: 'Swipe through letters that touch — across, down or diagonal. Each tile once per word, 3 letters minimum.' },
      { title: 'Longer is better', body: '3 letters = 100, 4 = 400, 5 = 800, 6 = 1400, 7 = 1800, 8+ = 2200.' },
      { title: 'Beat the clock', body: 'After 80 seconds the board locks. Highest score wins — words only you found are marked.' },
    ],
  },
  {
    slug: 'anagram',
    tiles: 'NOTES',
    name: 'Anagram Race',
    blurb: 'Same scrambled letters for both of you. First to unscramble the word takes the round — five rounds.',
    category: 'word',
    length: '5 rounds',
    modes: 'online',
    status: 'live',
    tagline: 'Same letters · 5 rounds · first to solve wins',
    rules: [
      { title: 'Same letters, both of you', body: 'Each round you both get the same scrambled word — 5 letters at first, up to 7 by the last round.' },
      { title: 'Tap to spell', body: 'Tap the letters in order to build your answer. Tap a placed letter to take it back, or Shuffle for a fresh look.' },
      { title: 'First one wins the round', body: 'It checks itself once every letter is placed. Any real word that uses all the letters counts.' },
      { title: '60 seconds a round', body: 'If nobody gets it in time, nobody scores. Most rounds won after five takes the match.' },
    ],
  },
  {
    slug: 'battleword',
    tiles: 'CRANE',
    name: 'Battleword',
    blurb: "Hide a 5-letter word. Crack your opponent's first using colour-coded clues.",
    category: 'word',
    length: '~5 min',
    modes: 'online + local',
    status: 'live',
    ops: true,
    tagline: 'Hide a word · crack theirs · six guesses each',
    rules: [
      { title: 'Hide a word', body: 'You each pick a secret 5-letter word: type it on the keys or tap Random. It has to be an everyday word, so nobody hides something obscure.' },
      { title: 'Take turns guessing', body: 'One guess a turn at the other’s word; any real 5-letter word counts. Green is the right letter in the right spot, yellow is in the word somewhere else, grey isn’t in it. The keys keep track.' },
      { title: 'Crack it first', body: 'Six guesses each. Turns go in pairs, so if the first player cracks it the other still gets their matching guess: crack it too and it’s a draw. Nobody cracks it in six? Also a draw.' },
      { title: 'No peeking', body: 'Online, your word never leaves your phone: it answers each guess with the colours, and you only see the colours of their guesses at yours. At the end both words are revealed and checked against what was locked in and every colour given.' },
    ],
  },
  {
    slug: 'hangman',
    tiles: 'GUESS',
    name: 'Hangman',
    blurb: 'One hides a word, the other guesses letter by letter. Swap roles — best of two.',
    category: 'word',
    length: '2 rounds',
    modes: 'online + local',
    status: 'live',
    ops: true,
    tagline: 'Hide a word · guess theirs · six wrong and you swing',
    rules: [
      { title: 'Set a word', body: 'Each round one player picks a secret word — tap a suggestion or type your own (letters only, 3–20). Only its length is shown.' },
      { title: 'Guess letters', body: 'The other player taps letters. Right ones fill in everywhere they appear; each wrong one adds a part to the hangman.' },
      { title: 'Six strikes', body: 'Find the whole word before the sixth wrong guess and you escape — that round is yours. Otherwise the setter takes it.' },
      { title: 'Swap and settle it', body: 'Two rounds, roles swapped. Most rounds wins; one each is a draw. Online, the word never leaves the setter’s phone, and it’s checked against what they locked in when it’s revealed.' },
    ],
  },
  {
    slug: 'spar',
    tiles: 'SPAR',
    name: 'Spar',
    blurb: 'Five cards each, follow suit — but only the last trick counts. Win it with a 6 or 7 for extra points.',
    category: 'card',
    length: '~10 min',
    modes: 'online + local',
    status: 'live',
    ops: true,
    players: [2, 4],
    tagline: 'Five cards · follow suit · only the last trick counts · 2–4 players',
    rules: [
      { title: 'Five cards each', body: 'Two to four players and a 35-card deck — 6 up to Ace in every suit, with the Ace of Spades taken out (spades stop at the King). Online, every phone helps shuffle it, so nobody can see anyone else’s hand.' },
      { title: 'Follow suit', body: 'The leader plays any card, then everyone else plays one, in any order — whoever’s ready goes next. You must follow the same suit if you can; the highest card of that suit wins the trick. No trumps. The winner leads the next trick.' },
      { title: 'Only the last trick counts', body: 'Whoever takes the fifth trick wins the round: 1 point, or 3 if they take it with a 6 and 2 with a 7. Take the last two tricks with 6s and 7s and both count — 6 + 7 is 5.' },
      { title: 'First to the target', body: 'The host picks 5, 10 or 15 points. The round’s winner leads the next one. When a round ends, every phone checks the shuffle and every card played.' },
      { title: 'Someone leaves', body: 'With three or four playing, the game goes on without them: the round in progress is dealt again for those left, and the scores stand. If the host leaves, the next player takes over. Down to one player, the match is over.' },
    ],
  },
  {
    slug: 'crossword',
    tiles: 'KENTE',
    name: 'Crossword',
    blurb: 'One grid, two solvers. Crack a clue to claim the word in your colour and go again. Most words wins.',
    category: 'word',
    length: '~8 min',
    modes: 'online + local',
    status: 'live',
    tagline: 'Crack a clue · claim the word · go again',
    rules: [
      { title: 'Pick a clue', body: 'Tap a square in the grid, or step through the clues with the arrows. Tap the same square again to switch between across and down.' },
      { title: 'Spell it', body: 'Tap the letters on the keys to fill the word, ⌫ to take one back, then Submit. Letters from words already claimed across it are filled in for you.' },
      { title: 'Right keeps the turn', body: 'A right answer claims the word in your colour and you go again. A wrong one — or Pass — hands the turn over.' },
      { title: 'Most words wins', body: 'When every word is claimed, whoever claimed more wins. If you both pass back to back, the game ends there and the rest are shown. The host picks the clues: Ghana, Games or a Mix.' },
    ],
  },
  {
    slug: 'battleship',
    fullscreen: true,
    tiles: 'FLEET',
    name: 'Battleship',
    blurb: "Hunt down your opponent's hidden fleet. Sink every ship before they sink yours.",
    category: 'board',
    length: '~10 min',
    modes: 'online + local',
    status: 'live',
    ops: true,
    tagline: 'Hide your fleet · hunt theirs · one shot a turn',
    rules: [
      { title: 'Place your fleet', body: 'Five ships on a 10×10 sea: Carrier (5), Battleship (4), Cruiser (3), Submarine (3) and Destroyer (2). They start shuffled — tap a ship to pick it up, tap it again to turn it, tap a square to move it. Ships may touch. Tap Ready when you’re happy.' },
      { title: 'Take your shot', body: 'Players take turns firing at a square of the other’s sea — one shot a turn, hit or miss. A hit is marked in red, a miss with a splash.' },
      { title: 'Sink them all', body: 'When every square of a ship is hit, it sinks and its outline shows. Sink all five of your opponent’s ships first to win. The host picks one battle or best of 3.' },
      { title: 'No peeking', body: 'Online, your fleet never leaves your phone — it answers each shot. At the end both fleets are revealed and checked against what was locked in at the start and every answer given, so nobody can move a ship or fib about a hit.' },
      { title: 'Feats', body: `Brag-worthy moments, kept against each rival: ${BATTLESHIP_FEATS.map((f) => `${f.name} — ${f.blurb.charAt(0).toLowerCase()}${f.blurb.slice(1, -1)}`).join('; ')}.` },
    ],
  },
  {
    slug: 'tictactoe',
    tiles: 'XOX',
    name: 'Tic-Tac-Toe',
    blurb: 'Three in a row takes the game. Play a best-of series — the opener swaps every game.',
    category: 'board',
    length: '~3 min',
    modes: 'online + local',
    status: 'live',
    ops: true,
    tagline: 'Three in a row · best of 3, 5 or 7',
    rules: [
      { title: 'Take turns', body: 'Tap an empty square to place your mark. X is player 1, O is player 2.' },
      { title: 'Three in a row', body: 'Line up three marks across, down or diagonally to take the game. A full board with no line is a draw.' },
      { title: 'Best-of series', body: 'The host picks best of 3, 5 or 7. Whoever opens swaps every game, so nobody keeps the first move.' },
      { title: 'Tip', body: 'The centre square is part of four lines — the strongest opening move.' },
    ],
  },
  {
    slug: 'connect4',
    fullscreen: true,
    watch: true,
    tiles: 'FOUR',
    name: 'Connect Four',
    blurb: 'Drop discs into the grid and line up four — across, down or diagonal. Play a single game or a series.',
    category: 'board',
    length: '~5 min',
    modes: 'online + local',
    status: 'live',
    ops: true,
    tagline: 'Four in a row · single game or best of 3 / 5',
    rules: [
      { title: 'Drop a disc', body: 'On your turn, tap any column — your disc falls to the lowest empty space. Orange is player 1, blue is player 2.' },
      { title: 'Four in a row', body: 'Line up four of your discs across, down or diagonally to take the game. A full board with no four is a draw.' },
      { title: 'Series', body: 'The host picks a single game, best of 3 or best of 5. Whoever opens swaps every game.' },
      { title: 'Tip', body: 'The middle column is part of the most lines — and watch for threats your opponent is building on two sides.' },
    ],
  },
  {
    slug: 'checkers',
    fullscreen: true,
    tiles: 'KING',
    name: 'Checkers',
    blurb: 'Diagonal warfare. Jump to capture, chain your jumps, crown your kings — and take every piece.',
    category: 'board',
    length: '~15 min',
    modes: 'online + local',
    status: 'live',
    ops: true,
    tagline: 'Jump, chain, crown · take every piece',
    rules: [
      { title: 'Move diagonally', body: 'Tap one of your pieces, then a dark square. Pieces step one square diagonally forward. Orange starts at the bottom.' },
      { title: 'Capturing is a must', body: 'Jump over an opponent’s piece into the empty square beyond — forwards or backwards. If you can capture, you have to. Keep jumping while you can.' },
      { title: 'Kings fly', body: 'Reach the far row and you’re crowned (that ends your turn). Kings move and capture any distance along a diagonal.' },
      { title: 'How it ends', body: 'Take every piece, or leave your opponent with no moves. If 25 moves each pass with only kings moving and nothing captured, it’s a draw.' },
    ],
  },
  {
    slug: 'othello',
    tiles: 'FLIP',
    name: 'Othello',
    blurb: 'Trap your opponent’s discs between yours to flip them. Most discs when the board fills up wins.',
    category: 'board',
    length: '~10 min',
    modes: 'online + local',
    status: 'live',
    ops: true,
    tagline: 'Outflank and flip · most discs wins',
    rules: [
      { title: 'Place to capture', body: 'On your turn, place a disc so it traps a straight line of your opponent’s discs between it and one of yours — across, down or diagonal.' },
      { title: 'Flip', body: 'Every trapped disc flips to your colour, in all directions at once. A move must flip at least one disc. Dots show where you can play.' },
      { title: 'No move? Skipped', body: 'If you can’t flip anything, your turn is skipped automatically. When neither player can move, the game ends.' },
      { title: 'Most discs wins', body: 'Count the discs at the end — the bigger colour wins. Tip: corners can never be flipped, so they’re gold.' },
    ],
  },
  {
    slug: 'oware',
    fullscreen: true,
    tiles: 'SEEDS',
    name: 'Oware',
    blurb: 'Sow seeds around the 12-pit board. Capture on 2 or 3 — first to 25 wins.',
    category: 'board',
    length: '~15 min',
    modes: 'online + local',
    status: 'live',
    ops: true,
    tagline: 'Sow, count, capture · first to 25 seeds',
    rules: [
      { title: 'Sow', body: 'Pick one of the six pits on your side. Its seeds go one by one into the next pits, counter-clockwise — along your row, then round into your opponent’s.' },
      { title: 'Capture 2s and 3s', body: 'If your last seed lands in your opponent’s pit and makes it exactly 2 or 3, you take them — and the pit before it, and the one before that, as long as each is a 2 or 3 on their side.' },
      { title: 'Keep them fed', body: 'If your opponent has no seeds, you must sow seeds over to them. A capture that would take every seed they have is cancelled. A pit of 12 or more laps the board and skips the pit it came from.' },
      { title: 'Win', body: 'First to capture 25 of the 48 seeds wins. If nobody can move — or nothing is captured for 50 moves each — each side keeps the seeds on it and the most seeds wins.' },
    ],
  },
  {
    slug: 'ludo',
    fullscreen: true,
    tiles: 'SIX',
    name: 'Ludo',
    blurb: 'Roll a six to enter, knock opponents off the track with back kicks and line kicks, bring them all home.',
    category: 'board',
    length: '~20 min',
    modes: 'online + local',
    status: 'live',
    ops: true,
    tagline: 'Roll, race, kick · bring every token home',
    rules: [
      { title: 'Roll a six to start', body: 'Tap the die on your turn. A 6 brings a token out of your yard onto your start square. Every 6 earns another roll — but a roll with no possible move ends your turn, even a 6.' },
      { title: 'Race round', body: 'Tap a token to move it by the roll, clockwise round the board and up your home column. Getting home needs an exact roll.' },
      { title: 'Kick them home', body: 'Land on a lone opponent token to send it back to its yard. Line kick: land directly across the lane from one and it’s sent home too — and your token jumps onto its square. Back kick: if moving backwards by your roll would capture, you can choose ↶ instead of →.' },
      { title: 'No kicking on a lone 6', body: 'A 6 only kicks (any of the three ways) if you have another token out on the board. If that token is your only one out, it lands beside the opponent’s token and leaves it alone, and they share the square until one of you moves on.' },
      { title: 'Blockades', body: 'Two tokens of one colour on a square form a blockade. Nothing can pass or land on it — not even your own tokens — and it can’t be captured. An opponent’s blockade on your start square keeps your tokens in the yard.' },
      { title: '1 or 2 colours each', body: 'The host picks 1 colour each (four tokens) or 2 colours each (diagonally opposite, eight tokens, one die for both). First to bring every token home wins.' },
    ],
  },
  {
    slug: 'quoridor',
    fullscreen: true,
    tiles: 'WALLS',
    name: 'Quoridor',
    blurb: 'Race your pawn across. Place walls to block — but never seal the path.',
    category: 'board',
    length: '~10 min',
    modes: 'online + local',
    status: 'live',
    ops: true,
    tagline: 'Race across · 10 walls each · never seal the path',
    rules: [
      { title: 'Race across', body: 'Orange starts in the middle of the bottom row, blue in the middle of the top. First pawn to reach any square of the far row wins. Online, your pawn always starts at the bottom.' },
      { title: 'Step or wall', body: 'On your turn, do one thing: step your pawn one square (tap a lit square), or put down one of your 10 walls. Walls are two squares long and sit in the grooves between squares.' },
      { title: 'Placing a wall', body: 'Tap a groove and the wall shows as a ghost along it. Tap the same spot again or Place to put it down, or Turn to swing it the other way. With a mouse, just click. Walls can’t cross or overlap.' },
      { title: 'Never seal the path', body: 'A wall may never cut a pawn off from its goal completely — there must always be a way round, however long.' },
      { title: 'Jumping', body: 'Face to face with the other pawn, you can jump straight over it. If a wall or the edge is behind it, step to either side of it instead.' },
      { title: 'Tip', body: 'Walls are worth more late than early: save a few for when your opponent is close to home.' },
    ],
  },
  {
    slug: 'dots',
    tiles: 'BOXES',
    name: 'Dots & Boxes',
    blurb: 'Take turns drawing lines between dots. Close a box to claim it and go again. Most boxes wins.',
    category: 'puzzle',
    length: '~5 min',
    modes: 'online + local',
    status: 'live',
    ops: true,
    tagline: 'Close a box, go again · 4×4, 5×5 or 6×6',
    rules: [
      { title: 'Draw a line', body: 'On your turn, press near any gap between two dots — the nearest line lights up. Slide to change it, lift to draw it.' },
      { title: 'Close a box', body: 'Draw the fourth side of a box and it’s yours, marked in your colour. Closing a box earns you another turn.' },
      { title: 'Most boxes wins', body: 'When every line is drawn, the player with more boxes wins. Even-sized boards can end in a draw.' },
      { title: 'Tip', body: 'Avoid drawing the third side of a box — that hands it to your opponent. Late in the game, count the chains.' },
    ],
  },
  {
    slug: 'sudoku',
    tiles: '9X9',
    name: 'Sudoku',
    blurb: 'Same puzzle, both racing. Fill the grid before your opponent does — or take turns on one phone against the clock.',
    category: 'puzzle',
    length: '~10 min',
    modes: 'online + local',
    status: 'live',
    tagline: 'Same puzzle · first to solve it wins',
    rules: [
      { title: 'Fill the grid', body: 'Every row, column and 3×3 box must contain 1 to 9 exactly once. The printed numbers are clues and can’t be changed.' },
      { title: 'Tap, then number', body: 'Tap a square, then a number on the pad. Turn on Notes to pencil in candidates. A clash with another number shows in red.' },
      { title: 'Race online', body: 'You both get the same puzzle. You can see how far along your opponent is, but not their numbers. First to solve it wins.' },
      { title: 'Pass & play', body: 'On one phone, each of you solves the same puzzle in turn against the clock. The faster time wins.' },
    ],
  },
  {
    slug: 'memory',
    tiles: 'PAIRS',
    name: 'Memory',
    blurb: 'Flip cards, find pairs. Whoever collects the most wins.',
    category: 'puzzle',
    length: '~5 min',
    modes: 'online + local',
    status: 'live',
    ops: true,
    tagline: 'Flip two · find a pair · go again',
    rules: [
      { title: 'Flip two', body: 'On your turn, tap two face-down cards to turn them over. Both players see them.' },
      { title: 'A pair? Go again', body: 'If the pictures match, the pair is yours (it stays up in your colour) and you take another turn. If not, they turn back over and it’s the other player’s go, so remember where they were.' },
      { title: 'Most pairs wins', body: 'When every pair is found, whoever found more wins; level is a draw. The host picks the board: the classic 4×4 (8 pairs) or a bigger 6×6 (18 pairs).' },
      { title: 'No peeking', body: 'Online, neither phone knows where the cards are: both shuffle the board, locked, and every card is turned over by the two phones together. At the end the shuffle and every card shown are checked.' },
    ],
  },
  {
    slug: 'pingpong',
    fullscreen: true,
    tiles: 'PONG',
    name: 'Table Tennis',
    blurb: 'A real-time rally against Ops. Move your bat like a trackpad, meet the ball and push up to hit: the angle aims it, speed adds pace, a curve puts spin on it. Smash the high ones.',
    category: 'sport',
    length: '~5 min',
    modes: 'vs Ops',
    status: 'live',
    ops: true,
    tagline: 'Move like a trackpad · meet the ball · games to 11',
    rules: [
      { title: 'Move', body: 'Put your thumb down anywhere low on the screen and slide: your bat moves by however far your thumb moves (a little further), like a trackpad. Lift and put it down again to reposition; the bat stays where you left it. It roams your whole half: left and right, and in toward the net or back off the table. On a computer it goes where the mouse points.' },
      { title: 'Hit', body: 'Your bat has to meet the ball after it bounces on your side. Push up as it reaches the bat: a fast push is a drive, a slow one a block, and a still bat just blocks it back. Push up and to the left or right to aim; curve the push for spin. Catch it on the edge and it goes astray; miss it and it’s Ops’ point. A faint ring shows where each of Ops’ shots will bounce.' },
      { title: 'Early or late', body: 'Step in toward the net and take it just after the bounce for a faster, sharper return (easier to misjudge). Hang back and take it late for more time, but a softer ball.' },
      { title: 'Smash', body: 'When a ball sits up high off the bounce it glows yellow and you’ll see Smash it! Push up hard as it meets your bat: it goes back flat and fast, straighter than a normal drive, and Ops rarely gets it back. Careful: a weak block of yours floats up high too, and Ops will smash it.' },
      { title: 'Scoring', body: 'Games to 11, win by 2. Two serves each, then one each from 10–10. Win a single game, or the best of 3 or 5.' },
    ],
  },
  {
    slug: 'pool',
    fullscreen: true,
    tiles: 'POOL',
    name: 'Pool',
    blurb: 'American 8-ball. Break, take solids or stripes, clear your group and sink the 8. Drag the cue round to aim with the full guide line, pull the power cue down and let go.',
    category: 'sport',
    length: '~10 min',
    modes: 'online + local',
    status: 'live',
    tagline: 'American 8-ball · drag the cue to aim · pull the power cue down to shoot',
    rules: [
      { title: 'Aim', body: 'Grab the cue and drag it round the ball, or touch anywhere else on the table to point the shot there. The guide line shows where the cue ball goes, the ghost ball where it meets the first ball, which way that ball travels and where the cue ball heads after. For a thin cut, slide the ridged wheel at the top of the side panel up or down to nudge the aim.' },
      { title: 'Shoot', body: 'Pull the cue in the side panel down (the cue on the table draws back with it) and let go to strike. A short pull is a soft touch, all the way down a full-power break; push it back up to call the shot off. Tap the cue ball at the bottom of the panel to set spin on a big ball: drag the red dot high for follow (it rolls on after the hit), low for draw (it comes back), or left or right for side, which bends it off the cushions that way.' },
      { title: 'The pockets', body: 'Each cushion turns back into the rail at a pocket. Catch that edge and the ball bounces off it, or rattles in the jaws and stays out; send it cleanly between them and it drops.' },
      { title: 'The break', body: 'Put the cue ball anywhere behind the line and break. Pot a ball or send at least four to a cushion, or the balls are racked again and the other player breaks. Pot one and you go again; if the 8 goes down on the break it comes back up.' },
      { title: 'Solids or stripes', body: 'After the break the table is open. The first shot that pots only solids (1–7) or only stripes (9–15) makes that group yours, and the other group your opponent’s. Pot one of yours and you shoot again.' },
      { title: 'Fouls', body: 'Pot the cue ball, hit nothing, hit the wrong ball first (on an open table the 8 can’t be first; after that it has to be one of yours), or play a shot where nothing reaches a cushion after the first hit, and it’s a foul: your opponent gets ball in hand and can put the cue ball anywhere.' },
      { title: 'The 8', body: 'Once your group is cleared, shoot at the 8 and call its pocket: it picks the pocket you’re aiming at, tap another to change it. Pot the 8 there cleanly to win the frame. Pot it in another pocket, with a foul, or before your group is cleared, and you lose the frame. Win a single frame, or the best of 3 or 5.' },
    ],
  },
]

export const CATEGORY_LABEL: Record<Category, string> = {
  word: 'Word',
  board: 'Board',
  card: 'Cards',
  puzzle: 'Puzzle',
  sport: 'Sport',
}

export function gameBySlug(slug: string) {
  return GAMES.find((g) => g.slug === slug)
}
