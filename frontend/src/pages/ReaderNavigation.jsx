import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import {
  clampReaderNumber,
  readerSwipeDirection,
} from "../data/readerContent";

export function SwipeReader({ enabled, onTurn, label, children }) {
  const host = useRef(null);
  const turn = useEffectEvent(onTurn);

  useEffect(() => {
    if (!enabled) return;

    const element = host.current;

    let start = null;
    let horizontal = 0;
    let lastTurn = 0;

    const canPan = (target) => {
      const pdf = target.closest?.(".online-reader-pdf");

      return pdf && pdf.scrollWidth > pdf.clientWidth + 2;
    };

    const touchStart = (event) => {
      start =
        event.touches.length === 1 && !canPan(event.target)
          ? {
              x: event.touches[0].clientX,
              y: event.touches[0].clientY,
              time: Date.now(),
            }
          : null;
    };

    const touchMove = (event) => {
      if (event.touches.length !== 1) start = null;
    };

    const touchEnd = (event) => {
      const touch = event.changedTouches[0];

      const direction =
        touch &&
        readerSwipeDirection(start, {
          x: touch.clientX,
          y: touch.clientY,
          time: Date.now(),
        });

      start = null;

      if (direction) turn(direction);
    };

    const cancel = () => {
      start = null;
    };

    const wheel = (event) => {
      if (
        event.ctrlKey ||
        canPan(event.target) ||
        Math.abs(event.deltaX) <= Math.abs(event.deltaY) * 1.8
      ) {
        horizontal = 0;
        return;
      }

      event.preventDefault();

      const now = Date.now();

      if (now - lastTurn < 650) return;

      const delta =
        event.deltaX *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? element.clientWidth
            : 1);

      horizontal =
        Math.sign(horizontal) === Math.sign(delta)
          ? horizontal + delta
          : delta;

      if (Math.abs(horizontal) >= 80) {
        turn(horizontal > 0 ? 1 : -1);

        horizontal = 0;
        lastTurn = now;
      }
    };

    const keyboard = (event) => {
      if (
        event.target.closest(
          "input, select, textarea, button, a, [contenteditable='true']",
        ) ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        turn(event.key === "ArrowRight" ? 1 : -1);
      }
    };

    element.addEventListener("touchstart", touchStart, { passive: true });
    element.addEventListener("touchmove", touchMove, { passive: true });
    element.addEventListener("touchend", touchEnd, { passive: true });
    element.addEventListener("touchcancel", cancel);
    element.addEventListener("wheel", wheel, { passive: false });
    element.addEventListener("keydown", keyboard);

    return () => {
      element.removeEventListener("touchstart", touchStart);
      element.removeEventListener("touchmove", touchMove);
      element.removeEventListener("touchend", touchEnd);
      element.removeEventListener("touchcancel", cancel);
      element.removeEventListener("wheel", wheel);
      element.removeEventListener("keydown", keyboard);
    };
  }, [enabled]);

  return (
    <div
      ref={host}
      className={`online-reader-stage ${enabled ? "is-swipe" : ""}`}
      tabIndex={enabled ? 0 : undefined}
      role="region"
      aria-label={label}
    >
      {children}
    </div>
  );
}

function LazyUnit({ number, initial, root, onReady, Unit, unitProps }) {
  const host = useRef(null);
  const content = useRef(null);

  const [active, setActive] = useState(
    () => Math.abs(number - initial) <= 1,
  );

  const [height, setHeight] = useState(700);
  const [revision, setRevision] = useState(0);

  const ready = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!active || !revision) return;

    const frame = requestAnimationFrame(() => {
      host.current.dataset.ready = "true";
      onReady(number);
    });

    return () => cancelAnimationFrame(frame);
  }, [active, revision, number, onReady]);

  useEffect(() => {
    const element = host.current;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          delete element.dataset.ready;
          setRevision(0);
        }

        setActive(entry.isIntersecting);
      },
      {
        root: root.current,
        rootMargin: "600px 0px",
      },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    if (!active || !revision) return;

    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.height > 0) {
        setHeight(Math.ceil(entry.contentRect.height));
      }
    });

    observer.observe(content.current);

    return () => observer.disconnect();
  }, [active, revision]);

  return (
    <section
      ref={host}
      className="online-reader-flow-unit"
      data-unit={number}
      style={
        active ? (revision ? undefined : { minHeight: height }) : { height }
      }
    >
      {active && (
        <div ref={content}>
          <Unit {...unitProps} number={number} onReady={ready} />
        </div>
      )}
    </section>
  );
}

export function ReaderFlow({
  total,
  position,
  ratio,
  jump,
  layout,
  onSave,
  Unit,
  unitProps,
  copy,
}) {
  const root = useRef(null);
  const location = useRef({ number: position, ratio });
  const pending = useRef(null);
  const previous = useRef(null);

  const save = useEffectEvent(onSave);

  const find = useCallback(
    (number) => root.current.querySelector(`[data-unit="${number}"]`),
    [],
  );

  const restore = useCallback((number) => {
    const goal = pending.current;

    if (!goal || goal.number !== number) return;

    const element = root.current;
    const unit = element.querySelector(`[data-unit="${number}"]`);

    if (unit?.dataset.ready !== "true") return;

    element.scrollTop =
      unit.offsetTop +
      goal.ratio * Math.max(0, unit.offsetHeight - element.clientHeight);

    location.current = goal;
    pending.current = null;

    element.dispatchEvent(new Event("scroll"));
  }, []);

  const ready = useCallback(
    (number) => restore(number),
    [restore],
  );

  useEffect(() => {
    const old = previous.current;

    const goal =
      old && old.jump !== jump
        ? {
            number: Math.min(total, Math.max(1, jump.number)),
            ratio: 0,
          }
        : location.current;

    previous.current = { jump, layout };
    pending.current = goal;

    const element = root.current;
    const unit = find(goal.number);

    if (unit) element.scrollTop = unit.offsetTop;

    if (old?.layout === layout) restore(goal.number);

    const frame = requestAnimationFrame(() => {
      if (!old) restore(goal.number);
    });

    return () => cancelAnimationFrame(frame);
  }, [jump, layout, total, find, restore]);

  useEffect(() => {
    const element = root.current;

    let frame;
    let timer;
    let dirty = false;

    const measure = () => {
      frame = null;

      if (pending.current) return;

      let low = 1;
      let high = total;

      const atBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight <= 2;

      const offset = element.scrollTop + 2;

      const unitAt = (number) =>
        element.querySelector(`[data-unit="${number}"]`);

      while (low < high) {
        const mid = Math.ceil((low + high) / 2);

        if (unitAt(mid).offsetTop <= offset) low = mid;
        else high = mid - 1;
      }

      const number = atBottom ? total : low;
      const unit = unitAt(number);

      const distance = Math.max(
        1,
        unit.offsetHeight - element.clientHeight,
      );

      location.current = {
        number,
        ratio: clampReaderNumber(
          (element.scrollTop - unit.offsetTop) / distance,
          0,
          1,
          0,
        ),
      };

      dirty = true;
    };

    const flush = () => {
      if (frame) {
        cancelAnimationFrame(frame);

        if (element.isConnected) measure();
        else frame = null;
      }

      if (dirty && !pending.current) {
        save(location.current.number, location.current.ratio);
        dirty = false;
      }
    };

    const scroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);

      clearTimeout(timer);
      timer = setTimeout(flush, 300);
    };

    const interrupt = () => {
      pending.current = null;
    };

    const visibility = () => {
      if (document.visibilityState === "hidden") flush();
    };

    element.addEventListener("scroll", scroll, { passive: true });
    element.addEventListener("wheel", interrupt, { passive: true });
    element.addEventListener("pointerdown", interrupt, { passive: true });

    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", visibility);

    return () => {
      flush();

      cancelAnimationFrame(frame);
      clearTimeout(timer);

      element.removeEventListener("scroll", scroll);
      element.removeEventListener("wheel", interrupt);
      element.removeEventListener("pointerdown", interrupt);

      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [total, find]);

  return (
    <div
      ref={root}
      className="online-reader-flow"
      tabIndex={0}
      role="region"
      aria-label={copy.scroll}
    >
      {Array.from({ length: total }, (_, index) => (
        <LazyUnit
          key={index + 1}
          number={index + 1}
          initial={position}
          root={root}
          onReady={ready}
          Unit={Unit}
          unitProps={unitProps}
        />
      ))}

      <p className="online-reader-end">{copy.end}</p>
    </div>
  );
}