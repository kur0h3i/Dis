import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { useConfigStatus, useGraph } from '../api/hooks';
import type { ContainerSummary, Tool, ToolStage } from '../api/types';
import {
  composeLabels,
  type ContainerDraft,
  containerYaml,
  copyText,
  hasContainerMeta,
  slugify,
  TOOL_ID_RE,
  toolYaml,
} from '../lib/snippets';

type Mode = 'container' | 'tool';
type Target = 'labels' | 'yaml';
type Note = { level: 'error' | 'info'; text: string };

interface Props {
  tools: Tool[] | undefined;
  containers: ContainerSummary[] | undefined;
  onClose: () => void;
}

const STAGES: { value: ToolStage; label: string }[] = [
  { value: 'operational', label: 'operativa' },
  { value: 'development', label: 'en desarrollo' },
  { value: 'idea', label: 'idea' },
];

const CONTAINER_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

const inputClass =
  'w-full rounded-md border border-line bg-bg px-2.5 py-1.5 font-mono text-xs text-ink placeholder:text-faint';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="font-mono text-[11px] text-faint">{label}</span>
      {children}
      {hint && <span className="block font-mono text-[10px] text-faint">{hint}</span>}
    </label>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex rounded-lg border border-line bg-bg p-0.5 font-mono text-xs"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`flex-1 rounded-md px-3 py-1.5 transition-colors ${
            value === o.value ? 'bg-accent text-white' : 'text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-surface-2 px-1 text-ink">{children}</code>;
}

/**
 * "Añadir servicio": un formulario que genera el fragmento listo para pegar
 * (labels del docker-compose.yml o entrada de dis.yaml). Dis no escribe la
 * config: no tiene autenticación, y así sigue siendo de solo lectura.
 */
export function AddServiceDialog({ tools, containers, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const listId = useId();
  const graph = useGraph();
  // Más frecuente mientras está abierto: ver enseguida si la edición entró.
  const config = useConfigStatus(5_000);

  const [mode, setMode] = useState<Mode>('container');
  const [target, setTarget] = useState<Target>('labels');
  const [name, setName] = useState('');
  const [customId, setCustomId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [stage, setStage] = useState<ToolStage>('operational');
  const [container, setContainer] = useState('');
  const [dependsOn, setDependsOn] = useState<string[]>([]);
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);

  useEffect(() => {
    // Sin cleanup: al desmontarse, el <dialog> sale del DOM y de la capa superior.
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const containerNames = (containers ?? []).map((c) => c.name);
  const toolId = customId ?? slugify(name);
  const selfId = mode === 'tool' ? toolId : name.trim();
  const nodeIds = graph.data?.nodes.map((n) => n.id) ?? [
    ...(tools ?? []).map((t) => t.id),
    ...containerNames,
  ];
  const depOptions = [...new Set(nodeIds)].filter((d) => d !== selfId).sort();
  const deps = depOptions.filter((d) => dependsOn.includes(d));

  const notes: Note[] = [];
  const urlValue = url.trim();
  if (urlValue && !/^https?:\/\//i.test(urlValue)) {
    notes.push({ level: 'error', text: 'La URL debe empezar por http:// o https://.' });
  }

  let snippet: string | null = null;
  let pending = '';
  if (mode === 'tool') {
    const linked = container.trim();
    if (!name.trim()) pending = 'Escribe al menos el nombre de la herramienta.';
    else if (!TOOL_ID_RE.test(toolId)) {
      notes.push({
        level: 'error',
        text: 'El id solo admite minúsculas, números, ".", "_" y "-", empezando por letra o número.',
      });
    } else if (tools?.some((t) => t.id === toolId)) {
      notes.push({ level: 'error', text: `Ya existe una herramienta con id «${toolId}».` });
    }
    if (linked && !containerNames.includes(linked) && stage === 'operational') {
      notes.push({
        level: 'info',
        text: `El contenedor «${linked}» aún no existe: saldrá como parada hasta que arranque.`,
      });
    }
    if (!linked && toolId && containerNames.includes(toolId)) {
      notes.push({
        level: 'info',
        text: `Se enlazará sola con el contenedor «${toolId}» (se llaman igual).`,
      });
    }
    if (!pending && !notes.some((n) => n.level === 'error')) {
      snippet = toolYaml({
        id: toolId,
        name,
        description,
        stage,
        url,
        container: linked,
        dependsOn: deps,
      });
    }
  } else {
    const draft: ContainerDraft = { name, url, description, dependsOn: deps };
    const containerName = name.trim();
    if (containerName && !CONTAINER_NAME_RE.test(containerName)) {
      notes.push({ level: 'error', text: 'Nombre de contenedor no válido.' });
    } else if (containerName) {
      notes.push({
        level: 'info',
        text: containerNames.includes(containerName)
          ? `«${containerName}» ya está en Docker: tomará estos datos.`
          : `«${containerName}» aún no está en Docker: aparecerá en cuanto arranque.`,
      });
    }
    if (target === 'yaml' && !containerName) pending = 'Escribe el nombre del contenedor.';
    else if (!hasContainerMeta(draft)) {
      pending = 'Rellena al menos la URL, la descripción o una dependencia.';
    }
    if (!pending && !notes.some((n) => n.level === 'error')) {
      snippet = target === 'labels' ? composeLabels(draft) : containerYaml(draft);
    }
  }

  const where =
    mode === 'tool' ? (
      <>
        Pégalo al final de la lista <Code>tools:</Code> de <Code>dis.yaml</Code>. Dis recarga el
        fichero solo, sin reiniciar.
      </>
    ) : target === 'labels' ? (
      <>
        Pégalo en el servicio, en su <Code>docker-compose.yml</Code> (si ya tiene{' '}
        <Code>labels:</Code>, añade solo las líneas <Code>dis.*</Code>), y ejecuta{' '}
        <Code>docker compose up -d</Code>. Dis lo muestra en menos de 30 s.
      </>
    ) : (
      <>
        Pégalo dentro de <Code>containers:</Code> en <Code>dis.yaml</Code>. Útil si no quieres tocar
        el compose del servicio. Dis recarga el fichero solo.
      </>
    );

  const onCopy = async () => {
    if (!snippet) return;
    const ok = await copyText(snippet, dialogRef.current ?? undefined);
    setCopied(ok ? 'ok' : 'fail');
    if (ok) window.setTimeout(() => setCopied(null), 1500);
  };

  const cfg = config.data;

  return (
    <dialog
      ref={dialogRef}
      data-dis-selectable
      aria-labelledby={titleId}
      onClose={onClose}
      // Escape cierra el diálogo, no también el panel lateral de detrás.
      onKeyDown={(e) => {
        if (e.key === 'Escape') e.stopPropagation();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // clic en el fondo
      }}
      className="m-auto w-[min(56rem,calc(100vw-2rem))] max-w-none overflow-hidden rounded-lg border border-line bg-surface p-0 text-ink shadow-2xl shadow-black/40 backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="space-y-1">
            <h2 id={titleId} className="font-mono text-base font-semibold">
              Añadir servicio
            </h2>
            <p className="text-sm text-muted">
              Dis ya detecta solo los contenedores, su enlace (por el puerto publicado) y sus
              dependencias (el depends_on de Compose). Aquí generas lo que no acierte o no pueda
              saber: enlace, descripción y dependencias, o una herramienta propia (aunque aún sea
              una idea).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 rounded-md px-2 py-1 font-mono text-sm text-faint hover:bg-surface-2 hover:text-ink"
          >
            esc ✕
          </button>
        </header>

        <div className="grid flex-1 gap-6 overflow-y-auto p-5 md:grid-cols-2">
          <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
            <Segmented
              label="Tipo de servicio"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'container', label: 'Contenedor Docker' },
                { value: 'tool', label: 'Herramienta propia' },
              ]}
            />
            {mode === 'container' && (
              <Segmented
                label="Dónde declararlo"
                value={target}
                onChange={setTarget}
                options={[
                  { value: 'labels', label: 'labels (compose)' },
                  { value: 'yaml', label: 'dis.yaml' },
                ]}
              />
            )}

            <datalist id={listId}>
              {containerNames.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>

            {mode === 'tool' ? (
              <>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Field label="Nombre">
                    <input
                      className={inputClass}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="p. ej. Vergil"
                      autoFocus
                    />
                  </Field>
                  <Field label="id">
                    <input
                      className={`${inputClass} w-32`}
                      value={toolId}
                      onChange={(e) => setCustomId(e.target.value)}
                      placeholder="vergil"
                      spellCheck={false}
                    />
                  </Field>
                </div>
                <Field label="Fase">
                  <select
                    className={inputClass}
                    value={stage}
                    onChange={(e) => setStage(e.target.value as ToolStage)}
                  >
                    {STAGES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            ) : (
              <Field
                label={
                  target === 'yaml' ? 'Nombre del contenedor' : 'Nombre del contenedor (opcional)'
                }
                hint="El de docker ps (container_name)."
              >
                <input
                  className={inputClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  list={listId}
                  placeholder="p. ej. grafana"
                  spellCheck={false}
                  autoFocus
                />
              </Field>
            )}

            <Field label="Descripción">
              <input
                className={inputClass}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="p. ej. Paneles de métricas"
              />
            </Field>
            <Field
              label="URL de la UI (opcional)"
              hint={
                <>
                  <Code>{'{host}'}</Code> se sustituye por el host con el que abres Dis (LAN o
                  Tailscale).
                </>
              }
            >
              <input
                className={inputClass}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://{host}:3000"
                spellCheck={false}
              />
            </Field>
            {mode === 'tool' && (
              <Field
                label="Contenedor que la implementa (opcional)"
                hint="Hereda su estado y métricas. Si se llama igual que el id, no hace falta."
              >
                <input
                  className={inputClass}
                  value={container}
                  onChange={(e) => setContainer(e.target.value)}
                  list={listId}
                  placeholder="—"
                  spellCheck={false}
                />
              </Field>
            )}

            <fieldset className="space-y-1">
              <legend className="font-mono text-[11px] text-faint">Depende de</legend>
              <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
                {depOptions.length === 0 && <span className="text-xs text-faint">—</span>}
                {depOptions.map((d) => {
                  const on = deps.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setDependsOn(on ? dependsOn.filter((x) => x !== d) : [...dependsOn, d])
                      }
                      className={`rounded-md border px-1.5 py-0.5 font-mono text-[11px] transition-colors ${
                        on
                          ? 'border-accent bg-accent/15 text-accent-ink'
                          : 'border-line text-muted hover:border-accent/60 hover:text-ink'
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </form>

          <div className="space-y-3">
            <h3 className="font-mono text-[11px] font-semibold tracking-[0.2em] text-faint uppercase">
              Fragmento
            </h3>
            <p className="text-sm text-muted">{where}</p>
            {snippet ? (
              <div className="relative">
                <pre
                  className="overflow-x-auto rounded-lg border border-line bg-bg p-3 pr-20 font-mono text-xs leading-relaxed text-ink"
                  aria-label="Fragmento generado"
                >
                  {snippet}
                </pre>
                <button
                  type="button"
                  onClick={() => void onCopy()}
                  className="absolute top-2 right-2 rounded-md border border-accent/40 bg-accent/10 px-2 py-1 font-mono text-[11px] text-accent-ink hover:bg-accent/20"
                >
                  {copied === 'ok' ? 'copiado ✓' : 'copiar'}
                </button>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-line p-3 font-mono text-xs text-faint">
                {pending || 'Corrige lo marcado en rojo.'}
              </p>
            )}
            {copied === 'fail' && (
              <p className="font-mono text-[11px] text-faint">
                No se pudo copiar: selecciona el texto y cópialo a mano.
              </p>
            )}
            {notes.length > 0 && (
              <ul className="space-y-1 font-mono text-[11px]">
                {notes.map((n) => (
                  <li
                    key={n.text}
                    className={n.level === 'error' ? 'text-[#ef4444]' : 'text-muted'}
                  >
                    {n.level === 'error' ? '✕ ' : '· '}
                    {n.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <footer className="border-t border-line px-5 py-3 font-mono text-[11px] text-faint">
          {cfg?.error ? (
            <div className="space-y-1 text-[#ef4444]">
              <p>dis.yaml no se pudo recargar; Dis sigue con la versión anterior:</p>
              <pre className="max-h-24 overflow-auto whitespace-pre-wrap">{cfg.error}</pre>
            </div>
          ) : cfg?.loaded_at ? (
            <p title={cfg.path ?? undefined}>
              dis.yaml cargado a las {new Date(cfg.loaded_at * 1000).toLocaleTimeString()} · se
              recarga solo al guardarlo
            </p>
          ) : (
            <p>Sin dis.yaml cargado.</p>
          )}
        </footer>
      </div>
    </dialog>
  );
}
