import { useState, useEffect, useRef } from 'react'
import {
  collection, doc, onSnapshot, setDoc, updateDoc, addDoc,
  deleteDoc, serverTimestamp, query, orderBy, getDoc, where, getDocs
} from 'firebase/firestore'
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged, sendPasswordResetEmail, updateProfile
} from 'firebase/auth'
import { db, auth } from './firebase.js'

// ─── Status config ────────────────────────────────────────────
const STATUS_CONFIG = {
  'not-started': { label: 'Not Started', color: '#9CA3AF', bg: '#F3F4F6' },
  'planning':    { label: 'Planning',    color: '#7A9E87', bg: '#EDF4EF' },
  'in-progress': { label: 'In Progress', color: '#C4714A', bg: '#FAF0EB' },
  'complete':    { label: 'Complete',    color: '#4A7C6F', bg: '#E6F0EE' },
}

const AVATARS = ['🏠','🌿','🛠','⭐','🌙','🔥','💎','🎯','🏡','✨','🌸','🦋','🎨','🏔','🌊']

function fmt(n) { return '£' + (n || 0).toLocaleString('en-GB') }

function timeAgo(ts) {
  if (!ts) return 'Just now'
  const secs = Math.floor((Date.now() - ts.toMillis()) / 1000)
  if (secs < 60) return 'Just now'
  if (secs < 3600) return Math.floor(secs / 60) + 'm ago'
  if (secs < 86400) return Math.floor(secs / 3600) + 'h ago'
  return Math.floor(secs / 86400) + 'd ago'
}

// ─── Shared style tokens ──────────────────────────────────────
const iS = { padding: '12px 14px', border: '1.5px solid #E5E7EB', borderRadius: 10, fontSize: 15, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }
const bP = { padding: '10px 20px', background: '#C4714A', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }
const bS = { padding: '10px 14px', background: 'transparent', color: '#6B7280', border: '1px solid #E5E7EB', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }
const crd = { background: '#fff', borderRadius: 14, padding: 16, border: '1px solid #EDE8E1' }
const sL = { fontSize: 12, fontWeight: 700, color: '#9CA3AF', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }

// ─── Helpers ─────────────────────────────────────────────────
function StatusBadge({ status }) {
  const c = STATUS_CONFIG[status] || STATUS_CONFIG['not-started']
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99, color: c.color, background: c.bg, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{c.label}</span>
}

function ProgressBar({ spent, estimate }) {
  const pct = estimate ? Math.min((spent / estimate) * 100, 100) : 0
  const over = spent > estimate
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>
        <span>Spent: <strong style={{ color: over ? '#C4714A' : '#1C2B3A' }}>{fmt(spent)}</strong></span>
        <span>Budget: <strong>{fmt(estimate)}</strong></span>
      </div>
      <div style={{ height: 6, background: '#E5E7EB', borderRadius: 99 }}>
        <div style={{ height: '100%', width: pct + '%', background: over ? '#C4714A' : '#7A9E87', borderRadius: 99, transition: 'width 0.4s' }} />
      </div>
    </div>
  )
}

// ─── Auth Screens ─────────────────────────────────────────────
function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login') // login | signup | reset
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (!email || !password) return
    setLoading(true); setError('')
    try {
      await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password)
    } catch (e) {
      const code = e.code || ''
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') setError('Wrong email or password.')
      else if (code === 'auth/user-not-found') setError('No account found with this email.')
      else if (code === 'auth/too-many-requests') setError('Too many attempts. Try again later.')
      else setError('Error: ' + code)
      setLoading(false)
    }
  }

  const handleSignup = async () => {
    if (!name || !email || !password) { setError('Please fill in all fields.'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    setLoading(true); setError('')
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password)
      await updateProfile(cred.user, { displayName: name.trim() })
    } catch (e) {
      const code = e.code || ''
      if (code === 'auth/email-already-in-use') setError('An account with this email already exists.')
      else if (code === 'auth/invalid-email') setError('Please enter a valid email address.')
      else if (code === 'auth/weak-password') setError('Password must be at least 6 characters.')
      else setError('Error: ' + code)
      setLoading(false)
    }
  }

  const handleReset = async () => {
    if (!email) { setError('Enter your email above.'); return }
    setLoading(true); setError('')
    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase())
      setMessage('Reset email sent! Check your inbox.')
      setMode('login')
    } catch (e) {
      setError('Could not send reset email. Check the address.')
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#1C2B3A', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>🏡</div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 700, color: '#F7F3ED', marginBottom: 6 }}>Our Home</div>
          <div style={{ fontSize: 14, color: '#7A9E87' }}>Your home renovation planner</div>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 20, padding: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#F7F3ED', marginBottom: 20 }}>
            {mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Reset Password'}
          </div>

          {message && <div style={{ background: 'rgba(122,158,135,0.2)', border: '1px solid rgba(122,158,135,0.4)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, color: '#7A9E87', fontSize: 14 }}>{message}</div>}
          {error && <div style={{ background: 'rgba(196,113,74,0.2)', border: '1px solid rgba(196,113,74,0.4)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, color: '#F0A080', fontSize: 14 }}>{error}</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {mode === 'signup' && (
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name"
                style={{ ...iS, background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.15)', color: '#F7F3ED' }} />
            )}
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Email address" autoCapitalize="none"
              onKeyDown={e => e.key === 'Enter' && (mode === 'login' ? handleLogin() : mode === 'signup' ? handleSignup() : handleReset())}
              style={{ ...iS, background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.15)', color: '#F7F3ED' }} />
            {mode !== 'reset' && (
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Password (min 6 characters)' : 'Password'}
                onKeyDown={e => e.key === 'Enter' && (mode === 'login' ? handleLogin() : handleSignup())}
                style={{ ...iS, background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.15)', color: '#F7F3ED' }} />
            )}
            <button onClick={mode === 'login' ? handleLogin : mode === 'signup' ? handleSignup : handleReset}
              disabled={loading}
              style={{ ...bP, width: '100%', padding: 14, fontSize: 16, borderRadius: 12, opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Email'}
            </button>
          </div>

          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            {mode === 'login' && <>
              <button onClick={() => { setMode('signup'); setError('') }} style={{ background: 'none', border: 'none', color: '#7A9E87', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
                Don't have an account? <strong>Sign up</strong>
              </button>
              <button onClick={() => { setMode('reset'); setError('') }} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                Forgot password?
              </button>
            </>}
            {mode !== 'login' && (
              <button onClick={() => { setMode('login'); setError('') }} style={{ background: 'none', border: 'none', color: '#7A9E87', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
                ← Back to sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Onboarding — Create or Join a Home ───────────────────────
function OnboardingScreen({ user, onComplete }) {
  const [mode, setMode] = useState(null) // 'create' | 'join'
  const [homeName, setHomeName] = useState('')
  const [avatar, setAvatar] = useState('🏠')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const createHome = async () => {
    if (!homeName.trim()) { setError('Please enter a name for your home.'); return }
    setLoading(true); setError('')
    try {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase()
      const homeRef = doc(collection(db, 'homes'))
      await setDoc(homeRef, {
        name: homeName.trim(),
        createdBy: user.uid,
        members: [user.uid],
        memberEmails: [user.email],
        inviteCode: code,
        createdAt: serverTimestamp(),
      })
      await setDoc(doc(db, 'users', user.uid), {
        name: user.displayName || user.email,
        email: user.email,
        avatar,
        homeId: homeRef.id,
        color: '#C4714A',
        createdAt: serverTimestamp(),
      })
      onComplete()
    } catch (e) {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  const joinHome = async () => {
    if (!inviteCode.trim()) { setError('Enter an invite code.'); return }
    setLoading(true); setError('')
    try {
      const q = query(collection(db, 'homes'), where('inviteCode', '==', inviteCode.trim().toUpperCase()))
      const snap = await getDocs(q)
      if (snap.empty) { setError('Invite code not found. Check and try again.'); setLoading(false); return }
      const homeDoc = snap.docs[0]
      const homeData = homeDoc.data()
      if (homeData.members.includes(user.uid)) { setError('You are already a member of this home.'); setLoading(false); return }
      if (homeData.members.length >= 2) { setError('This home already has 2 members.'); setLoading(false); return }
      await updateDoc(doc(db, 'homes', homeDoc.id), {
        members: [...homeData.members, user.uid],
        memberEmails: [...(homeData.memberEmails || []), user.email],
      })
      await setDoc(doc(db, 'users', user.uid), {
        name: user.displayName || user.email,
        email: user.email,
        avatar,
        homeId: homeDoc.id,
        color: '#7A9E87',
        createdAt: serverTimestamp(),
      })
      onComplete()
    } catch (e) {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#1C2B3A', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>🏡</div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 700, color: '#F7F3ED', marginBottom: 6 }}>
            Welcome, {user.displayName?.split(' ')[0] || 'there'}!
          </div>
          <div style={{ fontSize: 14, color: '#7A9E87' }}>Set up your home to get started</div>
        </div>

        {!mode ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <button onClick={() => setMode('create')}
              style={{ padding: '20px', background: 'rgba(196,113,74,0.15)', border: '2px solid #C4714A',
                borderRadius: 16, color: '#F7F3ED', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🏠</div>
              <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Create a new home</div>
              <div style={{ fontSize: 13, color: '#9CA3AF' }}>Start fresh and invite your partner</div>
            </button>
            <button onClick={() => setMode('join')}
              style={{ padding: '20px', background: 'rgba(122,158,135,0.15)', border: '2px solid #7A9E87',
                borderRadius: 16, color: '#F7F3ED', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🔑</div>
              <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Join an existing home</div>
              <div style={{ fontSize: 13, color: '#9CA3AF' }}>Enter the invite code your partner shared</div>
            </button>
            <button onClick={() => signOut(auth)} style={{ ...bS, color: '#9CA3AF', borderColor: 'rgba(255,255,255,0.1)' }}>
              Sign out
            </button>
          </div>
        ) : (
          <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 20, padding: 24 }}>
            <button onClick={() => { setMode(null); setError('') }}
              style={{ background: 'none', border: 'none', color: '#7A9E87', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', marginBottom: 16, padding: 0 }}>
              ← Back
            </button>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#F7F3ED', marginBottom: 20 }}>
              {mode === 'create' ? 'Create Your Home' : 'Join a Home'}
            </div>

            {error && <div style={{ background: 'rgba(196,113,74,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, color: '#F0A080', fontSize: 14 }}>{error}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {mode === 'create' ? (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#9CA3AF', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Home Name</label>
                    <input value={homeName} onChange={e => setHomeName(e.target.value)} placeholder="e.g. The Bartlett Home"
                      style={{ ...iS, background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.15)', color: '#F7F3ED' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#9CA3AF', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Avatar</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                      {AVATARS.map(a => (
                        <button key={a} onClick={() => setAvatar(a)}
                          style={{ padding: '10px 0', borderRadius: 10, border: 'none', fontSize: 22, cursor: 'pointer',
                            background: avatar === a ? '#C4714A' : 'rgba(255,255,255,0.08)' }}>
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={createHome} disabled={loading} style={{ ...bP, width: '100%', padding: 14, fontSize: 16, borderRadius: 12 }}>
                    {loading ? 'Creating…' : 'Create Home'}
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#9CA3AF', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Invite Code</label>
                    <input value={inviteCode} onChange={e => setInviteCode(e.target.value)} placeholder="e.g. AB12CD"
                      style={{ ...iS, background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.15)', color: '#F7F3ED', textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: 18, textAlign: 'center' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#9CA3AF', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Avatar</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                      {AVATARS.map(a => (
                        <button key={a} onClick={() => setAvatar(a)}
                          style={{ padding: '10px 0', borderRadius: 10, border: 'none', fontSize: 22, cursor: 'pointer',
                            background: avatar === a ? '#7A9E87' : 'rgba(255,255,255,0.08)' }}>
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={joinHome} disabled={loading} style={{ ...bP, width: '100%', padding: 14, fontSize: 16, borderRadius: 12, background: '#7A9E87' }}>
                    {loading ? 'Joining…' : 'Join Home'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Mood Board ───────────────────────────────────────────────
function MoodBoard({ projectId, homeId, moodBoard, onMoodChange }) {
  const [adding, setAdding] = useState(null)
  const [form, setForm] = useState({ label: '', value: '#C4714A', url: '', text: '' })

  const addItem = () => {
    if (!form.label) return
    const item = { id: 'mb' + Date.now(), type: adding, label: form.label, value: form.value, url: form.url, text: form.text }
    onMoodChange([...moodBoard, item])
    setAdding(null)
    setForm({ label: '', value: '#C4714A', url: '', text: '' })
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[['color','🎨 Colour'],['link','📌 Pinterest'],['note','📝 Note']].map(([t, label]) => (
          <button key={t} onClick={() => setAdding(t)}
            style={{ padding: '8px 14px', border: '1.5px dashed #C4714A', borderRadius: 20, background: 'transparent', color: '#C4714A', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            + {label}
          </button>
        ))}
      </div>
      {adding && (
        <div style={{ background: '#FFF7F3', border: '1px solid #F0D5C8', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 15 }}>
            {adding === 'color' ? 'Add a Colour' : adding === 'link' ? 'Add a Pinterest Link' : 'Add a Note'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input placeholder="Label" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} style={iS} />
            {adding === 'color' && <input type="color" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} style={{ height: 48, border: '1px solid #E5E7EB', borderRadius: 8, cursor: 'pointer', width: 100 }} />}
            {adding === 'link' && <input placeholder="Pinterest URL" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} style={iS} />}
            {adding === 'note' && <textarea placeholder="Your note..." value={form.text} rows={3} onChange={e => setForm(f => ({ ...f, text: e.target.value }))} style={{ ...iS, resize: 'vertical' }} />}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={addItem} style={bP}>Add</button>
              <button onClick={() => setAdding(null)} style={bS}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px,1fr))', gap: 12 }}>
        {moodBoard.map(item => (
          <div key={item.id} style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #EDE8E1', position: 'relative' }}>
            <button onClick={() => onMoodChange(moodBoard.filter(i => i.id !== item.id))}
              style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.2)', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', color: '#fff', fontSize: 13, lineHeight: '22px', textAlign: 'center', zIndex: 2 }}>×</button>
            {item.type === 'color' && <><div style={{ height: 90, background: item.value }} /><div style={{ padding: '8px 10px' }}><div style={{ fontSize: 12, fontWeight: 600 }}>{item.label}</div><div style={{ fontSize: 10, color: '#9CA3AF', fontFamily: 'monospace' }}>{item.value}</div></div></>}
            {item.type === 'link' && <><div style={{ height: 70, background: 'linear-gradient(135deg,#E60023,#FF4757)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>📌</div><div style={{ padding: '8px 10px' }}><div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>{item.label}</div><a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#E60023', textDecoration: 'none', fontWeight: 600 }}>Open Pinterest →</a></div></>}
            {item.type === 'note' && <div style={{ padding: 12, background: '#FFFDF4', minHeight: 110, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}><div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{item.text}</div><div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', marginTop: 8, borderTop: '1px solid #EDE8E1', paddingTop: 6 }}>{item.label}</div></div>}
          </div>
        ))}
      </div>
      {moodBoard.length === 0 && <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9CA3AF' }}><div style={{ fontSize: 36, marginBottom: 8 }}>🖼</div><div style={{ fontWeight: 600 }}>Mood board is empty</div></div>}
    </div>
  )
}

// ─── Images Tab ───────────────────────────────────────────────
function ImagesTab({ projectId, homeId }) {
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)
  const fileRef = useRef(null)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'homes', homeId, 'projects', projectId, 'images'), snap => {
      setImages(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => !i.deleted))
      setLoading(false)
    })
    return unsub
  }, [projectId, homeId])

  const upload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = async () => {
      const canvas = document.createElement('canvas')
      const MAX = 800
      let w = img.width, h = img.height
      if (w > h && w > MAX) { h = (h * MAX) / w; w = MAX }
      else if (h > MAX) { w = (w * MAX) / h; h = MAX }
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      const compressed = canvas.toDataURL('image/jpeg', 0.7)
      URL.revokeObjectURL(objectUrl)
      await addDoc(collection(db, 'homes', homeId, 'projects', projectId, 'images'), { data: compressed, name: file.name, createdAt: serverTimestamp() })
    }
    img.src = objectUrl
    e.target.value = ''
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading…</div>

  return (
    <div style={{ padding: 16 }}>
      <input type="file" accept="image/*" ref={fileRef} onChange={upload} style={{ display: 'none' }} />
      <button onClick={() => fileRef.current.click()} style={{ ...bP, width: '100%', marginBottom: 16, padding: 14, borderRadius: 12, fontSize: 15 }}>📷 Add Photo</button>
      {images.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9CA3AF' }}><div style={{ fontSize: 40, marginBottom: 8 }}>📷</div><div style={{ fontWeight: 600 }}>No photos yet</div></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {images.map(img => (
            <div key={img.id} style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid #EDE8E1', aspectRatio: '1' }}>
              <img src={img.data} alt={img.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button onClick={() => deleteDoc(doc(db, 'homes', homeId, 'projects', projectId, 'images', img.id))}
                style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', width: 26, height: 26, cursor: 'pointer', color: '#fff', fontSize: 14, lineHeight: '26px', textAlign: 'center' }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Quotes Tab ───────────────────────────────────────────────
function QuotesTab({ projectId, homeId }) {
  const [quotes, setQuotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const emptyForm = { contractor: '', trade: '', contact: '', phone: '', email: '', amount: '', status: 'pending', notes: '' }
  const [form, setForm] = useState(emptyForm)

  const QUOTE_STATUSES = {
    'pending':  { label: 'Pending',  color: '#9CA3AF', bg: '#F3F4F6' },
    'received': { label: 'Received', color: '#7A9E87', bg: '#EDF4EF' },
    'accepted': { label: 'Accepted', color: '#4A7C6F', bg: '#E6F0EE' },
    'rejected': { label: 'Rejected', color: '#C4714A', bg: '#FAF0EB' },
  }

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'homes', homeId, 'projects', projectId, 'quotes'), orderBy('createdAt', 'asc')), snap => {
      setQuotes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return unsub
  }, [projectId, homeId])

  const save = async () => {
    if (!form.contractor) return
    const ref = editingId ? doc(db, 'homes', homeId, 'projects', projectId, 'quotes', editingId) : null
    if (editingId) await updateDoc(ref, { ...form })
    else await addDoc(collection(db, 'homes', homeId, 'projects', projectId, 'quotes'), { ...form, createdAt: serverTimestamp() })
    setForm(emptyForm); setShowForm(false); setEditingId(null)
  }

  const startEdit = (q) => { setForm({ contractor: q.contractor||'', trade: q.trade||'', contact: q.contact||'', phone: q.phone||'', email: q.email||'', amount: q.amount||'', status: q.status||'pending', notes: q.notes||'' }); setEditingId(q.id); setShowForm(true) }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading…</div>

  return (
    <div style={{ padding: 16 }}>
      {!showForm && <button onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm) }} style={{ ...bP, width: '100%', marginBottom: 16, padding: 14, borderRadius: 12, fontSize: 15 }}>+ Add Quote / Contractor</button>}
      {showForm && (
        <div style={{ background: '#FFF7F3', border: '1px solid #F0D5C8', borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>{editingId ? 'Edit Quote' : 'New Quote / Contractor'}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[['contractor','Company / Contractor *','e.g. Riverside Kitchens'],['trade','Trade / Service','e.g. Kitchen fitting'],['contact','Contact Name','e.g. John Smith'],['phone','Phone','e.g. 07700 900000'],['email','Email','e.g. john@company.com'],['amount','Quote Amount (£)','e.g. 4500']].map(([key, label, ph]) => (
              <div key={key}><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 4 }}>{label}</label><input placeholder={ph} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} style={iS} /></div>
            ))}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 6 }}>Status</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Object.entries(QUOTE_STATUSES).map(([key, cfg]) => (
                  <button key={key} onClick={() => setForm(p => ({ ...p, status: key }))}
                    style={{ padding: '6px 14px', borderRadius: 99, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, fontFamily: 'inherit', background: form.status === key ? cfg.color : '#F3F4F6', color: form.status === key ? '#fff' : '#6B7280' }}>
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>
            <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 4 }}>Notes</label><textarea placeholder="Additional notes..." value={form.notes} rows={3} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} style={{ ...iS, resize: 'vertical' }} /></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={save} style={{ ...bP, flex: 1 }}>{editingId ? 'Save' : 'Add Quote'}</button>
              <button onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm) }} style={bS}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {quotes.length === 0 && !showForm ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9CA3AF' }}><div style={{ fontSize: 36, marginBottom: 8 }}>📋</div><div style={{ fontWeight: 600 }}>No quotes yet</div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {quotes.map(q => {
            const st = QUOTE_STATUSES[q.status] || QUOTE_STATUSES['pending']
            return (
              <div key={q.id} style={{ ...crd }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div><div style={{ fontWeight: 700, fontSize: 16 }}>{q.contractor}</div>{q.trade && <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>{q.trade}</div>}</div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99, color: st.color, background: st.bg, textTransform: 'uppercase' }}>{st.label}</span>
                </div>
                {q.amount && <div style={{ fontSize: 22, fontWeight: 800, color: '#1C2B3A', fontFamily: "'Playfair Display', serif", marginBottom: 10 }}>£{Number(q.amount).toLocaleString('en-GB')}</div>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
                  {q.contact && <div style={{ fontSize: 13, color: '#374151' }}>👤 {q.contact}</div>}
                  {q.phone && <a href={`tel:${q.phone}`} style={{ fontSize: 13, color: '#C4714A', textDecoration: 'none', fontWeight: 600 }}>📞 {q.phone}</a>}
                  {q.email && <a href={`mailto:${q.email}`} style={{ fontSize: 13, color: '#C4714A', textDecoration: 'none', fontWeight: 600 }}>✉️ {q.email}</a>}
                  {q.notes && <div style={{ fontSize: 13, color: '#6B7280', padding: '8px 10px', background: '#F9FAFB', borderRadius: 8, lineHeight: 1.5 }}>{q.notes}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8, borderTop: '1px solid #F3F4F6', paddingTop: 10 }}>
                  <button onClick={() => startEdit(q)} style={{ ...bS, fontSize: 13, padding: '6px 14px' }}>Edit</button>
                  <button onClick={() => { if (window.confirm('Delete this quote?')) deleteDoc(doc(db, 'homes', homeId, 'projects', projectId, 'quotes', q.id)) }}
                    style={{ fontSize: 13, padding: '6px 14px', background: 'transparent', color: '#C4714A', border: '1px solid #F0D5C8', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Discussion ───────────────────────────────────────────────
function Discussion({ projectId, homeId, currentUser }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef(null)

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'homes', homeId, 'projects', projectId, 'messages'), orderBy('createdAt', 'asc')), snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return unsub
  }, [projectId, homeId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async () => {
    if (!text.trim()) return
    const msg = text.trim(); setText('')
    await addDoc(collection(db, 'homes', homeId, 'projects', projectId, 'messages'), {
      author: currentUser.name, avatar: currentUser.avatar, color: currentUser.color,
      text: msg, createdAt: serverTimestamp(),
    })
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9CA3AF' }}><div style={{ fontSize: 32, marginBottom: 8 }}>💬</div><div style={{ fontWeight: 600 }}>No messages yet</div></div>
        ) : messages.map(msg => {
          const isMe = msg.author === currentUser.name
          const bubbleColor = msg.color || (isMe ? '#C4714A' : '#7A9E87')
          return (
            <div key={msg.id} style={{ display: 'flex', gap: 8, marginBottom: 14, flexDirection: isMe ? 'row-reverse' : 'row' }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: bubbleColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, flexShrink: 0 }}>{msg.avatar}</div>
              <div style={{ maxWidth: '75%' }}>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 3, textAlign: isMe ? 'right' : 'left', fontWeight: 600 }}>{msg.author} · {timeAgo(msg.createdAt)}</div>
                <div style={{ background: isMe ? bubbleColor : '#fff', color: isMe ? '#fff' : '#1C2B3A', padding: '10px 13px', borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px', fontSize: 15, lineHeight: 1.5, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: isMe ? 'none' : '1px solid #EDE8E1' }}>{msg.text}</div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      <div style={{ borderTop: '1px solid #EDE8E1', padding: '12px 16px', display: 'flex', gap: 8, background: '#fff', paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <textarea value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }}}
          placeholder={`Message as ${currentUser.name}…`} rows={1}
          style={{ flex: 1, padding: '10px 14px', border: '1.5px solid #E5E7EB', borderRadius: 20, fontSize: 15, resize: 'none', outline: 'none', fontFamily: 'inherit', background: '#FAFAFA' }} />
        <button onClick={send} style={{ ...bP, borderRadius: 20, padding: '10px 18px' }}>Send</button>
      </div>
    </div>
  )
}

// ─── Project Detail ───────────────────────────────────────────
function ProjectDetail({ project, homeId, currentUser, onBack, onDelete, onArchive }) {
  const [tab, setTab] = useState('overview')
  const [showMenu, setShowMenu] = useState(false)
  const [editingStatus, setEditingStatus] = useState(false)
  const [editingBudget, setEditingBudget] = useState(false)
  const [editingSpent, setEditingSpent] = useState(false)
  const [budgetInput, setBudgetInput] = useState(project.costEstimate || 0)
  const [spentInput, setSpentInput] = useState(project.costSpent || 0)
  const isOwner = currentUser.uid === project.createdBy

  const updateField = async (fields) => await updateDoc(doc(db, 'homes', homeId, 'projects', project.id), fields)
  const updateStatus = async (status) => { await updateField({ status }); setEditingStatus(false) }
  const saveBudget = async () => { await updateField({ costEstimate: Number(budgetInput) }); setEditingBudget(false) }
  const saveSpent = async () => { await updateField({ costSpent: Number(spentInput) }); setEditingSpent(false) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F7F3ED' }}>
      <div style={{ background: '#1C2B3A', padding: '16px 16px 0', paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#7A9E87', fontWeight: 600, cursor: 'pointer', fontSize: 14, padding: '0 0 12px' }}>← Back</button>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowMenu(m => !m)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 22, padding: '0 0 12px', lineHeight: 1 }}>⋯</button>
            {showMenu && (
              <div style={{ position: 'absolute', right: 0, top: '100%', background: '#fff', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', overflow: 'hidden', minWidth: 180, zIndex: 100 }}>
                <button onClick={() => { onArchive(project.id); setShowMenu(false) }} style={{ display: 'block', width: '100%', padding: '14px 18px', border: 'none', background: 'none', textAlign: 'left', fontSize: 15, cursor: 'pointer', color: '#374151', fontFamily: 'inherit' }}>📦 Archive Project</button>
                <div style={{ height: 1, background: '#F3F4F6' }} />
                <button onClick={() => { if (window.confirm('Permanently delete this project?')) { onDelete(project.id); setShowMenu(false) } }} style={{ display: 'block', width: '100%', padding: '14px 18px', border: 'none', background: 'none', textAlign: 'left', fontSize: 15, cursor: 'pointer', color: '#C4714A', fontFamily: 'inherit' }}>🗑 Delete Project</button>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 26 }}>{project.emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: '#F7F3ED', marginBottom: 6 }}>{project.name}</div>
            {editingStatus ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <button key={key} onClick={() => updateStatus(key)} style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 99, border: '1.5px solid ' + cfg.color, color: cfg.color, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>{cfg.label}</button>
                ))}
                <button onClick={() => setEditingStatus(false)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 99, border: '1px solid #555', background: 'transparent', cursor: 'pointer', color: '#aaa', fontFamily: 'inherit' }}>✕</button>
              </div>
            ) : (
              <button onClick={() => setEditingStatus(true)} style={{ all: 'unset', cursor: 'pointer' }}><StatusBadge status={project.status} /></button>
            )}
          </div>
        </div>
        <div style={{ display: 'flex' }}>
          {[['overview','Overview'],['discussion','Chat'],['moodboard','Mood Board'],['images','Photos'],['quotes','Quotes']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ flex: 1, padding: '10px 0', border: 'none', fontFamily: 'inherit', borderBottom: tab === id ? '2.5px solid #C4714A' : '2.5px solid transparent', background: 'none', cursor: 'pointer', fontSize: 11, fontWeight: tab === id ? 700 : 500, color: tab === id ? '#C4714A' : 'rgba(255,255,255,0.45)' }}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {tab === 'overview' && (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={crd}><div style={sL}>Description</div><p style={{ margin: 0, color: '#374151', lineHeight: 1.6, fontSize: 15 }}>{project.description}</p></div>
            <div style={crd}>
              <div style={sL}>Budget</div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>Total Budget Allocated</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: '#1C2B3A', fontFamily: "'Playfair Display', serif" }}>{fmt(project.costEstimate)}</div>
                  {isOwner && !editingBudget && <button onClick={() => { setEditingBudget(true); setBudgetInput(project.costEstimate || 0) }} style={{ fontSize: 12, color: '#7A9E87', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}>Edit</button>}
                </div>
                {editingBudget && isOwner && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                    <input type="number" value={budgetInput} onChange={e => setBudgetInput(e.target.value)} style={{ ...iS, width: 130 }} />
                    <button onClick={saveBudget} style={bP}>Save</button>
                    <button onClick={() => setEditingBudget(false)} style={bS}>✕</button>
                  </div>
                )}
                {!isOwner && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>Only the project creator can edit the budget</div>}
              </div>
              <ProgressBar spent={project.costSpent || 0} estimate={project.costEstimate} />
              <button onClick={() => { setEditingSpent(true); setSpentInput(project.costSpent || 0) }} style={{ marginTop: 10, fontSize: 13, color: '#7A9E87', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}>Update amount spent →</button>
              {editingSpent && (
                <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                  <input type="number" value={spentInput} onChange={e => setSpentInput(e.target.value)} style={{ ...iS, width: 130 }} />
                  <button onClick={saveSpent} style={bP}>Save</button>
                  <button onClick={() => setEditingSpent(false)} style={bS}>✕</button>
                </div>
              )}
            </div>
            <div style={crd}><div style={sL}>Timeline</div><div style={{ fontSize: 14, color: '#374151', marginBottom: 6 }}>🟢 Start: <strong>{project.startDate}</strong></div><div style={{ fontSize: 14, color: '#374151' }}>🏁 Target: <strong>{project.endDate}</strong></div></div>
          </div>
        )}
        {tab === 'discussion' && <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}><Discussion projectId={project.id} homeId={homeId} currentUser={currentUser} /></div>}
        {tab === 'moodboard' && <MoodBoard projectId={project.id} homeId={homeId} moodBoard={project.moodBoard || []} onMoodChange={(mb) => updateDoc(doc(db, 'homes', homeId, 'projects', project.id), { moodBoard: mb })} />}
        {tab === 'images' && <ImagesTab projectId={project.id} homeId={homeId} />}
        {tab === 'quotes' && <QuotesTab projectId={project.id} homeId={homeId} />}
      </div>
    </div>
  )
}

// ─── Account Settings ─────────────────────────────────────────
function AccountSettings({ userProfile, homeData, onBack, onUpdate }) {
  const [name, setName] = useState(userProfile.name || '')
  const [avatar, setAvatar] = useState(userProfile.avatar || '🏠')
  const [saved, setSaved] = useState('')
  const [showInvite, setShowInvite] = useState(false)

  const saveName = async () => {
    if (!name.trim()) return
    await updateDoc(doc(db, 'users', userProfile.uid), { name: name.trim() })
    await updateProfile(auth.currentUser, { displayName: name.trim() })
    onUpdate({ ...userProfile, name: name.trim() })
    setSaved('Name updated!'); setTimeout(() => setSaved(''), 2000)
  }

  const saveAvatar = async (a) => {
    setAvatar(a)
    await updateDoc(doc(db, 'users', userProfile.uid), { avatar: a })
    onUpdate({ ...userProfile, avatar: a })
    setSaved('Avatar updated!'); setTimeout(() => setSaved(''), 2000)
  }

  const copyInviteCode = () => {
    navigator.clipboard?.writeText(homeData?.inviteCode || '').catch(() => {})
    setSaved('Invite code copied!'); setTimeout(() => setSaved(''), 2000)
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', system-ui, sans-serif", background: '#F7F3ED' }}>
      <div style={{ background: '#1C2B3A', padding: '16px', paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#7A9E87', fontWeight: 600, cursor: 'pointer', fontSize: 14, padding: '0 0 12px', display: 'block' }}>← Back</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: userProfile.color || '#C4714A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 24 }}>{avatar}</div>
          <div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: '#F7F3ED' }}>Account Settings</div>
            <div style={{ fontSize: 13, color: '#7A9E87', marginTop: 2 }}>{userProfile.email}</div>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {saved && <div style={{ background: '#EDF4EF', border: '1px solid #7A9E87', borderRadius: 10, padding: '10px 14px', color: '#4A7C6F', fontWeight: 600, fontSize: 14, textAlign: 'center' }}>✓ {saved}</div>}

        <div style={crd}>
          <div style={sL}>Change Name</div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" style={{ ...iS, marginBottom: 10 }} />
          <button onClick={saveName} style={{ ...bP, width: '100%' }}>Save Name</button>
        </div>

        <div style={crd}>
          <div style={sL}>Change Avatar</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
            {AVATARS.map(a => (
              <button key={a} onClick={() => saveAvatar(a)}
                style={{ width: '100%', aspectRatio: '1', borderRadius: 12, border: 'none', background: avatar === a ? (userProfile.color || '#C4714A') : '#F3F4F6', fontSize: 22, cursor: 'pointer', boxShadow: avatar === a ? '0 2px 8px rgba(0,0,0,0.15)' : 'none' }}>
                {a}
              </button>
            ))}
          </div>
        </div>

        {homeData && (
          <div style={crd}>
            <div style={sL}>Invite Your Partner</div>
            <div style={{ fontSize: 14, color: '#6B7280', marginBottom: 12 }}>Share this code with your partner so they can join your home:</div>
            <div style={{ background: '#1C2B3A', borderRadius: 12, padding: '16px', textAlign: 'center', marginBottom: 12 }}>
              <div style={{ fontFamily: 'monospace', fontSize: 28, fontWeight: 800, color: '#C4714A', letterSpacing: '0.2em' }}>{homeData.inviteCode}</div>
            </div>
            <button onClick={copyInviteCode} style={{ ...bP, width: '100%' }}>📋 Copy Invite Code</button>
            <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 10, textAlign: 'center' }}>
              {homeData.members?.length === 1 ? 'Waiting for partner to join…' : '✓ Partner has joined your home'}
            </div>
          </div>
        )}

        <button onClick={() => signOut(auth)} style={{ ...bS, width: '100%', color: '#C4714A', borderColor: '#F0D5C8' }}>Sign Out</button>
      </div>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────
export default function App() {
  const [authUser, setAuthUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [userProfile, setUserProfile] = useState(null)
  const [homeData, setHomeData] = useState(null)
  const [projects, setProjects] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [showAccount, setShowAccount] = useState(false)
  const [newP, setNewP] = useState({ name: '', room: '', emoji: '🏠', costEstimate: '', startDate: '', endDate: '', description: '' })

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setAuthUser(user)
      setAuthLoading(false)
    })
    return unsub
  }, [])

  // Load user profile
  useEffect(() => {
    if (!authUser) { setUserProfile(null); setHomeData(null); return }
    const unsub = onSnapshot(doc(db, 'users', authUser.uid), snap => {
      if (snap.exists()) setUserProfile({ uid: authUser.uid, email: authUser.email, ...snap.data() })
      else setUserProfile(null)
    })
    return unsub
  }, [authUser])

  // Load home data
  useEffect(() => {
    if (!userProfile?.homeId) { setHomeData(null); return }
    const unsub = onSnapshot(doc(db, 'homes', userProfile.homeId), snap => {
      if (snap.exists()) setHomeData({ id: snap.id, ...snap.data() })
    })
    return unsub
  }, [userProfile?.homeId])

  // Load projects
  useEffect(() => {
    if (!userProfile?.homeId) { setProjects([]); return }
    const unsub = onSnapshot(collection(db, 'homes', userProfile.homeId, 'projects'), snap => {
      setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [userProfile?.homeId])

  const activeProjects = projects.filter(p => !p.archived)
  const archivedProjects = projects.filter(p => p.archived)
  const totalBudget = activeProjects.reduce((s, p) => s + (p.costEstimate || 0), 0)
  const totalSpent = activeProjects.reduce((s, p) => s + (p.costSpent || 0), 0)
  const inProgress = activeProjects.filter(p => p.status === 'in-progress').length
  const selected = projects.find(p => p.id === selectedId)

  const createProject = async () => {
    if (!newP.name || !userProfile?.homeId) return
    const ref = doc(collection(db, 'homes', userProfile.homeId, 'projects'))
    await setDoc(ref, { ...newP, costEstimate: Number(newP.costEstimate) || 0, costSpent: 0, status: 'planning', moodBoard: [], createdBy: authUser.uid, createdAt: serverTimestamp() })
    setNewP({ name: '', room: '', emoji: '🏠', costEstimate: '', startDate: '', endDate: '', description: '' })
    setShowNew(false)
    setSelectedId(ref.id)
  }

  const handleDelete = async (id) => {
    await deleteDoc(doc(db, 'homes', userProfile.homeId, 'projects', id))
    setSelectedId(null)
  }

  const handleArchive = async (id) => {
    await updateDoc(doc(db, 'homes', userProfile.homeId, 'projects', id), { archived: true })
    setSelectedId(null)
  }

  // Loading
  if (authLoading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, background: '#1C2B3A', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, color: '#F7F3ED' }}>Our Home 🏡</div>
      <div style={{ color: '#7A9E87', fontSize: 14 }}>Loading…</div>
    </div>
  )

  // Not logged in
  if (!authUser) return <AuthScreen />

  // Logged in but no home yet
  if (!userProfile?.homeId) return <OnboardingScreen user={authUser} onComplete={() => {}} />

  // Account settings
  if (showAccount) return <AccountSettings userProfile={userProfile} homeData={homeData} onBack={() => setShowAccount(false)} onUpdate={setUserProfile} />

  // Project detail
  if (selected) return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <ProjectDetail project={selected} homeId={userProfile.homeId} currentUser={userProfile} onBack={() => setSelectedId(null)} onDelete={handleDelete} onArchive={handleArchive} />
    </div>
  )

  // New project form
  if (showNew) return (
    <div style={{ height: '100vh', overflowY: 'auto', background: '#F7F3ED', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ background: '#1C2B3A', padding: '16px', paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
        <button onClick={() => setShowNew(false)} style={{ background: 'none', border: 'none', color: '#7A9E87', fontWeight: 600, cursor: 'pointer', fontSize: 14, padding: 0 }}>← Back</button>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: '#F7F3ED', marginTop: 8 }}>New Project</div>
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {[['Project Name','name','e.g. Living Room Repaint'],['Room / Area','room','e.g. Living Room'],['Emoji','emoji','🏠'],['Budget Estimate (£)','costEstimate','5000','number'],['Start Date','startDate','','date'],['End Date','endDate','','date']].map(([label, key, ph, type]) => (
          <div key={key}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5, color: '#374151' }}>{label}</label>
            <input type={type || 'text'} placeholder={ph} value={newP[key]} onChange={e => setNewP(p => ({ ...p, [key]: e.target.value }))} style={{ ...iS, fontSize: 16 }} />
          </div>
        ))}
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5, color: '#374151' }}>Description</label>
          <textarea placeholder="Describe the project..." value={newP.description} rows={3} onChange={e => setNewP(p => ({ ...p, description: e.target.value }))} style={{ ...iS, resize: 'vertical', fontSize: 16 }} />
        </div>
        <button onClick={createProject} style={{ ...bP, padding: 14, fontSize: 16, borderRadius: 12, width: '100%' }}>Create Project</button>
      </div>
    </div>
  )

  // Home screen
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', system-ui, sans-serif", background: '#F7F3ED' }}>
      <div style={{ background: '#1C2B3A', padding: '16px', paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: '#F7F3ED' }}>{homeData?.name || 'Our Home'} 🏡</div>
            <div style={{ fontSize: 12, color: '#7A9E87', marginTop: 2 }}>
              {homeData?.members?.length === 1 ? 'Waiting for partner to join' : 'Home shared'}
            </div>
          </div>
          <button onClick={() => setShowAccount(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 20, padding: '6px 12px 6px 6px', cursor: 'pointer' }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: userProfile?.color || '#C4714A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16 }}>{userProfile?.avatar || '🏠'}</div>
            <span style={{ color: '#F7F3ED', fontWeight: 600, fontSize: 14 }}>{userProfile?.name?.split(' ')[0]}</span>
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          {[['Budget', fmt(totalBudget)],['Spent', fmt(totalSpent)],['Active', inProgress],['Total', activeProjects.length]].map(([label, value]) => (
            <div key={label} style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#F7F3ED' }}>{value}</div>
              <div style={{ fontSize: 10, color: '#7A9E87', marginTop: 1 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Projects</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {activeProjects.map(p => (
            <div key={p.id} onClick={() => setSelectedId(p.id)}
              style={{ background: '#fff', borderRadius: 16, padding: 16, cursor: 'pointer', boxShadow: '0 1px 6px rgba(0,0,0,0.07)', border: '1px solid #EDE8E1' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 24 }}>{p.emoji}</span>
                  <div>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 700, color: '#1C2B3A' }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: '#9CA3AF' }}>{p.room}</div>
                  </div>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <ProgressBar spent={p.costSpent || 0} estimate={p.costEstimate} />
              <div style={{ marginTop: 8, fontSize: 12, color: '#9CA3AF' }}>🎨 {(p.moodBoard || []).length} mood items</div>
            </div>
          ))}
          <div onClick={() => setShowNew(true)}
            style={{ background: 'transparent', border: '2px dashed #C4714A', borderRadius: 16, padding: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C4714A', fontWeight: 700, fontSize: 15 }}>
            + Add Project
          </div>
        </div>

        {archivedProjects.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>📦 Archived ({archivedProjects.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {archivedProjects.map(p => (
                <div key={p.id} onClick={() => setSelectedId(p.id)}
                  style={{ background: '#fff', borderRadius: 14, padding: '12px 16px', cursor: 'pointer', border: '1px solid #EDE8E1', opacity: 0.7, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 20 }}>{p.emoji}</span>
                    <div><div style={{ fontSize: 14, fontWeight: 600, color: '#6B7280' }}>{p.name}</div><div style={{ fontSize: 11, color: '#9CA3AF' }}>{p.room}</div></div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); updateDoc(doc(db, 'homes', userProfile.homeId, 'projects', p.id), { archived: false }) }}
                    style={{ fontSize: 11, color: '#7A9E87', background: '#EDF4EF', border: 'none', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>
                    Restore
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
