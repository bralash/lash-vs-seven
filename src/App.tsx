import { lazy, Suspense } from 'react'
import { createBrowserRouter, Link, RouterProvider, type RouteObject } from 'react-router-dom'
import { Anagram } from './games/anagram/Anagram'
import { ConnectFour } from './games/connect4/ConnectFour'
import { DotsAndBoxes } from './games/dots/DotsAndBoxes'
import { Othello } from './games/othello/Othello'
import { Hangman } from './games/hangman/Hangman'
import { Oware } from './games/oware/Oware'
import { Checkers } from './games/checkers/Checkers'
import { Sudoku } from './games/sudoku/Sudoku'
import { TicTacToe } from './games/tictactoe/TicTacToe'
import { WordHunt } from './games/wordhunt/WordHunt'
import { SoundProvider } from './lib/sound'
import { Home } from './pages/Home'

// Dev-only sandbox; the DEV guard lets the bundler drop it from production builds.
const BoardLab = import.meta.env.DEV ? lazy(() => import('./dev/BoardLab')) : null
const TttLab = import.meta.env.DEV ? lazy(() => import('./dev/TttLab')) : null
const ShareLab = import.meta.env.DEV ? lazy(() => import('./dev/ShareLab')) : null
const C4Lab = import.meta.env.DEV ? lazy(() => import('./dev/C4Lab')) : null
const DotsLab = import.meta.env.DEV ? lazy(() => import('./dev/DotsLab')) : null
const OthelloLab = import.meta.env.DEV ? lazy(() => import('./dev/OthelloLab')) : null
const CheckersLab = import.meta.env.DEV ? lazy(() => import('./dev/CheckersLab')) : null
const VsLab = import.meta.env.DEV ? lazy(() => import('./dev/VsLab')) : null

// A data router (rather than <BrowserRouter>) so games can block navigation mid-match with useBlocker.
const routes: RouteObject[] = [
  { path: '/', element: <Home /> },
  { path: '/wordhunt', element: <WordHunt /> },
  { path: '/anagram', element: <Anagram /> },
  { path: '/tictactoe', element: <TicTacToe /> },
  { path: '/connect4', element: <ConnectFour /> },
  { path: '/dots', element: <DotsAndBoxes /> },
  { path: '/othello', element: <Othello /> },
  { path: '/oware', element: <Oware /> },
  { path: '/hangman', element: <Hangman /> },
  { path: '/sudoku', element: <Sudoku /> },
  { path: '/checkers', element: <Checkers /> },
  ...(BoardLab ? [{ path: '/dev/board', element: <Suspense><BoardLab /></Suspense> }] : []),
  ...(TttLab ? [{ path: '/dev/ttt', element: <Suspense><TttLab /></Suspense> }] : []),
  ...(ShareLab ? [{ path: '/dev/share', element: <Suspense><ShareLab /></Suspense> }] : []),
  ...(C4Lab ? [{ path: '/dev/c4', element: <Suspense><C4Lab /></Suspense> }] : []),
  ...(DotsLab ? [{ path: '/dev/dots', element: <Suspense><DotsLab /></Suspense> }] : []),
  ...(OthelloLab ? [{ path: '/dev/othello', element: <Suspense><OthelloLab /></Suspense> }] : []),
  ...(CheckersLab ? [{ path: '/dev/checkers', element: <Suspense><CheckersLab /></Suspense> }] : []),
  ...(VsLab ? [{ path: '/dev/vs', element: <Suspense><VsLab /></Suspense> }] : []),
  { path: '*', element: <NotFound /> },
]
const router = createBrowserRouter(routes)

export function App() {
  return (
    <SoundProvider>
      <RouterProvider router={router} />
    </SoundProvider>
  )
}

function NotFound() {
  return (
    <main className="page lobby__main screen-in" style={{ paddingTop: '18vh' }}>
      <h1 className="lobby__title" style={{ fontSize: 'clamp(48px, 10vw, 88px)' }}>Wrong board</h1>
      <p>That page isn’t on the shelf.</p>
      <Link to="/" className="btn btn--primary">All games</Link>
    </main>
  )
}
