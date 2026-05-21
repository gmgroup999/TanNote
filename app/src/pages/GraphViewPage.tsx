import { useEffect, useRef, useState } from 'react';
import { listAudioRecordings } from '../lib/db';

function useDark() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains('dark'),
  );
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains('dark')),
    );
    obs.observe(document.documentElement, { attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

// ─── Force layout ─────────────────────────────────────────────────────────────

interface GNode {
  id: string;      // IndexedDB record id
  noteId?: string; // Supabase UUID
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface GEdge {
  sourceId: string;
  targetId: string; // IndexedDB ids
  confirmed: boolean | null;
}

function runForceLayout(nodes: GNode[], edges: GEdge[], W: number, H: number, iters = 250) {
  const cx = W / 2;
  const cy = H / 2;
  const REPULSE = 4000;
  const ATTRACT = 0.04;
  const CENTER  = 0.02;
  const DAMP    = 0.85;

  for (let i = 0; i < iters; i++) {
    // Repulsion between all pairs
    for (let a = 0; a < nodes.length; a++) {
      for (let b = a + 1; b < nodes.length; b++) {
        const dx = nodes[b].x - nodes[a].x;
        const dy = nodes[b].y - nodes[a].y;
        const dist2 = dx * dx + dy * dy + 1;
        const f = REPULSE / dist2;
        const dist = Math.sqrt(dist2);
        nodes[a].vx -= (dx / dist) * f;
        nodes[a].vy -= (dy / dist) * f;
        nodes[b].vx += (dx / dist) * f;
        nodes[b].vy += (dy / dist) * f;
      }
    }
    // Attraction along edges
    for (const e of edges) {
      const a = nodes.find((n) => n.id === e.sourceId);
      const b = nodes.find((n) => n.id === e.targetId);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      a.vx += dx * ATTRACT;
      a.vy += dy * ATTRACT;
      b.vx -= dx * ATTRACT;
      b.vy -= dy * ATTRACT;
    }
    // Centering
    for (const n of nodes) {
      n.vx += (cx - n.x) * CENTER;
      n.vy += (cy - n.y) * CENTER;
      // Damping + integrate
      n.vx *= DAMP;
      n.vy *= DAMP;
      n.x  += n.vx;
      n.y  += n.vy;
      // Clamp to bounds
      n.x = Math.max(36, Math.min(W - 36, n.x));
      n.y = Math.max(36, Math.min(H - 36, n.y));
    }
  }
}

// ─── GraphViewPage ────────────────────────────────────────────────────────────

export default function GraphViewPage() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<GNode[]>([]);
  const [edges, setEdges] = useState<GEdge[]>([]);
  const [selected, setSelected] = useState<GNode | null>(null);
  const [loading, setLoading] = useState(true);
  const dark = useDark();

  const W = 340;
  const H = 420;

  useEffect(() => {
    (async () => {
      const records = await listAudioRecordings();
      const done = records.filter((r) => r.aiStatus === 'done');

      if (!done.length) { setLoading(false); return; }

      // Build node map: IndexedDB id → node
      const nodeMap = new Map<string, GNode>();
      // Also map Supabase noteId → IndexedDB id for link resolution
      const noteIdToLocalId = new Map<string, string>();

      for (const r of done) {
        const n: GNode = {
          id:     r.id,
          noteId: r.noteId,
          label:  r.title ?? formatDate(r.createdAt),
          x:      Math.random() * (W - 80) + 40,
          y:      Math.random() * (H - 80) + 40,
          vx:     0,
          vy:     0,
        };
        nodeMap.set(r.id, n);
        if (r.noteId) noteIdToLocalId.set(r.noteId, r.id);
      }

      // Build edges from suggestedLinks (confirmed=true or confirmed=null)
      const edgeSet = new Set<string>();
      const edgeList: GEdge[] = [];

      for (const r of done) {
        for (const link of r.suggestedLinks ?? []) {
          if (link.confirmed === false) continue; // rejected
          const targetLocalId = noteIdToLocalId.get(link.linkedNoteId);
          if (!targetLocalId || !nodeMap.has(targetLocalId)) continue;
          const key = [r.id, targetLocalId].sort().join('|');
          if (edgeSet.has(key)) continue;
          edgeSet.add(key);
          edgeList.push({ sourceId: r.id, targetId: targetLocalId, confirmed: link.confirmed });
        }
      }

      const nodeList = Array.from(nodeMap.values());
      runForceLayout(nodeList, edgeList, W, H);
      setNodes(nodeList);
      setEdges(edgeList);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-[#FAFAF7] dark:bg-[#18181A]">
        <p className="text-gray-400 text-sm">กำลังโหลด...</p>
      </div>
    );
  }

  if (!nodes.length) {
    return (
      <div className="min-h-svh flex flex-col bg-[#FAFAF7] dark:bg-[#18181A]">
        <header className="w-full max-w-md mx-auto px-5 pt-10 pb-4">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">Knowledge Graph</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">เชื่อมโยงโน้ตด้วย AI</p>
        </header>
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center px-8">
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-[#333336] flex items-center justify-center text-2xl">🕸️</div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">ยังไม่มีโน้ตที่ประมวลผลแล้ว</p>
          <p className="text-gray-400 dark:text-gray-600 text-xs leading-relaxed">
            บันทึกเสียงและกด "ถอดเสียง + วิเคราะห์ AI" เพื่อสร้างกราฟ
          </p>
        </div>
      </div>
    );
  }

  const selectedRecord = selected;

  const edgeColor   = dark ? '#555558' : '#D1D5DB';
  const nodeFillDef = dark ? '#333336' : '#F3F4F6';
  const nodeFillLnk = dark ? '#3D1F1F' : '#FEF2F2';
  const textFill    = dark ? '#D1D5DB' : '#374151';

  return (
    <div className="min-h-svh flex flex-col bg-[#FAFAF7] dark:bg-[#18181A]">
      <header className="w-full max-w-md mx-auto px-5 pt-10 pb-3">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">Knowledge Graph</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{nodes.length} โน้ต · {edges.length} ลิงก์</p>
      </header>

      <main className="w-full max-w-md mx-auto px-4 flex-1 flex flex-col gap-3 pb-6">
        {/* SVG Graph */}
        <div className="bg-white dark:bg-[#252527] rounded-2xl border border-gray-100 dark:border-[#333336] shadow-sm overflow-hidden">
          <svg
            ref={svgRef}
            width="100%"
            viewBox={`0 0 ${W} ${H}`}
            className="touch-none"
          >
            {/* Edges */}
            {edges.map((e, i) => {
              const a = nodes.find((n) => n.id === e.sourceId);
              const b = nodes.find((n) => n.id === e.targetId);
              if (!a || !b) return null;
              return (
                <line
                  key={i}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={e.confirmed === true ? '#E24B4A' : edgeColor}
                  strokeWidth={e.confirmed === true ? 2 : 1}
                  strokeDasharray={e.confirmed === null ? '4 3' : undefined}
                  strokeOpacity={e.confirmed === null ? 0.5 : 0.8}
                />
              );
            })}

            {/* Nodes */}
            {nodes.map((node) => {
              const isSelected = selected?.id === node.id;
              const hasLinks   = edges.some((e) => e.sourceId === node.id || e.targetId === node.id);
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x},${node.y})`}
                  className="cursor-pointer"
                  onClick={() => setSelected(isSelected ? null : node)}
                >
                  <circle
                    r={isSelected ? 22 : 18}
                    fill={isSelected ? '#E24B4A' : hasLinks ? nodeFillLnk : nodeFillDef}
                    stroke={isSelected ? '#C73B3A' : hasLinks ? '#E24B4A' : edgeColor}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="8"
                    fill={isSelected ? '#fff' : textFill}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {node.label.slice(0, 10)}
                    {node.label.length > 10 ? '…' : ''}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 px-1 text-[10px] text-gray-400 dark:text-gray-600">
          <div className="flex items-center gap-1.5">
            <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#E24B4A" strokeWidth="2" /></svg>
            ยืนยันแล้ว
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke={edgeColor} strokeWidth="1" strokeDasharray="4 3" /></svg>
            AI เสนอ (รอยืนยัน)
          </div>
        </div>

        {/* Selected node detail */}
        {selectedRecord && (
          <div className="bg-white dark:bg-[#252527] rounded-2xl border border-gray-100 dark:border-[#333336] shadow-sm p-4 flex flex-col gap-2">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{selectedRecord.label}</p>
            {(() => {
              const linked = edges
                .filter((e) => e.sourceId === selectedRecord.id || e.targetId === selectedRecord.id)
                .map((e) => {
                  const otherId = e.sourceId === selectedRecord.id ? e.targetId : e.sourceId;
                  const other   = nodes.find((n) => n.id === otherId);
                  return other ? { label: other.label, confirmed: e.confirmed } : null;
                })
                .filter(Boolean) as { label: string; confirmed: boolean | null }[];

              if (!linked.length) return (
                <p className="text-xs text-gray-400 dark:text-gray-600">ยังไม่มีลิงก์กับโน้ตอื่น</p>
              );

              return (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-600 uppercase tracking-wide mb-1">เชื่อมกับ</p>
                  <ul className="flex flex-col gap-1">
                    {linked.map((l, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${l.confirmed === true ? 'bg-[#E24B4A]' : 'bg-gray-300 dark:bg-[#555558]'}`} />
                        {l.label}
                        {l.confirmed === null && <span className="text-[10px] text-gray-400 dark:text-gray-600">(รอยืนยัน)</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
          </div>
        )}
      </main>
    </div>
  );
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'short' }).format(new Date(d));
}
