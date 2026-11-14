import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AppShell from './components/shell/AppShell'
import Overview from './pages/Overview'
import FieldDetail from './pages/FieldDetail'
import LocationAnalysis from './pages/LocationAnalysis'
import Methodology from './pages/Methodology'
import Account from './pages/Account'
import MyFields from './pages/MyFields'
import FieldEditor from './pages/FieldEditor'
import { useAuthListener } from './store/useAuth'

const queryClient = new QueryClient()

function AuthSync() {
  useAuthListener()
  return null
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthSync />
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Overview />} />
            <Route path="/fields/:fieldId" element={<FieldDetail />} />
            <Route path="/location" element={<LocationAnalysis />} />
            <Route path="/methodology" element={<Methodology />} />
            <Route path="/account" element={<Account />} />
            <Route path="/my-fields" element={<MyFields />} />
            <Route path="/my-fields/new" element={<FieldEditor />} />
            <Route path="/my-fields/:id" element={<FieldEditor />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
