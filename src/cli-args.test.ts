import { describe, it, expect } from 'vitest'
import { parseArgs } from './cli-args.js'

describe('parseArgs', () => {
  it('returns defaults for empty argv', () => {
    expect(parseArgs([])).toEqual({
      targetPath: '.',
      editor: 'vscode',
      port: 7272,
      open: true,
      ignore: [],
    })
  })

  it('takes the first positional as targetPath', () => {
    expect(parseArgs(['./src']).targetPath).toBe('./src')
  })

  it('ignores additional positionals', () => {
    expect(parseArgs(['./src', './extra']).targetPath).toBe('./src')
  })

  it('parses --editor=cursor', () => {
    expect(parseArgs(['--editor=cursor']).editor).toBe('cursor')
  })

  it('parses --port=8080', () => {
    expect(parseArgs(['--port=8080']).port).toBe(8080)
  })

  it('falls back to default port for non-numeric value', () => {
    expect(parseArgs(['--port=abc']).port).toBe(7272)
  })

  it('falls back to default port for out-of-range value', () => {
    expect(parseArgs(['--port=70000']).port).toBe(7272)
    expect(parseArgs(['--port=0']).port).toBe(7272)
    expect(parseArgs(['--port=-1']).port).toBe(7272)
  })

  it('sets open=false for --no-open', () => {
    expect(parseArgs(['--no-open']).open).toBe(false)
  })

  it('parses comma-separated --ignore', () => {
    expect(parseArgs(['--ignore=tests,fixtures']).ignore).toEqual(['tests', 'fixtures'])
  })

  it('trims whitespace and drops empty entries in --ignore', () => {
    expect(parseArgs(['--ignore=tests, fixtures , ,docs']).ignore).toEqual([
      'tests',
      'fixtures',
      'docs',
    ])
  })

  it('combines all flags with positional', () => {
    const args = parseArgs(['./src', '--editor=zed', '--port=9090', '--no-open', '--ignore=e2e'])
    expect(args).toEqual({
      targetPath: './src',
      editor: 'zed',
      port: 9090,
      open: false,
      ignore: ['e2e'],
    })
  })

  it('silently ignores unknown flags', () => {
    expect(() => parseArgs(['--unknown=foo'])).not.toThrow()
    expect(parseArgs(['--unknown=foo']).targetPath).toBe('.')
  })
})
