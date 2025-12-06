import { HashRouter as Router, Routes, Route, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { navigationService } from '@/services/navigation'
import { Toaster } from 'sonner'
import App from './App'
import ThemeProvider from '@/components/ThemeProvider'

const AppContent = () => {
  const navigate = useNavigate()

  useEffect(() => {
    navigationService.setNavigate(navigate)
  }, [navigate])

  return (
    <Routes>
      <Route path="/*" element={<App />} />
    </Routes>
  )
}

const AppRouter = () => {
  return (
    <ThemeProvider>
      <Router>
        <AppContent />
        <Toaster
          position="bottom-center"
          theme="system"
          closeButton
          richColors
        />
      </Router>
    </ThemeProvider>
  )
}

export default AppRouter
