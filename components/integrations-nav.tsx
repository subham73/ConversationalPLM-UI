"use client";

import { Eye, EyeOff, Loader2, Plug } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type Provider = "3dx" | "jira" | "dummy";
type Status = "connected" | "disconnected";

type Integration = {
  provider: Provider;
  instanceUrl: string;
  status: Status;
  securityContext: string;
  securityContexts: string[];
};

type FormState = {
  instanceUrl: string;
  username: string;
  password: string;
  patKey: string;
  securityContext: string;
};

const LABELS: Record<Provider, string> = {
  "3dx": "3DExperience",
  jira: "Jira",
  dummy: "Dummy",
};

const DEFAULT_FORM: FormState = {
  instanceUrl: "",
  username: "",
  password: "",
  patKey: "",
  securityContext: "",
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function StatusDot({ status }: { status: Status }) {
  return (
    <span
      className={cn(
        "size-2 rounded-full",
        status === "connected" ? "bg-emerald-500" : "bg-orange-500"
      )}
    />
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export function IntegrationsNav() {
  const { data, mutate } = useSWR<{ integrations: Integration[] }>(
    "/api/integrations",
    fetcher
  );
  const [activeProvider, setActiveProvider] = useState<Provider | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [securityContexts, setSecurityContexts] = useState<string[]>([]);
  const [showSecret, setShowSecret] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const integrations = useMemo(
    () =>
      new Map((data?.integrations ?? []).map((item) => [item.provider, item])),
    [data]
  );

  const openProvider = (provider: Provider) => {
    const existing = integrations.get(provider);
    setActiveProvider(provider);
    setForm({
      ...DEFAULT_FORM,
      instanceUrl: existing?.instanceUrl ?? "",
      securityContext: existing?.securityContext ?? "",
    });
    setSecurityContexts(existing?.securityContexts ?? []);
    setShowSecret(false);
  };

  const submit = async (action: "test" | "save") => {
    if (!activeProvider) {
      return;
    }

    const setBusy = action === "test" ? setTesting : setSaving;
    setBusy(true);

    try {
      const response = await fetch(
        `/api/integrations/${activeProvider}?action=${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.message ?? "Integration request failed.");
      }

      const contexts = Array.isArray(payload.security_contexts)
        ? payload.security_contexts
        : [];
      if (activeProvider === "3dx") {
        setSecurityContexts(contexts);
        setForm((current) => ({
          ...current,
          securityContext: current.securityContext || contexts[0] || "",
        }));
      }

      await mutate();
      toast.success(
        action === "test" ? "Connection verified" : "Configuration saved"
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Integration failed"
      );
    } finally {
      setBusy(false);
    }
  };

  const activeLabel = activeProvider ? LABELS[activeProvider] : "";
  const activeStatus = activeProvider
    ? (integrations.get(activeProvider)?.status ?? "disconnected")
    : "disconnected";

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                className="h-10 bg-background data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                tooltip="Integrations"
              >
                <Plug />
                <span>Integrations</span>
                <div className="ml-auto flex gap-1">
                  {(["3dx", "jira", "dummy"] as Provider[]).map((provider) => (
                    <StatusDot
                      key={provider}
                      status={
                        integrations.get(provider)?.status ?? "disconnected"
                      }
                    />
                  ))}
                </div>
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-popper-anchor-width)"
              side="top"
            >
              <DropdownMenuLabel>Integrations</DropdownMenuLabel>
              {(["3dx", "jira", "dummy"] as Provider[]).map((provider) => (
                <DropdownMenuItem
                  className="cursor-pointer justify-between"
                  key={provider}
                  onSelect={() => openProvider(provider)}
                >
                  <span>{LABELS[provider]}</span>
                  <StatusDot
                    status={
                      integrations.get(provider)?.status ?? "disconnected"
                    }
                  />
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setActiveProvider(null);
          }
        }}
        open={Boolean(activeProvider)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{activeLabel}</DialogTitle>
            <DialogDescription className="flex items-center gap-2">
              <StatusDot status={activeStatus} />
              {activeStatus === "connected" ? "Connected" : "Disconnected"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <Field id="instanceUrl" label="Instance URL">
              <Input
                id="instanceUrl"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    instanceUrl: event.target.value,
                  }))
                }
                placeholder="https://example.com"
                value={form.instanceUrl}
              />
            </Field>

            {activeProvider === "3dx" && (
              <>
                <Field id="username" label="Username">
                  <Input
                    id="username"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        username: event.target.value,
                      }))
                    }
                    value={form.username}
                  />
                </Field>
                <Field id="password" label="Password">
                  <div className="flex gap-2">
                    <Input
                      id="password"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          password: event.target.value,
                        }))
                      }
                      type={showSecret ? "text" : "password"}
                      value={form.password}
                    />
                    <Button
                      onClick={() => setShowSecret((value) => !value)}
                      size="icon"
                      type="button"
                      variant="outline"
                    >
                      {showSecret ? <EyeOff /> : <Eye />}
                    </Button>
                  </div>
                </Field>
                <Field id="securityContext" label="Security Context">
                  <Select
                    disabled={securityContexts.length === 0}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        securityContext: value,
                      }))
                    }
                    value={form.securityContext}
                  >
                    <SelectTrigger id="securityContext">
                      <SelectValue placeholder="Test connection first" />
                    </SelectTrigger>
                    <SelectContent>
                      {securityContexts.map((context) => (
                        <SelectItem key={context} value={context}>
                          {context}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </>
            )}

            {activeProvider === "jira" && (
              <Field id="patKey" label="PAT Key">
                <div className="flex gap-2">
                  <Input
                    id="patKey"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        patKey: event.target.value,
                      }))
                    }
                    type={showSecret ? "text" : "password"}
                    value={form.patKey}
                  />
                  <Button
                    onClick={() => setShowSecret((value) => !value)}
                    size="icon"
                    type="button"
                    variant="outline"
                  >
                    {showSecret ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
              </Field>
            )}
          </div>

          <DialogFooter>
            <Button
              disabled={testing || saving}
              onClick={() => submit("test")}
              type="button"
              variant="outline"
            >
              {testing && <Loader2 className="animate-spin" />}
              Test Connection
            </Button>
            <Button
              disabled={testing || saving}
              onClick={() => submit("save")}
              type="button"
            >
              {saving && <Loader2 className="animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
