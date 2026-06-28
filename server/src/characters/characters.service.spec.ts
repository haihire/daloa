import { classifyStatBuild } from './characters.service';

describe('classifyStatBuild', () => {
  it('returns unset for total under 300', () => {
    expect(typeof classifyStatBuild(100, 100, 50)).toBe('string');
  });

  it('returns unset for total 0', () => {
    expect(typeof classifyStatBuild(0, 0, 0)).toBe('string');
  });

  it('classifies a single dominant stat pair', () => {
    expect(typeof classifyStatBuild(1800, 150, 600)).toBe('string');
  });

  it('classifies three active stats as 치특신', () => {
    expect(classifyStatBuild(800, 800, 800)).toBe('치특신');
  });
});
