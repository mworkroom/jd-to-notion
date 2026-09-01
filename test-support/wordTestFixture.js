import { createHash } from 'node:crypto';
import AdmZip from 'adm-zip';

export function createWordTemplateFixture({
  duplicateHeaderMarker = false,
  omitBodyMarker = false,
  omitSop = false
} = {}) {
  const zip = new AdmZip();
  const duplicate = duplicateHeaderMarker ? ' [[STUDENT_NAME]]' : '';
  const bodyProgrammeMarker = omitBodyMarker ? 'PROGRAMME' : '[[PROGRAMME]]';
  const sop = omitSop
    ? '<w:p><w:r><w:t>Reference</w:t></w:r></w:p>'
    : '<w:p><w:r><w:t>SOP 글자 수 환산표</w:t></w:r></w:p>';

  zip.addFile('[Content_Types].xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
</Types>`));
  zip.addFile('_rels/.rels', Buffer.from('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'));
  zip.addFile('word/document.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="UniName"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>[[UNIVERSITY]]</w:t></w:r></w:p>
    <w:p><w:r><w:t>${bodyProgrammeMarker}</w:t></w:r></w:p>
    <w:p><w:r><w:t>[[URL]]</w:t><w:br/></w:r></w:p>
    <w:p/>
    <w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/></w:tblPr><w:tblGrid><w:gridCol w:w="5000"/><w:gridCol w:w="3000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="5000" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr><w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>Entry Requirement</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="ListParagraph"/></w:pPr><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Keep formatting</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    <w:p/>
    ${sop}
    <w:tbl><w:tblPr><w:tblStyle w:val="ReferenceTable"/></w:tblPr><w:tr><w:tc><w:p><w:r><w:t>Fixed reference</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>
  </w:body>
</w:document>`));
  zip.addFile('word/header1.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:pPr><w:spacing w:after="0" w:line="259" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>[[DEGREE_PREFIX]] </w:t></w:r><w:r><w:t>[[PROGRAMME_LABEL]]</w:t></w:r></w:p>
  <w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:t>[[STUDENT_NAME]]${duplicate}</w:t></w:r><w:r><w:t>님</w:t></w:r></w:p>
</w:hdr>`));
  zip.addFile('word/_rels/document.xml.rels', Buffer.from('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'));
  zip.addFile('word/styles.xml', Buffer.from('<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="table" w:styleId="TableGrid"/></w:styles>'));
  zip.addFile('word/numbering.xml', Buffer.from('<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>'));
  zip.addFile('word/theme/theme1.xml', Buffer.from('<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="fixture"/>'));

  return zip.toBuffer();
}

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}
