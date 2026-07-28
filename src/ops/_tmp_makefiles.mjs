import { jsPDF } from "jspdf";
import { Document, Packer, Paragraph } from "docx";
import fs from "node:fs";
const D = "/tmp/claude-0/-home-user-resume-ai-source/396b21ba-a154-5a57-9e4c-7e4f8bb0b3b1/scratchpad/files";
fs.mkdirSync(D, { recursive: true });

// 1. text PDF
const doc = new jsPDF();
const lines = [
  "Ahmed Al-Fahad",
  "ahmed.fahad@email.com | +966 55 123 4567 | Riyadh",
  "",
  "EXPERIENCE",
  "Senior Software Engineer, Acme Corp, 2020 - Present",
  "- Built payment systems handling 2M transactions/month",
  "- Led a team of 5 engineers",
  "Software Engineer, Beta Ltd, 2017 - 2020",
  "- Node.js, React, PostgreSQL",
  "",
  "SKILLS",
  "JavaScript, TypeScript, React, Node.js, AWS, Docker, Kubernetes",
  "",
  "EDUCATION",
  "BSc Computer Science, KFUPM, 2017",
];
let y = 20;
for (const l of lines) { doc.text(l || " ", 12, y); y += 8; }
fs.writeFileSync(`${D}/resume.pdf`, Buffer.from(doc.output("arraybuffer")));

// 1b. LONG text pdf > 8000 chars
const doc2 = new jsPDF();
let y2 = 10; let total = 0;
for (let i = 0; i < 400; i++) {
  const l = `Line ${i}: Delivered measurable improvements across engineering teams and platforms.`;
  total += l.length + 1;
  if (y2 > 285) { doc2.addPage(); y2 = 10; }
  doc2.text(l, 8, y2); y2 += 6;
}
fs.writeFileSync(`${D}/long.pdf`, Buffer.from(doc2.output("arraybuffer")));
console.log("long pdf approx chars", total);

// 2. DOCX
const d = new Document({ sections: [{ children: lines.map((l) => new Paragraph(l)) }] });
Packer.toBuffer(d).then((b) => fs.writeFileSync(`${D}/resume.docx`, b));

// 3. TXT
fs.writeFileSync(`${D}/resume.txt`, lines.join("\n"), "utf-8");

// 3b. long txt
fs.writeFileSync(`${D}/long.txt`, Array.from({length:400},(_,i)=>`Line ${i}: Delivered measurable improvements across engineering teams and platforms.`).join("\n"), "utf-8");

// 4. Windows-1256 Arabic txt
const arText = "أحمد الفهد\nمهندس برمجيات أول\nالرياض، المملكة العربية السعودية\nالخبرات: تطوير أنظمة الدفع وقيادة فرق هندسية\nالمهارات: جافاسكربت، رياكت، نود جي اس\nالتعليم: بكالوريوس علوم حاسب";
// encode to cp1256 manually
const cp1256 = {};
// build reverse map from the standard windows-1256 table
const table = "€پ‚ƒ„…†‡ˆ‰ٹ‹Œچژڈگ‘’“”•–—ک™ڑ›œ‌‍ں ،¢£¤¥¦§¨©ھ«¬­®¯°±²³´µ¶·¸¹؛»¼½¾؟ہءآأؤإئابةتثجحخدذرزسشصض×طظعغـفقكàلâمنهوçèéêëىيîïًٌٍَôُِ÷ّùْûü‎‏ے";
for (let i = 0; i < table.length; i++) cp1256[table[i]] = 0x80 + i;
const bytes = [];
for (const ch of arText) {
  const c = ch.codePointAt(0);
  if (c < 0x80) bytes.push(c);
  else if (cp1256[ch] !== undefined) bytes.push(cp1256[ch]);
  else bytes.push(0x3f);
}
fs.writeFileSync(`${D}/arabic-1256.txt`, Buffer.from(bytes));

// 5. corrupt pdf
fs.writeFileSync(`${D}/corrupt.pdf`, Buffer.from("%PDF-1.4\nthis is not a real pdf at all, garbage bytes follow\n\x00\x01\x02\x03"));

// 6. 6 MB txt
fs.writeFileSync(`${D}/big.txt`, Buffer.alloc(6 * 1024 * 1024, 0x41));

// 7. bogus extension
fs.writeFileSync(`${D}/resume.rtf`, lines.join("\n"));
// 8. docx bytes named .pdf
setTimeout(() => {
  fs.copyFileSync(`${D}/resume.docx`, `${D}/mislabeled.pdf`);
  console.log(fs.readdirSync(D));
}, 1500);
