import { describe, expect, it } from 'vitest';
import { composeLabels, slugify, toolYaml, yamlScalar } from './snippets';

describe('snippets', () => {
  it('yamlScalar entrecomilla lo que YAML 1.1 leería como otra cosa', () => {
    expect(yamlScalar('yes')).toBe('"yes"');
    expect(yamlScalar('no')).toBe('"no"');
    expect(yamlScalar(' x')).toBe('" x"');
  });

  it('yamlScalar deja el texto seguro sin comillas', () => {
    expect(yamlScalar('Gerión 2')).toBe('Gerión 2');
  });

  it('slugify quita acentos y separa con guiones', () => {
    expect(slugify('Gerión 2')).toBe('gerion-2');
  });

  it('composeLabels dobla $ para Compose', () => {
    const out = composeLabels({ name: 'x', url: 'a$b', description: '', dependsOn: [] });
    expect(out).toContain('dis.url: "a$$b"');
  });

  it('toolYaml omite los campos vacíos', () => {
    const out = toolYaml({
      id: 'x',
      name: 'X',
      description: '',
      stage: 'idea',
      url: '',
      container: '',
      dependsOn: [],
    });
    expect(out).toBe('  - id: x\n    name: X\n    stage: idea');
  });
});
