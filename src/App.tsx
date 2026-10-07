import { lazy, Suspense } from 'react'
import { createBrowserRouter, Link, RouterProvider, type RouteObject } from 'react-router-dom'
import { Anagram } from './games/anagram/Anagram'
import { TicTacToe } from './games/tictactoe/TicTacToe'
import { WordHunt } from './games/wordhunt/WordHunt'
import { SoundProvider } from './lib/sound'
import { Home } from './pages/Home'

// Dev-only sandbox; the DEV guard lets the bundler drop it from production builds.
const BoardLab = import.meta.env.DEV ? lazy(() => import('./dev/BoardLab')) : null
const TttLab = import.meta.env.DEV ? lazy(() => import('./dev/TttLab')) : null
const ShareLab = import.meta.env.DEV ? lazy(() => import('./dev/ShareLab')) : null

// A data router (rather than <BrowserRouter>) so games can block navigation mid-match with useBlocker.
const routes: RouteObject[] = [
  { path: '/', element: <Home /> },
  { path: '/wordhunt', element: <WordHunt /> },
  { path: '/anagram', element: <Anagram /> },
  { path: '/tictactoe', element: <TicTacToe /> },
  ...(BoardLab ? [{ path: '/dev/board', element: <Suspense><BoardLab /></Suspense> }] : []),
  ...(TttLab ? [{ path: '/dev/ttt', element: <Suspense><TttLab /></Suspense> }] : []),
  ...(ShareLab ? [{ path: '/dev/share', element: <Suspense><ShareLab /></Suspense> }] : []),
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
