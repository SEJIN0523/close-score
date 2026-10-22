Local OCR assets (loaded only when image recognition is requested)

Tesseract.js 7.0.0 and tesseract.js-core 7.0.0: Apache-2.0.
https://github.com/naptha/tesseract.js
https://github.com/naptha/tesseract.js-core
License files are included in this directory.

kor.traineddata.gz: the official Korean model provided by the user.
eng.traineddata.gz: the official English model from the installed Tesseract data.
Both are losslessly gzip-compressed; Tesseract tessdata models are Apache-2.0.
https://github.com/tesseract-ocr/tessdata
https://github.com/tesseract-ocr/tessdata_fast

Images are processed locally in a browser worker and are never uploaded.
No CDN or OCR service is used. No change to the existing service worker.
