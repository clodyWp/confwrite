/**
 * Tests for diagram style preferences
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  getDefaultDiagramStyle,
  loadDiagramStyle,
  saveDiagramStyle,
  getColorScheme,
  type DiagramStyle,
} from '../../src/diagrams/style.js';

const TEST_DIR = join(process.cwd(), '.test-diagram-style');

describe('DiagramStyle', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(join(TEST_DIR, 'assets'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  describe('getDefaultDiagramStyle', () => {
    it('returns default style with warm color scheme', () => {
      const style = getDefaultDiagramStyle();
      expect(style.colorScheme).toBe('warm');
      expect(style.nodeShape).toBe('rounded');
      expect(style.layoutDirection).toBe('top-to-bottom');
      expect(style.fontSize).toBe('normal');
      expect(style.customColors).toBeNull();
    });
  });

  describe('getColorScheme', () => {
    it('returns warm color scheme', () => {
      const colors = getColorScheme('warm');
      expect(colors.primary).toBe('#d97706');
      expect(colors.secondary).toBe('#f59e0b');
      expect(colors.bg).toBe('#ffffff');
    });

    it('returns cool color scheme', () => {
      const colors = getColorScheme('cool');
      expect(colors.primary).toBe('#2563eb');
      expect(colors.secondary).toBe('#3b82f6');
    });

    it('returns mono color scheme', () => {
      const colors = getColorScheme('mono');
      expect(colors.primary).toBe('#374151');
      expect(colors.secondary).toBe('#6b7280');
    });

    it('returns null for custom scheme', () => {
      const colors = getColorScheme('custom');
      expect(colors).toBeNull();
    });
  });

  describe('loadDiagramStyle', () => {
    it('returns default style when file does not exist', () => {
      const style = loadDiagramStyle(TEST_DIR);
      expect(style.colorScheme).toBe('warm');
    });

    it('loads style from file', () => {
      const customStyle: DiagramStyle = {
        colorScheme: 'cool',
        nodeShape: 'sharp',
        layoutDirection: 'left-to-right',
        fontSize: 'compact',
        customColors: null,
      };
      writeFileSync(
        join(TEST_DIR, 'assets', 'diagram-style.json'),
        JSON.stringify(customStyle)
      );

      const style = loadDiagramStyle(TEST_DIR);
      expect(style.colorScheme).toBe('cool');
      expect(style.nodeShape).toBe('sharp');
      expect(style.layoutDirection).toBe('left-to-right');
    });
  });

  describe('saveDiagramStyle', () => {
    it('saves style to file', () => {
      const style: DiagramStyle = {
        colorScheme: 'mono',
        nodeShape: 'pill',
        layoutDirection: 'top-to-bottom',
        fontSize: 'spacious',
        customColors: null,
      };

      saveDiagramStyle(TEST_DIR, style);

      const loaded = loadDiagramStyle(TEST_DIR);
      expect(loaded.colorScheme).toBe('mono');
      expect(loaded.nodeShape).toBe('pill');
    });
  });
});
