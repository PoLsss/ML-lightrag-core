import { HashRouter as Router, Routes, Route, useNavigate, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { navigationService } from '@/services/navigation'
import { Toaster } from 'sonner'
import App from './App'
import LoginPage from '@/features/LoginPage'
import ThemeProvider from '@/components/ThemeProvider'
import { useAuthStore } from '@/stores/state'

// Protected Route component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isGuestMode } = useAuthStore()

  // Allow access if authenticated or in guest mode
  if (isAuthenticated || isGuestMode) {
    return <>{children}</>
  }

  // Redirect to login if not authenticated
  return <Navigate to="/login" replace />
}

const AppContent = () => {
  const navigate = useNavigate()

  useEffect(() => {
    navigationService.setNavigate(navigate)
  }, [navigate])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <App />
          </ProtectedRoute>
        }
      />
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
