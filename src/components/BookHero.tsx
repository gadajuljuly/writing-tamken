/** Animated open book with Arabic and Hebrew letters floating out of it (decorative). */
const LETTERS = ["أ", "א", "ب", "ש", "ق", "ל", "م", "ת", "ن", "ב", "ك", "מ", "ح", "ק"];

export default function BookHero() {
  return (
    <div className="book-hero" aria-hidden="true">
      <div className="book-letters">
        {LETTERS.map((ch, i) => (
          <span key={i} style={{ ["--i" as any]: i, ["--x" as any]: `${((i * 37) % 13) - 6}` }}>{ch}</span>
        ))}
      </div>
      <svg className="book-svg" viewBox="0 0 220 110" width="220" height="110">
        <path d="M110 30 C 80 14, 40 12, 12 20 L 12 96 C 40 88, 80 90, 110 104 Z" fill="#004e8a" />
        <path d="M110 30 C 140 14, 180 12, 208 20 L 208 96 C 180 88, 140 90, 110 104 Z" fill="#004e8a" />
        <path d="M110 26 C 82 10, 44 8, 18 14 L 18 90 C 44 84, 82 86, 110 100 Z" fill="#fffdf6" />
        <path d="M110 26 C 138 10, 176 8, 202 14 L 202 90 C 176 84, 138 86, 110 100 Z" fill="#fff6dc" />
        <g stroke="#e6d9b3" strokeWidth="2" strokeLinecap="round" fill="none">
          <path d="M34 30 Q 70 26 96 38" /><path d="M34 44 Q 70 40 96 52" /><path d="M34 58 Q 70 54 96 66" /><path d="M34 72 Q 70 68 96 80" />
          <path d="M186 30 Q 150 26 124 38" /><path d="M186 44 Q 150 40 124 52" /><path d="M186 58 Q 150 54 124 66" /><path d="M186 72 Q 150 68 124 80" />
        </g>
        <path d="M110 26 L 110 100" stroke="#ffc20e" strokeWidth="3" />
        <path className="book-page" d="M110 26 C 138 10, 176 8, 202 14 L 202 90 C 176 84, 138 86, 110 100 Z" fill="#fffaf0" stroke="#efe3c2" />
      </svg>
    </div>
  );
}
