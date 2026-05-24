import { useEffect, useMemo, useRef, useState } from 'react';
import { listAudioRecordings, updateAudioRecord, type AudioRecord } from '../lib/db';
import { confirmNoteLink } from '../lib/api';

// ─── useDark ──────────────────────────────────────────────────────────────────
function useDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')));
    obs.observe(document.documentElement, { attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

// ─── Types ────────────────────────────────────────────────────────────────────
type GraphMode = 'tag' | 'note';

interface GNode  { id: string; noteId?: string; label: string; x: number; y: number; vx: number; vy: number; }
interface GEdge  { sourceId: string; targetId: string; linkId: string; confirmed: boolean | null; }
interface TNode  { id: string; label: string; count: number; x: number; y: number; vx: number; vy: number; }
interface TEdge  { sourceId: string; targetId: string; coCount: number; }
interface VT     { x: number; y: number; s: number; }

// ─── Constants ────────────────────────────────────────────────────────────────
const SVG_W   = 340;
const SVG_H   = 420;
const NOTE_W  = 620;   // layout space for note graph (larger → less overlap)
const NOTE_H  = 520;
const MAX_NOTES = 60;
const NOTE_INIT_S: number = Math.min(SVG_W / NOTE_W, SVG_H / NOTE_H);
const NOTE_INIT_VT: VT = {
  x: (SVG_W - NOTE_W * NOTE_INIT_S) / 2,
  y: (SVG_H - NOTE_H * NOTE_INIT_S) / 2,
  s: NOTE_INIT_S,
};

// ─── Force layout (generic duck-typed nodes + edges) ─────────────────────────
function forceLayout(
  nodes: { id: string; x: number; y: number; vx: number; vy: number }[],
  edges: { sourceId: string; targetId: string }[],
  W: number, H: number, iters = 280,
) {
  const cx = W / 2; const cy = H / 2;
  const REPULSE = 5500; const ATTRACT = 0.04; const CENTER = 0.018; const DAMP = 0.84;
  for (let i = 0; i < iters; i++) {
    for (let a = 0; a < nodes.length; a++) {
      for (let b = a + 1; b < nodes.length; b++) {
        const dx = nodes[b].x - nodes[a].x;
        const dy = nodes[b].y - nodes[a].y;
        const d2 = dx * dx + dy * dy + 1;
        const f = REPULSE / d2;
        const d = Math.sqrt(d2);
        nodes[a].vx -= (dx / d) * f; nodes[a].vy -= (dy / d) * f;
        nodes[b].vx += (dx / d) * f; nodes[b].vy += (dy / d) * f;
      }
    }
    for (const e of edges) {
      const a = nodes.find(n => n.id === e.sourceId);
      const b = nodes.find(n => n.id === e.targetId);
      if (!a || !b) continue;
      const dx = b.x - a.x; const dy = b.y - a.y;
      a.vx += dx * ATTRACT; a.vy += dy * ATTRACT;
      b.vx -= dx * ATTRACT; b.vy -= dy * ATTRACT;
    }
    for (const n of nodes) {
      n.vx += (cx - n.x) * CENTER; n.vy += (cy - n.y) * CENTER;
      n.vx *= DAMP; n.vy *= DAMP;
      n.x += n.vx; n.y += n.vy;
      n.x = Math.max(40, Math.min(W - 40, n.x));
      n.y = Math.max(40, Math.min(H - 40, n.y));
    }
  }
}

// ─── nodeRadius ───────────────────────────────────────────────────────────────
function noteRadius(id: string, edges: GEdge[]) {
  return Math.min(14 + edges.filter(e => e.sourceId === id || e.targetId === id).length * 4, 30);
}
function tagRadius(count: number) { return Math.min(12 + count * 3, 36); }

// ─── formatDate ───────────────────────────────────────────────────────────────
function formatDate(d: Date) {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'short' }).format(new Date(d));
}

// ─── GraphViewPage ────────────────────────────────────────────────────────────
export default function GraphViewPage({ onNavigateToNote }: { onNavigateToNote?: (noteId: string) => void }) {
  const svgRef     = useRef<SVGSVGElement>(null);
  const didDragRef = useRef(false);
  const panRef     = useRef<{ ex: number; ey: number; tx: number; ty: number } | null>(null);
  const dark       = useDark();

  // ── data ──
  const [records,   setRecords]   = useState<AudioRecord[]>([]);
  const [noteNodes, setNoteNodes] = useState<GNode[]>([]);
  const [noteEdges, setNoteEdges] = useState<GEdge[]>([]);
  const [tagNodes,  setTagNodes]  = useState<TNode[]>([]);
  const [tagEdges,  setTagEdges]  = useState<TEdge[]>([]);
  const [loading,   setLoading]   = useState(true);

  // ── UI state ──
  const [mode,        setMode]        = useState<GraphMode>('note');
  const [filterText,  setFilterText]  = useState('');
  const [noteVT,      setNoteVT]      = useState<VT>(NOTE_INIT_VT);
  const [dragging,    setDragging]    = useState<{ id: string; ox: number; oy: number } | null>(null);
  const [selNote,     setSelNote]     = useState<GNode | null>(null);
  const [selTagId,    setSelTagId]    = useState<string | null>(null);

  // ── load ──
  useEffect(() => {
    (async () => {
      const recs  = await listAudioRecordings();
      const done  = recs.filter(r => r.aiStatus === 'done');
      if (!done.length) { setLoading(false); return; }

      // ── Note graph ──
      const noteIdMap = new Map<string, string>(); // supabase noteId → local id
      const nNodes: GNode[] = done.slice(0, MAX_NOTES).map(r => {
        const n: GNode = {
          id: r.id, noteId: r.noteId,
          label: r.title ?? formatDate(r.createdAt),
          x: Math.random() * (NOTE_W - 80) + 40,
          y: Math.random() * (NOTE_H - 80) + 40,
          vx: 0, vy: 0,
        };
        if (r.noteId) noteIdMap.set(r.noteId, r.id);
        return n;
      });
      const nEdgeSet = new Set<string>();
      const nEdges: GEdge[] = [];
      for (const r of done.slice(0, MAX_NOTES)) {
        for (const link of r.suggestedLinks ?? []) {
          if (link.confirmed === false) continue;
          const tgt = noteIdMap.get(link.linkedNoteId);
          if (!tgt) continue;
          const key = [r.id, tgt].sort().join('|');
          if (nEdgeSet.has(key)) continue;
          nEdgeSet.add(key);
          nEdges.push({ sourceId: r.id, targetId: tgt, linkId: link.id, confirmed: link.confirmed });
        }
      }
      forceLayout(nNodes, nEdges, NOTE_W, NOTE_H);

      // ── Tag graph ──
      const tagCount   = new Map<string, number>();
      const coCountMap = new Map<string, number>();
      for (const r of done) {
        const tags = Array.from(new Set([
          ...(r.structuredTags?.map(t => t.name) ?? []),
          ...(r.hashtags ?? []),
        ]));
        for (const t of tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
        for (let i = 0; i < tags.length; i++) {
          for (let j = i + 1; j < tags.length; j++) {
            const k = [tags[i], tags[j]].sort().join('|||');
            coCountMap.set(k, (coCountMap.get(k) ?? 0) + 1);
          }
        }
      }
      const tNodes: TNode[] = Array.from(tagCount.entries()).map(([name, cnt]) => ({
        id: name, label: name, count: cnt,
        x: Math.random() * (SVG_W - 80) + 40,
        y: Math.random() * (SVG_H - 80) + 40,
        vx: 0, vy: 0,
      }));
      const tEdges: TEdge[] = [];
      for (const [k, co] of coCountMap.entries()) {
        if (co < 2) continue; // only show tags that co-appear in ≥2 notes
        const [a, b] = k.split('|||');
        tEdges.push({ sourceId: a, targetId: b, coCount: co });
      }
      forceLayout(tNodes, tEdges, SVG_W, SVG_H);

      setRecords(done);
      setNoteNodes(nNodes);
      setNoteEdges(nEdges);
      setTagNodes(tNodes);
      setTagEdges(tEdges);
      setLoading(false);
    })();
  }, []);

  // ── filter note graph ──
  const visNoteNodes = useMemo(() => {
    if (!filterText.trim()) return noteNodes;
    const q = filterText.toLowerCase();
    return noteNodes.filter(n => n.label.toLowerCase().includes(q));
  }, [noteNodes, filterText]);

  const visNoteEdges = useMemo(() => {
    const ids = new Set(visNoteNodes.map(n => n.id));
    return noteEdges.filter(e => ids.has(e.sourceId) && ids.has(e.targetId));
  }, [visNoteNodes, noteEdges]);

  // ── tag → notes ──
  const selTagNotes = useMemo(() => {
    if (!selTagId) return [];
    return records.filter(r =>
      r.structuredTags?.some(t => t.name === selTagId) || r.hashtags?.includes(selTagId)
    );
  }, [selTagId, records]);

  // ── SVG coordinate helper ──
  function svgPoint(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width)  * SVG_W,
      y: ((clientY - rect.top)  / rect.height) * SVG_H,
    };
  }

  // ── node drag (note graph) ──
  function onNodePointerDown(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    didDragRef.current = false;
    panRef.current = null;
    const pt = svgPoint(e.clientX, e.clientY);
    if (!pt) return;
    const node = noteNodes.find(n => n.id === id);
    if (!node) return;
    const cx = (pt.x - noteVT.x) / noteVT.s;
    const cy = (pt.y - noteVT.y) / noteVT.s;
    setDragging({ id, ox: cx - node.x, oy: cy - node.y });
  }

  // ── background pan ──
  function onSvgPointerDown(e: React.PointerEvent) {
    didDragRef.current = false;
    panRef.current = { ex: e.clientX, ey: e.clientY, tx: noteVT.x, ty: noteVT.y };
  }

  function onSvgPointerMove(e: React.PointerEvent) {
    if (dragging) {
      didDragRef.current = true;
      const pt = svgPoint(e.clientX, e.clientY);
      if (!pt) return;
      const cx = (pt.x - noteVT.x) / noteVT.s;
      const cy = (pt.y - noteVT.y) / noteVT.s;
      setNoteNodes(prev => prev.map(n =>
        n.id === dragging.id
          ? { ...n, x: Math.max(40, Math.min(NOTE_W - 40, cx - dragging.ox)), y: Math.max(40, Math.min(NOTE_H - 40, cy - dragging.oy)) }
          : n
      ));
    } else if (panRef.current) {
      didDragRef.current = true;
      const pan  = panRef.current;                          // capture before setState
      const svg  = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const dx   = (e.clientX - pan.ex) / rect.width  * SVG_W;
      const dy   = (e.clientY - pan.ey) / rect.height * SVG_H;
      const newX = pan.tx + dx;                             // compute before callback
      const newY = pan.ty + dy;
      setNoteVT(v => ({ ...v, x: newX, y: newY }));
    }
  }

  function onSvgPointerUp() {
    setDragging(null);
    panRef.current = null;
  }

  function onNoteNodeClick(node: GNode) {
    if (didDragRef.current) return;
    setSelNote(prev => prev?.id === node.id ? null : node);
  }

  // ── wheel zoom (note graph) ──
  function onSvgWheel(e: React.WheelEvent) {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const rect   = svg.getBoundingClientRect();
    const ptX    = ((e.clientX - rect.left) / rect.width)  * SVG_W;  // compute before callback
    const ptY    = ((e.clientY - rect.top)  / rect.height) * SVG_H;
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setNoteVT(v => {
      const ns = Math.max(0.2, Math.min(4, v.s * factor));
      return {
        x: ptX - (ptX - v.x) * (ns / v.s),
        y: ptY - (ptY - v.y) * (ns / v.s),
        s: ns,
      };
    });
  }

  // ── confirm note link ──
  async function handleConfirmLink(edge: GEdge, confirmed: boolean) {
    setNoteEdges(prev => prev.map(e => e.linkId === edge.linkId ? { ...e, confirmed } : e));
    confirmNoteLink(edge.linkId, confirmed);
    const src = records.find(r => r.id === edge.sourceId);
    if (src) {
      const updated = src.suggestedLinks?.map(l => l.id === edge.linkId ? { ...l, confirmed } : l) ?? [];
      await updateAudioRecord(src.id, { suggestedLinks: updated });
      setRecords(prev => prev.map(r => r.id === src.id ? { ...r, suggestedLinks: updated } : r));
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-[#FAFAF7] dark:bg-[#18181A]">
        <p className="text-gray-400 text-sm">กำลังโหลด...</p>
      </div>
    );
  }

  const totalDone = records.length;
  const hasTags   = tagNodes.length > 0;
  const hasNotes  = noteNodes.length > 0;
  const isEmpty   = !hasTags && !hasNotes;

  if (isEmpty) {
    return (
      <div className="min-h-svh flex flex-col bg-[#FAFAF7] dark:bg-[#18181A]">
        <header className="w-full max-w-md mx-auto px-5 pt-10 pb-4">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">Knowledge Graph</h1>
        </header>
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center px-8">
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-[#333336] flex items-center justify-center text-2xl">🕸️</div>
          <p className="text-gray-500 text-sm">ยังไม่มีโน้ตที่ประมวลผลแล้ว</p>
          <p className="text-gray-400 text-xs">บันทึกเสียงและกด "ถอดเสียง + วิเคราะห์ AI" เพื่อสร้างกราฟ</p>
        </div>
      </div>
    );
  }

  const edgeColor   = dark ? '#555558' : '#D1D5DB';
  const nodeFillDef = dark ? '#333336' : '#F3F4F6';
  const nodeFillLnk = dark ? '#3D1F1F' : '#FEF2F2';
  const textFill    = dark ? '#D1D5DB' : '#374151';
  const tagFillBase = dark ? '#1E293B' : '#EFF6FF';
  const tagStroke   = dark ? '#3B82F6' : '#93C5FD';

  const selNoteNode = selNote ? noteNodes.find(n => n.id === selNote.id) ?? null : null;

  // ─── JSX ─────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-svh flex flex-col bg-[#FAFAF7] dark:bg-[#18181A]">
      <header className="w-full max-w-md lg:max-w-2xl mx-auto px-5 pt-10 pb-3">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">Knowledge Graph</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {totalDone} โน้ต · {tagNodes.length} หัวข้อ · {noteEdges.length} ลิงก์
        </p>
      </header>

      <main className="w-full max-w-md lg:max-w-2xl mx-auto px-4 flex-1 flex flex-col gap-3 pb-6">

        {/* ── Mode toggle ── */}
        <div className="flex bg-gray-100 dark:bg-[#252527] rounded-xl p-1 gap-1">
          {([['note', '📄 Note Graph', `${Math.min(totalDone, MAX_NOTES)} โน้ต`], ['tag', '🕸️ Tag Graph', `${tagNodes.length} หัวข้อ`]] as const).map(([m, label, sub]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 flex flex-col items-center py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === m
                  ? 'bg-white dark:bg-[#333336] text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {label}
              <span className="text-[10px] font-normal opacity-60 mt-0.5">{sub}</span>
            </button>
          ))}
        </div>

        {/* ══ TAG GRAPH ══════════════════════════════════════════════════════════ */}
        {mode === 'tag' && (
          <>
            {!hasTags ? (
              <div className="bg-white dark:bg-[#252527] rounded-2xl border border-gray-100 dark:border-[#333336] p-8 text-center text-sm text-gray-400">
                ยังไม่มี tag — ถอดเสียง AI ก่อน
              </div>
            ) : (
              <>
                <div className="bg-white dark:bg-[#252527] rounded-2xl border border-gray-100 dark:border-[#333336] shadow-sm overflow-hidden">
                  <svg width="100%" viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="touch-none">
                    {tagEdges.map((e, i) => {
                      const a = tagNodes.find(n => n.id === e.sourceId);
                      const b = tagNodes.find(n => n.id === e.targetId);
                      if (!a || !b) return null;
                      return (
                        <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                          stroke={edgeColor}
                          strokeWidth={Math.min(1 + e.coCount * 0.5, 4)}
                          strokeOpacity={0.6}
                        />
                      );
                    })}
                    {tagNodes.map(node => {
                      const isSel = selTagId === node.id;
                      const r = tagRadius(node.count);
                      return (
                        <g key={node.id}
                          transform={`translate(${node.x},${node.y})`}
                          className="cursor-pointer"
                          onClick={() => setSelTagId(isSel ? null : node.id)}
                        >
                          <circle r={isSel ? r + 4 : r}
                            fill={isSel ? '#E24B4A' : tagFillBase}
                            stroke={isSel ? '#C73B3A' : tagStroke}
                            strokeWidth={isSel ? 2.5 : 1.5}
                          />
                          <text textAnchor="middle" dominantBaseline="middle"
                            fontSize={Math.max(7, Math.min(10, r * 0.6))}
                            fill={isSel ? '#fff' : textFill}
                            style={{ pointerEvents: 'none', userSelect: 'none' }}
                          >
                            {node.label.slice(0, 12)}{node.label.length > 12 ? '…' : ''}
                          </text>
                          {/* count badge */}
                          <text textAnchor="middle" y={r + 10}
                            fontSize="7" fill={isSel ? '#E24B4A' : (dark ? '#6B7280' : '#9CA3AF')}
                            style={{ pointerEvents: 'none', userSelect: 'none' }}
                          >
                            ×{node.count}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-[10px] text-gray-400 dark:text-gray-600">
                  <span>ขนาด node = จำนวนโน้ต</span>
                  <span>ความหนาเส้น = ความถี่ co-appear</span>
                  <span>กด node เพื่อดูรายการ</span>
                </div>

                {/* Selected tag → notes list */}
                {selTagId && (
                  <div className="bg-white dark:bg-[#252527] rounded-2xl border border-gray-100 dark:border-[#333336] shadow-sm p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                        #{selTagId}
                        <span className="ml-2 text-xs font-normal text-gray-400">({selTagNotes.length} โน้ต)</span>
                      </p>
                      <button onClick={() => setSelTagId(null)}
                        className="text-gray-300 hover:text-gray-500 transition-colors p-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <ul className="flex flex-col gap-1.5">
                      {selTagNotes.map(r => (
                        <li key={r.id}
                          className="flex items-center justify-between gap-2 text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-[#1E1E20] rounded-lg px-3 py-2">
                          <span className="flex-1 truncate">{r.title ?? formatDate(r.createdAt)}</span>
                          {r.noteId && onNavigateToNote && (
                            <button onClick={() => onNavigateToNote(r.noteId!)}
                              className="text-[#E24B4A] hover:text-[#C73B3A] transition-colors flex-shrink-0">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                              </svg>
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ══ NOTE GRAPH ═════════════════════════════════════════════════════════ */}
        {mode === 'note' && (
          <>
            {/* Filter + zoom controls */}
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input
                  type="text"
                  value={filterText}
                  onChange={e => setFilterText(e.target.value)}
                  placeholder="ค้นหาโน้ต..."
                  className="w-full pl-8 pr-3 py-2 text-xs bg-white dark:bg-[#252527] border border-gray-200 dark:border-[#333336] rounded-xl text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:border-[#E24B4A]"
                />
              </div>
              <button
                onClick={() => setNoteVT(NOTE_INIT_VT)}
                title="Reset zoom"
                className="flex-shrink-0 px-3 py-2 text-xs bg-white dark:bg-[#252527] border border-gray-200 dark:border-[#333336] rounded-xl text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500 transition-colors"
              >
                {Math.round(noteVT.s * 100 / NOTE_INIT_S)}% ↺
              </button>
            </div>

            {/* Note count info */}
            {totalDone > MAX_NOTES && !filterText && (
              <div className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 rounded-xl px-3 py-2">
                แสดง {MAX_NOTES} โน้ตล่าสุดจากทั้งหมด {totalDone} รายการ — ค้นหาเพื่อกรอง
              </div>
            )}
            {filterText && (
              <p className="text-xs text-gray-400 dark:text-gray-600 px-1">
                พบ {visNoteNodes.length} โน้ต
              </p>
            )}

            {/* SVG canvas */}
            <div className="bg-white dark:bg-[#252527] rounded-2xl border border-gray-100 dark:border-[#333336] shadow-sm overflow-hidden">
              <svg
                ref={svgRef}
                width="100%"
                viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                className={dragging ? 'touch-none cursor-grabbing' : panRef.current ? 'touch-none cursor-grab' : 'touch-none cursor-default'}
                onPointerDown={onSvgPointerDown}
                onPointerMove={onSvgPointerMove}
                onPointerUp={onSvgPointerUp}
                onPointerLeave={onSvgPointerUp}
                onWheel={onSvgWheel}
              >
                <g transform={`translate(${noteVT.x},${noteVT.y}) scale(${noteVT.s})`}>
                  {/* Edges */}
                  {visNoteEdges.map((e, i) => {
                    const a = visNoteNodes.find(n => n.id === e.sourceId);
                    const b = visNoteNodes.find(n => n.id === e.targetId);
                    if (!a || !b) return null;
                    return (
                      <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                        stroke={e.confirmed === true ? '#E24B4A' : edgeColor}
                        strokeWidth={(e.confirmed === true ? 2 : 1) / noteVT.s}
                        strokeDasharray={e.confirmed === null ? `${6 / noteVT.s} ${4 / noteVT.s}` : undefined}
                        strokeOpacity={e.confirmed === null ? 0.5 : 0.8}
                      />
                    );
                  })}
                  {/* Dimmed unmatched nodes */}
                  {filterText && noteNodes.filter(n => !visNoteNodes.find(v => v.id === n.id)).map(node => (
                    <g key={node.id} transform={`translate(${node.x},${node.y})`} opacity={0.2}>
                      <circle r={12 / noteVT.s} fill={nodeFillDef} stroke={edgeColor} strokeWidth={1 / noteVT.s} />
                    </g>
                  ))}
                  {/* Nodes */}
                  {visNoteNodes.map(node => {
                    const isSel   = selNoteNode?.id === node.id;
                    const hasLink = visNoteEdges.some(e => e.sourceId === node.id || e.targetId === node.id);
                    const r       = noteRadius(node.id, visNoteEdges);
                    const rs      = r / noteVT.s; // scale-compensated radius
                    return (
                      <g key={node.id}
                        transform={`translate(${node.x},${node.y})`}
                        className="cursor-grab"
                        onPointerDown={(e) => onNodePointerDown(e, node.id)}
                        onClick={() => onNoteNodeClick(node)}
                      >
                        <circle r={isSel ? rs + 4 / noteVT.s : rs}
                          fill={isSel ? '#E24B4A' : hasLink ? nodeFillLnk : nodeFillDef}
                          stroke={isSel ? '#C73B3A' : hasLink ? '#E24B4A' : edgeColor}
                          strokeWidth={(isSel ? 2.5 : 1.5) / noteVT.s}
                        />
                        <text textAnchor="middle" dominantBaseline="middle"
                          fontSize={8 / noteVT.s}
                          fill={isSel ? '#fff' : textFill}
                          style={{ pointerEvents: 'none', userSelect: 'none' }}
                        >
                          {node.label.slice(0, 10)}{node.label.length > 10 ? '…' : ''}
                        </text>
                      </g>
                    );
                  })}
                </g>
              </svg>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-[10px] text-gray-400 dark:text-gray-600">
              <div className="flex items-center gap-1.5">
                <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#E24B4A" strokeWidth="2" /></svg>
                ยืนยันแล้ว
              </div>
              <div className="flex items-center gap-1.5">
                <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke={edgeColor} strokeWidth="1" strokeDasharray="4 3" /></svg>
                รอยืนยัน
              </div>
              <span>Scroll = zoom · ลาก bg = pan · ลาก node = ย้าย</span>
            </div>

            {/* Selected note detail */}
            {selNoteNode && (() => {
              const connEdges     = visNoteEdges.filter(e => e.sourceId === selNoteNode.id || e.targetId === selNoteNode.id);
              const pendingEdges  = connEdges.filter(e => e.confirmed === null);
              const confirmedEdges = connEdges.filter(e => e.confirmed === true);
              return (
                <div className="bg-white dark:bg-[#252527] rounded-2xl border border-gray-100 dark:border-[#333336] shadow-sm p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 leading-snug">{selNoteNode.label}</p>
                    {selNoteNode.noteId && onNavigateToNote && (
                      <button onClick={() => onNavigateToNote(selNoteNode.noteId!)}
                        className="flex-shrink-0 flex items-center gap-1 text-xs text-[#E24B4A] hover:text-[#C73B3A] font-medium transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                        </svg>
                        ดูในรายการ
                      </button>
                    )}
                  </div>
                  {pendingEdges.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-1.5">🔗 AI เสนอว่าเชื่อมกับ</p>
                      <div className="flex flex-col gap-2">
                        {pendingEdges.map(edge => {
                          const otherId = edge.sourceId === selNoteNode.id ? edge.targetId : edge.sourceId;
                          const other   = noteNodes.find(n => n.id === otherId);
                          return (
                            <div key={edge.linkId} className="flex items-center justify-between gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 rounded-xl px-3 py-2">
                              <p className="text-xs text-gray-700 dark:text-gray-300 flex-1 truncate">«{other?.label ?? otherId}»</p>
                              <div className="flex gap-1.5 flex-shrink-0">
                                <button onClick={() => handleConfirmLink(edge, true)}
                                  className="text-[11px] px-2.5 py-1 rounded-full bg-green-100 text-green-700 hover:bg-green-200 transition-colors font-medium">ใช่</button>
                                <button onClick={() => handleConfirmLink(edge, false)}
                                  className="text-[11px] px-2.5 py-1 rounded-full bg-gray-100 dark:bg-[#333336] text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#444448] transition-colors">ไม่ใช่</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {confirmedEdges.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-600 uppercase tracking-wide mb-1">เชื่อมยืนยันกับ</p>
                      <ul className="flex flex-col gap-1">
                        {confirmedEdges.map((edge, i) => {
                          const otherId = edge.sourceId === selNoteNode.id ? edge.targetId : edge.sourceId;
                          const other   = noteNodes.find(n => n.id === otherId);
                          return (
                            <li key={i} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#E24B4A] flex-shrink-0" />
                              {other?.label ?? otherId}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  {connEdges.length === 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-600">ยังไม่มีลิงก์กับโน้ตอื่น</p>
                  )}
                </div>
              );
            })()}
          </>
        )}
      </main>
    </div>
  );
}
