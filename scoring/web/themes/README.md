# Blossom SD companion

`blossom-sd.png` is a transparent 2 by 2 sprite sheet generated from the user's
character reference. Each quadrant is a new full-body SD pose:

| Position | Pose | Application |
| --- | --- | --- |
| Top left | Pointing guide | Help, neutral/empty account, recommendations and watchlist |
| Top right | Happy | Positive actual total account profit |
| Bottom left | Sad | Negative actual total account profit |
| Bottom right | Celebration | Successful trade persistence, briefly |

The original generated sheet is preserved in the workspace `generated_images`.
CSS selects a complete pose without modifying or cropping the source file.
`companion.js` only reads account values already calculated by the app. The
preview picker cannot change account values or the real reaction.

Web builds use the local PNG. Standalone builds embed its bytes and create a
short document-local Blob URL through `scoring/theme-assets.js`.
