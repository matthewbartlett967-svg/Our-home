import { useState, useEffect, useRef } from 'react'
import {
  collection, doc, onSnapshot, setDoc, updateDoc, addDoc,
  serverTimestamp, query, orderBy, getDoc
} from 'firebase/firestore'
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from 'firebase/auth'
import { db } from './firebase.js'

const auth = getAuth()

// Known users — matched by email after login
const USER_PROFILES = {
  'matt@ourhome.com':  { name: 'Matt', avatar: 'M', color: '#C4714A' },
  'tara@ourhome.com':  { name: 'Tara', avatar: 'T', color: '#7A9E87' },
}

const STATUS_CONFIG = {
  'not-started': { label: 'Not Started', color: '#9CA3AF', bg: '#F3F4F6' },
  'planning':    { label: 'Planning',    color: '#7A9E87', bg: '#EDF4EF' },
  'in-progress': { label: 'In Progress', color: '#C4714A', bg: '#FAF0EB' },
  'complete':    { label: 'Complete',    color: '#4A7C6F', bg: '#E6F0EE' },
}

const SEED_PROJECTS = [
  {
    id: 'kitchen', name: 'Kitchen Renovation', room: 'Kitchen', emoji: '🍳',
    status: 'in-progress', costEstimate: 12500, costSpent: 3200,
    startDate: '2026-05-01', endDate: '2026-08-15',
    description: 'Full kitchen remodel including new cabinets, countertops, and appliances.',
    moodBoard: [
      { id: 'mb1', type: 'color', value: '#E8DDD0', label: 'Cabinet tone' },
      { id: 'mb2', type: 'color', value: '#2C2C2C', label: 'Hardware' },
      { id: 'mb3', type: 'link', url: 'https://pinterest.com/search/pins/?q=modern+farmhouse+kitchen', label: 'Farmhouse inspo' },
      { id: 'mb4', type: 'note', text: 'Shaker-style doors, brushed brass handles, open shelving on one wall', label: 'Style note' },
    ],
  },
  {
    id: 'bedroom', name: 'Master Bedroom Refresh', room: 'Bedroom', emoji: '🛏',
    status: 'planning', costEstimate: 3800, costSpent: 0,
    startDate: '2026-09-01', endDate: '2026-10-15',
    description: 'New paint, lighting upgrade, built-in wardrobe and styling.',
    moodBoard: [
      { id: 'mb1', type: 'color', value: '#5C6E6E', label: 'Feature wall' },
      { id: 'mb2', type: 'link', url: 'https://pinterest.com/search/pins/?q=moody+bedroom+green+dark', label: 'Dark bedroom inspo' },
      { id: 'mb3', type: 'note', text: "Farrow & Ball 'Mizzle' or 'Calke Green' for the accent wall", label: 'Paint shortlist' },
    ],
  },
  {
    id: 'deck', name: 'Backyard Deck', room: 'Garden', emoji: '🌿',
    status: 'not-started', costEstimate: 18000, costSpent: 0,
    startDate: '2026-11-01', endDate: '2027-02-28',
    description: 'Timber deck with built-in seating, outdoor lighting, and garden beds.',
    moodBoard: [
      { id: 'mb1', type: 'color', value: '#8B6F47', label: 'Timber stain' },
      { id: 'mb2', type: 'link', url: 'https://pinterest.com/search/pins/?q=timber+deck+outdoor+lighting', label: 'Deck ideas' },
      { id: 'mb3', type: 'note', text: 'Get at least 3 quotes. Check council regulations for deck height.', label: 'To-do' },
    ],
  },
]

function fmt(n) { return '$' + (n || 0).toLocaleString() }

function timeAgo(ts) {
  if (!ts) return 'Just now'
  const secs = Math.floor((Date.now() - ts.toMillis()) / 1000)
  if (secs < 60) return 'Just now'
  if (secs < 3600) return Math.floor(secs / 60) + 'm ago'
  if (secs < 86400) return Math.floor(secs / 3600) + 'h ago'
  return Math.floor(secs / 86400) + 'd ago'
}

function StatusBadge({ status }) {
  const c = STATUS_CONFIG[status] || STATUS_CONFIG['not-started']
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
      color: c.color, background: c.bg, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
      {c.label}
    </span>
  )
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
        <div style={{ height: '100%', width: pct + '%', background: over ? '#C4714A' : '#7A9E87',
          borderRadius: 99, transition: 'width 0.4s' }} />
      </div>
    </div>
  )
}

// ─── Login Screen ─────────────────────────────────────────────
function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const login = async () => {
    if (!email || !password) return
    setLoading(true)
    setError('')
    try {
      await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password)
    } catch (e) {
      setError('Incorrect email or password. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#1C2B3A', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏡</div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 700,
            color: '#F7F3ED', marginBottom: 6 }}>Our Home</div>
          <div style={{ fontSize: 14, color: '#7A9E87' }}>Matt & Tara's project planner</div>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 20, padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#9CA3AF',
              marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@email.com" autoCapitalize="none"
              onKeyDown={e => e.key === 'Enter' && login()}
              style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '1.5px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.08)', color: '#F7F3ED', fontSize: 16,
                outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#9CA3AF',
              marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" onKeyDown={e => e.key === 'Enter' && login()}
              style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '1.5px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.08)', color: '#F7F3ED', fontSize: 16,
                outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>

          {error && (
            <div style={{ background: 'rgba(196,113,74,0.2)', border: '1px solid rgba(196,113,74,0.4)',
              borderRadius: 10, padding: '10px 14px', marginBottom: 16, color: '#F0A080', fontSize: 14 }}>
              {error}
            </div>
          )}

          <button onClick={login} disabled={loading}
            style={{ width: '100%', padding: '14px', background: '#C4714A', color: '#fff',
              border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 16, cursor: 'pointer',
              opacity: loading ? 0.7 : 1, fontFamily: 'inherit' }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Mood Board ───────────────────────────────────────────────
function MoodBoard({ moodBoard, onMoodChange }) {
  const [adding, setAdding] = useState(null)
  const [form, setForm] = useState({ label: '', value: '#C4714A', url: '', text: '' })

  const addItem = () => {
    if (!form.label) return
    const item = { id: 'mb' + Date.now(), type: adding, label: form.label,
      value: form.value, url: form.url, text: form.text }
    onMoodChange([...moodBoard, item])
    setAdding(null)
    setForm({ label: '', value: '#C4714A', url: '', text: '' })
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[['color','🎨 Colour'],['link','📌 Pinterest'],['note','📝 Note']].map(([t, label]) => (
          <button key={t} onClick={() => setAdding(t)}
            style={{ padding: '8px 14px', border: '1.5px dashed #C4714A', borderRadius: 20,
              background: 'transparent', color: '#C4714A', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
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
            {adding === 'color' && <input type="color" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
              style={{ height: 48, border: '1px solid #E5E7EB', borderRadius: 8, cursor: 'pointer', width: 100 }} />}
            {adding === 'link' && <input placeholder="Pinterest URL" value={form.url}
              onChange={e => setForm(f => ({ ...f, url: e.target.value }))} style={iS} />}
            {adding === 'note' && <textarea placeholder="Your note..." value={form.text} rows={3}
              onChange={e => setForm(f => ({ ...f, text: e.target.value }))} style={{ ...iS, resize: 'vertical' }} />}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={addItem} style={bP}>Add</button>
              <button onClick={() => setAdding(null)} style={bS}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px,1fr))', gap: 12 }}>
        {moodBoard.map(item => (
          <div key={item.id} style={{ background: '#fff', borderRadius: 12, overflow: 'hidden',
            border: '1px solid #EDE8E1', position: 'relative' }}>
            <button onClick={() => onMoodChange(moodBoard.filter(i => i.id !== item.id))}
              style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.2)', border: 'none',
                borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', color: '#fff',
                fontSize: 13, lineHeight: '22px', textAlign: 'center', zIndex: 2 }}>×</button>
            {item.type === 'color' && <>
              <div style={{ height: 90, background: item.value }} />
              <div style={{ padding: '8px 10px' }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{item.label}</div>
                <div style={{ fontSize: 10, color: '#9CA3AF', fontFamily: 'monospace' }}>{item.value}</div>
              </div>
            </>}
            {item.type === 'link' && <>
              <div style={{ height: 70, background: 'linear-gradient(135deg,#E60023,#FF4757)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>📌</div>
              <div style={{ padding: '8px 10px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>{item.label}</div>
                <a href={item.url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 11, color: '#E60023', textDecoration: 'none', fontWeight: 600 }}>Open Pinterest →</a>
              </div>
            </>}
            {item.type === 'note' && (
              <div style={{ padding: 12, background: '#FFFDF4', minHeight: 110,
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{item.text}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', marginTop: 8,
                  borderTop: '1px solid #EDE8E1', paddingTop: 6 }}>{item.label}</div>
              </div>
            )}
          </div>
        ))}
      </div>
      {moodBoard.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9CA3AF' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🖼</div>
          <div style={{ fontWeight: 600 }}>Mood board is empty</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Add colours, Pinterest links, and notes above.</div>
        </div>
      )}
    </div>
  )
}

// ─── Discussion ───────────────────────────────────────────────
function Discussion({ projectId, currentUser }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef(null)

  useEffect(() => {
    const q = query(collection(db, 'projects', projectId, 'messages'), orderBy('createdAt', 'asc'))
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return unsub
  }, [projectId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async () => {
    if (!text.trim()) return
    const msg = text.trim(); setText('')
    await addDoc(collection(db, 'projects', projectId, 'messages'), {
      author: currentUser.name,
      avatar: currentUser.avatar,
      color: currentUser.color,
      text: msg,
      createdAt: serverTimestamp(),
    })
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9CA3AF' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
            <div style={{ fontWeight: 600 }}>No messages yet</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Start the conversation!</div>
          </div>
        ) : messages.map(msg => {
          const isMe = msg.author === currentUser.name
          const bubbleColor = msg.color || (isMe ? '#C4714A' : '#7A9E87')
          return (
            <div key={msg.id} style={{ display: 'flex', gap: 8, marginBottom: 14,
              flexDirection: isMe ? 'row-reverse' : 'row' }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: bubbleColor,
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                {msg.avatar}
              </div>
              <div style={{ maxWidth: '75%' }}>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 3,
                  textAlign: isMe ? 'right' : 'left', fontWeight: 600 }}>
                  {msg.author} · {timeAgo(msg.createdAt)}
                </div>
                <div style={{ background: isMe ? bubbleColor : '#fff',
                  color: isMe ? '#fff' : '#1C2B3A', padding: '10px 13px',
                  borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  fontSize: 15, lineHeight: 1.5, boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  border: isMe ? 'none' : '1px solid #EDE8E1' }}>
                  {msg.text}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      <div style={{ borderTop: '1px solid #EDE8E1', padding: '12px 16px', display: 'flex', gap: 8,
        background: '#fff', paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <textarea value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }}}
          placeholder={`Message as ${currentUser.name}…`} rows={1}
          style={{ flex: 1, padding: '10px 14px', border: '1.5px solid #E5E7EB', borderRadius: 20,
            fontSize: 15, resize: 'none', outline: 'none', fontFamily: 'inherit', background: '#FAFAFA' }} />
        <button onClick={send} style={{ ...bP, borderRadius: 20, padding: '10px 18px' }}>Send</button>
      </div>
    </div>
  )
}

// ─── Project Detail ───────────────────────────────────────────
function ProjectDetail({ project, currentUser, onBack }) {
  const [tab, setTab] = useState('overview')
  const [editingStatus, setEditingStatus] = useState(false)
  const [editingCost, setEditingCost] = useState(false)
  const [costInput, setCostInput] = useState(project.costSpent || 0)

  const updateField = async (fields) => { await updateDoc(doc(db, 'projects', project.id), fields) }
  const updateStatus = async (status) => { await updateField({ status }); setEditingStatus(false) }
  const saveCost = async () => { await updateField({ costSpent: Number(costInput) }); setEditingCost(false) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F7F3ED' }}>
      <div style={{ background: '#1C2B3A', padding: '16px 16px 0',
        paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#7A9E87',
          fontWeight: 600, cursor: 'pointer', fontSize: 14, padding: '0 0 12px', display: 'block' }}>
          ← Back
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 26 }}>{project.emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700,
              color: '#F7F3ED', marginBottom: 6 }}>{project.name}</div>
            {editingStatus ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <button key={key} onClick={() => updateStatus(key)}
                    style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 99,
                      border: '1.5px solid ' + cfg.color, color: cfg.color, background: 'transparent', cursor: 'pointer' }}>
                    {cfg.label}
                  </button>
                ))}
                <button onClick={() => setEditingStatus(false)}
                  style={{ fontSize: 11, padding: '4px 10px', borderRadius: 99,
                    border: '1px solid #555', background: 'transparent', cursor: 'pointer', color: '#aaa' }}>✕</button>
              </div>
            ) : (
              <button onClick={() => setEditingStatus(true)} style={{ all: 'unset', cursor: 'pointer' }}>
                <StatusBadge status={project.status} />
              </button>
            )}
          </div>
        </div>
        <div style={{ display: 'flex' }}>
          {[['overview','Overview'],['discussion','Chat'],['moodboard','Mood Board']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ flex: 1, padding: '10px 0', border: 'none', fontFamily: 'inherit',
                borderBottom: tab === id ? '2.5px solid #C4714A' : '2.5px solid transparent',
                background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === id ? 700 : 500,
                color: tab === id ? '#C4714A' : 'rgba(255,255,255,0.45)' }}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {tab === 'overview' && (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={crd}>
              <div style={sL}>Description</div>
              <p style={{ margin: 0, color: '#374151', lineHeight: 1.6, fontSize: 15 }}>{project.description}</p>
            </div>
            <div style={crd}>
              <div style={sL}>Budget</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#1C2B3A', fontFamily: "'Playfair Display', serif" }}>
                {fmt(project.costEstimate)}
              </div>
              <ProgressBar spent={project.costSpent || 0} estimate={project.costEstimate} />
              <button onClick={() => { setEditingCost(true); setCostInput(project.costSpent || 0) }}
                style={{ marginTop: 10, fontSize: 13, color: '#7A9E87', background: 'none',
                  border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}>
                Update amount spent →
              </button>
              {editingCost && (
                <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                  <input type="number" value={costInput} onChange={e => setCostInput(e.target.value)}
                    style={{ ...iS, width: 120 }} />
                  <button onClick={saveCost} style={bP}>Save</button>
                  <button onClick={() => setEditingCost(false)} style={bS}>✕</button>
                </div>
              )}
            </div>
            <div style={crd}>
              <div style={sL}>Timeline</div>
              <div style={{ fontSize: 14, color: '#374151', marginBottom: 6 }}>🟢 Start: <strong>{project.startDate}</strong></div>
              <div style={{ fontSize: 14, color: '#374151' }}>🏁 Target: <strong>{project.endDate}</strong></div>
            </div>
          </div>
        )}
        {tab === 'discussion' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Discussion projectId={project.id} currentUser={currentUser} />
          </div>
        )}
        {tab === 'moodboard' && (
          <MoodBoard
            moodBoard={project.moodBoard || []}
            onMoodChange={(mb) => updateDoc(doc(db, 'projects', project.id), { moodBoard: mb })}
          />
        )}
      </div>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [newP, setNewP] = useState({ name:'', room:'', emoji:'🏠', costEstimate:'', startDate:'', endDate:'', description:'' })
  const seeded = useRef(false)

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, firebaseUser => {
      if (firebaseUser) {
        const profile = USER_PROFILES[firebaseUser.email.toLowerCase()] || {
          name: firebaseUser.email, avatar: firebaseUser.email[0].toUpperCase(), color: '#C4714A'
        }
        setUser({ ...profile, email: firebaseUser.email, uid: firebaseUser.uid })
      } else {
        setUser(null)
      }
      setAuthLoading(false)
    })
    return unsub
  }, [])

  // Seed Firestore
  useEffect(() => {
    if (!user) return
    const seed = async () => {
      if (seeded.current) return
      seeded.current = true
      for (const p of SEED_PROJECTS) {
        const ref = doc(db, 'projects', p.id)
        const snap = await getDoc(ref)
        if (!snap.exists()) await setDoc(ref, p)
      }
    }
    seed()
  }, [user])

  // Real-time listener
  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(collection(db, 'projects'), snap => {
      setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return unsub
  }, [user])

  const selected = projects.find(p => p.id === selectedId)
  const totalBudget = projects.reduce((s, p) => s + (p.costEstimate || 0), 0)
  const totalSpent  = projects.reduce((s, p) => s + (p.costSpent  || 0), 0)
  const inProgress  = projects.filter(p => p.status === 'in-progress').length

  const createProject = async () => {
    if (!newP.name) return
    const ref = doc(collection(db, 'projects'))
    await setDoc(ref, { ...newP, costEstimate: Number(newP.costEstimate) || 0, costSpent: 0,
      status: 'planning', moodBoard: [], createdAt: serverTimestamp() })
    setNewP({ name:'', room:'', emoji:'🏠', costEstimate:'', startDate:'', endDate:'', description:'' })
    setShowNew(false)
    setSelectedId(ref.id)
  }

  if (authLoading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 16, background: '#1C2B3A' }}>
      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, color: '#F7F3ED' }}>Our Home 🏡</div>
      <div style={{ color: '#7A9E87', fontSize: 14 }}>Loading…</div>
    </div>
  )

  if (!user) return <LoginScreen />

  if (selected) return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <ProjectDetail project={selected} currentUser={user} onBack={() => setSelectedId(null)} />
    </div>
  )

  if (showNew) return (
    <div style={{ height: '100vh', overflowY: 'auto', background: '#F7F3ED', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ background: '#1C2B3A', padding: '16px', paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
        <button onClick={() => setShowNew(false)} style={{ background: 'none', border: 'none',
          color: '#7A9E87', fontWeight: 600, cursor: 'pointer', fontSize: 14, padding: 0 }}>← Back</button>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: '#F7F3ED', marginTop: 8 }}>New Project</div>
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {[
          { label: 'Project Name', key: 'name', placeholder: 'e.g. Living Room Repaint' },
          { label: 'Room / Area', key: 'room', placeholder: 'e.g. Living Room' },
          { label: 'Emoji', key: 'emoji', placeholder: '🏠' },
          { label: 'Budget Estimate ($)', key: 'costEstimate', placeholder: '5000', type: 'number' },
          { label: 'Start Date', key: 'startDate', type: 'date' },
          { label: 'End Date', key: 'endDate', type: 'date' },
        ].map(f => (
          <div key={f.key}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5, color: '#374151' }}>{f.label}</label>
            <input type={f.type || 'text'} placeholder={f.placeholder}
              value={newP[f.key]} onChange={e => setNewP(p => ({ ...p, [f.key]: e.target.value }))}
              style={{ width: '100%', ...iS, fontSize: 16 }} />
          </div>
        ))}
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5, color: '#374151' }}>Description</label>
          <textarea placeholder="Describe the project..." value={newP.description} rows={3}
            onChange={e => setNewP(p => ({ ...p, description: e.target.value }))}
            style={{ width: '100%', ...iS, resize: 'vertical', fontSize: 16 }} />
        </div>
        <button onClick={createProject} style={{ ...bP, padding: 14, fontSize: 16, borderRadius: 12, width: '100%' }}>
          Create Project
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column',
      fontFamily: "'Inter', system-ui, sans-serif", background: '#F7F3ED' }}>

      {/* Header */}
      <div style={{ background: '#1C2B3A', padding: '16px', paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#F7F3ED' }}>
              Our Home 🏡
            </div>
            <div style={{ fontSize: 12, color: '#7A9E87', marginTop: 2 }}>Matt & Tara</div>
          </div>
          {/* Signed in user + sign out */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: user.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 700, fontSize: 14 }}>{user.avatar}</div>
              <span style={{ color: '#F7F3ED', fontWeight: 600, fontSize: 14 }}>{user.name}</span>
            </div>
            <button onClick={() => signOut(auth)}
              style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.1)', border: 'none',
                borderRadius: 8, color: '#9CA3AF', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
              Sign out
            </button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          {[
            { label: 'Budget', value: fmt(totalBudget) },
            { label: 'Spent',  value: fmt(totalSpent) },
            { label: 'Active', value: inProgress },
            { label: 'Total',  value: projects.length },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 10,
              padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#F7F3ED' }}>{s.value}</div>
              <div style={{ fontSize: 10, color: '#7A9E87', marginTop: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Project list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16,
        paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>Loading projects…</div>
        ) : (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF',
              letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Projects</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {projects.map(p => (
                <div key={p.id} onClick={() => setSelectedId(p.id)}
                  style={{ background: '#fff', borderRadius: 16, padding: 16, cursor: 'pointer',
                    boxShadow: '0 1px 6px rgba(0,0,0,0.07)', border: '1px solid #EDE8E1' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 24 }}>{p.emoji}</span>
                      <div>
                        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 16,
                          fontWeight: 700, color: '#1C2B3A' }}>{p.name}</div>
                        <div style={{ fontSize: 12, color: '#9CA3AF' }}>{p.room}</div>
                      </div>
                    </div>
                    <StatusBadge status={p.status} />
                  </div>
                  <ProgressBar spent={p.costSpent || 0} estimate={p.costEstimate} />
                  <div style={{ marginTop: 8, fontSize: 12, color: '#9CA3AF' }}>
                    🎨 {(p.moodBoard || []).length} mood items
                  </div>
                </div>
              ))}
              <div onClick={() => setShowNew(true)}
                style={{ background: 'transparent', border: '2px dashed #C4714A', borderRadius: 16,
                  padding: 20, cursor: 'pointer', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', color: '#C4714A', fontWeight: 700, fontSize: 15 }}>
                + Add Project
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const iS = { padding: '12px 14px', border: '1.5px solid #E5E7EB', borderRadius: 10, fontSize: 14, outline: 'none', fontFamily: 'inherit' }
const bP = { padding: '10px 20px', background: '#C4714A', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 14 }
const bS = { padding: '10px 14px', background: 'transparent', color: '#6B7280', border: '1px solid #E5E7EB', borderRadius: 8, cursor: 'pointer', fontSize: 14 }
const crd = { background: '#fff', borderRadius: 14, padding: 16, border: '1px solid #EDE8E1' }
const sL = { fontSize: 12, fontWeight: 700, color: '#9CA3AF', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }
