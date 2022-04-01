# Atlas 2.0

This is the basis for a second version of Atlas with lessons learned. The properties and behaviours of objects on an 
Atlas world are to be split into traits. This model is inspired by the "Entity component system" often used in game 
development.

In this model objects look much more similar to each other, and new objects can be composed utilising different traits.


## Traits
List of the current traits and the functions they offer. Each also offers an `applyProps()` function for
transforming props to internal state on the object, diffing and notifying if the model changed.

- **Generic object**
  - objectForEach()
  - getTopParent()
- **Container**
  - append()
  - insertBefore()
  - remove()
  - hideInstance()
- **Evented**
  - addEventListener()
  - removeEventListener()
  - dispatchEvent()
  - propagatePointerEvent()
  - propagateTouchEvent()
  - propagateEvent()
- **Has styles**
  - stylesDidUpdate()
- **Layouts**
  - addLayoutSubscription()
  - triggerLayout()
  - flushLayoutSubscriptions()
- **Paintable**
  - getObjectsAt()
  - getAllPointsAt()
- **Revision**
- **Scheduled updates**
  - getScheduledUpdates()

## Runtime simplification

- Setting home position
- Starting / stopping controllers
- Passing position to controller *controller could get runtime*
- Trigger resize
- 
