import { ManagementHeader } from '@/components/management-header';
import { useAuthToken } from "@convex-dev/auth/react";
﻿import React, { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  Button,
  Card,
  CardBody,
  Chip,
  Divider,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
  useDisclosure,
} from "@heroui/react";
import { AppAlertDialog, appModalClassNames } from "@/components/app-dialogs";
import { FaCheck, FaCopy, FaPlug, FaServer } from "react-icons/fa";

interface PageProps {
  username?: string;
  userData?: Record<string, unknown>;
}

type ServerRow = {
  _id: Id<"servers">;
  name: string | null;
  serverInstanceId: string;
  createdAt: number;
  lastSeen: number;
  status: string | null;
  modulesCount: number;
  publicIp?: string | null;
  tunnelUrl?: string | null;
};

type PendingRow = {
  _id: Id<"pendingServers">;
  serverInstanceId: string;
  createdAt: number;
  lastSeen: number;
  publicIp?: string | null;
  tunnelUrl?: string | null;
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const EXPOSE_CMD =
  "python -m lockedin_data_server.server --dashboard https://YOUR-DASHBOARD --expose";


export const ServersPage: React.FC<PageProps> = () => {
  const authToken = useAuthToken();
  const pending = useQuery(api.servers.listPendingServers) as PendingRow[] | undefined;
  const servers = useQuery(api.servers.listServers) as ServerRow[] | undefined;

  const bindPendingServer = useMutation(api.servers.bindPendingServer);

  const { isOpen: isBindOpen, onOpen: onBindOpen, onClose: onBindClose } = useDisclosure();

  const [bindKey, setBindKey] = useState("");
  const [serverName, setServerName] = useState("");
  const [pendingTarget, setPendingTarget] = useState<PendingRow | null>(null);
  const [isBinding, setIsBinding] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [pingState, setPingState] = useState<Record<string, string>>({});
  const [pingOk, setPingOk] = useState<Record<string, boolean>>({});
  const [showSetup, setShowSetup] = useState(false);
  const [copied, setCopied] = useState(false);

  const connectedRows = useMemo(() => servers ?? [], [servers]);
  const pendingRows = useMemo(() => pending ?? [], [pending]);

  const openBindFor = (p: PendingRow) => {
    setPendingTarget(p);
    setBindKey("");
    setServerName("");
    onBindOpen();
  };

  const handleBind = async () => {
    const trimmed = bindKey.trim();
    if (!trimmed) return;

    setIsBinding(true);
    try {
      const hash = await sha256Hex(trimmed);
      await bindPendingServer({ bindKeyHash: hash, name: serverName.trim() || undefined });
      onBindClose();
    } catch (err: any) {
      setAlertMessage(err?.message || "Failed to bind server");
    } finally {
      setIsBinding(false);
    }
  };

  const copyCmd = () => {
    navigator.clipboard.writeText(EXPOSE_CMD.replace("https://YOUR-DASHBOARD", window.location.origin));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const pingDirect = async (s: ServerRow) => {
    const id = String(s._id);
    if (!s.tunnelUrl) {
      setPingOk((p) => ({ ...p, [id]: false }));
      setPingState((p) => ({ ...p, [id]: "No tunnel — re-run server with --expose" }));
      return;
    }
    setPingState((p) => ({ ...p, [id]: "Pinging…" }));
    try {
      const resp = await fetch("/api/server/direct", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ tunnelUrl: s.tunnelUrl }),
      });
      const data = await resp.json();
      if (data?.ok) {
        const mods = Array.isArray(data?.data?.modules) ? data.data.modules.length : "?";
        setPingOk((p) => ({ ...p, [id]: true }));
        setPingState((p) => ({ ...p, [id]: `Live · ${mods} module${mods === 1 ? "" : "s"} running` }));
      } else {
        setPingOk((p) => ({ ...p, [id]: false }));
        setPingState((p) => ({ ...p, [id]: data?.error || "Unreachable" }));
      }
    } catch (e: any) {
      setPingOk((p) => ({ ...p, [id]: false }));
      setPingState((p) => ({ ...p, [id]: e?.message || "Ping failed" }));
    }
  };

  return (
    <div className="management-page">
      <ManagementHeader title="Servers" summary={<>
        <span>{connectedRows.length} connected</span>
        {pendingRows.length > 0 && <Chip size="sm" color="warning" variant="flat">{pendingRows.length} waiting</Chip>}
      </>} actions={<Button color="primary" startContent={<FaPlug />} onPress={() => setShowSetup(value => !value)} aria-expanded={showSetup}>{showSetup ? 'Close setup' : 'Connect server'}</Button>} />

      {showSetup && (
        <Card className="border border-primary/30 bg-primary/5">
          <CardBody className="gap-3">
            <p className="text-sm">Run on the server PC:</p>
            <div className="flex gap-2 items-center bg-default-100 border border-default-200 rounded-xl p-3 font-mono text-xs break-all">
              <span className="flex-1 select-all">{EXPOSE_CMD.replace("https://YOUR-DASHBOARD", typeof window === "undefined" ? "https://li.kaooffline.top" : window.location.origin)}</span>
              <Button isIconOnly size="sm" variant="light" onPress={copyCmd}>
                {copied ? <FaCheck className="text-success" /> : <FaCopy />}
              </Button>
            </div>
            <p className="text-xs text-default-500">
              Paste the printed bind key when the server appears below.
            </p>
          </CardBody>
        </Card>
      )}

      {/* Waiting */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">Pending connections</h2>
          {(pendingRows.length > 0) && (
            <Chip size="sm" variant="flat" color="warning">{pendingRows.length}</Chip>
          )}
        </div>
        {!pending ? (
          <div className="flex items-center gap-2 text-sm text-default-500">
            <Spinner size="sm" /> Looking for new servers…
          </div>
        ) : pendingRows.length === 0 ? (
          <Card className="management-panel border-dashed">
            <CardBody className="py-6 text-center">
              <FaPlug className="mx-auto text-2xl text-default-500 mb-2" />
              <p className="text-sm text-default-500">No servers waiting to connect.</p>
            </CardBody>
          </Card>
        ) : (
          pendingRows.map((p) => (
            <Card key={p._id} className="border border-warning/30">
              <CardBody className="flex flex-row items-center gap-3 py-3">
                <span className="w-2 h-2 rounded-full bg-warning animate-pulse shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs truncate">{p.serverInstanceId}</div>
                  <div className="text-[11px] text-default-500">
                    {p.publicIp || "unknown IP"} · seen {timeAgo(p.lastSeen)}
                    {p.tunnelUrl ? " · tunnel ready" : ""}
                  </div>
                </div>
                <Button size="sm" color="warning" variant="flat" onPress={() => openBindFor(p)}>
                  Connect
                </Button>
              </CardBody>
            </Card>
          ))
        )}
      </div>

      <Divider />

      {/* Connected */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-default-500">Connected</h2>
          <Chip size="sm" variant="flat" color="default">{connectedRows.length}</Chip>
        </div>
        {!servers ? (
          <div className="flex items-center gap-2 text-sm text-default-500">
            <Spinner size="sm" /> Loading…
          </div>
        ) : connectedRows.length === 0 ? (
          <Card className="border border-dashed border-default-300">
            <CardBody className="py-6 text-center">
              <FaServer className="mx-auto text-2xl text-default-500 mb-2" />
              <p className="text-sm text-default-500">No connected servers.</p>
            </CardBody>
          </Card>
        ) : (
          connectedRows.map((s) => {
            const id = String(s._id);
            const live = !!s.tunnelUrl;
            return (
              <Card key={s._id} className="management-panel">
                <CardBody className="gap-2 py-3">
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${s.status === "online" ? "bg-success" : "bg-default-300"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{s.name || "Unnamed server"}</div>
                      <div className="text-[11px] text-default-500">
                        {s.publicIp || "unknown IP"} · seen {timeAgo(s.lastSeen)} · {s.modulesCount} module{s.modulesCount === 1 ? "" : "s"}
                      </div>
                    </div>
                    <Chip size="sm" variant="flat" color={live ? "success" : "default"} title={s.tunnelUrl || "Heartbeat only"}>
                      {live ? "Direct" : "Relay"}
                    </Chip>
                    <Button size="sm" variant="flat" onPress={() => pingDirect(s)}>
                      Ping
                    </Button>
                  </div>
                  {pingState[id] && (
                    <div className={`text-[11px] pl-5 ${pingOk[id] ? "text-success" : "text-danger"}`}>
                      {pingState[id]}
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })
        )}
      </div>

      <Modal isOpen={isBindOpen} onClose={onBindClose} classNames={appModalClassNames}>
        <ModalContent>
          <ModalHeader>Connect server</ModalHeader>
          <ModalBody className="space-y-4">
            {pendingTarget && (
              <div className="text-xs text-default-500">
                Server <span className="font-mono">{pendingTarget.serverInstanceId.slice(0, 13)}…</span>
                {pendingTarget.publicIp ? ` · ${pendingTarget.publicIp}` : ""}
              </div>
            )}
            <Input
              label="Bind key"
              placeholder="Paste the key printed by the server"
              value={bindKey}
              onValueChange={setBindKey}
            />
            <Input
              label="Name"
              placeholder="e.g. Gate PC"
              value={serverName}
              onValueChange={setServerName}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onBindClose}>
              Cancel
            </Button>
            <Button color="primary" onPress={handleBind} isLoading={isBinding}>
              Connect
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <AppAlertDialog isOpen={Boolean(alertMessage)} onClose={() => setAlertMessage("")} message={alertMessage} />
    </div>
  );
};
