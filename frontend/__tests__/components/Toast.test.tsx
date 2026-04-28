import { render, screen, act } from '@testing-library/react'
import { ToastProvider, useToast } from '@/components/Toast'
import userEvent from '@testing-library/user-event'

function TestComponent({ type = 'info' }: { type?: 'success' | 'error' | 'info' }) {
  const { toast } = useToast()
  return (
    <button onClick={() => toast('Test message', type)}>
      Show Toast
    </button>
  )
}

describe('ToastProvider', () => {
  it('renders a toast when triggered', async () => {
    const user = userEvent.setup()
    
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    )
    
    // Click button to show toast
    await user.click(screen.getByRole('button', { name: /show toast/i }))
    
    // Toast should be visible
    expect(screen.getByText('Test message')).toBeInTheDocument()
    // Info icon
    expect(screen.getByText('ℹ')).toBeInTheDocument()
  })

  it('renders a success toast correctly', async () => {
    const user = userEvent.setup()
    
    render(
      <ToastProvider>
        <TestComponent type="success" />
      </ToastProvider>
    )
    
    await user.click(screen.getByRole('button', { name: /show toast/i }))
    
    expect(screen.getByText('Test message')).toBeInTheDocument()
    expect(screen.getByText('✓')).toBeInTheDocument()
  })

  it('allows dismissing a toast', async () => {
    const user = userEvent.setup()
    
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    )
    
    await user.click(screen.getByRole('button', { name: /show toast/i }))
    expect(screen.getByText('Test message')).toBeInTheDocument()
    
    // There are two buttons: the trigger button and the dismiss button ("✕")
    const buttons = screen.getAllByRole('button')
    const dismissButton = buttons.find(b => b.textContent === '✕')
    
    expect(dismissButton).toBeDefined()
    if (dismissButton) {
      await user.click(dismissButton)
    }
    
    expect(screen.queryByText('Test message')).not.toBeInTheDocument()
  })
})
