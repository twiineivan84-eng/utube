/**
 * Turihamwe Management System — Central Typography Tokens
 * iOS / Apple San Francisco Design System
 * 
 * Provides centralized tokens and CSS class helpers for:
 * - Font stacks (System UI, SF Pro Display, SF Pro Text, Monospace)
 * - Typography hierarchy weights (Regular, Medium, Semibold)
 * - Letter spacing (Display, Heading, Body, Label, Micro)
 * - Line heights and tabular figures
 */

export const TYPOGRAPHY_STACKS = {
  // Global system fallback stack
  system: [
    '-apple-system',
    'BlinkMacSystemFont',
    '"SF Pro Display"',
    '"SF Pro Text"',
    '"Helvetica Neue"',
    'Arial',
    'sans-serif',
  ].join(', '),

  // Normal application body & controls font stack
  body: [
    '-apple-system',
    'BlinkMacSystemFont',
    '"SF Pro Text"',
    '"Helvetica Neue"',
    'Arial',
    'sans-serif',
  ].join(', '),

  // Large headings & prominent display font stack
  display: [
    '-apple-system',
    'BlinkMacSystemFont',
    '"SF Pro Display"',
    '"Helvetica Neue"',
    'Arial',
    'sans-serif',
  ].join(', '),

  // Code, reference keys, financial hashes & account numbers
  mono: [
    'SFMono-Regular',
    'Menlo',
    'Monaco',
    'Consolas',
    '"Liberation Mono"',
    '"Courier New"',
    'monospace',
  ].join(', '),
} as const;

export const TYPOGRAPHY_WEIGHTS = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

export const TYPOGRAPHY_TRACKING = {
  tightDisplay: '-0.022em',
  tightHeading: '-0.015em',
  body: '-0.006em',
  label: '0.012em',
  caption: '0.005em',
} as const;

export const TYPOGRAPHY_HIERARCHY = {
  displayHeading: 'font-display font-semibold tracking-[-0.022em]',
  sectionHeading: 'font-display font-semibold tracking-[-0.015em]',
  subheading: 'font-sans font-semibold tracking-[-0.01em]',
  bodyRegular: 'font-sans font-normal tracking-[-0.006em]',
  bodyMedium: 'font-sans font-medium tracking-[-0.006em]',
  formLabel: 'font-sans font-medium tracking-[0.012em]',
  button: 'font-sans font-medium tracking-[-0.005em]',
  tableHeader: 'font-sans font-semibold tracking-[0.02em]',
  tableContent: 'font-sans font-normal tabular-nums tracking-[-0.006em]',
  caption: 'font-sans font-normal tracking-[0.005em]',
  codeOrNumber: 'font-mono font-medium tabular-nums',
} as const;
