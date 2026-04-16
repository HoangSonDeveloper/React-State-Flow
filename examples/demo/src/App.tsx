import { Provider as ReduxProvider } from 'react-redux'
import { ThemeProvider } from './contexts/ThemeContext'
import { AuthProvider } from './contexts/AuthContext'
import { store } from './store/redux/store'
import { Layout } from './components/Layout'

export default function App() {
  return (
    <ReduxProvider store={store}>
      <ThemeProvider>
        <AuthProvider>
          <Layout />
        </AuthProvider>
      </ThemeProvider>
    </ReduxProvider>
  )
}
