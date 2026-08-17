import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SettingsWorkspace } from './SettingsWorkspace'
import { useAuth } from '../auth/AuthContext'
import { api } from '../../services/api'

// Mock dependencies
vi.mock('../auth/AuthContext', () => ({
  useAuth: vi.fn()
}))

vi.mock('../../services/api', () => ({
  api: {
    getUsers: vi.fn(),
    createUser: vi.fn(),
    deleteUser: vi.fn()
  }
}))

describe('SettingsWorkspace', () => {
  const mockOnNotify = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useAuth.mockReturnValue({
      user: { username: 'admin', role: 'admin' }
    })
    api.getUsers.mockResolvedValue({ users: [] })
  })

  it('renders General settings by default', () => {
    render(<SettingsWorkspace onNotify={mockOnNotify} />)
    
    expect(screen.getByText('General Settings')).toBeInTheDocument()
    expect(screen.getByText('Workspace Name')).toBeInTheDocument()
  })

  it('switches to Network settings when Network tab is clicked', () => {
    render(<SettingsWorkspace onNotify={mockOnNotify} />)
    
    fireEvent.click(screen.getByText('Network'))
    
    expect(screen.getByText('Network & API')).toBeInTheDocument()
    expect(screen.getByText('API Endpoint URL')).toBeInTheDocument()
  })

  it('displays User Management tab for admin users', () => {
    render(<SettingsWorkspace onNotify={mockOnNotify} />)
    
    expect(screen.getByText('User Management')).toBeInTheDocument()
  })

  it('hides User Management tab for non-admin users', () => {
    useAuth.mockReturnValue({
      user: { username: 'user1', role: 'user' }
    })
    render(<SettingsWorkspace onNotify={mockOnNotify} />)
    
    expect(screen.queryByText('User Management')).not.toBeInTheDocument()
  })

  it('calls fetchUsers when User Management tab is active for admin', async () => {
    render(<SettingsWorkspace onNotify={mockOnNotify} />)
    
    fireEvent.click(screen.getByText('User Management'))
    
    await waitFor(() => {
      expect(api.getUsers).toHaveBeenCalled()
    })
  })

  it('triggers onNotify when save button is clicked', () => {
    render(<SettingsWorkspace onNotify={mockOnNotify} />)
    
    fireEvent.click(screen.getByText('Save Changes'))
    
    expect(mockOnNotify).toHaveBeenCalledWith('Settings saved successfully', 'success')
  })
})
