/**
 * New static renderer
 *
 * Made up of the following parts:
 *
 * - Creation of host, appendable to main container
 * - Creation of hosts for objects
 * - Correctly appending objects to containers (object.parent._host)
 * - Hook definition for renderer
 * - Creation of object renderers (e.g. image DOM host)
 * - Render function/hook that will correctly add/remove containers and objects
 * - Optional "always loaded" objects that will be visually hidden and remounted to the main container
 * - Updating of object host if display/crop changes - possibly check for transitions and emulating it
 *
 *
 * User accessible functions:
 *  - Hide
 *  - Reset
 *  - Unhide
 */
