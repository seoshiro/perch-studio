# Shared room model

`model.ts` owns the portable schema, catalog dimensions, geometry, undo/redo and browser-storage operations. Distances are metres; positions are item centres measured from the room's top-left corner. Rotation is clockwise in the plan. The renderer maps plan Y to world Z and negates rotation around world Y.

The plan and procedural furniture renderer consume the same furniture dimensions. Mesh bounds are constrained to those dimensions, including unusually narrow or tall edits. Convex polygon separation tests compare rotated footprints. Inward door sweeps are quarter-circle convex polygons with 32 arc segments. Checks use a 5 mm contact tolerance; they are furnishing guidance, not building or accessibility certification.

Each edit commits an immutable project snapshot, capped at 80 undo entries. A pointer drag previews transforms and commits once on release. Escape, cancellation, lost capture and unmount cancel the preview. New edits discard redo entries. Layout copies deep-clone room data and regenerate item/opening identifiers.

The version-1 importer accepts only known kinds, finishes and presets, finite bounded measurements, valid unique identifiers, and bounded arrays. Input is capped at 256 KB. Imported values are rebuilt into whitelisted objects; no markup is executed. Import and layout deletion ask for explicit confirmation.

Autosave is debounced 400 ms and flushes on page exit or when the document becomes hidden. An unchanged save preserves the previous backup. A valid prior primary becomes the backup; corrupt primary data never overwrites a readable backup. If both copies are corrupt, the demo is opened without replacing them until the user chooses to save it or imports a project. Storage errors are visible and exports remain available.

# Rendering

Three.js is loaded in a separate chunk. Original furniture is built from small primitive meshes and bevelled rectangles, without downloaded models or textures. The camera has bounded tilt, explicit views and no automatic animation. Dragging furniture happens in 2D, avoiding a conflict between touch placement and camera orbit.

Rendering is requested only after a change. Intersection and document-visibility checks suppress offscreen/hidden frames. Pixel ratio is capped at 1.6; shadow maps use 512 or 1024 pixels. Preview moves transform existing groups rather than rebuilding geometry. Geometry, shared materials, shadow targets, renderers, observers and event handlers are released when replaced or unmounted.

The 2D plan and forms remain usable without WebGL. The browser UI includes numeric placement, arrow-button alternatives, keyboard moves, localizable labels, visible focus and reduced-motion styles. Exported SVG is serialized from a clean noninteractive plan. PNG is rendered and captured on request. The printable report uses the same plan and project data.

# Hosting

The application is a static Vite build with relative asset paths for GitHub Pages. Production CSP permits local scripts/fonts/assets, inline finish styles and exported image data, while disabling data connections, embedded objects and forms. The development server omits that CSP to permit local hot reload. No server code or credentials are included in the browser build.
