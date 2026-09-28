import type { JSX as ReactJSX } from "react";

// dnd-kit 6 uses the React 18 global name for element return types.
declare global {
  namespace JSX {
    type IntrinsicElements = ReactJSX.IntrinsicElements;
    type Element = ReactJSX.Element;
  }
}
