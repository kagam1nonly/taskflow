import { render, screen, act } from '@testing-library/react'
import TaskCard from '@/components/TaskCard'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const mockTask = {
  id: '1',
  board_id: 'b1',
  column_id: 'c1',
  title: 'Test Task Title',
  description: 'Test task description',
  position: 0,
  status: 'todo',
  created_by: 'user1',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

describe('TaskCard', () => {
  it('renders task details correctly', () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()

    render(<TaskCard task={mockTask} onEdit={onEdit} onDelete={onDelete} />)

    expect(screen.getByText('Test Task Title')).toBeInTheDocument()
    expect(screen.getByText('Test task description')).toBeInTheDocument()
  })

  it('calls onEdit when edit button is clicked', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const onDelete = vi.fn()

    render(<TaskCard task={mockTask} onEdit={onEdit} onDelete={onDelete} />)

    // Open menu
    const menuButton = screen.getByRole('button', { name: /open task menu/i })
    await user.click(menuButton)

    // Click edit
    const editButton = screen.getByText('Edit')
    await user.click(editButton)

    expect(onEdit).toHaveBeenCalledWith(mockTask)
  })

  it('calls onDelete when delete button is clicked', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const onDelete = vi.fn()

    render(<TaskCard task={mockTask} onEdit={onEdit} onDelete={onDelete} />)

    // Open menu
    const menuButton = screen.getByRole('button', { name: /open task menu/i })
    await user.click(menuButton)

    // Click delete
    const deleteButton = screen.getByText('Delete')
    await user.click(deleteButton)

    expect(onDelete).toHaveBeenCalledWith(mockTask)
  })
})
