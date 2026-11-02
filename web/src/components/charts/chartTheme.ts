import { useTheme } from '../../lib/theme';

/*
 * Chart colours per theme. Mirrors the tokens in index.css; kept in JS because
 * SVG chart attributes are rendered before <html data-theme> updates.
 */
const PALETTES = {
  light: {
    primary: '#3761b6',
    fill: '#83a4e6',
    compare: '#a7b1c5',
    grid: '#edf0f5',
    axis: '#656f83',
    ink: '#192235',
    surface: '#ffffff',
    line: '#dbdfe7',
    success: '#4d6eb0',
    danger: '#ba3b2f',
    series: ['#3761b6', '#3298a2', '#ce772e', '#5a72a3', '#6380bb', '#ba3b2f', '#3f8f8a', '#b8798f'],
  },
  dark: {
    primary: '#789de9',
    fill: '#526da2',
    compare: '#8493b0',
    grid: '#2a3242',
    axis: '#aab4c9',
    ink: '#eef2fb',
    surface: '#161d2a',
    line: '#30394a',
    success: '#a7b7d8',
    danger: '#f18070',
    series: ['#789de9', '#91aadb', '#f4a269', '#91a9d9', '#647eb1', '#f18070', '#b0c0df', '#e6a2bb'],
  },
} as const;

export type ChartTheme = (typeof PALETTES)['light'] | (typeof PALETTES)['dark'];

export function useChartTheme(): ChartTheme {
  return PALETTES[useTheme().resolved];
}
