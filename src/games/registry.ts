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
  { slug: 'anagram', tiles: 'NOTES', name: 'Anagram Race', blurb: 'Same scrambled word, both players at once. First to unscramble it takes the round.', category: 'word', length: '5 rounds', modes: 'online', status: 'soon' },
  { slug: 'battleword', tiles: 'CRANE', name: 'Battleword', blurb: "Hide a 5-letter word. Crack your opponent's first using colour-coded clues.", category: 'word', length: '~5 min', modes: 'online + local', status: 'soon' },
  { slug: 'hangman', tiles: 'GUESS', name: 'Hangman', blurb: 'One hides a word, the other guesses letter by letter. Swap roles — best of two.', category: 'word', length: '2 rounds', modes: 'online + local', status: 'soon' },
  { slug: 'crossword', tiles: 'KENTE', name: 'Crossword', blurb: 'Race to fill the grid. Claim words in your colour and outscore your opponent.', category: 'word', length: '~8 min', modes: 'online + local', status: 'soon' },
  { slug: 'battleship', tiles: 'FLEET', name: 'Battleship', blurb: "Hunt down your opponent's hidden fleet. Sink every ship before they sink yours.", category: 'board', length: '~10 min', modes: 'online + local', status: 'soon' },
  { slug: 'tictactoe', tiles: 'XOX', name: 'Tic-Tac-Toe', blurb: 'Three in a row wins the round. Anchor vs Skull.', category: 'board', length: '~2 min', modes: 'online + local', status: 'soon' },
  { slug: 'connect4', tiles: 'FOUR', name: 'Connect Four', blurb: 'Drop pieces into the grid and line up four — across, down or diagonal.', category: 'board', length: '~5 min', modes: 'online + local', status: 'soon' },
  { slug: 'checkers', tiles: 'KING', name: 'Checkers', blurb: 'Diagonal warfare. Capture every enemy piece and crown your kings.', category: 'board', length: '~15 min', modes: 'local', status: 'soon' },
  { slug: 'othello', tiles: 'FLIP', name: 'Othello', blurb: 'Outflank and flip. Most discs when the board fills up wins.', category: 'board', length: '~10 min', modes: 'online + local', status: 'soon' },
  { slug: 'oware', tiles: 'SEEDS', name: 'Oware', blurb: 'Sow seeds around the 12-pit board. Capture on 2 or 3 — first to 25 wins.', category: 'board', length: '~15 min', modes: 'online + local', status: 'soon' },
  { slug: 'ludo', tiles: 'SIX', name: 'Ludo', blurb: 'Roll a six to enter, knock opponents off the track, bring all four home.', category: 'board', length: '~20 min', modes: 'online + local', status: 'soon' },
  { slug: 'quoridor', tiles: 'WALLS', name: 'Quoridor', blurb: 'Race your pawn across. Place walls to block — but never seal the path.', category: 'board', length: '~10 min', modes: 'online + local', status: 'soon' },
  { slug: 'dots', tiles: 'BOXES', name: 'Dots & Boxes', blurb: 'Draw lines between dots. Close a box to claim it. Most boxes wins.', category: 'puzzle', length: '~5 min', modes: 'online + local', status: 'soon' },
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
