import * as t from '@babel/types'
import type { ComponentInfo, ComponentEnrichment, Detector } from './types.js'

/**
 * Extracts state variable names from a component.
 *   Function:  const [count, setCount] = useState(0)   → ['count']
 *   Function:  const [state, dispatch] = useReducer(…)  → ['state']
 *   Class:     state = { count: 0, name: '' }            → ['count', 'name']
 *   Class:     this.state = { count: 0 } (constructor)   → ['count']
 */
export class StateSlotsDetector implements Detector {
  readonly name = 'state-slots'

  enrichComponent(component: ComponentInfo): ComponentEnrichment {
    const slots: string[] = []

    if (t.isClassDeclaration(component.path.node)) {
      component.path.traverse({
        ClassProperty(innerPath: any) {
          const node = innerPath.node
          if (
            !node.static &&
            t.isIdentifier(node.key, { name: 'state' }) &&
            t.isObjectExpression(node.value)
          ) {
            for (const prop of node.value.properties) {
              if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                slots.push(prop.key.name)
              }
            }
          }
        },
        AssignmentExpression(innerPath: any) {
          const left = innerPath.node.left
          const right = innerPath.node.right
          if (
            t.isMemberExpression(left) &&
            t.isThisExpression(left.object) &&
            t.isIdentifier(left.property, { name: 'state' }) &&
            t.isObjectExpression(right)
          ) {
            for (const prop of right.properties) {
              if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                slots.push(prop.key.name)
              }
            }
          }
        },
      })
      return { stateSlots: slots }
    }

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
