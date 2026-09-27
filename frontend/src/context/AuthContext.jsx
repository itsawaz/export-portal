import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, token } from '../api'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const onLogout = () => setUser(null)
    window.addEventListener('ep:logout', onLogout)
    if (token.get()) api('/auth/me').then(setUser).catch(() => token.set(null)).finally(() => setReady(true))
    else setReady(true)
    return () => window.removeEventListener('ep:logout', onLogout)
  }, [])

  const acceptSession = (s) => { token.set(s.access_token); setUser(s.user); return s.user }
  const login = useCallback(async (email, password) =>
    acceptSession(await api('/auth/login', { method: 'POST', body: { email, password } })), [])
  const register = useCallback(async (body) =>
    acceptSession(await api('/auth/register', { method: 'POST', body })), [])
  const logout = useCallback(() => { token.set(null); setUser(null) }, [])
  const refresh = useCallback(async () => setUser(await api('/auth/me')), [])

  const isStaff = !!user && (user.role === 'admin' || user.role === 'staff')
  return (
    <AuthCtx.Provider value={{ user, ready, isStaff, isAdmin: user?.role === 'admin', login, register, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
