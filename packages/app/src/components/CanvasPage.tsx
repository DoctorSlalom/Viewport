'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

type Tab = { id: string; slug: string; name: string };
type Card = {
  id: string; tabId: string; variant: string; path: string; title: string;
  canvasX: number; canvasY: number; width: number; height: number; zIndex: number;
};
type DragState = { id: string; startPX: number; startPY: number; startCX: number; startCY: number };
type PanState = { startPX: number; startPY: number; startOX: number; startOY: number };

function protoSrc(path: string) {
  return `/proto/${path.replace(/^prototypes\//, '')}/index.html`;
}

export function CanvasPage() {
  const [displayName, setDisplayName] = useState('');
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [tabId, setTabId] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [pan, setPan] = useState({ x: 40, y: 40 });

  const drag = useRef<DragState | null>(null);
  const panDrag = useRef<PanState | null>(null);
  // Always-current refs so callbacks don't go stale
  const latestCards = useRef(cards);
  latestCards.current = cards;
  const latestPan = useRef(pan);
  latestPan.current = pan;
  const latestTabId = useRef(tabId);
  latestTabId.current = tabId;
  const canvasEl = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/auth/session')
      .then(r => r.json())
      .then((d: { authenticated: boolean; displayName?: string }) => {
        if (d.authenticated && d.displayName) setDisplayName(d.displayName);
      });
  }, []);

  useEffect(() => {
    fetch('/api/tabs')
      .then(r => r.json())
      .then((ts: Tab[]) => {
        setTabs(ts);
        if (ts[0]) setTabId(ts[0].id);
      });
  }, []);

  useEffect(() => {
    if (!tabId) { setCards([]); return; }
    fetch(`/api/tabs/${tabId}/prototypes`)
      .then(r => r.json())
      .then(setCards);
  }, [tabId]);

  // Card drag — starts on title bar pointerdown
  const startCardDrag = useCallback((e: React.PointerEvent, card: Card) => {
    e.stopPropagation();
    drag.current = {
      id: card.id,
      startPX: e.clientX, startPY: e.clientY,
      startCX: card.canvasX, startCY: card.canvasY,
    };
    canvasEl.current?.setPointerCapture(e.pointerId);
    if (canvasEl.current) canvasEl.current.style.cursor = 'grabbing';
  }, []);

  // Canvas pan — starts on background pointerdown
  const onCanvasDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    panDrag.current = {
      startPX: e.clientX, startPY: e.clientY,
      startOX: latestPan.current.x, startOY: latestPan.current.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    (e.currentTarget as HTMLElement).style.cursor = 'grabbing';
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (drag.current) {
      const { id, startPX, startPY, startCX, startCY } = drag.current;
      setCards(prev => prev.map(c =>
        c.id === id
          ? { ...c, canvasX: startCX + e.clientX - startPX, canvasY: startCY + e.clientY - startPY }
          : c,
      ));
    } else if (panDrag.current) {
      const { startPX, startPY, startOX, startOY } = panDrag.current;
      setPan({ x: startOX + e.clientX - startPX, y: startOY + e.clientY - startPY });
    }
  }, []);

  const onPointerUp = useCallback(() => {
    if (drag.current) {
      const id = drag.current.id;
      const card = latestCards.current.find(c => c.id === id);
      const tid = latestTabId.current;
      if (card && tid) {
        fetch(`/api/tabs/${tid}/layout`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates: [{ id: card.id, canvasX: card.canvasX, canvasY: card.canvasY }] }),
        });
      }
    }
    drag.current = null;
    panDrag.current = null;
    if (canvasEl.current) canvasEl.current.style.cursor = '';
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f0f0f', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '0 16px', height: 48, background: '#1a1a1a',
        borderBottom: '1px solid #2a2a2a', flexShrink: 0,
      }}>
        <span style={{ fontWeight: 700, color: '#fff', fontSize: 15, marginRight: 12 }}>Viewport</span>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTabId(t.id)}
            style={{
              padding: '4px 14px', borderRadius: 4, border: 'none',
              cursor: 'pointer', fontSize: 13, fontWeight: 500,
              background: tabId === t.id ? '#2563eb' : 'transparent',
              color: tabId === t.id ? '#fff' : '#888',
            }}
          >
            {t.name}
          </button>
        ))}
        {displayName && (
          <span style={{ marginLeft: 'auto', color: '#555', fontSize: 13 }}>{displayName}</span>
        )}
      </header>

      <div
        ref={canvasEl}
        style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: 'grab', touchAction: 'none' }}
        onPointerDown={onCanvasDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div style={{ position: 'absolute', transform: `translate(${pan.x}px, ${pan.y}px)` }}>
          {cards.map(card => (
            <div
              key={card.id}
              style={{
                position: 'absolute',
                left: card.canvasX,
                top: card.canvasY,
                width: card.width,
                height: card.height + 36,
                borderRadius: 6,
                overflow: 'hidden',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                background: '#fff',
                zIndex: card.zIndex,
              }}
            >
              <div
                onPointerDown={e => startCardDrag(e, card)}
                style={{
                  height: 36, background: '#1e1e1e', color: '#ccc',
                  display: 'flex', alignItems: 'center', padding: '0 12px',
                  fontSize: 12, fontWeight: 500, cursor: 'grab',
                  userSelect: 'none', touchAction: 'none', flexShrink: 0,
                }}
              >
                {card.title}
                <span style={{ marginLeft: 'auto', color: '#555', fontSize: 11 }}>{card.variant}</span>
              </div>
              <iframe
                src={protoSrc(card.path)}
                title={card.title}
                sandbox="allow-scripts allow-same-origin allow-forms"
                style={{ width: card.width, height: card.height, border: 'none', display: 'block' }}
              />
            </div>
          ))}

          {cards.length === 0 && tabId && (
            <p style={{ color: '#444', fontSize: 14, margin: 0, padding: '60px 20px' }}>
              No active prototypes — run{' '}
              <code style={{ background: '#1a1a1a', padding: '2px 6px', borderRadius: 3, color: '#aaa' }}>
                viewport sync
              </code>{' '}
              to populate this canvas.
            </p>
          )}

          {tabs.length === 0 && (
            <p style={{ color: '#444', fontSize: 14, margin: 0, padding: '60px 20px' }}>
              No tabs yet — add prototype folders to <code style={{ background: '#1a1a1a', padding: '2px 6px', borderRadius: 3, color: '#aaa' }}>prototypes/</code> and run{' '}
              <code style={{ background: '#1a1a1a', padding: '2px 6px', borderRadius: 3, color: '#aaa' }}>viewport sync</code>.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
