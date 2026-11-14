import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AppShell from './components/shell/AppShell'
import Overview from './pages/Overview'
import FieldDetail from './pages/FieldDetail'
import LocationAnalysis from './pages/LocationAnalysis'
import Methodology from './pages/Methodology'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Overview />} />
            <Route path="/fields/:fieldId" element={<FieldDetail />} />
            <Route path="/location" element={<LocationAnalysis />} />
            <Route path="/methodology" element={<Methodology />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
