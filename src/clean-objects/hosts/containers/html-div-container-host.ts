// Start here.
//
// This needs to do the following:
// - Create the root host (<div />)
// - Offer a mounting surface (e.g. DOM) in constructor
// - List of supported HOST types
// - Implement:
//     - appendChild
//     - removeChild
//     - appendBeforeChild
//     - applying config / styling to container
// - Add box as example, it should:
//    - Be mountable to this object
//    - It's children be mountable to THAT host
//
//
// FUTURE NOTES
//  - A "box" will be invisible in the tree
//  - A "styled box" will be a sub-renderer, rendering things inside it

export class TestContainerHost {}
