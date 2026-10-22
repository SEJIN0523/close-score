# Blossom character artwork

The character reference is developed into three complementary forms, all kept
as transparent 2 by 2 sheets. Each cell is selected by CSS, without editing the
source image. Generated originals remain in the workspace `generated_images`.

| Sheet | Top left | Top right | Bottom left | Bottom right | Use |
| --- | --- | --- | --- | --- | --- |
| `blossom-scenes.png` | Pointing | Explaining a clipboard | Welcoming wave | Thumbs up | Today's plan, recommendations, watchlist, OCR guidance and help |
| `blossom-portraits.png` | Calm | Delighted | Concerned | Encouraging wink | Actual total P&L in holdings and statistics |
| `blossom-sd.png` | Pointing | Happy | Sad | Celebration | Small saved-record feedback and preview |

Main illustrations and portraits retain ordinary anime proportions. Only the
small feedback sheet uses SD proportions. The preview offers all three forms
without changing real account values or the active financial expression.

`companion.js` reads account values already calculated by the app. It never
changes records, scoring, trading, or storage. Web builds load local PNGs;
standalone builds embed all three sheets as document-local Blob URLs through
`scoring/theme-assets.js`, avoiding large CSS custom-property values.
