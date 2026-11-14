import { create } from 'zustand'
import type { Priorities, Scenario } from '../types/api'

interface AppState {
  selectedFieldId: string | null
  priorities: Priorities
  scenario: Scenario
  selectField: (id: string | null) => void
  setPriorities: (p: Priorities) => void
  setScenario: (s: Scenario) => void
}

export const useAppStore = create<AppState>((set) => ({
  selectedFieldId: null,
  priorities: { w_water: 0.25, w_soil: 0.25, w_income: 0.25, w_resilience: 0.25 },
  scenario: { rain_multiplier: 1.0, temp_delta_c: 0.0 },
  selectField: (id) => set({ selectedFieldId: id }),
  setPriorities: (priorities) => set({ priorities }),
  setScenario: (scenario) => set({ scenario }),
}))
