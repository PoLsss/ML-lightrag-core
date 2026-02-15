import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/state'
import { useSettingsStore } from '@/stores/settings'
import { useGraphStore } from '@/stores/graph'
import { getAuthStatus } from '@/api/lightrag'
import { loginUser, registerUser } from '@/api/users'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { MailIcon, LockIcon, EyeIcon, EyeOffIcon, UserPlusIcon, LogInIcon } from 'lucide-react'
import AppSettings from '@/components/AppSettings'

const LoginPage = () => {
  const navigate = useNavigate()
  const { login, isAuthenticated } = useAuthStore()
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isRegisterMode, setIsRegisterMode] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const authCheckRef = useRef(false)

  useEffect(() => {
    console.log('LoginPage mounted')
  }, [])

  useEffect(() => {
    const checkAuthConfig = async () => {
      if (authCheckRef.current) {
        return
      }
      authCheckRef.current = true

      try {
        if (isAuthenticated) {
          navigate('/')
          return
        }

        const status = await getAuthStatus()

        if (status.core_version || status.api_version) {
          sessionStorage.setItem('VERSION_CHECKED_FROM_LOGIN', 'true')
        }

        if (!status.auth_configured && status.access_token) {
          login(
            status.access_token,
            true,
            status.core_version,
            status.api_version,
            status.webui_title || null,
            status.webui_description || null
          )
          if (status.message) {
            toast.info(status.message)
          }
          navigate('/')
          return
        }

        setCheckingAuth(false)
      } catch (error) {
        console.error('Failed to check auth configuration:', error)
        setCheckingAuth(false)
      }
    }

    checkAuthConfig()

    return () => { }
  }, [isAuthenticated, login, navigate])

  if (checkingAuth) {
    return null
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (isRegisterMode) {
      // Handle registration
      if (!username || !password || !confirmPassword) {
        toast.error(t('login.errorEmptyFields'))
        return
      }

      if (password !== confirmPassword) {
        toast.error(t('login.passwordMismatch'))
        return
      }

      try {
        setLoading(true)
        await registerUser({
          email: username,
          password: password,
          confirm_password: confirmPassword
        })
        toast.success(t('login.registerSuccess'))
        setIsRegisterMode(false)
        setPassword('')
        setConfirmPassword('')
      } catch (error: any) {
        console.error('Registration failed...', error)
        const errorMsg = error.response?.data?.detail || t('login.registerError')
        toast.error(errorMsg)
      } finally {
        setLoading(false)
      }
    } else {
      // Handle login
      if (!username || !password) {
        toast.error(t('login.errorEmptyFields'))
        return
      }

      try {
        setLoading(true)
        const response = await loginUser(username, password)

        const previousUsername = localStorage.getItem('LIGHTRAG-PREVIOUS-USER')
        const isSameUser = previousUsername === username

        if (isSameUser) {
          console.log('Same user logging in, preserving chat history')
        } else {
          console.log('Different user logging in, clearing chat history')
          useSettingsStore.getState().setRetrievalHistory([])
        }

        localStorage.setItem('LIGHTRAG-PREVIOUS-USER', username)

        // Fetch status to get version info if possible, otherwise use nulls
        let coreVersion = null
        let apiVersion = null
        let webuiTitle = null
        let webuiDescription = null

        try {
          const status = await getAuthStatus()
          coreVersion = status.core_version
          apiVersion = status.api_version
          webuiTitle = status.webui_title
          webuiDescription = status.webui_description
        } catch (e) {
          console.warn('Failed to fetch status after login', e)
        }

        login(
          response.access_token,
          false, // Not guest mode
          coreVersion,
          apiVersion,
          webuiTitle,
          webuiDescription,
          response.user.display_name
        )

        if (coreVersion || apiVersion) {
          sessionStorage.setItem('VERSION_CHECKED_FROM_LOGIN', 'true')
        }

        // Reset tab to documents and reset knowledge graph on login
        useSettingsStore.getState().setCurrentTab('documents')
        useGraphStore.getState().reset()

        toast.success(t('login.successMessage'))
        // Use window.location for reliable navigation after state update
        window.location.href = window.location.origin + window.location.pathname + '#/'
      } catch (error: any) {
        console.error('Login failed...', error)
        const errorMsg = error.response?.data?.detail || t('login.errorInvalidCredentials')
        toast.error(errorMsg)

        useAuthStore.getState().logout()
        localStorage.removeItem('LIGHTRAG-API-TOKEN')
      } finally {
        setLoading(false)
      }
    }
  }

  const toggleMode = () => {
    setIsRegisterMode(!isRegisterMode)
    setPassword('')
    setConfirmPassword('')
  }

  return (
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        {/* Animated orbs */}
        <div className="absolute top-1/4 left-1/4 h-96 w-96 animate-pulse rounded-full bg-purple-500/20 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 h-96 w-96 animate-pulse rounded-full bg-pink-500/20 blur-3xl" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-cyan-500/10 blur-3xl" style={{ animationDelay: '2s' }} />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)`,
          backgroundSize: '50px 50px'
        }}
      />

      {/* Settings button */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <AppSettings className="bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-xl border border-white/10 text-white transition-all duration-300" />
      </div>

      {/* Main card */}
      <Card className="relative z-10 w-full max-w-[420px] mx-4 bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl shadow-purple-500/10">
        <CardHeader className="flex items-center justify-center pb-6 pt-8 border-b border-white/10">
          <div className="flex flex-col items-center space-y-6 w-full">
            {/* Logo with glow effect */}
            <div className="relative">
              <div className="absolute inset-0 animate-pulse rounded-full bg-emerald-400/50 blur-xl" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-400 shadow-lg shadow-emerald-500/30">
                <img
                  src="images/our-logo.png"
                  alt="Custom Logo"
                  className="h-16 w-16 object-contain"
                />
              </div>
            </div>
            
            {/* Title and subtitle section with frame */}
            <div className="text-center space-y-4 px-8 py-6 w-full border-2 border-emerald-400/40 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-emerald-400/5 to-transparent backdrop-blur-sm shadow-lg shadow-emerald-500/5">
              <h1 className="text-4xl font-bold tracking-wider bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent leading-tight">
                UIT Document Management
              </h1>
              <div className="w-12 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent mx-auto" />
              <p className="text-gray-300 text-sm leading-relaxed font-medium">
                {isRegisterMode ? t('login.register') : t('login.description')}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-6 pb-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email/Username field */}
            <div className="space-y-2">
              <label htmlFor="username-input" className="text-sm font-medium text-gray-300">
                {isRegisterMode ? t('login.email') : t('login.username')}
              </label>
              <div className="relative">
                <MailIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
                <Input
                  id="username-input"
                  type={isRegisterMode ? "email" : "text"}
                  placeholder={isRegisterMode ? t('login.emailPlaceholder') : t('login.usernamePlaceholder')}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="w-full h-12 pl-11 pr-11 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-emerald-400/50 focus:ring-emerald-400/20 transition-all duration-300"
                />
              </div>
            </div>

            {/* Password field */}
            <div className="space-y-2">
              <label htmlFor="password-input" className="text-sm font-medium text-gray-300">
                {t('login.password')}
              </label>
              <div className="relative">
                <LockIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
                <Input
                  id="password-input"
                  type={showPassword ? "text" : "password"}
                  placeholder={t('login.passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full h-12 pl-11 pr-11 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-emerald-400/50 focus:ring-emerald-400/20 transition-all duration-300"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Confirm Password field (register mode only) */}
            {isRegisterMode && (
              <div className="space-y-2">
                <label htmlFor="confirm-password-input" className="text-sm font-medium text-gray-300">
                  {t('login.confirmPassword')}
                </label>
                <div className="relative">
                  <LockIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
                  <Input
                    id="confirm-password-input"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder={t('login.confirmPasswordPlaceholder')}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="w-full h-12 pl-11 pr-11 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-emerald-400/50 focus:ring-emerald-400/20 transition-all duration-300"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    {showConfirmPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            )}

            {/* Submit button */}
            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 border-0 shadow-lg shadow-emerald-500/25 transition-all duration-300 hover:shadow-emerald-500/40 hover:scale-[1.02] active:scale-[0.98]"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  {isRegisterMode ? t('login.registering') : t('login.loggingIn')}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  {isRegisterMode ? (
                    <>
                      <UserPlusIcon className="h-5 w-5" />
                      {t('login.registerButton')}
                    </>
                  ) : (
                    <>
                      <LogInIcon className="h-5 w-5" />
                      {t('login.loginButton')}
                    </>
                  )}
                </span>
              )}
            </Button>

            {/* Toggle login/register */}
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={toggleMode}
                className="text-sm text-gray-400 hover:text-emerald-400 transition-colors duration-300"
              >
                {isRegisterMode ? t('login.haveAccount') : t('login.noAccount')}
                <span className="ml-1 font-medium text-emerald-400">
                  {isRegisterMode ? t('login.loginButton') : t('login.register')}
                </span>
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
    </div>
  )
}

export default LoginPage
