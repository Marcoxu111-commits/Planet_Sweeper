# Broomie cursor artwork

`original.png` is the Broomie image supplied by the user for this project.
The design has not been replaced or redrawn. The transparent cursor cutout and
separate body, arm/broom/bag, and leg PNGs are derived from that same image.

Rebuild them with `node scripts/prepare_broomie.js` (Node built-ins only).
The script removes the background-connected white area, keeps enclosed eye
highlights, separates the existing limb pixels, and resizes them for the cursor.
Only the part transforms animate; the click reticle never lags behind the pointer.

This does not grant a third-party license to the user-supplied character artwork.
