import React from 'react';

const LETTERS = ['P', 'r', 'a', 'Q', 'e', 'n'];

// Negative = UP
// Positive = DOWN
// Creates a more natural wavy PraQen wordmark
const OFFSETS = [
  -0.10, // P  → slightly UP
  0.04, // r  → slightly DOWN
  0.10, // a  → DOWN
  -0.10, // Q  → slightly UP
  0.05, // e  → slightly DOWN
  -0.02, // n  → almost normal
];

const ACCENT_INDEX = 3;

export default function PraqenLogo({
  fontSize = 40,
  color = '#1B4332'
}) {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@800&display=swap');
      `}</style>

      <div
        style={{
          display: 'inline-flex',
          alignItems: 'flex-end',
          fontFamily: "'Baloo 2', sans-serif",
          fontWeight: 800,
          fontSize: `${fontSize}px`,
          color,
          lineHeight: 1,
        }}
      >
        {LETTERS.map((letter, i) => (
          <span
            key={i}
            style={{
              position: 'relative',
              display: 'inline-block',

              // Individual wavy positioning
              transform: `translateY(${OFFSETS[i] * fontSize}px)`,

              // Tight, clean spacing
              marginRight:
                i < LETTERS.length - 1
                  ? `${fontSize * -0.025}px`
                  : 0,
            }}
          >
            {letter}

            {i === ACCENT_INDEX && (
              <svg
                width={fontSize * 0.48}
                height={fontSize * 0.36}
                viewBox="0 0 30 26"
                style={{
                  position: 'absolute',

                  // Close to Q
                  top: `${-fontSize * 0.15}px`,

                  // Centered above Q
                  left: `${fontSize * 0.10}px`,

                  overflow: 'visible',
                  pointerEvents: 'none',
                }}
              >
                <line
                  x1="8"
                  y1="16"
                  x2="3"
                  y2="6"
                  stroke={color}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />

                <line
                  x1="15"
                  y1="14"
                  x2="15"
                  y2="2"
                  stroke={color}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />

                <line
                  x1="22"
                  y1="16"
                  x2="27"
                  y2="6"
                  stroke={color}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </span>
        ))}
      </div>
    </>
  );
}