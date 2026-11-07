export type StepStatus = 'pending' | 'in_progress' | 'completed'

declare module 'claude-code' {
  interface PluginState {
    'session-bar': { steps: StepStatus[] | null }
  }
}
