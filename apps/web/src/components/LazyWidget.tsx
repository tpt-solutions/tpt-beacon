// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * LazyWidget — renders a dashboard widget only when it scrolls into view.
 *
 * Uses IntersectionObserver to defer rendering until the widget is visible,
 * reducing initial dashboard load time for dashboards with many widgets.
 */

import { useRef, useState, useEffect, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Placeholder shown while the widget is not yet visible. */
  placeholder?: ReactNode;
  /** Root margin for IntersectionObserver (default: "200px" — start loading slightly before visible). */
  rootMargin?: string;
}

const DEFAULT_PLACEHOLDER = (
  <div
    style={{
      width: "100%",
      height: "100%",
      minHeight: 120,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#161b22",
      border: "1px dashed #30363d",
      borderRadius: 8,
      color: "#484f58",
      fontSize: "0.8rem",
    }}
  >
    Loading...
  </div>
);

export function LazyWidget({
  children,
  placeholder = DEFAULT_PLACEHOLDER,
  rootMargin = "200px",
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // If IntersectionObserver is not supported, render immediately.
    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return <div ref={ref}>{isVisible ? children : placeholder}</div>;
}
