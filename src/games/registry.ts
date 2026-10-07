// Every game on the site. The homepage and each game's lobby read from here,
// so adding a game = one entry + one route component.

export type Category = 'word' | 'board' | 'puzzle'

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
  modes: 'online' | 'online + local' | 'local'
  status: 'live' | 'soon'
  /** short tagline shown under the title in the game's lobby */
  tagline?: string
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
  { slug: 'battleword', tiles: 'CRANE', name: 'Battleword', blurb: "Hide a 5-letter word. Crack your opponent's first using colour-coded clues.", category: 'word', length: '~5 min', modes: 'online + local', status: 'soon' },
  { slug: 'hangman', tiles: 'GUESS', name: 'Hangman', blurb: 'One hides a word, the other guesses letter by letter. Swap roles — best of two.', category: 'word', length: '2 rounds', modes: 'online + local', status: 'soon' },
  { slug: 'crossword', tiles: 'KENTE', name: 'Crossword', blurb: 'Race to fill the grid. Claim words in your colour and outscore your opponent.', category: 'word', length: '~8 min', modes: 'online + local', status: 'soon' },
  { slug: 'battleship', tiles: 'FLEET', name: 'Battleship', blurb: "Hunt down your opponent's hidden fleet. Sink every ship before they sink yours.", category: 'board', length: '~10 min', modes: 'online + local', status: 'soon' },
  {
    slug: 'tictactoe',
    tiles: 'XOX',
    name: 'Tic-Tac-Toe',
    blurb: 'Three in a row takes the game. Play a best-of series — the opener swaps every game.',
    category: 'board',
    length: '~3 min',
    modes: 'online + local',
    status: 'live',
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
    tiles: 'FOUR',
    name: 'Connect Four',
    blurb: 'Drop discs into the grid and line up four — across, down or diagonal. Play a single game or a series.',
    category: 'board',
    length: '~5 min',
    modes: 'online + local',
    status: 'live',
    tagline: 'Four in a row · single game or best of 3 / 5',
    rules: [
      { title: 'Drop a disc', body: 'On your turn, tap any column — your disc falls to the lowest empty space. Orange is player 1, blue is player 2.' },
      { title: 'Four in a row', body: 'Line up four of your discs across, down or diagonally to take the game. A full board with no four is a draw.' },
      { title: 'Series', body: 'The host picks a single game, best of 3 or best of 5. Whoever opens swaps every game.' },
      { title: 'Tip', body: 'The middle column is part of the most lines — and watch for threats your opponent is building on two sides.' },
    ],
  },
  { slug: 'checkers', tiles: 'KING', name: 'Checkers', blurb: 'Diagonal warfare. Capture every enemy piece and crown your kings.', category: 'board', length: '~15 min', modes: 'local', status: 'soon' },
  {
    slug: 'othello',
    tiles: 'FLIP',
    name: 'Othello',
    blurb: 'Trap your opponent’s discs between yours to flip them. Most discs when the board fills up wins.',
    category: 'board',
    length: '~10 min',
    modes: 'online + local',
    status: 'live',
    tagline: 'Outflank and flip · most discs wins',
    rules: [
      { title: 'Place to capture', body: 'On your turn, place a disc so it traps a straight line of your opponent’s discs between it and one of yours — across, down or diagonal.' },
      { title: 'Flip', body: 'Every trapped disc flips to your colour, in all directions at once. A move must flip at least one disc. Dots show where you can play.' },
      { title: 'No move? Skipped', body: 'If you can’t flip anything, your turn is skipped automatically. When neither player can move, the game ends.' },
      { title: 'Most discs wins', body: 'Count the discs at the end — the bigger colour wins. Tip: corners can never be flipped, so they’re gold.' },
    ],
  },
  { slug: 'oware', tiles: 'SEEDS', name: 'Oware', blurb: 'Sow seeds around the 12-pit board. Capture on 2 or 3 — first to 25 wins.', category: 'board', length: '~15 min', modes: 'online + local', status: 'soon' },
  { slug: 'ludo', tiles: 'SIX', name: 'Ludo', blurb: 'Roll a six to enter, knock opponents off the track, bring all four home.', category: 'board', length: '~20 min', modes: 'online + local', status: 'soon' },
  { slug: 'quoridor', tiles: 'WALLS', name: 'Quoridor', blurb: 'Race your pawn across. Place walls to block — but never seal the path.', category: 'board', length: '~10 min', modes: 'online + local', status: 'soon' },
  {
    slug: 'dots',
    tiles: 'BOXES',
    name: 'Dots & Boxes',
    blurb: 'Take turns drawing lines between dots. Close a box to claim it and go again. Most boxes wins.',
    category: 'puzzle',
    length: '~5 min',
    modes: 'online + local',
    status: 'live',
    tagline: 'Close a box, go again · 4×4, 5×5 or 6×6',
    rules: [
      { title: 'Draw a line', body: 'On your turn, press near any gap between two dots — the nearest line lights up. Slide to change it, lift to draw it.' },
      { title: 'Close a box', body: 'Draw the fourth side of a box and it’s yours, marked in your colour. Closing a box earns you another turn.' },
      { title: 'Most boxes wins', body: 'When every line is drawn, the player with more boxes wins. Even-sized boards can end in a draw.' },
      { title: 'Tip', body: 'Avoid drawing the third side of a box — that hands it to your opponent. Late in the game, count the chains.' },
    ],
  },
  { slug: 'sudoku', tiles: '9X9', name: 'Sudoku', blurb: 'Same puzzle, both racing. Fill the grid before your opponent does.', category: 'puzzle', length: '~10 min', modes: 'online + local', status: 'soon' },
  { slug: 'memory', tiles: 'PAIRS', name: 'Memory', blurb: 'Flip cards, find pairs. Whoever collects the most wins.', category: 'puzzle', length: '~5 min', modes: 'online + local', status: 'soon' },
]

export const CATEGORY_LABEL: Record<Category, string> = {
  word: 'Word',
  board: 'Board',
  puzzle: 'Puzzle',
}

export function gameBySlug(slug: string) {
  return GAMES.find((g) => g.slug === slug)
}
