import { NavigateFunction } from 'react-router-dom'
import { useAuthStore, useBackendState } from '@/stores/state'
import { useGraphStore } from '@/stores/graph'
import { useSettingsStore } from '@/stores/settings'

class NavigationService {
  private navigate: NavigateFunction | null = null

  setNavigate(navigate: NavigateFunction) {
    this.navigate = navigate
  }

  resetAllApplicationState() {
    console.log('Resetting all application state...')

    const graphStore = useGraphStore.getState()
    const sigma = graphStore.sigmaInstance
    graphStore.reset()
    graphStore.setGraphDataFetchAttempted(false)
    graphStore.setLabelsFetchAttempted(false)
    graphStore.setSigmaInstance(null)
    graphStore.setIsFetching(false)

    useBackendState.getState().clear()
    useSettingsStore.getState().setRetrievalHistory([])

    sessionStorage.clear()

    if (sigma) {
      sigma.getGraph().clear()
      sigma.kill()
      useGraphStore.getState().setSigmaInstance(null)
    }
  }

  navigateToLogin() {
    if (!this.navigate) {
      console.error('Navigation function not set')
      return
    }

    const currentUsername = useAuthStore.getState().username
    if (currentUsername) {
      localStorage.setItem('LIGHTRAG-PREVIOUS-USER', currentUsername)
    }

    this.resetAllApplicationState()
    useAuthStore.getState().logout()

    this.navigate('/login')
  }

  navigateToHome() {
    if (!this.navigate) {
      console.error('Navigation function not set')
      return
    }

    this.navigate('/')
  }
}

export const navigationService = new NavigationService()
