import {
  experimental_useSidebarThreadSplit,
  type PluginSidebarThreadSplit,
} from "@get-bb/plugin-sdk/app";
import {
  memo,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEventHandler,
  type PointerEventHandler,
} from "react";
import { flushSync } from "react-dom";

const SplitRegistration = memo(function SplitRegistration({
  threadId,
  publish,
}: {
  threadId: string;
  publish: (value: PluginSidebarThreadSplit | null) => void;
}) {
  const split = experimental_useSidebarThreadSplit(threadId);
  useLayoutEffect(() => {
    publish(split);
    return () => publish(null);
  }, [split, publish]);
  return null;
});

/** The host's split gesture is needed by the row receiving input, not by every
 * cached row. Keep the row DOM in place while attaching its host behavior. */
export function useDeferredSidebarThreadSplit(threadId: string) {
  const [armed, setArmed] = useState(false);
  const [isAvailable, setAvailable] = useState(false);
  const current = useRef<PluginSidebarThreadSplit | null>(null);
  const focused = useRef(false),
    pressed = useRef(false);
  const publish = useCallback((value: PluginSidebarThreadSplit | null) => {
    current.current = value;
    if (value) setAvailable(value.isAvailable);
  }, []);
  const activate = useCallback(() => {
    if (!current.current) flushSync(() => setArmed(true));
  }, []);
  const onPointerDown = useCallback<PointerEventHandler<HTMLElement>>(
    (event) => {
      pressed.current = true;
      activate();
      current.current?.splitProps.onPointerDown?.(event);
    },
    [activate],
  );
  const onFocusCapture = useCallback<FocusEventHandler<HTMLElement>>(() => {
    focused.current = true;
    setArmed(true);
  }, []);
  const onBlurCapture = useCallback<FocusEventHandler<HTMLElement>>((event) => {
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    )
      return;
    focused.current = false;
    if (!pressed.current) setArmed(false);
  }, []);
  useLayoutEffect(() => {
    if (!armed) return;
    const release = () => {
      pressed.current = false;
      queueMicrotask(() => {
        if (!focused.current && !pressed.current) setArmed(false);
      });
    };
    document.addEventListener("pointerup", release, true);
    document.addEventListener("pointercancel", release, true);
    window.addEventListener("blur", release);
    return () => {
      document.removeEventListener("pointerup", release, true);
      document.removeEventListener("pointercancel", release, true);
      window.removeEventListener("blur", release);
    };
  }, [armed]);
  return {
    isAvailable,
    activate,
    onPointerDown,
    onFocusCapture,
    onBlurCapture,
    behavior: armed ? (
      <SplitRegistration threadId={threadId} publish={publish} />
    ) : null,
  };
}
