import type { ToolStage } from '../api/types';
import { normalizeText } from './graphFocus';

/** Id válido de herramienta en dis.yaml. */
export const TOOL_ID_RE = /^[a-z0-9][a-z0-9._-]*$/;

/** "Gerión 2" → "gerion-2". */
export function slugify(text: string): string {
  return normalizeText(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Palabras que YAML 1.1 (PyYAML) no leería como texto sin comillas.
const RESERVED_RE = /^(true|false|yes|no|on|off|y|n|null|~)$/i;
const PLAIN_RE = /^[A-Za-zÀ-ÿ][\wÀ-ÿ .,()/+-]*$/;
const PLAIN_ITEM_RE = /^[A-Za-z][\w.-]*$/;

/** Escalar YAML legible: sin comillas si es seguro; si no, JSON (que es YAML válido). */
export function yamlScalar(value: string): string {
  return PLAIN_RE.test(value) && !RESERVED_RE.test(value) && value === value.trim()
    ? value
    : JSON.stringify(value);
}

/** Clave o elemento de lista en flujo (`[a, b]`), donde `,` y `[]{}` son especiales. */
function yamlItem(value: string): string {
  return PLAIN_ITEM_RE.test(value) && !RESERVED_RE.test(value) ? value : JSON.stringify(value);
}

function flowList(values: string[]): string {
  return `[${values.map(yamlItem).join(', ')}]`;
}

export interface ToolDraft {
  id: string;
  name: string;
  description: string;
  stage: ToolStage;
  url: string;
  container: string;
  dependsOn: string[];
}

/** Entrada para la lista `tools:` de dis.yaml (sin la cabecera: se pega al final de la lista). */
export function toolYaml(d: ToolDraft): string {
  const lines = [`  - id: ${yamlItem(d.id)}`, `    name: ${yamlScalar(d.name.trim())}`];
  if (d.description.trim()) lines.push(`    description: ${yamlScalar(d.description.trim())}`);
  lines.push(`    stage: ${d.stage}`);
  if (d.url.trim()) lines.push(`    url: ${yamlScalar(d.url.trim())}`);
  if (d.container.trim()) lines.push(`    container: ${yamlItem(d.container.trim())}`);
  if (d.dependsOn.length > 0) lines.push(`    depends_on: ${flowList(d.dependsOn)}`);
  return lines.join('\n');
}

export interface ContainerDraft {
  name: string;
  url: string;
  description: string;
  dependsOn: string[];
}

export function hasContainerMeta(d: ContainerDraft): boolean {
  return !!(d.url.trim() || d.description.trim() || d.dependsOn.length > 0);
}

/** Entrada para el mapa `containers:` de dis.yaml (sin la cabecera). */
export function containerYaml(d: ContainerDraft): string {
  const lines = [`  ${yamlItem(d.name.trim())}:`];
  if (d.url.trim()) lines.push(`    url: ${yamlScalar(d.url.trim())}`);
  if (d.description.trim()) lines.push(`    description: ${yamlScalar(d.description.trim())}`);
  if (d.dependsOn.length > 0) lines.push(`    depends_on: ${flowList(d.dependsOn)}`);
  return lines.join('\n');
}

/**
 * Labels para el servicio en su docker-compose.yml, con la sangría de un
 * servicio típico. Siempre entre comillas, y `$` se dobla para que Compose no
 * lo interprete como variable.
 */
export function composeLabels(d: ContainerDraft): string {
  const value = (v: string) => JSON.stringify(v.trim().replace(/\$/g, '$$$$'));
  const lines = ['    labels:'];
  if (d.url.trim()) lines.push(`      dis.url: ${value(d.url)}`);
  if (d.description.trim()) lines.push(`      dis.description: ${value(d.description)}`);
  if (d.dependsOn.length > 0) lines.push(`      dis.depends_on: ${value(d.dependsOn.join(','))}`);
  return lines.join('\n');
}

/**
 * Copia al portapapeles. `navigator.clipboard` solo existe en contextos seguros
 * (HTTPS o localhost), y Dis se abre por http en la LAN: de ahí el plan B.
 * `host` debe estar fuera de lo inerte: con un <dialog> modal, el propio diálogo.
 */
export async function copyText(text: string, host: HTMLElement = document.body): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // seguimos con el plan B
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  host.appendChild(area);
  area.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
