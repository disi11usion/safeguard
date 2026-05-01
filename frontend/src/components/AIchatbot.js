import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaRobot } from 'react-icons/fa';

export default function AIchatbot({
  initialOpen = false,
  welcomeMessage = "Hi! Ask me anything.",
  placeholder = "Type your message...",
  zIndex = 9999,
  onOpenChange,
  onSend,
  bubbleLabel = 'Open AI Chatbot',
  chatRoute = '/ai-chat',
  navigateOnEnter = true,
  suggestions = [
    "Tell me something about BTC",
    "Analyze Bitcoin's recent performance",
    "Explain common market risk signals",
    "Explain crypto market indicators",
  ],
}) {
  const [open, setOpen] = useState(initialOpen);
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState({ x: 24, y: 24 }); // offset from bottom/right in px
  const [messages, setMessages] = useState(
    welcomeMessage ? [{ role: 'assistant', text: welcomeMessage, id: 'welcome' }] : []
  );
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const bubbleRef = useRef(null);
  const dragRef = useRef({ startX: 0, startY: 0, lastX: 0, lastY: 0 });

  const navigate = useNavigate();

  // Toggle open
  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    onOpenChange && onOpenChange(next);
  };

  // Drag handlers (mouse + touch)
  const onStart = (clientX, clientY) => {
    setDragging(true);
    dragRef.current.startX = clientX;
    dragRef.current.startY = clientY;
    dragRef.current.lastX = pos.x;
    dragRef.current.lastY = pos.y;
  };

  const bubbleSize = 56; // px, must match .ai-bubble size
  const panelGap = 16;   // px spacing between bubble and panel

  const onMove = (clientX, clientY) => {
    if (!dragging) return;
    const dx = clientX - dragRef.current.startX;
    const dy = clientY - dragRef.current.startY;

    let nextX = Math.max(0, dragRef.current.lastX - dx);
    let nextY = Math.max(0, dragRef.current.lastY - dy);

    // Constrain within viewport so the bubble never leaves the window
    const maxRight = Math.max(0, (window.innerWidth || 0) - bubbleSize);
    const maxBottom = Math.max(0, (window.innerHeight || 0) - bubbleSize);

    if (Number.isFinite(maxRight)) {
      nextX = Math.min(nextX, maxRight);
    }
    if (Number.isFinite(maxBottom)) {
      nextY = Math.min(nextY, maxBottom);
    }

    setPos({ x: nextX, y: nextY });
  };

  const onEnd = () => setDragging(false);

  // Mouse listeners
  const handleMouseDown = (e) => {
    e.preventDefault();
    onStart(e.clientX, e.clientY);
  };
  const handleMouseMove = (e) => onMove(e.clientX, e.clientY);
  const handleMouseUp = () => onEnd();

  // Touch listeners
  const handleTouchStart = (e) => {
    const t = e.touches[0];
    onStart(t.clientX, t.clientY);
  };
  const handleTouchMove = (e) => {
    const t = e.touches[0];
    onMove(t.clientX, t.clientY);
  };
  const handleTouchEnd = () => onEnd();

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [dragging]);

  const goToChatPage = (text) => {
    const payload = (text || '').trim();
    if (!payload) return;
    try {
      window.sessionStorage.setItem('aichat_prefill', payload);
      window.sessionStorage.setItem('aichat_should_auto', '1');
    } catch {}
    if (chatRoute) {
      navigate(chatRoute, { state: { prefill: payload, shouldAuto: true } });
    }
  };

  // Send message
  const send = () => {
    const text = input.trim();
    if (!text) return;
    goToChatPage(text);
    setInput('');
  };

  // Submit on Enter
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = input.trim();
      if (!text) return;
      goToChatPage(text);
      setInput('');
    }
  };

let panelRight = pos.x + bubbleSize + panelGap;
let panelBottom = Math.max(8, pos.y); // default attach using bottom
let panelTop = null;
let openDownwards = false;

// Auto-flip panel horizontally and vertically if it would overflow viewport
if (typeof window !== 'undefined') {
  const viewportWidth = window.innerWidth || 0;
  const viewportHeight = window.innerHeight || 0;
  const panelWidth = viewportWidth / 3; // matches 33.3333vw

  // Horizontal flip: keep panel inside viewport left/right
  if (viewportWidth > 0) {
    const panelLeft = viewportWidth - panelRight - panelWidth;
    if (panelLeft < 0) {
      // Not enough space on the left; open on the other side of the bubble
      let flippedRight = pos.x - panelWidth - panelGap;

      const minRight = 8;
      const maxRight = Math.max(minRight, viewportWidth - panelWidth - 8);
      flippedRight = Math.min(Math.max(flippedRight, minRight), maxRight);

      panelRight = flippedRight;
    }
  }

  // Vertical behaviour: decide open upwards or downwards based on available space
  if (viewportHeight > 0) {
    const bubbleBottom = pos.y; // distance from bottom
    const bubbleTop = viewportHeight - bubbleBottom - bubbleSize; // distance from top
    const margin = 8;
    const gap = panelGap;
    const maxPanelHeight = viewportHeight * 0.8; // matches max-h-[80vh]

    const spaceAbove = bubbleTop - margin;   // space between top margin and bubble top
    const spaceBelow = bubbleBottom - margin; // space between bubble bottom and bottom margin

    // If上方空间不够并且下方更充足，则向下展开，并紧贴气泡
    if (spaceAbove < maxPanelHeight && spaceBelow > spaceAbove) {
      openDownwards = true;

      // Desired top is just below the bubble plus gap
      const desiredTop = Math.max(margin, bubbleTop + bubbleSize + gap);

      // Clamp so that there is always bottom margin and max height respected
      const maxTop = Math.max(margin, viewportHeight - maxPanelHeight - margin);
      panelTop = Math.min(desiredTop, maxTop);
    } else {
      // Default: open upwards / side-by-side using bottom anchor, but keep within bottom margin
      panelBottom = Math.max(margin, panelBottom);
    }
  }
}

  const panelStyle = {
    right: `${panelRight}px`,
    width: '33.3333vw',
    maxWidth: '33.3333vw',
  };

  if (openDownwards && panelTop !== null) {
    panelStyle.top = `${panelTop}px`;
  } else {
    panelStyle.bottom = `${panelBottom}px`;
  }

  const hasOnlyWelcome =
    messages.length === 0 ||
    (messages.length === 1 && messages[0]?.id === 'welcome');

  const handleSuggestion = (text) => {
    // fill the input with the selected suggestion, user can edit then send
    setInput(text);
  };

  return (
    <div className="relative" style={{ zIndex }}>
      {/* Floating Bubble */}
      <button
        ref={bubbleRef}
        className={`fixed pointer-events-auto flex items-center justify-center w-14 h-14 rounded-full border border-white/20 shadow-lg bg-blue-600 text-white hover:shadow-xl active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-blue-400/50 ${
          dragging ? 'cursor-grabbing opacity-90' : 'cursor-grab'
        }`}
        aria-label={bubbleLabel}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onClick={(e) => {
          // if moved more than a tiny distance during drag, treat as drag not click
          if (!dragging) toggleOpen();
        }}
        style={{ right: `${pos.x}px`, bottom: `${pos.y}px` }}
      >
        <FaRobot className="w-6 h-6" />
      </button>

      {/* Chat Panel */}
      {open && (
        <div
          className="fixed pointer-events-auto rounded-xl border border-neutral-200 bg-white text-neutral-900 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 flex flex-col max-h-[80vh]"
          role="dialog"
          aria-label="AI Chatbot"
          style={panelStyle}
        >
          <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 rounded-t-xl bg-white/60 dark:bg-neutral-900/60 backdrop-blur">
            <div>
              <div className="text-sm font-semibold">AI Assistant</div>
              <div className="text-[11px] text-neutral-500 dark:text-neutral-400 -mt-0.5">Powered by advanced AI</div>
            </div>
            <button
              className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
              onClick={() => toggleOpen()}
              aria-label="Close chatbot"
            >
              ×
            </button>
          </div>
          <div className="p-4 flex-1 overflow-y-auto">
            {hasOnlyWelcome ? (
              <div className="flex flex-col items-center text-center py-6">
                <div className="w-14 h-14 rounded-full border border-neutral-200 dark:border-neutral-700 flex items-center justify-center mb-3">
                  <FaRobot className="w-6 h-6 text-neutral-600 dark:text-neutral-300" />
                </div>
                <h3 className="text-lg font-semibold mb-1">Welcome to AI Assistant</h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-300 max-w-[460px] leading-relaxed">
                  Ask me anything about cryptocurrency markets, trading strategies, or financial analysis!
                </p>
                <div className="uppercase tracking-wide text-[10px] text-neutral-500 dark:text-neutral-400 mt-4 mb-2">Try asking:</div>
                <div className="w-full max-w-[520px] space-y-2">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleSuggestion(s)}
                      className="w-full text-left px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-800/60 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition text-sm"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3" role="log" aria-live="polite">
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm leading-relaxed shadow-sm ${
                      m.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100'
                    }`}>
                      {m.text}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 p-2 border-t border-neutral-200 dark:border-neutral-800 rounded-b-xl bg-white/60 dark:bg-neutral-900/60 backdrop-blur shrink-0">
            <textarea
              className="flex-1 resize-none rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400/50 min-h-[36px]"
              placeholder={placeholder}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
            />
            <button
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md bg-blue-600 text-white px-3 py-2 text-sm font-medium shadow hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={send}
              disabled={sending || !input.trim()}
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
          <div className="px-4 pb-3 pt-1 text-[10px] text-neutral-500 dark:text-neutral-400">Press Enter to send, Shift + Enter for new line</div>
        </div>
      )}
    </div>
  );
}