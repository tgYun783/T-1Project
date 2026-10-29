import { Route, Routes } from 'react-router-dom'
import { RequireAuth, RequireUnlocked } from '@/components/guards'
import Layout from '@/components/Layout'
import CheckPage from '@/pages/CheckPage'
import CoverLetterDetail from '@/pages/CoverLetterDetail'
import CoverLetterNew from '@/pages/CoverLetterNew'
import CoverLetterPaste from '@/pages/CoverLetterPaste'
import CoverLetterWrite from '@/pages/CoverLetterWrite'
import AuthPage from '@/pages/AuthPage'
import ExperienceDetail from '@/pages/ExperienceDetail'
import Experiences from '@/pages/Experiences'
import Home from '@/pages/Home'
import Intro from '@/pages/Intro'
import NotFound from '@/pages/NotFound'
import Resume from '@/pages/Resume'

// 화면은 specs/ 순서대로 하나씩 추가한다.
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Intro />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route element={<RequireAuth />}>
          <Route path="/cover-letters" element={<Home />} />
          <Route path="/experiences" element={<Experiences />} />
          <Route path="/resume" element={<Resume />} />
          <Route path="/experiences/:id" element={<ExperienceDetail />} />
          <Route element={<RequireUnlocked />}>
            <Route path="/cover-letters/paste" element={<CoverLetterPaste />} />
            <Route path="/cover-letters/new" element={<CoverLetterNew />} />
            <Route path="/cover-letters/:id/items/:itemId" element={<CoverLetterWrite />} />
            <Route path="/cover-letters/:id" element={<CoverLetterDetail />} />
            <Route path="/checks/:checkId" element={<CheckPage />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
