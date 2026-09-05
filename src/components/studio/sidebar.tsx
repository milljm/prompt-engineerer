import { useState } from "react";
import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { probeConnection } from "@/lib/connect";
import { useEngineStore } from "@/lib/store";
import { cn, shortModel } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const settings = useEngineStore((s) => s.settings);
  const connection = useEngineStore((s) => s.connection);
  const setSettings = useEngineStore((s) => s.setSettings);
  const running = useEngineStore((s) => s.status === "running" || s.status === "stopping");
  const [showKey, setShowKey] = useState(false);

  const connected = connection.ok;
  const hasUrl = settings.apiUrl.trim().length > 0;

  return (
    <div className="flex h-full flex-col bg-card paper">
      <div className="flex items-start justify-between gap-2 px-4 pb-3 pt-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Prompt
          </p>
          <h1 className="font-display text-2xl italic leading-tight text-foreground">Engineerer</h1>
          <p className="mt-1 text-xs text-muted-foreground">Parent forges. Child is tested.</p>
        </div>
        <ThemeToggle />
      </div>

      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 shadow-[var(--shadow-border)]">
          <span className={cn(connected ? "live-dot" : "dead-dot")} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">
              {connection.probing
                ? "Checking API…"
                : connected
                  ? "API connected"
                  : hasUrl
                    ? "API unreachable"
                    : "No API yet"}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {connected
                ? `${connection.models.length} model${connection.models.length === 1 ? "" : "s"} loaded`
                : connection.error || "Enter an OpenAI-compatible /v1 address"}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Refresh models"
            disabled={connection.probing || !hasUrl}
            onClick={() => void probeConnection()}
          >
            <RefreshCw className={cn("size-3.5", connection.probing && "animate-spin")} />
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 px-4 pb-6">
          <section className="space-y-2">
            <Label>OpenAI API</Label>
            <Input
              value={settings.apiUrl}
              disabled={running}
              onChange={(e) => setSettings({ apiUrl: e.target.value })}
              onBlur={() => {
                if (settings.apiUrl.trim()) void probeConnection();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && settings.apiUrl.trim()) {
                  e.currentTarget.blur();
                  void probeConnection();
                }
              }}
              placeholder="https://api.openai.com/v1"
              aria-label="OpenAI-compatible API address"
              autoComplete="off"
              spellCheck={false}
              className="h-9 font-mono text-xs"
            />
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                value={settings.apiKey}
                disabled={running}
                onChange={(e) => setSettings({ apiKey: e.target.value })}
                onBlur={() => {
                  if (settings.apiUrl.trim()) void probeConnection();
                }}
                placeholder="API key (if required)"
                aria-label="API key"
                autoComplete="off"
                spellCheck={false}
                className="h-9 pr-9 font-mono text-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={showKey ? "Hide API key" : "Show API key"}
                className="absolute right-1 top-1/2 -translate-y-1/2"
                onClick={() => setShowKey((v) => !v)}
              >
                {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Any OpenAI-compatible <span className="font-mono">/v1</span> endpoint. Local servers
              usually skip the key.
            </p>
          </section>

          <section className="space-y-2">
            <Label>Parent</Label>
            <ModelSelect
              value={settings.parentModel}
              role="parent"
              disabled={running}
              onChange={(id) => {
                setSettings({ parentModel: id });
                onNavigate?.();
              }}
            />
            <Label>Child</Label>
            <ModelSelect
              value={settings.childModel}
              role="child"
              disabled={running}
              onChange={(id) => {
                setSettings({ childModel: id });
                onNavigate?.();
              }}
            />
          </section>

          <section className="space-y-2">
            <Label>Loaded models</Label>
            <div className="space-y-1">
              {connection.probing && !connection.models.length ? (
                <p className="text-xs text-muted-foreground">Scanning…</p>
              ) : !connection.models.length ? (
                <p className="text-xs text-muted-foreground">
                  No models yet. Enter a compatible API address and refresh.
                </p>
              ) : (
                connection.models.map((m) => {
                  const isParent = m.id === settings.parentModel;
                  const isChild = m.id === settings.childModel;
                  return (
                    <div
                      key={m.id}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
                    >
                      <span className="size-1.5 rounded-full bg-ok" />
                      <span className="min-w-0 flex-1 break-all font-mono text-[11px] leading-snug">
                        {m.name}
                      </span>
                      {isParent ? <Badge variant="parent">parent</Badge> : null}
                      {isChild ? <Badge variant="child">child</Badge> : null}
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="space-y-3">
            <SliderRow
              label="Target score"
              value={settings.targetScore}
              min={5}
              max={10}
              step={1}
              display={`${settings.targetScore}/10`}
              disabled={running}
              onChange={(n) => setSettings({ targetScore: n })}
            />
            <SliderRow
              label="Turns per test"
              value={settings.turns}
              min={1}
              max={4}
              step={1}
              display={`${settings.turns}`}
              disabled={running}
              onChange={(n) => setSettings({ turns: n })}
            />
            <SliderRow
              label="Max iterations"
              value={settings.maxIterations}
              min={1}
              max={12}
              step={1}
              display={`${settings.maxIterations}`}
              disabled={running}
              onChange={(n) => setSettings({ maxIterations: n })}
            />
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </p>
  );
}

function ModelSelect({
  value,
  onChange,
  disabled,
  role,
}: {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  role: "parent" | "child";
}) {
  const models = useEngineStore((s) => s.connection.models);
  return (
    <select
      value={value}
      disabled={disabled || !models.length}
      aria-label={role === "parent" ? "Parent model" : "Child model"}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full rounded-sm bg-secondary px-2 font-mono text-xs text-foreground shadow-[var(--shadow-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:opacity-50"
    >
      {!models.length ? <option value="">No models</option> : null}
      {models.map((m) => (
        <option key={`${role}-${m.id}`} value={m.id}>
          {shortModel(m.name)}
        </option>
      ))}
    </select>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  display,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  disabled?: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <Label>{label}</Label>
        <span className="font-mono text-xs tabular-nums text-foreground">{display}</span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        disabled={disabled}
        onValueChange={(v) => onChange(v[0] ?? value)}
      />
    </div>
  );
}
