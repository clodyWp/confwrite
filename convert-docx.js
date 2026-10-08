const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');

const docxPath = path.join(__dirname, 'inputs', '二期设备选型文件V1.8（0921）.docx');
const mdPath = path.join(__dirname, 'inputs', 'requirements.md');

mammoth.convertToMarkdown({path: docxPath})
  .then(result => {
    fs.writeFileSync(mdPath, result.value);
    console.log('Converted:', result.value.length, 'chars');
  })
  .catch(err => {
    console.error('Error:', err);
  });
