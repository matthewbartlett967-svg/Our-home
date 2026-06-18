import { useState, useEffect, useRef } from 'react'
import {
  collection, doc, onSnapshot, setDoc, updateDoc, addDoc,
  deleteDoc, serverTimestamp, query, orderBy, getDoc
} from 'firebase/firestore'
import { db } from './firebase.js'

// ─── Users ───────────────────────────────────────────────────
const USERS = [
  { name: 'Matt', avatar: 'M', color: '#C4714A' },
  { name: 'Tara', avatar: 'T', color: '#7A9E87' },
]

// ─── Status config ────────────────────────────────────────────
const STATUS_CONFIG = {
  'not-started': { label: 'Not Started', color: '#9CA3AF', bg: '#F3F4F6' },
  'planning':    { label: 'Planning',    color: '#7A9E87', bg: '#EDF4EF' },
  'in-progress': { label: 'In Progress', color: '#C4714A', bg: '#FAF0EB' },
  'complete':    { label: 'Complete',    color: '#4A7C6F', bg: '#E6F0EE' },
}

// ─── Seed data (written once if Firestore is empty) ──────────
const SEED_PROJECTS = [
  {
    id: 'kitchen',
    name: 'Kitchen Renovation',
    room: 'Kitchen',
    emoji: '🍳',
    status: 'in-progress',
    costEstimate: 12500,
    costSpent: 3200,
    startDate: '2026-05-01',
    endDate: '2026-08-15',
    description: 'Full kitchen remodel including new cabinets, countertops, and appliances.',
    moodBoard: [
      { id: 'mb1', type: 'color', value: '#E8DDD0', label: 'Cabinet tone' },
      { id: 'mb2', type: 'color', value: '#2C2C2C', label: 'Hardware' },
      { id: 'mb3', type: 'link', url: 'https://pinterest.com/search/pins/?q=modern+farmhouse+kitchen', label: 'Farmhouse inspo' },
      { id: 'mb4', type: 'note', text: 'Shaker-style doors, brushed brass handles, open shelving on one wall', label: 'Style note' },
    ],
  },
  {
    id: 'bedroom',
    name: 'Master Bedroom Refresh',
    room: 'Bedroom',
    emoji: '🛏',
    status: 'planning',
    costEstimate: 3800,
    costSpent: 0,
    startDate: '2026-09-01',
    endDate: '2026-10-15',
    description: 'New paint, lighting upgrade, built-in wardrobe and styling.',
    moodBoard: [
      { id: 'mb1', type: 'color', value: '#5C6E6E', label: 'Feature wall' },
      { id: 'mb2', type: 'link', url: 'https://pinterest.com/search/pins/?q=moody+bedroom+green+dark', label: 'Dark bedroom inspo' },
      { id: 'mb3', type: 'note', text: "Farrow & Ball 'Mizzle' or 'Calke Green' for the accent wall", label: 'Paint shortlist' },
    ],
  },
  {
    id: 'deck',
    name: 'Backyard Deck',
    room: 'Garden',
    emoji: '🌿',
    status: 'not-started',
    costEstimate: 18000,
    costSpent: 0,
    startDate: '2026-11-01',
    endDate: '2027-02-28',
    description: 'Timber deck with built-in seating, outdoor lighting, and garden beds.',
    moodBoard: [
      { id: 'mb1', type: 'color', value: '#8B6F47', label: 'Timber stain' },
      { id: 'mb2', type: 'link', url: 'https://pinterest.com/search/pins/?q=timber+deck+outdoor+lighting', label: 'Deck ideas' },
      { id: 'mb3', type: 'note', text: 'Get at least 3 quotes. Check council regulations for deck height.', label: 'To-do' },
    ],
  },
]

// ─── Helpers ─────────────────────────────────────────────────
function fmt(n) { return '$' + (n || 0).toLocaleString() }

function timeAgo(ts) {
  if (!ts) return 'Just now'
  const secs = Math.floor((Date.now() - ts.toMillis()) / 1000)
  if (secs < 60) return 'Just now'
  if (secs < 3600) return Math.floor(secs / 60) + 'm ago'
  if (secs < 86400) return Math.floor(secs / 3600) + 'h ago'
  return Math.floor(secs / 86400) + 'd ago'
}

// ─── Tiny components ─────────────────────────────────────────
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

// ─── Mood Board ───────────────────────────────────────────────
function MoodBoard({ projectId, moodBoard, onMoodChange }) {
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

  const removeItem = (id) => onMoodChange(moodBoard.filter(i => i.id !== id))

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {[['color','🎨 Colour'],['link','📌 Pinterest Link'],['note','📝 Note']].map(([t, label]) => (
          <button key={t} onClick={() => setAdding(t)}
            style={{ padding: '7px 16px', border: '1.5px dashed #C4714A', borderRadius: 8,
              background: 'transparent', color: '#C4714A', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            + Add {label}
          </button>
        ))}
      </div>

      {adding && (
        <div style={{ background: '#FFF7F3', border: '1px solid #F0D5C8', borderRadius: 12, padding: 18, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>
            {adding === 'color' ? 'Add a Colour' : adding === 'link' ? 'Add a Pinterest Link' : 'Add a Note'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input placeholder="Label" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              style={inputStyle} />
            {adding === 'color' && <input type="color" value={form.value}
              onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
              style={{ height: 44, border: '1px solid #E5E7EB', borderRadius: 8, cursor: 'pointer', width: 100 }} />}
            {adding === 'link' && <input placeholder="Pinterest URL" value={form.url}
              onChange={e => setForm(f => ({ ...f, url: e.target.value }))} style={inputStyle} />}
            {adding === 'note' && <textarea placeholder="Your note..." value={form.text} rows={3}
              onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
              style={{ ...inputStyle, resize: 'vertical' }} />}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={addItem} style={btnPrimary}>Add</button>
              <button onClick={() => setAdding(null)} style={btnSecondary}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: 14 }}>
        {moodBoard.map(item => (
          <div key={item.id} style={{ background: '#fff', borderRadius: 14, overflow: 'hidden',
            border: '1px solid #EDE8E1', position: 'relative', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <button onClick={() => removeItem(item.id)}
              style={{ position: 'absolute', top: 7, right: 7, background: 'rgba(0,0,0,0.2)',
                border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer',
                color: '#fff', fontSize: 13, lineHeight: '22px', textAlign: 'center', zIndex: 2 }}>×</button>
            {item.type === 'color' && <>
              <div style={{ height: 110, background: item.value }} />
              <div style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{item.label}</div>
                <div style={{ fontSize: 11, color: '#9CA3AF', fontFamily: 'monospace', marginTop: 2 }}>{item.value}</div>
              </div>
            </>}
            {item.type === 'link' && <>
              <div style={{ height: 90, background: 'linear-gradient(135deg,#E60023,#FF4757)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34 }}>📌</div>
              <div style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{item.label}</div>
                <a href={item.url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 11, color: '#E60023', textDecoration: 'none', fontWeight: 600 }}>
                  Open Pinterest →
                </a>
              </div>
            </>}
            {item.type === 'note' && (
              <div style={{ padding: '14px', background: '#FFFDF4', minHeight: 130,
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{item.text}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', marginTop: 10,
                  borderTop: '1px solid #EDE8E1', paddingTop: 8 }}>{item.label}</div>
              </div>
            )}
          </div>
        ))}
      </div>
      {moodBoard.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9CA3AF' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🖼</div>
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
    const q = query(
      collection(db, 'projects', projectId, 'messages'),
      orderBy('createdAt', 'asc')
    )
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return unsub
  }, [projectId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    if (!text.trim()) return
    const msg = text.trim()
    setText('')
    await addDoc(collection(db, 'projects', projectId, 'messages'), {
      author: currentUser.name,
      avatar: currentUser.avatar,
      text: msg,
      createdAt: serverTimestamp(),
    })
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 320px)', minHeight: 300 }}>
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 16 }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9CA3AF' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>💬</div>
            <div style={{ fontWeight: 600 }}>No messages yet</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Start the conversation below.</div>
          </div>
        ) : messages.map(msg => {
          const isMe = msg.author === currentUser.name
          const userColor = USERS.find(u => u.name === msg.author)?.color || '#7A9E87'
          return (
            <div key={msg.id} style={{ display: 'flex', gap: 10, marginBottom: 16,
              flexDirection: isMe ? 'row-reverse' : 'row' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: userColor,
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 15, flexShrink: 0 }}>{msg.avatar}</div>
              <div style={{ maxWidth: '72%' }}>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4,
                  textAlign: isMe ? 'right' : 'left' }}>
                  {msg.author} · {timeAgo(msg.createdAt)}
                </div>
                <div style={{ background: isMe ? '#C4714A' : '#fff', color: isMe ? '#fff' : '#1C2B3A',
                  padding: '10px 14px', borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  fontSize: 14, lineHeight: 1.5, boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
                  border: isMe ? 'none' : '1px solid #EDE8E1' }}>
                  {msg.text}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      <div style={{ borderTop: '1px solid #EDE8E1', paddingTop: 14, display: 'flex', gap: 10 }}>
        <textarea value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }}}
          placeholder={`Message as ${currentUser.name}…`} rows={2}
          style={{ flex: 1, padding: '10px 14px', border: '1.5px solid #E5E7EB', borderRadius: 10,
            fontSize: 14, resize: 'none', outline: 'none', fontFamily: 'inherit', background: '#FAFAFA' }} />
        <button onClick={send} style={btnPrimary}>Send</button>
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

  const updateField = async (fields) => {
    await updateDoc(doc(db, 'projects', project.id), fields)
  }

  const updateStatus = async (status) => {
    await updateField({ status })
    setEditingStatus(false)
  }

  const saveCost = async () => {
    await updateField({ costSpent: Number(costInput) })
    setEditingCost(false)
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'discussion', label: 'Discussion' },
    { id: 'moodboard', label: 'Mood Board' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '24px 28px 0', borderBottom: '1px solid #EDE8E1' }}>
        <button onClick={onBack}
          style={{ background: 'none', border: 'none', color: '#7A9E87', fontWeight: 600,
            cursor: 'pointer', fontSize: 13, padding: 0, marginBottom: 14 }}>
          ← All Projects
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 26 }}>{project.emoji}</span>
              <h2 style={{ margin: 0, fontFamily: "'Playfair Display', serif", fontSize: 24,
                color: '#1C2B3A', fontWeight: 700 }}>{project.name}</h2>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {editingStatus ? (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <button key={key} onClick={() => updateStatus(key)}
                      style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 99,
                        border: '1.5px solid ' + cfg.color, color: cfg.color, background: 'transparent', cursor: 'pointer' }}>
                      {cfg.label}
                    </button>
                  ))}
                  <button onClick={() => setEditingStatus(false)}
                    style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99,
                      border: '1px solid #E5E7EB', background: 'transparent', cursor: 'pointer', color: '#9CA3AF' }}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button onClick={() => setEditingStatus(true)} style={{ all: 'unset', cursor: 'pointer' }}>
                  <StatusBadge status={project.status} />
                </button>
              )}
              <span style={{ fontSize: 12, color: '#9CA3AF' }}>
                🗓 {project.startDate} → {project.endDate}
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 0 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: '9px 18px', border: 'none', fontFamily: 'inherit',
                borderBottom: tab === t.id ? '2.5px solid #C4714A' : '2.5px solid transparent',
                background: 'none', cursor: 'pointer', fontSize: 14,
                fontWeight: tab === t.id ? 700 : 500,
                color: tab === t.id ? '#C4714A' : '#6B7280' }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        {tab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <div style={{ gridColumn: '1 / -1', ...card }}>
              <div style={sectionLabel}>Description</div>
              <p style={{ margin: 0, color: '#374151', lineHeight: 1.6, fontSize: 15 }}>{project.description}</p>
            </div>
            <div style={card}>
              <div style={sectionLabel}>Budget</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#1C2B3A', fontFamily: "'Playfair Display', serif" }}>
                {fmt(project.costEstimate)}
              </div>
              <ProgressBar spent={project.costSpent || 0} estimate={project.costEstimate} />
              <button onClick={() => { setEditingCost(true); setCostInput(project.costSpent || 0) }}
                style={{ marginTop: 12, fontSize: 12, color: '#7A9E87', background: 'none',
                  border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}>
                Update amount spent →
              </button>
              {editingCost && (
                <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                  <input type="number" value={costInput} onChange={e => setCostInput(e.target.value)}
                    style={{ padding: '6px 10px', border: '1.5px solid #C4714A', borderRadius: 8,
                      width: 110, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
                  <button onClick={saveCost} style={btnPrimary}>Save</button>
                  <button onClick={() => setEditingCost(false)} style={btnSecondary}>✕</button>
                </div>
              )}
            </div>
            <div style={card}>
              <div style={sectionLabel}>Timeline</div>
              <div style={{ fontSize: 14, color: '#374151', marginBottom: 6 }}>🟢 Start: <strong>{project.startDate}</strong></div>
              <div style={{ fontSize: 14, color: '#374151' }}>🏁 Target: <strong>{project.endDate}</strong></div>
            </div>
          </div>
        )}
        {tab === 'discussion' && (
          <Discussion projectId={project.id} currentUser={currentUser} />
        )}
        {tab === 'moodboard' && (
          <MoodBoard
            projectId={project.id}
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
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [currentUser, setCurrentUser] = useState(USERS[0])
  const [showNew, setShowNew] = useState(false)
  const [newP, setNewP] = useState({ name:'', room:'', emoji:'🏠', costEstimate:'', startDate:'', endDate:'', description:'' })
  const seeded = useRef(false)

  // Seed Firestore once if empty
  useEffect(() => {
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
  }, [])

  // Real-time listener
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'projects'), snap => {
      setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return unsub
  }, [])

  const selected = projects.find(p => p.id === selectedId)

  const totalBudget = projects.reduce((s, p) => s + (p.costEstimate || 0), 0)
  const totalSpent  = projects.reduce((s, p) => s + (p.costSpent  || 0), 0)
  const inProgress  = projects.filter(p => p.status === 'in-progress').length

  const createProject = async () => {
    if (!newP.name) return
    const ref = doc(collection(db, 'projects'))
    await setDoc(ref, {
      ...newP,
      costEstimate: Number(newP.costEstimate) || 0,
      costSpent: 0,
      status: 'planning',
      moodBoard: [],
      createdAt: serverTimestamp(),
    })
    setNewP({ name:'', room:'', emoji:'🏠', costEstimate:'', startDate:'', endDate:'', description:'' })
    setShowNew(false)
    setSelectedId(ref.id)
  }

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 16, background: '#F7F3ED' }}>
      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, color: '#1C2B3A' }}>Our Home 🏡</div>
      <div style={{ color: '#9CA3AF', fontSize: 14 }}>Connecting…</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: "'Inter', system-ui, sans-serif",
      background: '#F7F3ED', color: '#1C2B3A' }}>

      {/* ── Sidebar ── */}
      <div style={{ width: 270, background: '#1C2B3A', display: 'flex', flexDirection: 'column',
        overflowY: 'auto', flexShrink: 0 }}>
        <div style={{ padding: '24px 20px 16px' }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700,
            color: '#F7F3ED', marginBottom: 2 }}>Our Home</div>
          <div style={{ fontSize: 12, color: '#7A9E87', fontWeight: 500 }}>Matt & Tara</div>
        </div>

        {/* User switcher */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8 }}>
          {USERS.map(u => (
            <button key={u.name} onClick={() => setCurrentUser(u)}
              style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none',
                background: currentUser.name === u.name ? u.color : 'rgba(255,255,255,0.07)',
                color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              {u.name}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: 10, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {[
            { label: 'Total Budget', value: fmt(totalBudget) },
            { label: 'Spent',        value: fmt(totalSpent) },
            { label: 'In Progress',  value: inProgress },
            { label: 'Projects',     value: projects.length },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#F7F3ED' }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#7A9E87', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Project list */}
        <div style={{ flex: 1, padding: '14px 10px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)',
            letterSpacing: '0.08em', textTransform: 'uppercase', padding: '4px 10px', marginBottom: 6 }}>
            Projects
          </div>
          {projects.map(p => (
            <button key={p.id} onClick={() => { setSelectedId(p.id); setShowNew(false) }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '10px 10px', borderRadius: 10, border: 'none',
                background: selectedId === p.id ? 'rgba(196,113,74,0.2)' : 'transparent',
                cursor: 'pointer', textAlign: 'left', marginBottom: 2,
                borderLeft: selectedId === p.id ? '3px solid #C4714A' : '3px solid transparent' }}>
              <span style={{ fontSize: 18 }}>{p.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#F7F3ED',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                <div style={{ fontSize: 11, color: STATUS_CONFIG[p.status]?.color || '#9CA3AF', marginTop: 1 }}>
                  {STATUS_CONFIG[p.status]?.label || ''}
                </div>
              </div>
            </button>
          ))}
          <button onClick={() => { setShowNew(true); setSelectedId(null) }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '10px 10px', borderRadius: 10, border: '1.5px dashed rgba(255,255,255,0.2)',
              background: 'transparent', cursor: 'pointer', color: 'rgba(255,255,255,0.5)',
              fontSize: 13, fontWeight: 600, marginTop: 8 }}>
            + New Project
          </button>
        </div>
      </div>

      {/* ── Main panel ── */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {showNew ? (
          <div style={{ padding: 32, maxWidth: 560 }}>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, margin: '0 0 24px' }}>New Project</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                    style={{ width: '100%', ...inputStyle }} />
                </div>
              ))}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5, color: '#374151' }}>Description</label>
                <textarea placeholder="Describe the project..." value={newP.description} rows={3}
                  onChange={e => setNewP(p => ({ ...p, description: e.target.value }))}
                  style={{ width: '100%', ...inputStyle, resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button onClick={createProject} style={{ ...btnPrimary, padding: '11px 24px', fontSize: 15 }}>Create Project</button>
                <button onClick={() => setShowNew(false)} style={btnSecondary}>Cancel</button>
              </div>
            </div>
          </div>
        ) : selected ? (
          <ProjectDetail project={selected} currentUser={currentUser} onBack={() => setSelectedId(null)} />
        ) : (
          <div style={{ padding: 32 }}>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 32, margin: '0 0 6px' }}>
              Welcome home 🏡
            </h1>
            <p style={{ color: '#6B7280', fontSize: 15, margin: '0 0 30px' }}>
              Select a project, or create a new one.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 18 }}>
              {projects.map(p => (
                <div key={p.id} onClick={() => setSelectedId(p.id)}
                  style={{ background: '#fff', border: '1px solid #EDE8E1', borderRadius: 16,
                    padding: '20px 22px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                    transition: 'transform 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 28 }}>{p.emoji}</span>
                    <StatusBadge status={p.status} />
                  </div>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700,
                    color: '#1C2B3A', marginBottom: 4 }}>{p.name}</div>
                  <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 12 }}>{p.room}</div>
                  <ProgressBar spent={p.costSpent || 0} estimate={p.costEstimate} />
                  <div style={{ marginTop: 10, fontSize: 12, color: '#9CA3AF' }}>
                    🎨 {(p.moodBoard || []).length} mood items
                  </div>
                </div>
              ))}
              <div onClick={() => setShowNew(true)}
                style={{ background: 'transparent', border: '2px dashed #C4714A', borderRadius: 16,
                  padding: '20px 22px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 8, color: '#C4714A', fontWeight: 700, fontSize: 15, minHeight: 160 }}>
                + Add Project
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Shared style tokens ──────────────────────────────────────
const inputStyle = {
  padding: '10px 14px', border: '1.5px solid #E5E7EB', borderRadius: 10,
  fontSize: 14, outline: 'none', fontFamily: 'inherit',
}
const btnPrimary = {
  padding: '8px 18px', background: '#C4714A', color: '#fff', border: 'none',
  borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 14,
}
const btnSecondary = {
  padding: '8px 14px', background: 'transparent', color: '#6B7280',
  border: '1px solid #E5E7EB', borderRadius: 8, cursor: 'pointer', fontSize: 14,
}
const card = {
  background: '#fff', borderRadius: 14, padding: '18px 20px', border: '1px solid #EDE8E1',
}
const sectionLabel = {
  fontSize: 13, fontWeight: 700, color: '#9CA3AF', marginBottom: 8,
  textTransform: 'uppercase', letterSpacing: '0.06em',
}
