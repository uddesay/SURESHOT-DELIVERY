import { useTheme } from '../../lib/theme';

/*
 * Chart colours per theme. Mirrors the tokens in index.css; kept in JS because
 * SVG chart attributes are rendered before <html data-theme> updates.
 */
const PALETTES = {
  light: {
    primary: '#7259e1',
    fill: '#d5cbfa',
    compare: '#acbdb6',
    grid: '#ebeef1',
    axis: '#77808b',
    ink: '#23252d',
    surface: '#ffffff',
    line: '#e3e8e6',
    success: '#2e7d4c',
    danger: '#ba3b2f',
    series: ['#7259e1', '#2e679e', '#a67012', '#7056a6', '#8fae66', '#ba3b2f', '#3f8f8a', '#b8798f'],
  },
  dark: {
    primary: '#b4a1ff',
    fill: '#6b58b0',
    compare: '#77758d',
    grid: '#303443',
    axis: '#8991a7',
    ink: '#eff0f8',
    surface: '#1b1e28',
    line: '#303443',
    success: '#70c98c',
    danger: '#f18070',
    series: ['#b4a1ff', '#7cace8', '#e8b658', '#b29cec', '#9ebe76', '#f18070', '#6fcfc5', '#e6a2bb'],
  },
} as const;

export type ChartTheme = (typeof PALETTES)['light'] | (typeof PALETTES)['dark'];

export function useChartTheme(): ChartTheme {
  return PALETTES[useTheme().resolved];
}
