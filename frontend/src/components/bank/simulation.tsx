"use client";

import { ChevronDown, FlaskConical, MapPin, Monitor, Clock, KeyRound, Brain, RotateCcw } from "lucide-react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Card, Field, Select, Input, cn, Button } from "@/components/ui/base";
import { api } from "@/lib/http";
import type { SimLocationOption, Simulation } from "@/lib/types";

const DEFAULT: Simulation = { location: "lagos", deviceMode: "current", localTime: "", loginBehaviour: "normal", mlProfile: "typical" };

const Ctx = createContext<{ sim: Simulation; setSim: (s: Simulation) => void; reset: () => void; changed: boolean; locations: SimLocationOption[] }>({
  sim: DEFAULT,
  setSim: () => {},
  reset: () => {},
  changed: false,
  locations: [],
});

// Demo controls persist for the browser session and are attached to every payment,
// so a demonstrator can put any transaction in any context (see the rule catalogue).
export function SimulationProvider({ children }: { children: ReactNode }) {
  const [sim, setSimState] = useState<Simulation>(DEFAULT);
  const [locations, setLocations] = useState<SimLocationOption[]>([]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("fds_sim");
      if (raw) setSimState({ ...DEFAULT, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
    api<SimLocationOption[]>("bank", "/bank/locations").then(setLocations).catch(() => {});
  }, []);

  const setSim = (s: Simulation) => {
    setSimState(s);
    try {
      sessionStorage.setItem("fds_sim", JSON.stringify(s));
    } catch {
      /* ignore */
    }
  };

  const changed = JSON.stringify(sim) !== JSON.stringify(DEFAULT);
  return <Ctx.Provider value={{ sim, setSim, reset: () => setSim(DEFAULT), changed, locations }}>{children}</Ctx.Provider>;
}

export const useSimulation = () => useContext(Ctx);

// Payload sent to the API (empty fields omitted).
export function simPayload(s: Simulation) {
  return {
    location: s.location,
    deviceMode: s.deviceMode,
    localTime: s.localTime || undefined,
    loginBehaviour: s.loginBehaviour,
    mlProfile: s.mlProfile,
  };
}

export function SimulationPanel() {
  const { sim, setSim, reset, changed, locations } = useSimulation();
  const [open, setOpen] = useState(false);

  return (
    <Card className={cn("overflow-hidden", changed && "border-warn/50")}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-warnsoft text-warn">
            <FlaskConical size={17} />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">Demo lab: simulate the context</p>
            <p className="text-xs text-muted">
              {changed ? "Custom context active. This payment will be screened as if it came from the chosen situation." : "For demonstrations only. Put this payment in any situation; the analyst dashboard shows how it was screened."}
            </p>
          </div>
        </div>
        <ChevronDown size={18} className={cn("text-muted transition", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-line bg-soft p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={<span className="inline-flex items-center gap-1.5"><MapPin size={13} /> Where the request comes from</span>}>
              <Select value={sim.location} onChange={(e) => setSim({ ...sim, location: e.target.value })}>
                {locations.length === 0 && <option value="lagos">Lagos, Nigeria (my usual location)</option>}
                {locations.map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={<span className="inline-flex items-center gap-1.5"><Monitor size={13} /> Device</span>}>
              <Select value={sim.deviceMode} onChange={(e) => setSim({ ...sim, deviceMode: e.target.value as Simulation["deviceMode"] })}>
                <option value="current">This browser (known device)</option>
                <option value="new">A brand-new device</option>
                <option value="shared">A shared device used by several accounts</option>
              </Select>
            </Field>
            <Field label={<span className="inline-flex items-center gap-1.5"><Clock size={13} /> Local time of day</span>} hint="Leave empty to use the real time. Try 03:10 for an unusual hour.">
              <Input type="time" value={sim.localTime} onChange={(e) => setSim({ ...sim, localTime: e.target.value })} />
            </Field>
            <Field label={<span className="inline-flex items-center gap-1.5"><KeyRound size={13} /> Log-in behaviour</span>}>
              <Select value={sim.loginBehaviour} onChange={(e) => setSim({ ...sim, loginBehaviour: e.target.value as Simulation["loginBehaviour"] })}>
                <option value="normal">Normal sign-in</option>
                <option value="failed-burst">Three failed sign-ins, then a success</option>
              </Select>
            </Field>
          </div>
          <Field
            label={<span className="inline-flex items-center gap-1.5"><Brain size={13} /> What the machine learning layer sees</span>}
            hint="The ML layer scores a real transaction from the public fraud dataset: a legitimate one, fraud it recognises clearly, or subtle fraud it misses."
          >
            <Select value={sim.mlProfile} onChange={(e) => setSim({ ...sim, mlProfile: e.target.value as Simulation["mlProfile"] })}>
              <option value="typical">Typical transaction pattern</option>
              <option value="anomalous">Anomalous pattern (clear fraud signature)</option>
              <option value="subtle">Subtle fraud (the ML layer tends to miss it)</option>
            </Select>
          </Field>
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" icon={<RotateCcw size={13} />} onClick={reset} disabled={!changed}>
              Reset to normal
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
