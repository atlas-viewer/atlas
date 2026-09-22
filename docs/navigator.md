# Navigator

`enableNavigator` shows the new home-view navigator. Its frame keeps the viewer's aspect ratio and contains the full home view, including long scroll canvases. Drag the outlined viewport or click elsewhere to move. Use the corner grip to resize it.

The preview follows the viewer's view rotation. Clicking and dragging continue to use the rotated preview's coordinates.

```tsx
<Atlas
  width={800}
  height={600}
  enableNavigator
  navigatorOptions={{
    width: 180,
    className: 'document-navigator',
    showAnnotations: false,
    resizable: true,
  }}
>
  {children}
</Atlas>
```

`width` sets the width in CSS pixels and can be changed later to restore a saved size. The navigator stays within the viewer. `onResize(width)` reports the final width when the user finishes dragging the resize grip or changes it with the keyboard. Store that value and pass it back as `width` to save and restore the size. `resizable` controls the grip.

```tsx
<Atlas
  width={800}
  height={600}
  enableNavigator
  navigatorOptions={{
    width: savedWidth,
    onResize: (width) => {
      setSavedWidth(width);
      localStorage.setItem('navigatorWidth', String(width));
    },
  }}
>
  {children}
</Atlas>
```

Load `savedWidth` from storage when your application starts.

`showAnnotations` controls whether boxes and geometry appear. The navigator fades to partial opacity after inactivity while zoomed in, and hides completely after inactivity at the home zoom level. Set `hideUnlessZoomed: true` to hide it immediately whenever the viewer is at home zoom. Set `hideAtHomeWhenIdle: false` to keep partial opacity at home, or `idleFade: false` to keep it active. `idleMs`, `fadeDurationMs`, `opacityActive`, and `opacityIdle` tune the fade.

The `className` is added to the navigator container. These CSS variables work on that class or a parent:

```css
.document-navigator {
  --atlas-navigator-background: #f5f2eb;
  --atlas-navigator-border: 1px solid #343434;
  --atlas-navigator-radius: 3px;
  --atlas-navigator-shadow: 0 3px 12px #0004;
  --atlas-navigator-viewport-stroke: #e6a800;
  --atlas-navigator-viewport-line-width: 2px;
  --atlas-navigator-resize-color: #e6a800;
  --atlas-navigator-opacity-idle: 0.4;
}
```

The existing `--atlas-navigator-top`, `--atlas-navigator-right`, `--atlas-navigator-left`, `--atlas-navigator-bottom`, `--atlas-navigator-z-index`, `--atlas-navigator-fade-duration`, and `--atlas-navigator-opacity-active` variables also apply. The container and canvas have `.atlas-navigator` and `.atlas-navigator-canvas` classes for CSS selectors. An explicit `navigatorOptions` fade or opacity value overrides the corresponding CSS variable.

The navigator also accepts `style.viewportStroke` as a fallback colour, but the CSS variable takes precedence. Its viewport interior stays transparent.
