/// <reference types="vite/client" />

// React 19 scopes the JSX namespace under React.JSX. Expose the legacy global
// so existing `JSX.Element` return-type annotations keep working.
import type { JSX as ReactJSX } from 'react'

declare global {
  namespace JSX {
    type Element = ReactJSX.Element
    type ElementClass = ReactJSX.ElementClass
    type ElementAttributesProperty = ReactJSX.ElementAttributesProperty
    type ElementChildrenAttribute = ReactJSX.ElementChildrenAttribute
    type IntrinsicAttributes = ReactJSX.IntrinsicAttributes
    type IntrinsicClassAttributes<T> = ReactJSX.IntrinsicClassAttributes<T>
    type IntrinsicElements = ReactJSX.IntrinsicElements
    type LibraryManagedAttributes<C, P> = ReactJSX.LibraryManagedAttributes<C, P>
  }
}

export {}
