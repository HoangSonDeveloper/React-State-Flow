import { ContextDetector } from './context.detector.js'
import { JSXChildrenDetector } from './jsx-children.detector.js'
import { ReduxDetector } from './redux.detector.js'
import { StateSlotsDetector } from './state-slots.detector.js'
import { ZustandDetector } from './zustand.detector.js'
import type { Detector } from './types.js'

export type { Detector, ParseContext, ComponentInfo, ComponentEnrichment } from './types.js'
export { discoverComponents } from './discover-components.js'

/**
 * Built-in detectors, in execution order.
 * To add support for a new state manager, add its detector class here — no other edits needed.
 */
export function createDefaultDetectors(): Detector[] {
  return [
    new ContextDetector(),
    new ReduxDetector(),
    new ZustandDetector(),
    new StateSlotsDetector(),
    new JSXChildrenDetector(),
  ]
}
