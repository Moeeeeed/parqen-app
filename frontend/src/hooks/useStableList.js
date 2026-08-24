import { useState, useRef, useEffect } from 'react';

// Holds onto the last non-empty list for `graceMs` after the source goes empty,
// so something bound to "is this list empty?" (e.g. showing/hiding a banner)
// doesn't flicker in and out every time the underlying data drops to empty for
// one poll cycle (a pinned offer's listing briefly auto-paused, a fetch that
// landed mid-refresh, etc.) — it only actually clears after staying empty for
// the whole grace window. Appearing is never delayed, only disappearing is.
export default function useStableList(list, graceMs = 90000) {
  const [stable, setStable] = useState(list);
  const timerRef = useRef(null);
  const signature = list.map(item => item.id).join(',');

  useEffect(() => {
    if (list.length > 0) {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      setStable(list);
    } else if (!timerRef.current) {
      timerRef.current = setTimeout(() => {
        setStable([]);
        timerRef.current = null;
      }, graceMs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return stable;
}
