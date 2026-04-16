import * as t from '@babel/types'
import type { ComponentInfo, ComponentEnrichment, Detector } from './types.js'

/**
 * Extracts state variable names declared via useState / useReducer.
 *   const [count, setCount] = useState(0)   → ['count']
 *   const [state, dispatch] = useReducer(…)  → ['state']
 */
export class StateSlotsDetector implements Detector {
  readonly name = 'state-slots'

  enrichComponent(component: ComponentInfo): ComponentEnrichment {
    const slots: string[] = []
    component.path.traverse({
      CallExpression(innerPath: any) {
        const callee = innerPath.node.callee
        const isHook =
          t.isIdentifier(callee, { name: 'useState' }) ||
          t.isIdentifier(callee, { name: 'useReducer' })
        if (!isHook) return

        const parent = innerPath.parentPath
        if (parent?.isVariableDeclarator() && t.isArrayPattern(parent.node.id)) {
          const first = parent.node.id.elements[0]
          if (t.isIdentifier(first)) slots.push(first.name)
        }
      },
    })
    return { stateSlots: slots }
  }
}
