# Number System Lab — HSC ICT

A pure HTML/CSS/JavaScript learning tool that converts and calculates in any base from 2 to 36 and shows the mathematics behind every answer.

## Run
Open `index.html` in a modern browser. No build, backend or framework. (Google Fonts are optional; the app falls back to system fonts offline.)

## Files
`index.html` (structure) · `style.css` (themes, responsive layout) · `script.js` (engine + UI) · `README.md`

## Features
Converter with integer, fractional and negative numbers · mixed-base calculator (+ − × ÷, two or more operands) · step solver · quick practice (easy/medium/hard, score) · history (localStorage, 100 records) · reference sheet · dark/light/system theme · on-screen keypad that disables invalid digits · shortcuts: Enter, Ctrl/Cmd+Enter, Ctrl/Cmd+K, Esc.

## How it works
1. **Parse**: split into sign, integer digits, fraction digits; reject any digit ≥ base with an explanatory message.
2. **Exact value**: every number becomes a BigInt fraction `n/d` (digits ÷ base^fractionLength). No floating point is used, so `0.1 + 0.2` is exactly `0.3`.
3. **Operate**: +, −, × and ÷ are done on fractions.
4. **Convert out**: the integer part uses repeated division; the fraction uses repeated multiplication, stopping at the chosen maximum digits. Non-terminating results are labelled *Approximate*; all others are *Exact*.
5. **Steps**: each stage returns `{title, lines}` records rendered by the UI.

Shortcuts shown: Binary ↔ Octal (3-bit groups) and Binary ↔ Hex (4-bit groups). Binary column addition with carries is shown when both operands and the result share a base.

## Algorithms
- Base N → decimal: Σ digit × baseᵖᵒˢⁱᵗⁱᵒⁿ (negative powers after the point).
- Decimal → base N: repeated division (integer), repeated multiplication (fraction).

## Browser support
Any current Chrome, Edge, Firefox or Safari (needs BigInt, `<dialog>`, `color-mix`).
