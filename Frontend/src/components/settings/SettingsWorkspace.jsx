import React, { useState, useEffect } from 'react'
import { Bell, Monitor, Save, User, Wifi, Users, Trash2, Plus } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { api } from '../../services/api'

export function SettingsWorkspace({ onNotify }) {
  const { user } = useAuth()
  const [usersList, setUsersList] = useState([])
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [loadingUsers, setLoadingUsers] = useState(false)

  const [activeTab, setActiveTab] = useState('general')

  
  useEffect(() => {
    if (activeTab === 'users' && user?.role === 'admin') {
      fetchUsers()
    }
  }, [activeTab, user])

  const fetchUsers = async () => {
    setLoadingUsers(true)
    try {
      const data = await api.getUsers()
      setUsersList(data.users || [])
    } catch (err) {
      if (onNotify) onNotify('Failed to fetch users: ' + err.message, 'error')
    } finally {
      setLoadingUsers(false)
    }
  }

  const handleAddUser = async (e) => {
    e.preventDefault()
    if (!newUsername || !newPassword) return
    
    try {
      await api.createUser({ username: newUsername, password: newPassword, role: 'user' })
      setNewUsername('')
      setNewPassword('')
      fetchUsers()
      if (onNotify) onNotify('User added successfully', 'success')
    } catch (err) {
      if (onNotify) onNotify('Failed to add user: ' + err.message, 'error')
    }
  }

  const handleDeleteUser = async (id) => {
    try {
      await api.deleteUser(id)
      fetchUsers()
      if (onNotify) onNotify('User deleted successfully', 'success')
    } catch (err) {
      if (onNotify) onNotify('Failed to delete user: ' + err.message, 'error')
    }
  }

  const handleSave = () => {
    if (onNotify) onNotify('Settings saved successfully', 'success')
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span>Manage</span>
          <span>/</span>
          <span className="font-medium text-slate-900">Settings</span>
        </div>
        <h2 className="mt-2 text-[30px] font-bold tracking-[-.055em] sm:text-[36px]">Settings</h2>
        <p className="mt-1 text-sm text-slate-500">Manage your workspace preferences and network configurations.</p>
      </div>

      <div className="flex flex-col gap-8 md:flex-row">
        {/* Settings Navigation */}
        <div className="w-full md:w-64 flex-shrink-0">
          <nav className="flex flex-col gap-1">
            <TabButton icon={<Monitor size={18} />} label="General" active={activeTab === 'general'} onClick={() => setActiveTab('general')} />
            <TabButton icon={<User size={18} />} label="Account" active={activeTab === 'account'} onClick={() => setActiveTab('account')} />
            <TabButton icon={<Bell size={18} />} label="Notifications" active={activeTab === 'notifications'} onClick={() => setActiveTab('notifications')} />
            <TabButton icon={<Wifi size={18} />} label="Network" active={activeTab === 'network'} onClick={() => setActiveTab('network')} />
            {user?.role === 'admin' && (
              <TabButton icon={<Users size={18} />} label="User Management" active={activeTab === 'users'} onClick={() => setActiveTab('users')} />
            )}
          </nav>
        </div>

        {/* Settings Content */}
        <div className="flex-1">
          <div className="panel flex flex-col gap-6 p-6 sm:p-8">
            {activeTab === 'general' && (
              <>
                <h3 className="text-xl font-bold tracking-tight">General Settings</h3>
                <div className="flex flex-col gap-5 border-t border-slate-100 pt-5">
                  <SettingField label="Workspace Name" id="workspaceName" type="text" defaultValue="PrintOps Farm Alpha" />
                  <SettingField label="Timezone" id="timezone" type="select" options={['UTC', 'America/New_York', 'Europe/London']} defaultValue="UTC" />
                  <SettingField label="Language" id="language" type="select" options={['English', 'Spanish', 'French', 'German']} defaultValue="English" />
                </div>
              </>
            )}
            
            {activeTab === 'account' && (
              <>
                <h3 className="text-xl font-bold tracking-tight">Account Information</h3>
                <div className="flex flex-col gap-5 border-t border-slate-100 pt-5">
                  <SettingField label="Full Name" id="fullName" type="text" defaultValue="Admin User" />
                  <SettingField label="Email Address" id="email" type="email" defaultValue="admin@printops.local" />
                </div>
              </>
            )}

            {activeTab === 'notifications' && (
              <>
                <h3 className="text-xl font-bold tracking-tight">Notification Preferences</h3>
                <div className="flex flex-col gap-4 border-t border-slate-100 pt-5">
                  <ToggleSetting label="Print job completion alerts" defaultChecked />
                  <ToggleSetting label="Error and pause alerts" defaultChecked />
                  <ToggleSetting label="Weekly summary emails" defaultChecked={false} />
                  <ToggleSetting label="Network disconnection alerts" defaultChecked />
                </div>
              </>
            )}

            {activeTab === 'network' && (
              <>
                <h3 className="text-xl font-bold tracking-tight">Network & API</h3>
                <div className="flex flex-col gap-5 border-t border-slate-100 pt-5">
                  <SettingField label="API Endpoint URL" id="apiUrl" type="text" defaultValue="http://localhost:8000" />
                  <SettingField label="WebSocket URL" id="wsUrl" type="text" defaultValue="ws://localhost:8000/ws" />
                  <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-50 p-4 border border-slate-100">
                    <div>
                      <div className="font-semibold text-sm">Auto-Discovery</div>
                      <div className="text-xs text-slate-500">Automatically scan local network for new printers</div>
                    </div>
                    <div className="h-6 w-11 rounded-full bg-orange-500 p-1 cursor-pointer">
                      <div className="h-4 w-4 rounded-full bg-white shadow-sm ml-auto"></div>
                    </div>
                  </div>
                </div>
              </>
            )}


            
            {activeTab === 'users' && user?.role === 'admin' && (
              <>
                <h3 className="text-xl font-bold tracking-tight">User Management</h3>
                <div className="flex flex-col gap-6 border-t border-slate-100 pt-5">
                  <form onSubmit={handleAddUser} className="flex flex-col sm:flex-row gap-3 items-end rounded-xl bg-slate-50 p-4 border border-slate-100">
                    <div className="flex-1 w-full">
                      <label className="mb-1 block text-xs font-semibold text-slate-600 uppercase tracking-wider">Username</label>
                      <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10" required />
                    </div>
                    <div className="flex-1 w-full">
                      <label className="mb-1 block text-xs font-semibold text-slate-600 uppercase tracking-wider">Password</label>
                      <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10" required />
                    </div>
                    <button type="submit" className="flex h-[38px] w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 transition-colors">
                      <Plus size={16} /> Add User
                    </button>
                  </form>
                  
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Username</th>
                          <th className="px-4 py-3 font-semibold">Role</th>
                          <th className="px-4 py-3 font-semibold">Created</th>
                          <th className="px-4 py-3 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {loadingUsers ? (
                          <tr><td colSpan="4" className="px-4 py-4 text-center text-slate-500">Loading...</td></tr>
                        ) : usersList.length === 0 ? (
                          <tr><td colSpan="4" className="px-4 py-4 text-center text-slate-500">No users found.</td></tr>
                        ) : (
                          usersList.map((u) => (
                            <tr key={u.id}>
                              <td className="px-4 py-3 font-medium">{u.username}</td>
                              <td className="px-4 py-3 text-slate-500 capitalize">{u.role}</td>
                              <td className="px-4 py-3 text-slate-500">{new Date(u.created_at).toLocaleDateString()}</td>
                              <td className="px-4 py-3 text-right">
                                {u.username !== 'admin' && user.username !== u.username && (
                                  <button onClick={() => handleDeleteUser(u.id)} className="text-red-500 hover:text-red-600 p-1 rounded-md hover:bg-red-50 transition-colors">
                                    <Trash2 size={16} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
            
            {/* Actions */}

            <div className="mt-4 flex items-center justify-end gap-3 border-t border-slate-100 pt-6">
              <button className="secondary-button" onClick={() => onNotify?.('Changes discarded', 'error')}>Cancel</button>
              <button className="primary-button" onClick={handleSave}>
                <Save size={16} />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TabButton({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
        active
          ? 'bg-orange-50 text-orange-600 shadow-sm ring-1 ring-orange-500/20'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function SettingField({ label, id, type, defaultValue, options }) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-xs font-semibold text-slate-600 uppercase tracking-wider">
        {label}
      </label>
      {type === 'select' ? (
        <select
          id={id}
          defaultValue={defaultValue}
          className="w-full max-w-md rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition-all focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type={type}
          defaultValue={defaultValue}
          className="w-full max-w-md rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition-all focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
        />
      )}
    </div>
  )
}

function ToggleSetting({ label, defaultChecked }) {
  const [checked, setChecked] = useState(defaultChecked)
  return (
    <div className="flex items-center gap-3">
      <div 
        onClick={() => setChecked(!checked)}
        className={`flex h-6 w-11 cursor-pointer items-center rounded-full p-1 transition-colors ${checked ? 'bg-orange-500' : 'bg-slate-300'}`}
      >
        <div className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}></div>
      </div>
      <span className="text-sm font-medium text-slate-700">{label}</span>
    </div>
  )
}
